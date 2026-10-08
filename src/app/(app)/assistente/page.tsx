import type { Metadata } from "next";
import { Suspense } from "react";
import { CONTAINER_PAGINA, PageHeader } from "@/components/shell/page-header";
import { ChatAssistente } from "./chat-assistente";
import { PainelAssistente } from "./painel-assistente";

export const metadata: Metadata = { title: "Assistente Dialys" };

export default function AssistentePage() {
  return (
    <div className={CONTAINER_PAGINA}>
      <PageHeader
        pagina="Assistente Dialys"
        titulo="Assistente Dialys"
        descricao="Peça o briefing do dia para ouvi-lo em voz, ou pergunte sobre empresas, reuniões, riscos e ações sugeridas."
      />

      {/* Chat (com o briefing em voz) via /api/v1/assistente; compromissos via /api/v1/agenda e ações sugeridas via /api/v1/resumo. O chat lê ?conta= e ?compromisso= no cliente. */}
      <PainelAssistente
        chat={
          <Suspense fallback={<div className="h-[480px] animate-pulse rounded-[12px] bg-shell" />}>
            <ChatAssistente />
          </Suspense>
        }
      />
    </div>
  );
}
