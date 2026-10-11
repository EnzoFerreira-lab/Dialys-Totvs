"use client";

import { AiGenerate, Checkmark, Renew, WarningAlt } from "@carbon/icons-react";
import { useState } from "react";
import { SignalTag, type SignalVariant } from "@/components/sinais/signal-tag";
import { api, ErroDaApi, type PautaSugerida } from "@/lib/api-cliente";
import { cn } from "@/lib/cn";

const TAG: Record<PautaSugerida["assuntos"][number]["categoria"], { variant: SignalVariant; rotulo: string } | null> = {
  risco: { variant: "churn-critico", rotulo: "Risco" },
  oportunidade: { variant: "oportunidade", rotulo: "Oportunidade" },
  objecao: { variant: "objecao", rotulo: "Objeção" },
  acompanhamento: null,
};

const ORIGEM: Record<PautaSugerida["origem"], string> = {
  nemotron: "Sugerida pela IA (Nemotron)",
  claude: "Sugerida pela IA (Claude)",
  regras: "Montada a partir das ações registradas, sem IA",
};

const BOTAO =
  "inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[#8D8D8D] px-3 text-[12px] font-medium text-text-primary transition-colors hover:bg-[#F2F2F2] disabled:cursor-not-allowed disabled:opacity-50";

type Estado = { fase: "inicio" } | { fase: "carregando" } | { fase: "pronta"; pauta: PautaSugerida } | { fase: "erro"; mensagem: string };

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.06em] text-text-helper uppercase">{titulo}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] leading-[1.5] text-text-primary">
        {itens.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Sugerir pauta com IA" no cadastro de compromisso: objetivo, assuntos (com a fala do cliente) e
 * direcionamento, a partir das reuniões analisadas do cliente. Só roda ao clicar (gasta 1 requisição da
 * IA) e não grava nada: "Usar nas observações" copia o texto para o campo, que o usuário ainda pode editar.
 * O componente é recriado (key) quando o cliente muda, então a pauta nunca é de outro cliente.
 */
export function SugestaoPauta({
  contaId,
  titulo,
  data,
  onUsar,
  desabilitado,
}: {
  contaId: string;
  titulo: string;
  data: string;
  onUsar: (texto: string) => void;
  desabilitado?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "inicio" });
  const [usada, setUsada] = useState(false);

  async function gerar() {
    setEstado({ fase: "carregando" });
    setUsada(false);
    try {
      const pauta = await api.sugerirPauta({ contaId, ...(titulo.trim() ? { titulo: titulo.trim() } : {}), ...(data ? { data } : {}) });
      setEstado({ fase: "pronta", pauta });
    } catch (erro) {
      setEstado({ fase: "erro", mensagem: erro instanceof ErroDaApi ? erro.message : "Não foi possível sugerir a pauta agora." });
    }
  }

  if (estado.fase === "inicio" || estado.fase === "carregando") {
    const carregando = estado.fase === "carregando";
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-dashed border-[#C6C6C6] bg-[#F7F7F7] px-4 py-3">
        <button type="button" onClick={() => void gerar()} disabled={carregando || desabilitado} aria-busy={carregando} className={BOTAO}>
          {carregando ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" aria-hidden="true" />
          ) : (
            <AiGenerate size={16} aria-hidden="true" />
          )}
          {carregando ? "Preparando a pauta..." : "Sugerir pauta com IA"}
        </button>
        <p className="min-w-0 flex-1 text-[12px] leading-4 text-text-helper">
          Objetivo, assuntos importantes e como conduzir, a partir das reuniões analisadas deste cliente.
        </p>
      </div>
    );
  }

  if (estado.fase === "erro") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[#FFB3B8] bg-[#FFF1F1] px-4 py-3 text-[13px]">
        <WarningAlt size={16} className="shrink-0 text-support-error" aria-hidden="true" />
        <span className="min-w-0 flex-1">{estado.mensagem}</span>
        <button type="button" onClick={() => void gerar()} className={BOTAO}>
          <Renew size={14} aria-hidden="true" />
          Tentar de novo
        </button>
      </div>
    );
  }

  const { pauta } = estado;
  return (
    <section aria-label="Pauta sugerida" className="rounded-[8px] border border-border-subtle bg-layer-01">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
            <AiGenerate size={16} aria-hidden="true" />
            Pauta sugerida
          </p>
          <p className="mt-0.5 text-[11px] text-text-helper">
            {ORIGEM[pauta.origem]}
            {pauta.fontes.length ? ` · com base em ${pauta.fontes.join("; ")}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void gerar()} disabled={desabilitado} className={BOTAO} title="Gerar outra sugestão">
            <Renew size={14} aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Gerar de novo</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onUsar(pauta.textoObservacoes);
              setUsada(true);
            }}
            disabled={desabilitado}
            className={cn(BOTAO, usada && "border-[#24A148] text-[#0E6027]")}
          >
            {usada ? <Checkmark size={14} aria-hidden="true" /> : null}
            {usada ? "Copiada para Observações" : "Usar nas observações"}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
        {pauta.aviso ? <p className="rounded-[4px] bg-[#FCF4D6] px-3 py-2 text-[12px] text-[#684E00]">{pauta.aviso}</p> : null}
        {pauta.semHistorico ? (
          <p className="rounded-[4px] bg-[#F2F2F2] px-3 py-2 text-[12px] text-text-secondary">
            Este cliente ainda não tem reuniões analisadas no Dialys: a pauta é um roteiro de primeira conversa, sem histórico.
          </p>
        ) : null}

        <div>
          <p className="text-[11px] font-semibold tracking-[0.06em] text-text-helper uppercase">Objetivo</p>
          <p className="mt-1 text-[14px] leading-[1.5] font-medium text-text-primary">{pauta.objetivo}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold tracking-[0.06em] text-text-helper uppercase">Assuntos importantes</p>
          <ol className="mt-1.5 flex flex-col gap-2.5">
            {pauta.assuntos.map((assunto, indice) => {
              const tag = TAG[assunto.categoria];
              return (
                <li key={`${assunto.titulo}-${indice}`} className="text-[13px] leading-[1.5] text-text-primary">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-text-helper">{indice + 1}.</span>
                    <span className="font-medium">{assunto.titulo}</span>
                    {tag ? <SignalTag variant={tag.variant}>{tag.rotulo}</SignalTag> : null}
                  </div>
                  <p className="mt-0.5 pl-5 text-text-secondary">{assunto.detalhe}</p>
                  {assunto.citacao ? (
                    <blockquote className="mt-1 ml-5 border-l-2 border-[#C6C6C6] pl-2.5 text-[12px] text-text-secondary italic">
                      “{assunto.citacao}”{assunto.reuniao ? <span className="not-italic text-text-helper"> · {assunto.reuniao}</span> : null}
                    </blockquote>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Lista titulo="Levar" itens={pauta.direcionamento.levar} />
          <Lista titulo="Perguntar" itens={pauta.direcionamento.perguntar} />
          <Lista titulo="Evitar" itens={pauta.direcionamento.evitar} />
        </div>
      </div>
    </section>
  );
}
