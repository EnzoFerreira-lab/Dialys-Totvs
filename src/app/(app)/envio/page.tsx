import { Growth, InformationFilled, Network_3, WarningAlt } from "@carbon/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { listarExemplos } from "@/server/ai/demo/exemplos";
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
  // Menu Exemplo: amostra real da TOTVS (data/demo/totvs) e cenários roteirizados (data/demo/cenarios).
  // Só títulos; o texto é carregado ao escolher.
  const exemplos = listarExemplos();

  return (
    <div className="mx-auto w-full max-w-[800px] px-4 pt-10 pb-16 sm:px-4 sm:pt-11">
      <nav aria-label="Trilha de navegação" className="text-[11px] text-text-secondary">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/clientes" className="hover:text-text-primary hover:underline">
              Workspace
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-text-primary">
            Envio de transcrição
          </li>
        </ol>
      </nav>

      <p className="mt-12 flex items-center gap-2 text-[11px] leading-none tracking-[0.12em] text-text-helper uppercase">
        <span className="h-[3px] w-[3px] bg-interactive" aria-hidden="true" />
        Da conversa à inteligência
      </p>
      <h1 className="mt-4 text-[18px] leading-6 font-medium text-text-primary">Cadastrar e Analisar Reunião</h1>
      <p className="mt-2.5 max-w-[510px] text-[13px] leading-[1.6] text-text-secondary">
        Envie a transcrição bruta da reunião em texto ou arquivo para extração automática de sinais de negócio.
      </p>

      <div className="mt-9">
        <EnvioWorkspace exemplos={exemplos} />
      </div>

      <aside className="mt-8 flex gap-4 border border-border-info bg-[#F5F6F8] px-6 py-4">
        <InformationFilled size={16} className="mt-0.5 shrink-0 text-[#262626]" aria-hidden="true" />
        <div>
          <p className="text-[12px] leading-4 font-medium text-text-primary">Inteligência que conecta os pontos.</p>
          <p className="mt-1 text-[11px] leading-4 text-text-secondary">
            A análise via Inteligência Conversacional processa automaticamente churn, oportunidades de upsell e
            ecossistema de produtos TOTVS.
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
  );
}
