"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api-cliente";
import type { TrechoBriefing } from "@/lib/briefing";

/** Avisa os outros players que este começou a falar: só uma voz por vez na página. */
const EVENTO_VOZ = "dialys:voz-iniciada";

export type StatusBriefing = "parado" | "tocando" | "pausado";
/** "elevenlabs": MP3 gerado no servidor; "navegador": Web Speech API (reserva quando o ElevenLabs falha). */
export type FonteVoz = "elevenlabs" | "navegador";

/** Briefing gravado na conversa: o servidor só gera a voz dele (nunca de texto livre). */
export type OrigemBriefing = { conversaId: string; mensagemId: string };

const TICK_MS = 200;

const assinarNada = () => () => {};

/** Web Speech API só existe no navegador; no servidor (e na hidratação) assume indisponível. */
function useSuportaVoz() {
  return useSyncExternalStore(
    assinarNada,
    () => "speechSynthesis" in window,
    () => false,
  );
}

function escolherVoz(vozes: SpeechSynthesisVoice[]) {
  const portugues = vozes.filter((voz) => voz.lang.replace("_", "-").toLowerCase().startsWith("pt-br"));
  return portugues.find((voz) => /natural|online|google/i.test(voz.name)) ?? portugues[0] ?? null;
}

/** Quanto esperar a lista de vozes chegar (o Chrome a entrega depois do carregamento da página). */
const ESPERA_VOZES_MS = 1500;
/** Respiro entre cancel() e speak(): sem ele, o Chrome às vezes fala o trecho novo na voz padrão. */
const RESPIRO_APOS_CANCELAR_MS = 80;

/** Lista de vozes; se ainda estiver vazia, espera o `voiceschanged` (com limite de tempo). */
function obterVozes(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const agora = synth.getVoices();
  if (agora.length) return Promise.resolve(agora);
  return new Promise((resolver) => {
    const pronto = () => {
      window.clearTimeout(limite);
      synth.removeEventListener("voiceschanged", pronto);
      resolver(synth.getVoices());
    };
    const limite = window.setTimeout(pronto, ESPERA_VOZES_MS);
    synth.addEventListener("voiceschanged", pronto);
  });
}

/** Áudio do ElevenLabs já carregado: o elemento e o segundo em que cada trecho começa. */
type AudioPronto = { elemento: HTMLAudioElement; tempos: number[]; duracao: number };

/**
 * Player do briefing. Com `origem`, toca a voz do ElevenLabs (MP3 gerado no servidor, com o segundo de
 * cada trecho para destacar a frase e avançar). Se ela falhar, ou sem `origem`, usa `speechSynthesis`
 * trecho a trecho; sem suporte a voz, roda em "modo legenda", com o progresso guiado por um timer.
 */
