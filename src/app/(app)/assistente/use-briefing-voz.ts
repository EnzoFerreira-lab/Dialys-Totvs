"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { TrechoBriefing } from "@/lib/briefing";

/** Avisa os outros players que este começou a falar: só uma voz por vez na página. */
const EVENTO_VOZ = "dialys:voz-iniciada";

export type StatusBriefing = "parado" | "tocando" | "pausado";

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

/**
 * Player do briefing sobre `speechSynthesis`, falando trecho a trecho (frases curtas evitam o corte de
 * utterances longas no Chrome e permitem pausar/avançar). Sem suporte a voz, roda em "modo legenda":
 * o mesmo progresso e destaque de texto, guiados por um timer.
 */
export function useBriefingVoz(trechos: TrechoBriefing[], duracaoSegundos: number) {
  const suportaVoz = useSuportaVoz();
  const idPlayer = useId();
  const [status, setStatus] = useState<StatusBriefing>("parado");
  const [progresso, setProgresso] = useState(0);
  const [vozNome, setVozNome] = useState<string | null>(null);
  const [falhaVoz, setFalhaVoz] = useState(false);

  const progressoRef = useRef(0);
  /** Voz falhou nesta sessão: o timer assume e o briefing segue em modo legenda. */
  const legendaRef = useRef(false);
  const limiteRef = useRef(0);
  const sessao = useRef(0);

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

  const definirProgresso = useCallback((valor: number) => {
    progressoRef.current = valor;
    setProgresso(valor);
  }, []);

  const finalizar = useCallback(() => {
    sessao.current++;
    setStatus("parado");
    definirProgresso(1);
  }, [definirProgresso]);

  const tocarDe = useCallback(
    (inicio: number) => {
      const id = ++sessao.current;
      setStatus("tocando");
      window.dispatchEvent(new CustomEvent(EVENTO_VOZ, { detail: idPlayer }));
      definirProgresso(inicios.lista[inicio]);
      legendaRef.current = !suportaVoz;
      limiteRef.current = suportaVoz ? fimDoTrecho(inicio) : 1;
      if (!suportaVoz) return;

      const synth = window.speechSynthesis;
      synth.cancel();
      const voz = escolherVoz(synth.getVoices());
      setVozNome(voz?.name ?? null);

      for (let i = inicio; i < trechos.length; i++) {
        const fala = new SpeechSynthesisUtterance(inicios.falas[i]);
        fala.lang = "pt-BR";
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
    [definirProgresso, fimDoTrecho, finalizar, idPlayer, inicios, suportaVoz, trechos.length],
  );

  const pausar = useCallback(() => {
    sessao.current++;
    if (suportaVoz) window.speechSynthesis.cancel();
    setStatus("pausado");
  }, [suportaVoz]);

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

  // Avança o progresso de forma contínua entre os eventos da voz (nem toda voz emite `boundary`).
  useEffect(() => {
    if (status !== "tocando") return;
    const passo = TICK_MS / 1000 / duracaoSegundos;
    const timer = window.setInterval(() => {
      const proximo = Math.min(limiteRef.current, progressoRef.current + passo);
      definirProgresso(proximo);
      if (legendaRef.current && proximo >= 1) finalizar();
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [definirProgresso, duracaoSegundos, finalizar, status]);

  // Outro briefing começou a falar: este pausa (a fala dele já foi cancelada pelo novo).
  useEffect(() => {
    const aoIniciarOutro = (evento: Event) => {
      if ((evento as CustomEvent<string>).detail === idPlayer) return;
      sessao.current++;
      setStatus((atual) => (atual === "tocando" ? "pausado" : atual));
    };
    window.addEventListener(EVENTO_VOZ, aoIniciarOutro);
    return () => window.removeEventListener(EVENTO_VOZ, aoIniciarOutro);
  }, [idPlayer]);

  // Pré-carrega as vozes (Chrome as entrega de forma assíncrona) e silencia ao sair da página.
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.getVoices();
    return () => window.speechSynthesis.cancel();
  }, []);

  const trechoAtual = status === "parado" ? -1 : indiceEm(progresso);

  return {
    suportaVoz: suportaVoz && !falhaVoz,
    status,
    progresso,
    segundos: Math.round(progresso * duracaoSegundos),
    trechoAtual,
    vozNome,
    alternar,
    reiniciar,
    buscar,
  };
}
