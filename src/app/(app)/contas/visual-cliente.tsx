// Peças visuais comuns da aba Clientes (lista e ficha): situação, tendência e contagem de alertas.
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "@carbon/icons-react";
import { cn } from "@/lib/cn";
import type { Criticidade } from "@/lib/insights";
import { ROTULO_FAIXA, type FaixaSaude } from "@/lib/saude";
import type { Tendencia } from "@/server/clientes/perfil";

export const COR_FAIXA: Record<FaixaSaude, string> = {
  risco: "bg-[#FFD7D9] text-[#A2191F]",
  estavel: "bg-[#FCF4D6] text-[#684E00]",
  saudavel: "bg-[#A7F0BA] text-[#044317]",
};

export const CRITICIDADE: Record<Criticidade, { rotulo: string; classe: string }> = {
  alta: { rotulo: "Alta", classe: "bg-[#FFD7D9] text-[#A2191F]" },
  atencao: { rotulo: "Atenção", classe: "bg-[#FFE8BA] text-[#8A3800]" },
  baixa: { rotulo: "Baixa", classe: "bg-[#E0E0E0] text-[#525252]" },
};

const nota = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "Em risco · 4,5" ou "Sem avaliação" (nenhuma reunião com transcrição ativa), como na Home. */
export function SituacaoCliente({ saude, className }: { saude: { nota: number; faixa: FaixaSaude } | null; className?: string }) {
  if (!saude) {
    return (
      <span className={cn("rounded-full border border-dashed border-[#A8A8A8] px-2 py-0.5 text-[11px] text-text-secondary", className)}>
        Sem avaliação
      </span>
    );
  }
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap tabular-nums", COR_FAIXA[saude.faixa], className)}>
      {ROTULO_FAIXA[saude.faixa]} · {nota(saude.nota)}
    </span>
  );
}

const TENDENCIA: Record<Tendencia, { rotulo: string; classe: string; Icone: typeof ArrowUpRight }> = {
  melhorou: { rotulo: "Melhorou", classe: "text-[#198038]", Icone: ArrowUpRight },
  piorou: { rotulo: "Piorou", classe: "text-[#DA1E28]", Icone: ArrowDownRight },
  estavel: { rotulo: "Estável", classe: "text-text-secondary", Icone: ArrowRight },
};

/** Saúde da última reunião comparada à anterior. */
export function TendenciaCliente({ tendencia, comRotulo = false }: { tendencia: Tendencia | null; comRotulo?: boolean }) {
  if (!tendencia) return null;
  const { rotulo, classe, Icone } = TENDENCIA[tendencia];
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", classe)} title={`${rotulo} em relação à reunião anterior`}>
      <Icone size={14} aria-hidden="true" />
      {comRotulo ? rotulo : <span className="sr-only">{rotulo} em relação à reunião anterior</span>}
    </span>
  );
}

/** Contagem de sinais por tipo, com cor e rótulo acessível. */
export function ContagemAlertas({ alertas }: { alertas: { churn: number; oportunidade: number; objecao: number } }) {
  const itens = [
    { n: alertas.churn, rotulo: "risco de churn", ponto: "bg-[#DA1E28]" },
    { n: alertas.oportunidade, rotulo: "oportunidade", ponto: "bg-[#24A148]" },
    { n: alertas.objecao, rotulo: "objeção", ponto: "bg-[#D2A106]" },
  ];
  if (itens.every((i) => i.n === 0)) return <span className="text-[12px] text-text-helper">Nenhum</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] tabular-nums">
      {itens
        .filter((i) => i.n > 0)
        .map((i) => (
          <span key={i.rotulo} className="inline-flex items-center gap-1" title={`${i.n} ${i.rotulo}`}>
            <span className={cn("h-2 w-2 rounded-full", i.ponto)} aria-hidden="true" />
            {i.n}
            <span className="sr-only"> {i.rotulo}</span>
          </span>
        ))}
    </span>
  );
}
