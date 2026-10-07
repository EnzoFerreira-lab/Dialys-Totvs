import { ArrowRight, Chat, CheckmarkFilled, Growth, WarningAlt } from "@carbon/icons-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { linkReuniao, type Alerta } from "@/lib/alertas";
import { cn } from "@/lib/cn";
import type { TipoSinal } from "@/lib/insights";
import { extrairValorReais, formatarReais } from "@/lib/valores";

const APRESENTACAO: Record<
  TipoSinal,
  { borda: string; icone: ComponentType<{ size?: number; className?: string }>; corIcone: string; tag: string; rotulo: string }
> = {
  churn: {
    borda: "border-l-[#DA1E28]",
    icone: WarningAlt,
    corIcone: "text-[#DA1E28]",
    tag: "bg-[#FFD7D9] text-[#750E13]",
    rotulo: "Risco de churn",
  },
  oportunidade: {
    borda: "border-l-[#24A148]",
    icone: Growth,
    corIcone: "text-[#198038]",
    tag: "bg-[#A7F0BA] text-[#044317]",
    rotulo: "Upsell / cross-sell",
  },
  objecao: {
    borda: "border-l-[#D2A106]",
    icone: Chat,
    corIcone: "text-[#8E6A00]",
    tag: "bg-[#F1C21B] text-[#161616]",
    rotulo: "Objeção de jornada",
  },
};

function rotuloTag(alerta: Alerta) {
  const nivel = alerta.urgencia === "alta" ? "alta" : "média";
  return `${APRESENTACAO[alerta.tipo].rotulo} — ${nivel} ${alerta.tipo === "oportunidade" ? "probabilidade" : "criticidade"}`;
}

/** Card compacto do feed: o quê, quanto (se a reunião citou valor), o que fazer e onde ver a evidência. */
export function AlertaCard({ alerta, novo = false }: { alerta: Alerta; novo?: boolean }) {
  const { borda, icone: Icone, corIcone, tag } = APRESENTACAO[alerta.tipo];
  const valor = alerta.tipo === "churn" ? extrairValorReais(`${alerta.evidencia} ${alerta.acao}`) : null;

  return (
    <article
      aria-labelledby={`alerta-${alerta.id}`}
      className={cn(
        "rounded-[4px] border border-l-[3px] bg-layer-01 px-4 py-3.5 sm:px-5",
        borda,
        novo ? "border-y-interactive border-r-interactive shadow-[0_0_0_2px_rgba(254,172,14,0.2)]" : "border-y-border-subtle border-r-border-subtle",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 id={`alerta-${alerta.id}`} className="flex min-w-0 items-center gap-2 text-[15px] leading-5 font-semibold text-text-primary">
          <Icone size={18} className={cn("shrink-0", corIcone)} aria-hidden="true" />
          <span className="truncate">{alerta.empresa}</span>
          {novo ? (
            <span className="shrink-0 rounded-full bg-interactive px-2 py-0.5 text-[10px] leading-4 font-semibold tracking-[0.06em] text-on-interactive uppercase">
              Novo
            </span>
          ) : null}
        </h3>
        <span className={cn("rounded-[2px] px-2 py-0.5 text-[11px] leading-4 font-semibold tracking-[0.04em] uppercase", tag)}>
          {rotuloTag(alerta)}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-[13px] leading-[1.5] text-text-primary">
        <span className="font-medium">{alerta.subtipo}:</span> “{alerta.evidencia}”
        {valor !== null ? <span className="font-semibold text-[#DA1E28]"> Valor em risco: {formatarReais(valor)}.</span> : null}
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.06em] text-text-helper uppercase">Ação recomendada</p>
          <p className="mt-0.5 text-[13px] leading-[1.45] text-text-primary">{alerta.acao}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-text-helper">
            <span>
              {alerta.reuniaoCodigo} · {alerta.quando}
            </span>
            <span>Confiança da IA {Math.round(alerta.confianca * 100)}%</span>
            {alerta.sincronizadoCrm ? (
              <span className="flex items-center gap-1 text-[#198038]">
                <CheckmarkFilled size={12} aria-hidden="true" />
                No CRM
              </span>
            ) : null}
          </p>
        </div>
        <Link
          href={linkReuniao(alerta.reuniaoId)}
          className="flex shrink-0 items-center gap-1.5 self-start text-[13px] font-medium text-text-primary underline-offset-[3px] hover:underline sm:self-end"
          aria-label={`Ver análise de ${alerta.empresa}`}
        >
          Ver análise
          <ArrowRight size={16} className="text-interactive" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
