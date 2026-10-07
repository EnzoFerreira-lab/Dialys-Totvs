"use client";

import { PauseFilled, PlayFilledAlt, VolumeUp } from "@carbon/icons-react";
import { useEffect, useMemo } from "react";
import type { MensagemAssistenteApi } from "@/lib/api-cliente";
import type { TrechoBriefing } from "@/lib/briefing";
import { cn } from "@/lib/cn";
import { FontesMensagem } from "./fontes-mensagem";
import { OndaAudio } from "./onda-audio";
import { useBriefingVoz } from "./use-briefing-voz";

/** Ritmo médio da voz pt-BR do navegador, para a duração exibida no player. */
const CARACTERES_POR_SEGUNDO = 14;

const mmss = (segundos: number) => `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;

/** Trechos agrupados em parágrafos, com o índice global de cada frase (para destacar a que está sendo lida). */
function emParagrafos(trechos: TrechoBriefing[]) {
  return trechos.reduce<Array<Array<{ texto: string; indice: number }>>>((lista, trecho, indice) => {
    if (indice === 0 || trecho.novoParagrafo) lista.push([]);
    lista[lista.length - 1].push({ texto: trecho.texto, indice });
    return lista;
  }, []);
}

/**
 * Resposta de briefing no chat: a única lida em voz (window.speechSynthesis). Começa a falar sozinha
 * quando acabou de chegar porque a pessoa pediu; vinda do histórico, só toca se ela apertar o play.
 */
export function BalaoBriefing({
  mensagem,
  tocarAoChegar,
  onTocou,
}: {
  mensagem: MensagemAssistenteApi;
  tocarAoChegar: boolean;
  onTocou: () => void;
}) {
  const trechos = useMemo<TrechoBriefing[]>(() => mensagem.fala ?? [{ texto: mensagem.texto }], [mensagem.fala, mensagem.texto]);
  const duracao = useMemo(
    () => Math.max(5, Math.round(trechos.reduce((soma, t) => soma + (t.fala ?? t.texto).length + 1, 0) / CARACTERES_POR_SEGUNDO)),
    [trechos],
  );
  const player = useBriefingVoz(trechos, duracao);
  const tocando = player.status === "tocando";
  const paragrafos = useMemo(() => emParagrafos(trechos), [trechos]);

  // A pessoa acabou de pedir o briefing: responde em voz. O pai desliga o aviso para não repetir.
  const { reiniciar } = player;
  useEffect(() => {
    if (!tocarAoChegar) return;
    reiniciar();
    onTocou();
  }, [tocarAoChegar, reiniciar, onTocou]);

  return (
    <div className="w-full max-w-[min(760px,96%)] rounded-[12px] rounded-tl-[2px] border border-interactive/50 bg-[#2B2B2B] px-4 py-3.5 text-[14px] leading-[1.7] text-[#E0E0E0] sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-interactive px-2 py-0.5 text-[10px] leading-4 font-semibold tracking-[0.08em] text-on-interactive uppercase">
          <VolumeUp size={12} aria-hidden="true" />
          Briefing do dia · em voz
        </span>
        {tocando ? (
          <span className="flex items-center gap-1.5 text-[11px] text-interactive">
            <span className="h-1.5 w-1.5 rounded-full bg-interactive motion-safe:animate-pulse" aria-hidden="true" />
            Falando
          </span>
        ) : null}
      </div>

      {/* Player */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={player.alternar}
          aria-label={tocando ? "Pausar briefing" : "Ouvir briefing"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-interactive text-on-interactive shadow-[0_0_0_4px_rgba(254,172,14,0.15)] transition-colors hover:bg-interactive-hover"
        >
          {tocando ? <PauseFilled size={18} /> : <PlayFilledAlt size={18} className="ml-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <OndaAudio ativa={tocando} className="h-8" />
          <label className="sr-only" htmlFor={`progresso-${mensagem.id}`}>
            Posição no briefing
          </label>
          <input
            id={`progresso-${mensagem.id}`}
            type="range"
            min={0}
            max={1000}
            value={Math.round(player.progresso * 1000)}
            onChange={(evento) => player.buscar(Number(evento.target.value) / 1000)}
            aria-valuetext={`${mmss(player.segundos)} de ${mmss(duracao)}`}
            className="h-1 w-full cursor-pointer accent-interactive"
          />
          <div className="flex justify-between font-mono text-[11px] text-shell-text-secondary tabular-nums">
            <span>{mmss(player.segundos)}</span>
            <span>{mmss(duracao)}</span>
          </div>
        </div>
      </div>

      {/* Texto com a frase atual destacada */}
      <div className="mt-3 space-y-2.5">
        {paragrafos.map((paragrafo) => (
          <p key={paragrafo[0].indice}>
            {paragrafo.map(({ texto, indice }) => (
              <span
                key={indice}
                className={cn(
                  "rounded-[2px] transition-colors duration-300",
                  indice === player.trechoAtual
                    ? "bg-interactive/20 text-white shadow-[0_2px_0_var(--interactive)]"
                    : player.trechoAtual > indice
                      ? "text-[#C6C6C6]"
                      : player.trechoAtual >= 0
                        ? "text-[#8D8D8D]"
                        : "text-[#E0E0E0]",
                )}
              >
                {texto}{" "}
              </span>
            ))}
          </p>
        ))}
      </div>

      <FontesMensagem fontes={mensagem.fontes} />
      <p className="mt-2.5 text-[11px] text-text-on-shell-muted" aria-live="polite">
        {player.suportaVoz
          ? `Montado com os dados analisados, sem IA · voz do navegador${player.vozNome ? ` (${player.vozNome})` : ""}`
          : "Montado com os dados analisados, sem IA · síntese de voz indisponível neste navegador: acompanhe pela legenda"}
      </p>
    </div>
  );
}
