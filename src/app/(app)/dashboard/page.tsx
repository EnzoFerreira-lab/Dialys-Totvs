import { ArrowRight } from "@carbon/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BOTAO_ACAO_CABECALHO, CONTAINER_PAGINA, PageHeader } from "@/components/shell/page-header";
import { BotaoExportarAlertas } from "./botao-exportar-alertas";
import { PainelExecutivo } from "./painel-executivo";

export const metadata: Metadata = { title: "Dashboard Comercial" };

export default function DashboardPage() {
  return (
    <div className={CONTAINER_PAGINA}>
      <PageHeader
        pagina="Dashboard"
        titulo="Dashboard Comercial"
        descricao="Transforme os sinais da sua carteira em decisões que preservam e expandem receita."
        acoes={
          <>
            <BotaoExportarAlertas />
            <Link href="/envio" className={BOTAO_ACAO_CABECALHO}>
              Nova análise
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </>
        }
      />

      {/* KPIs, alertas e radar vêm da API no navegador; ?nova= (vindo do /envio) é lido no cliente. */}
      <Suspense>
        <PainelExecutivo />
      </Suspense>
    </div>
  );
}
