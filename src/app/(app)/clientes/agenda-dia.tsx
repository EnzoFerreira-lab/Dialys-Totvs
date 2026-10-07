"use client";

import { ChevronRight } from "@carbon/icons-react";
import { ROTULO_STATUS, type Compromisso } from "@/lib/agenda";
import { cn } from "@/lib/cn";
import { dataNoFuso, type DataCivil } from "@/lib/fuso";
import { COR_STATUS, corBloco, descricaoAcessivel, intervalo } from "./estilo-compromisso";

/** Lista do dia (celular): compromissos em ordem de horário; tocar abre os detalhes. */
export function AgendaDia({ data, fuso, compromissos, onAbrir }: { data: DataCivil; fuso: string; compromissos: Compromisso[]; onAbrir: (c: Compromisso) => void }) {
  const doDia = compromissos.filter((c) => dataNoFuso(new Date(c.inicio), fuso) === data);
  if (doDia.length === 0) {
    return <p className="px-4 py-10 text-center text-[13px] text-text-secondary">Nenhum compromisso neste dia.</p>;
  }
  return (
    <ul className="flex flex-col gap-2 px-4 pb-4" aria-label="Compromissos do dia">
      {doDia.map((compromisso) => (
        <li key={compromisso.id}>
          <button
            type="button"
            onClick={() => onAbrir(compromisso)}
            aria-label={descricaoAcessivel(compromisso, fuso)}
            className={cn("flex w-full items-center gap-3 rounded-[6px] border-l-[3px] px-3 py-2.5 text-left transition-[filter] hover:brightness-95", corBloco(compromisso))}
          >
            <span className="w-[86px] shrink-0 text-[12px] font-medium tabular-nums no-underline">{intervalo(compromisso, fuso)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] leading-5 font-semibold">{compromisso.titulo}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] no-underline opacity-90">
                {compromisso.cliente ? <span className="truncate">{compromisso.cliente.nome}</span> : <span>Interno</span>}
                {compromisso.status !== "agendado" ? (
                  <span className={cn("rounded-full px-1.5 py-px text-[10px] font-medium", COR_STATUS[compromisso.status])}>{ROTULO_STATUS[compromisso.status]}</span>
                ) : null}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 opacity-60" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
