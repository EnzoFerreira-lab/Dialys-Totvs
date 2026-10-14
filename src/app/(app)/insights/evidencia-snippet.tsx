import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Evidencia, TipoDestaque, Urgencia } from "@/lib/insights";

type Tom = "churn-critico" | "churn-atencao" | Exclude<TipoDestaque, "churn">;

/** Cores por criticidade, as mesmas das etiquetas de sinal (docs/ARQUITETURA.md §5.2). */
const DESTAQUE: Record<Tom, { marca: string; legenda: string }> = {
  "churn-critico": { marca: "bg-[#FFD7D9] text-[#750E13] decoration-[#DA1E28]", legenda: "Churn crítico" },
  "churn-atencao": { marca: "bg-[#FFD9BE] text-[#8A3800] decoration-[#FF832B]", legenda: "Churn atenção" },
  oportunidade: { marca: "bg-[#A7F0BA] text-[#044317] decoration-[#24A148]", legenda: "Oportunidade" },
  objecao: { marca: "bg-[#FCF4D6] text-[#684E00] decoration-[#B28600]", legenda: "Objeção" },
  produto: { marca: "bg-[#D0E2FF] text-[#002D9C] decoration-[#0F62FE]", legenda: "Produto TOTVS" },
  concorrente: { marca: "bg-[#E0E0E0] text-[#161616] decoration-[#6F6F6F]", legenda: "Concorrente" },
};

const tomDe = (tipo: TipoDestaque, urgencia?: Urgencia): Tom =>
  tipo === "churn" ? (urgencia === "media" ? "churn-atencao" : "churn-critico") : tipo;

/** Prioridade quando dois destaques se sobrepõem: a ordem da legenda (o mais crítico primeiro). */
const PRIORIDADE = Object.keys(DESTAQUE) as Tom[];

/**
 * Quebra o texto literal nos trechos destacados, preservando a ordem original. Citações que se sobrepõem
 * (ex.: o churn dentro de uma objeção mais longa) não somem: cada pedaço fica com o destaque mais crítico
 * que o cobre, então o churn aparece em vermelho e o restante da objeção continua em amarelo.
 */
function marcarTrechos({ texto, destaques }: Evidencia) {
  const tomPorCaractere: Array<Tom | null> = new Array(texto.length).fill(null);
  for (const destaque of destaques) {
    const inicio = texto.indexOf(destaque.trecho);
    if (inicio < 0) continue;
    const tom = tomDe(destaque.tipo, destaque.urgencia);
    for (let i = inicio; i < inicio + destaque.trecho.length; i++) {
      const atual = tomPorCaractere[i];
      if (atual === null || PRIORIDADE.indexOf(tom) < PRIORIDADE.indexOf(atual)) tomPorCaractere[i] = tom;
    }
  }

  const partes: ReactNode[] = [];
  for (let inicio = 0; inicio < texto.length; ) {
    const tom = tomPorCaractere[inicio];
    let fim = inicio + 1;
    while (fim < texto.length && tomPorCaractere[fim] === tom) fim++;
    const trecho = texto.slice(inicio, fim);
    partes.push(
      tom ? (
        <mark key={inicio} className={cn("rounded-[2px] px-0.5 underline decoration-2 underline-offset-[3px]", DESTAQUE[tom].marca)}>
          {trecho}
          <span className="sr-only"> ({DESTAQUE[tom].legenda})</span>
        </mark>
      ) : (
        trecho
      ),
    );
    inicio = fim;
  }
  return partes;
}

/** Legenda única para todos os trechos da seção, na ordem de criticidade. */
export function LegendaDestaques({ evidencias }: { evidencias: Evidencia[] }) {
  const usados = new Set(evidencias.flatMap((e) => e.destaques.map((d) => tomDe(d.tipo, d.urgencia))));
  const tons = (Object.keys(DESTAQUE) as Tom[]).filter((tom) => usados.has(tom));
  if (tons.length === 0) return null;
  return (
    <ul aria-label="Legenda dos destaques" className="flex flex-wrap gap-x-4 gap-y-1">
      {tons.map((tom) => (
        <li key={tom} className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <span className={cn("h-2.5 w-2.5 rounded-[2px]", DESTAQUE[tom].marca.split(" ")[0])} aria-hidden="true" />
          {DESTAQUE[tom].legenda}
        </li>
      ))}
    </ul>
  );
}

/** Trecho literal da reunião (fala de um locutor) com as citações destacadas pela criticidade do sinal. */
export function EvidenciaSnippet({ evidencia }: { evidencia: Evidencia }) {
  const partes = marcarTrechos(evidencia);

  return (
    <figure>
      <figcaption className="mb-1.5 text-[11px] text-text-helper">
        {evidencia.instante ? <span className="font-mono">{evidencia.instante} · </span> : null}
        {evidencia.falante}
      </figcaption>
      <blockquote className="border-l-2 border-[#8D8D8D] bg-[#F4F4F4] px-4 py-3 font-mono text-[13px] leading-[1.85] text-text-primary">
        {partes}
      </blockquote>
    </figure>
  );
}
