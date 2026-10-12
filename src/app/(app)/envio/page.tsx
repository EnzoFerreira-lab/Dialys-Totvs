import { Growth, InformationFilled, Network_3, WarningAlt } from "@carbon/icons-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CONTAINER_PAGINA, PageHeader } from "@/components/shell/page-header";
import { listarExemplos } from "@/server/ai/demo/exemplos";
import { BoasVindas } from "./boas-vindas";
import { EnvioWorkspace } from "./envio-workspace";

export const metadata: Metadata = {
  title: "Envio de transcrição",
};

/** A análise com IA leva de 20 a 60 s; vale para a Server Action desta página no deploy. */
export const maxDuration = 300;

const DESTAQUES = [
  { icon: WarningAlt, titulo: "Antecipe riscos", descricao: "Identifique sinais de churn." },
  { icon: Growth, titulo: "Encontre oportunidades", descricao: "Revele caminhos para o upsell." },
  { icon: Network_3, titulo: "Conecte o ecossistema", descricao: "Explore o potencial dos produtos TOTVS." },
];

export default function EnvioPage() {
  // Menu Exemplo: amostra real (anonimizada) da TOTVS, em data/exemplos/totvs.
  // Só títulos; o texto é carregado ao escolher.
  const exemplos = listarExemplos();

  return (
    <div className={CONTAINER_PAGINA}>
      {/* Topo na mesma posição das outras abas; o formulário fica estreito e centralizado. */}
      <PageHeader
        pagina="Enviar reunião"
        titulo="Cadastrar e Analisar Reunião"
        descricao="Envie a transcrição bruta da reunião em texto ou arquivo para extração automática de sinais de negócio."
      />

      <div className="mx-auto w-full max-w-[768px]">
        <Suspense>
          <BoasVindas />
        </Suspense>
        <div className="mt-9">
          {/* O compositor lê ?conta= (vindo da ficha do cliente): useSearchParams pede Suspense. */}
          <Suspense fallback={<div className="h-[260px] animate-pulse rounded-[12px] border border-border-subtle bg-layer-01" aria-busy="true" />}>
            <EnvioWorkspace exemplos={exemplos} />
          </Suspense>
        </div>

        <aside className="mt-8 flex gap-4 border border-border-info bg-[#F5F6F8] px-6 py-4">
          <InformationFilled size={16} className="mt-0.5 shrink-0 text-[#262626]" aria-hidden="true" />
          <div>
            <p className="text-[12px] leading-4 font-medium text-text-primary">Inteligência que conecta os pontos.</p>
            <p className="mt-1 text-[11px] leading-4 text-text-secondary">
              A análise via Inteligência Conversacional processa automaticamente churn, oportunidades de upsell e ecossistema de produtos
              TOTVS.
            </p>
          </div>
        </aside>

        <hr className="mt-8 border-border-subtle" />

        <ul className="mt-6 grid gap-5 sm:grid-cols-3 sm:gap-4">
          {DESTAQUES.map(({ icon: Icon, titulo, descricao }) => (
            <li key={titulo} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] bg-layer-01 text-text-primary">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-[12px] leading-4 font-medium text-[#262626]">{titulo}</span>
                <span className="mt-1 block text-[11px] leading-4 text-text-helper">{descricao}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
