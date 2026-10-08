"use client";

import { ArrowRight, Calendar } from "@carbon/icons-react";
import Link from "next/link";
import { ROTULO_STATUS } from "@/lib/agenda";
import type { ListaAgendaApi } from "@/lib/api-cliente";
import { cn } from "@/lib/cn";
import { horaNoFuso } from "@/lib/fuso";

/**
 * Compromissos de hoje: a mesma agenda da Home (GET /api/v1/agenda, mesmos ids). "Preparar" abre a
 * conversa com o compromisso em foco, sem enviar pergunta.
 */
export function CompromissosHoje({ agenda }: { agenda: ListaAgendaApi }) {
  const { fuso, dados } = agenda;
  return (
    <section aria-labelledby="titulo-compromissos-hoje" className="rounded-[12px] border border-border-subtle bg-layer-01">
      <h2 id="titulo-compromissos-hoje" className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-5 py-4 text-[15px] leading-5 font-semibold text-text-primary">
        <Calendar size={16} aria-hidden="true" />
        Compromissos de hoje
      </h2>
      {dados.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-text-secondary">Nenhum compromisso hoje.</p>
      ) : (
        <ul>
          {dados.map((c) => (
            <li key={c.id} className="flex gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0">
              <span className={cn("w-11 shrink-0 pt-px font-mono text-[12px] tabular-nums", c.status === "agendado" ? "text-text-primary" : "text-text-helper")}>
                {horaNoFuso(new Date(c.inicio), fuso)}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[13px] leading-5 font-medium text-text-primary", c.status === "cancelado" && "text-text-helper line-through")}>{c.titulo}</p>
                <p className="text-[12px] text-text-secondary">
                  {c.cliente ? c.cliente.nome : "Interno"}
                  {c.status !== "agendado" ? ` · ${ROTULO_STATUS[c.status]}` : ""}
                </p>
                {c.status === "agendado" ? (
                  <Link
                    href={`/assistente?${new URLSearchParams({ compromisso: c.id })}`}
                    scroll={false}
                    className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-text-primary underline-offset-[3px] hover:underline"
                  >
                    Preparar com o Dialys
                    <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border-subtle px-5 py-3 text-[11px] leading-4 text-text-helper">
        Para criar ou editar compromissos, use a agenda da{" "}
        <Link href="/clientes" className="underline underline-offset-2 hover:text-text-primary">
          Home
        </Link>
        .
      </p>
    </section>
  );
}
