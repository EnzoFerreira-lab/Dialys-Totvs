import { ArrowRight, Upload } from "@carbon/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { usuarioDaSessao } from "@/server/auth/sessao-pagina";
import { buscarClienteNoCadastro } from "@/server/clientes/clientes";
import { podeAcessarConta } from "@/server/auth/usuarios";
import { listarReunioesCentral } from "@/server/insights/contas";
import { usarModoDemonstracao } from "@/server/pipeline/motor-analise";
import { CentralInsights } from "./central-insights";

export const metadata: Metadata = { title: "Central de Insights" };

function CarregandoInsights() {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]" aria-busy="true" aria-label="Carregando insights">
      <div className="h-[560px] animate-pulse border border-border-subtle bg-layer-01" />
      <div className="h-[640px] animate-pulse border border-border-subtle bg-layer-01" />
    </div>
  );
}

type ParametrosBusca = Promise<{ [chave: string]: string | string[] | undefined }>;

/** "Ver cliente" de um cliente da carteira que ainda não tem reunião analisada: não há o que mostrar na Central. */
function ClienteSemAnalise({ nome, segmento }: { nome: string; segmento: string | null }) {
  return (
    <EstadoConta rotulo={segmento ?? "Cliente da sua carteira"} titulo={nome} selo="Sem avaliação">
      Ainda não há reuniões analisadas deste cliente, então o Dialys não tem sinais, evidências nem saúde calculada para mostrar. Envie a
      transcrição de uma reunião para a análise aparecer aqui.
    </EstadoConta>
  );
}

function EstadoConta({ rotulo, titulo, selo, children }: { rotulo: string; titulo: string; selo?: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-[12px] border border-border-subtle bg-layer-01 px-5 py-8 sm:px-8" aria-labelledby="titulo-sem-analise">
      <p className="text-[12px] text-text-secondary">{rotulo}</p>
      <h2 id="titulo-sem-analise" className="mt-1 text-[22px] leading-8 font-normal text-text-primary">
        {titulo}
      </h2>
      {selo ? (
        <span className="mt-3 inline-block rounded-full border border-dashed border-[#A8A8A8] px-2.5 py-0.5 text-[12px] text-text-secondary">{selo}</span>
      ) : null}
      <p className="mt-4 max-w-[620px] text-[14px] leading-[1.6] text-text-secondary">{children}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/envio"
          className="inline-flex h-10 items-center gap-2 rounded-[4px] bg-interactive px-4 text-[13px] font-medium text-on-interactive transition-colors hover:bg-interactive-hover"
        >
          <Upload size={16} aria-hidden="true" />
          Enviar reunião
        </Link>
        <Link href="/insights" className="inline-flex h-10 items-center rounded-[4px] border border-[#8D8D8D] px-4 text-[13px] font-medium text-text-primary hover:bg-[#F2F2F2]">
          Ver contas analisadas
        </Link>
      </div>
    </section>
  );
}

/**
 * Reuniões analisadas, uma por linha, lidas a cada visita (uma nova análise aparece sem rebuild) e
 * filtradas pelo escopo do usuário da sessão. A seleção vem da URL, lida no cliente:
 *   ?reuniao=<id>  abre essa reunião;
 *   ?conta=<id>    abre a reunião mais recente do cliente. Cliente da carteira sem reunião analisada:
 *                  estado vazio dele (nome lido no servidor, do cadastro do usuário; nunca do link).
 */
async function InsightsDasReunioes({ searchParams }: { searchParams: ParametrosBusca }) {
  await connection();
  const usuario = await usuarioDaSessao();
  if (!usuario) redirect("/login?volta=/insights");
  const { conta } = await searchParams;
  const reunioes = await listarReunioesCentral((contaId) => podeAcessarConta(usuario, contaId));
  if (typeof conta === "string" && conta && !reunioes.some((r) => r.conta.id === conta)) {
    const cliente = await buscarClienteNoCadastro(usuario, conta);
    if (cliente) return <ClienteSemAnalise nome={cliente.nome} segmento={cliente.segmento} />;
    // Inexistente ou fora do escopo: a mesma resposta, sem abrir outra conta no lugar.
    return (
      <EstadoConta rotulo="Central de Insights" titulo="Cliente não encontrado">
        Este cliente não está entre as contas que você pode acessar, ou o link está incompleto.
      </EstadoConta>
    );
  }
  return <CentralInsights reunioes={reunioes} modoDemonstracao={usarModoDemonstracao()} />;
}

export default function InsightsPage({ searchParams }: { searchParams: ParametrosBusca }) {
  return (
    <div className="mx-auto w-full max-w-[1312px] px-4 pt-6 pb-10 sm:px-8 sm:pt-7">
      <nav aria-label="Trilha de navegação" className="text-[11px] text-text-secondary print:hidden">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/clientes" className="hover:text-text-primary hover:underline">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-text-primary">
            Central de Insights
          </li>
        </ol>
      </nav>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <header>
          <h1 className="text-[28px] leading-9 font-normal text-text-primary sm:text-[32px] sm:leading-10">Central de Insights</h1>
          <p className="mt-1 text-[14px] leading-[1.6] text-text-secondary">
            Da conversa à ação: explore as análises e os próximos passos de cada reunião.
          </p>
        </header>
        <Link
          href="/envio"
          className="inline-flex h-10 shrink-0 items-center gap-6 self-start border border-[#8D8D8D] bg-layer-01 px-4 text-[13px] font-medium text-text-primary transition-colors hover:bg-[#F2F2F2] sm:self-auto"
        >
          Enviar nova reunião
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <Suspense fallback={<CarregandoInsights />}>
        <InsightsDasReunioes searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
