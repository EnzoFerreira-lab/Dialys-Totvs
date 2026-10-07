import { ArrowRight } from "@carbon/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { BotaoExportarAlertas } from "./botao-exportar-alertas";
import { PainelExecutivo } from "./painel-executivo";

export const metadata: Metadata = { title: "Dashboard Comercial" };

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-[1312px] px-4 pt-6 pb-16 sm:px-8 sm:pt-7">
      <nav aria-label="Trilha de navegação" className="text-[11px] text-text-secondary print:hidden">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/clientes" className="text-[#0F62FE] hover:underline">
              Workspace
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-text-primary">
            Dashboard
          </li>
        </ol>
      </nav>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          kicker="Visão executiva"
          titulo="Dashboard Comercial"
          descricao="Transforme os sinais da sua carteira em decisões que preservam e expandem receita."
        />
        <div className="flex shrink-0 items-start gap-2 print:hidden">
          <BotaoExportarAlertas />
          <Link
            href="/envio"
            className="inline-flex h-10 items-center gap-6 rounded-[4px] bg-interactive px-4 text-[13px] font-medium text-on-interactive transition-colors hover:bg-interactive-hover active:bg-interactive-active"
          >
            Nova análise
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* KPIs, alertas e radar vêm da API no navegador; ?nova= (vindo do /envio) é lido no cliente. */}
      <Suspense>
        <PainelExecutivo />
      </Suspense>
    </div>
  );
}
