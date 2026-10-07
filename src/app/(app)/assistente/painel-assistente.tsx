"use client";

import type { ReactNode } from "react";
import { api } from "@/lib/api-cliente";
import { useDadosApi } from "@/lib/use-dados-api";
import { AcoesSugeridas } from "./acoes-sugeridas";
import { CompromissosHoje } from "./compromissos-hoje";

/** Agenda e ações mudam pouco: atualiza a cada minuto. */
const ATUALIZACAO_MS = 60_000;

function Carregando() {
  return <div className="h-[200px] animate-pulse rounded-[12px] border border-border-subtle bg-layer-01" aria-busy="true" />;
}

function Falha({ texto }: { texto: string }) {
  return (
    <p role="alert" className="rounded-[12px] border border-border-subtle bg-layer-01 px-5 py-6 text-[13px] text-text-secondary">
      {texto}
    </p>
  );
}

/**
 * Conversa com o Dialys (inclui o briefing em voz) e, ao lado, separados: os compromissos de hoje (agenda
 * do usuário, GET /api/v1/agenda) e as ações sugeridas pela análise, sem horário (GET /api/v1/resumo).
 */
export function PainelAssistente({ chat }: { chat: ReactNode }) {
  const { dados: agenda, erro: erroAgenda } = useDadosApi(api.agendaDeHoje, ATUALIZACAO_MS);
  const { dados: resumo, erro: erroResumo } = useDadosApi(api.resumo, ATUALIZACAO_MS);

  return (
    <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">{chat}</div>
      <aside aria-label="Agenda e ações do dia" className="flex flex-col gap-4 lg:sticky lg:top-16">
        {agenda ? <CompromissosHoje agenda={agenda} /> : erroAgenda ? <Falha texto={`Não foi possível carregar a agenda: ${erroAgenda.message}`} /> : <Carregando />}
        {resumo ? (
          <AcoesSugeridas agenda={resumo.agenda} />
        ) : erroResumo ? (
          <Falha texto={`Não foi possível carregar as ações sugeridas: ${erroResumo.message}`} />
        ) : (
          <Carregando />
        )}
      </aside>
    </div>
  );
}