export function useBriefingVoz(trechos: TrechoBriefing[], duracaoEstimada: number, origem: OrigemBriefing | null = null) {
  const suportaVoz = useSuportaVoz();
  const idPlayer = useId();
  const [status, setStatus] = useState<StatusBriefing>("parado");
  const [progresso, setProgresso] = useState(0);
  const [vozNome, setVozNome] = useState<string | null>(null);
  const [falhaVoz, setFalhaVoz] = useState(false);
  const [fonte, setFonte] = useState<FonteVoz>(origem ? "elevenlabs" : "navegador");
  const [carregando, setCarregando] = useState(false);
  const [duracaoAudio, setDuracaoAudio] = useState<number | null>(null);
  const duracaoSegundos = duracaoAudio ?? duracaoEstimada;

  const progressoRef = useRef(0);
  /** Voz falhou nesta sessão: o timer assume e o briefing segue em modo legenda. */
  const legendaRef = useRef(false);
  const limiteRef = useRef(0);
  const sessao = useRef(0);
  /** Voz do navegador escolhida no primeiro play: pausar, retomar e avançar continuam nela. */
  const vozRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<AudioPronto | null>(null);
  /** O ElevenLabs falhou para este briefing: daqui em diante, voz do navegador. */
  const usarNavegadorRef = useRef(false);

  // Posição (em caracteres falados) onde cada trecho começa, normalizada para 0..1.
  const inicios = useMemo(() => {
    const falas = trechos.map((trecho) => trecho.fala ?? trecho.texto);
    const total = falas.reduce((soma, fala) => soma + fala.length + 1, 0);
    const lista: number[] = [];
    for (let i = 0, acumulado = 0; i < falas.length; acumulado += falas[i].length + 1, i++) {
      lista.push(acumulado / total);
    }
    return { lista, total, falas };
  }, [trechos]);

  const fimDoTrecho = useCallback(
    (indice: number) => (indice + 1 < inicios.lista.length ? inicios.lista[indice + 1] : 1),
    [inicios],
  );

  const indiceEm = useCallback(
    (fracao: number) => {
      let indice = 0;
      for (let i = 0; i < inicios.lista.length; i++) if (inicios.lista[i] <= fracao) indice = i;
      return indice;
    },
    [inicios],
  );

  /** Segundo do áudio → fração do briefing (a mesma escala dos trechos, para o destaque da frase). */
  const fracaoDoTempo = useCallback(
    (segundo: number, { tempos, duracao }: AudioPronto) => {
      let i = 0;
      for (let j = 0; j < tempos.length; j++) if (tempos[j] <= segundo) i = j;
      const fimTempo = tempos[i + 1] ?? duracao;
      const parte = fimTempo > tempos[i] ? Math.min(1, (segundo - tempos[i]) / (fimTempo - tempos[i])) : 0;
      return inicios.lista[i] + parte * (fimDoTrecho(i) - inicios.lista[i]);
    },
    [fimDoTrecho, inicios],
  );

  const definirProgresso = useCallback((valor: number) => {
    progressoRef.current = valor;
    setProgresso(valor);
  }, []);

  const finalizar = useCallback(() => {
    sessao.current++;
    setStatus("parado");
    definirProgresso(1);
  }, [definirProgresso]);

  /** Para o que estiver tocando (áudio e voz do navegador), sem mudar o status. */
  const silenciar = useCallback(() => {
    audioRef.current?.elemento.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  /** Enfileira os trechos a partir de `inicio` na voz do navegador, se esta sessão ainda for a atual. */
  const falarDe = useCallback(
    (id: number, inicio: number, voz: SpeechSynthesisVoice | null) => {
      if (sessao.current !== id) return;
      const synth = window.speechSynthesis;
      setVozNome(voz?.name ?? null);

      for (let i = inicio; i < trechos.length; i++) {
        const fala = new SpeechSynthesisUtterance(inicios.falas[i]);
        // Idioma igual ao da voz: com idiomas diferentes, alguns navegadores ignoram a voz escolhida.
        fala.lang = voz?.lang ?? "pt-BR";
        if (voz) fala.voice = voz;
        fala.onstart = () => {
          if (sessao.current !== id) return;
          limiteRef.current = fimDoTrecho(i);
          definirProgresso(Math.max(progressoRef.current, inicios.lista[i]));
        };
        fala.onboundary = (evento) => {
          if (sessao.current !== id) return;
          const posicao = inicios.lista[i] + evento.charIndex / inicios.total;
          definirProgresso(Math.min(limiteRef.current, Math.max(progressoRef.current, posicao)));
        };
        fala.onerror = (evento) => {
          if (sessao.current !== id || evento.error === "interrupted" || evento.error === "canceled") return;
          // Sem voz utilizável: cancela a fila e deixa o timer conduzir a legenda até o fim.
          sessao.current++;
          window.speechSynthesis.cancel();
          legendaRef.current = true;
          limiteRef.current = 1;
          setFalhaVoz(true);
        };
        if (i === trechos.length - 1) {
          fala.onend = () => {
            if (sessao.current === id) finalizar();
          };
        }
        synth.speak(fala);
      }
    },
    [definirProgresso, fimDoTrecho, finalizar, inicios, trechos.length],
  );

  /** Voz do navegador a partir do trecho `inicio` (reserva do ElevenLabs). */
  const tocarNoNavegador = useCallback(
    (id: number, inicio: number) => {
      legendaRef.current = !suportaVoz;
      limiteRef.current = suportaVoz ? fimDoTrecho(inicio) : 1;
      if (!suportaVoz) return;
      void obterVozes().then((vozes) => {
        // Reaproveita a voz já usada (procurada pelo nome: a lista pode ter sido recriada); só escolhe na primeira vez.
        const anterior = vozRef.current;
        const voz = (anterior && vozes.find((v) => v.name === anterior.name)) || escolherVoz(vozes);
        if (voz) vozRef.current = voz;
        window.setTimeout(() => falarDe(id, inicio, voz), RESPIRO_APOS_CANCELAR_MS);
      });
    },
    [falarDe, fimDoTrecho, suportaVoz],
  );

  /** Toca o MP3 do ElevenLabs a partir do trecho `inicio`; se não der, cai para a voz do navegador. */
  const tocarAudio = useCallback(
    (id: number, inicio: number, pronto: AudioPronto) => {
      if (sessao.current !== id) return;
      legendaRef.current = false;
      limiteRef.current = 1;
      pronto.elemento.currentTime = pronto.tempos[inicio] ?? 0;
      pronto.elemento.play().catch((falha: unknown) => {
        if (sessao.current !== id) return;
        // Navegador bloqueou o som sem um clique: espera a pessoa apertar o play.
        if (falha instanceof DOMException && falha.name === "NotAllowedError") {
          sessao.current++;
          setStatus("pausado");
          return;
        }
        usarNavegadorRef.current = true;
        setFonte("navegador");
        tocarNoNavegador(id, inicio);
      });
    },
    [tocarNoNavegador],
  );

  const tocarDe = useCallback(
    (inicio: number) => {
      const id = ++sessao.current;
      silenciar();
      setStatus("tocando");
      window.dispatchEvent(new CustomEvent(EVENTO_VOZ, { detail: idPlayer }));
      definirProgresso(inicios.lista[inicio]);

      if (!origem || usarNavegadorRef.current) return tocarNoNavegador(id, inicio);
      if (audioRef.current) return tocarAudio(id, inicio, audioRef.current);

      // Primeira vez: pede o MP3 ao servidor (alguns segundos na primeira geração; depois vem do cache).
      setCarregando(true);
      api
        .vozDoBriefing(origem.conversaId, origem.mensagemId)
        .then((voz) => {
          const elemento = new Audio(voz.audio);
          elemento.preload = "auto";
          audioRef.current = { elemento, tempos: voz.inicios, duracao: voz.duracao || elemento.duration || duracaoEstimada };
          setDuracaoAudio(audioRef.current.duracao);
          setVozNome(null);
          setFonte("elevenlabs");
          tocarAudio(id, inicio, audioRef.current);
        })
        .catch(() => {
          usarNavegadorRef.current = true;
          setFonte("navegador");
          if (sessao.current === id) tocarNoNavegador(id, inicio);
        })
        .finally(() => setCarregando(false));
    },
    [definirProgresso, duracaoEstimada, idPlayer, inicios, origem, silenciar, tocarAudio, tocarNoNavegador],
  );

  const pausar = useCallback(() => {
    sessao.current++;
    silenciar();
    setStatus("pausado");
  }, [silenciar]);

  /** Play/pause. Retomar recomeça a frase atual (mais confiável que speechSynthesis.resume entre navegadores). */
  const alternar = useCallback(() => {
    if (status === "tocando") return pausar();
    const atual = progressoRef.current >= 1 ? 0 : indiceEm(progressoRef.current);
    tocarDe(atual);
  }, [indiceEm, pausar, status, tocarDe]);

  const reiniciar = useCallback(() => tocarDe(0), [tocarDe]);

  const buscar = useCallback(
    (fracao: number) => {
      const indice = indiceEm(fracao);
      if (status === "tocando") return tocarDe(indice);
      definirProgresso(fracao);
      setStatus("pausado");
    },
    [definirProgresso, indiceEm, status, tocarDe],
  );

  // Avança o progresso enquanto toca: pelo tempo real do MP3 ou, na voz do navegador, de forma contínua
  // entre os eventos da voz (nem toda voz emite `boundary`).
  useEffect(() => {
    if (status !== "tocando") return;
    const passo = TICK_MS / 1000 / duracaoSegundos;
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      if (audio && !usarNavegadorRef.current) {
        if (audio.elemento.ended) return finalizar();
        if (!audio.elemento.paused) definirProgresso(fracaoDoTempo(audio.elemento.currentTime, audio));
        return;
      }
      const proximo = Math.min(limiteRef.current, progressoRef.current + passo);
      definirProgresso(proximo);
      if (legendaRef.current && proximo >= 1) finalizar();
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [definirProgresso, duracaoSegundos, finalizar, fracaoDoTempo, status]);

  // Outro briefing começou a falar: este pausa (a fala do navegador já foi cancelada pelo novo).
  useEffect(() => {
    const aoIniciarOutro = (evento: Event) => {
      if ((evento as CustomEvent<string>).detail === idPlayer) return;
      sessao.current++;
      audioRef.current?.elemento.pause();
      setStatus((atual) => (atual === "tocando" ? "pausado" : atual));
    };
    window.addEventListener(EVENTO_VOZ, aoIniciarOutro);
    return () => window.removeEventListener(EVENTO_VOZ, aoIniciarOutro);
  }, [idPlayer]);

  // Pré-carrega as vozes do navegador (Chrome as entrega de forma assíncrona) e silencia ao sair da página.
  useEffect(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
    const audio = audioRef;
    return () => {
      audio.current?.elemento.pause();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const trechoAtual = status === "parado" ? -1 : indiceEm(progresso);

  return {
    suportaVoz: fonte === "elevenlabs" || (suportaVoz && !falhaVoz),
    fonte,
    carregando,
    status,
    progresso,
    segundos: Math.round(progresso * duracaoSegundos),
    duracaoSegundos: Math.round(duracaoSegundos),
    trechoAtual,
    vozNome,
    alternar,
    reiniciar,
    buscar,
  };
}
