"use client";

import {
  CheckmarkFilled,
  DocumentView,
  ErrorFilled,
  Idea,
  ListChecked,
  Product,
  TextLinkAnalysis,
  Time,
  WarningAlt,
} from "@carbon/icons-react";
import type { ComponentType, ReactNode } from "react";
import { SignalTag, type SignalVariant } from "@/components/sinais/signal-tag";
import { cn } from "@/lib/cn";
import type { ContaResumo } from "@/lib/mock/contas";
import { descreverContexto, type ContextoReuniao } from "@/lib/transcricao";
import type { ResultadoAnalise } from "@/server/ai/analisar-reuniao";
import type { StatusProduto } from "@/server/ai/schemas";
import type { MotivoDescarte, SinalValidado } from "@/server/ai/validar-evidencia";
import type { NomeEtapa, StatusEtapa } from "@/server/db/banco";
import type { FalhaAnalise } from "./actions";

const numero = new Intl.NumberFormat("pt-BR");
const dolar = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 4 });
const segundos = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const SEVERIDADE = { ALTA: "alta", MÉDIA: "média", BAIXA: "baixa" } as const;

const SINAL: Record<SinalValidado["tipo"], { rotulo: string; marca: string; faixa: string }> = {
  CHURN_RISK: { rotulo: "Risco de churn", marca: "bg-[#FFD7D9] decoration-[#DA1E28]", faixa: "bg-[#DA1E28]" },
  OPPORTUNITY: { rotulo: "Oportunidade", marca: "bg-[#A7F0BA] decoration-[#24A148]", faixa: "bg-[#24A148]" },
  OBJECTION: { rotulo: "Objeção", marca: "bg-[#FCF4D6] decoration-[#B28600]", faixa: "bg-[#F1C21B]" },
};

const PRODUTO: Record<StatusProduto, { variant: SignalVariant; rotulo: string }> = {
  EM_USO: { variant: "produto-em-uso", rotulo: "Em uso" },
  INTERESSE: { variant: "oportunidade", rotulo: "Interesse" },
  INSATISFAÇÃO: { variant: "churn-atencao", rotulo: "Insatisfação" },
  CONCORRENTE: { variant: "concorrente", rotulo: "Concorrente" },
};

const MOTIVO_DESCARTE: Record<MotivoDescarte, string> = {
  citacao_nao_encontrada: "a citação não existe na transcrição",
  citacao_curta: "a citação é curta demais para servir de evidência",
};

function varianteSinal(sinal: SinalValidado): SignalVariant {
  if (sinal.tipo === "CHURN_RISK") return sinal.severidade === "ALTA" ? "churn-critico" : "churn-atencao";
  return sinal.tipo === "OPPORTUNITY" ? "oportunidade" : "objecao";
}

function Secao({
  titulo,
  icon: Icon,
  children,
  extra,
}: {
  titulo: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section className="rounded-[12px] border border-border-subtle bg-layer-01 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] leading-5 font-semibold text-text-primary">
          <Icon size={16} className="text-text-secondary" aria-hidden="true" />
          {titulo}
        </h3>
        {extra}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Transcrição com cada evidência marcada e numerada, para conferir de onde veio cada sinal. */
function TranscricaoDestacada({ texto, sinais }: { texto: string; sinais: SinalValidado[] }) {
  const ordenados = sinais
    .map((sinal, indice) => ({ sinal, numero: indice + 1 }))
    .sort((a, b) => a.sinal.posicaoCaracterStart - b.sinal.posicaoCaracterStart);

  const partes: ReactNode[] = [];
  let cursor = 0;
  for (const { sinal, numero: n } of ordenados) {
    if (sinal.posicaoCaracterStart < cursor) continue; // evidências sobrepostas: mantém a primeira
    partes.push(texto.slice(cursor, sinal.posicaoCaracterStart));
    partes.push(
      <mark
        key={n}
        className={cn("rounded-[2px] px-0.5 text-text-primary underline decoration-2 underline-offset-[3px]", SINAL[sinal.tipo].marca)}
      >
        <sup className="mr-0.5 font-sans text-[10px] font-semibold">[{n}]</sup>
        {texto.slice(sinal.posicaoCaracterStart, sinal.posicaoCaracterEnd)}
      </mark>,
    );
    cursor = sinal.posicaoCaracterEnd;
  }
  partes.push(texto.slice(cursor));

  return (
    <pre className="max-h-[420px] overflow-auto rounded-[8px] bg-[#F7F7F7] p-4 font-mono text-[12.5px] leading-[1.9] whitespace-pre-wrap text-text-secondary">
      {partes}
    </pre>
  );
}

export function ResultadoAnaliseView({
  resultado,
  texto,
  conta,
  contexto = null,
}: {
  resultado: ResultadoAnalise;
  texto: string;
  conta: ContaResumo | null;
  contexto?: ContextoReuniao | null;
}) {
  const { analise, evidencias, auditoria } = resultado;
  const { metricas } = evidencias;
  const totalTokens = Object.values(auditoria.tokens).reduce((soma, valor) => soma + valor, 0);
  const demonstracao = auditoria.modo === "demonstracao";

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho + auditoria */}
      <header className="rounded-[12px] border border-border-subtle bg-layer-01 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[13px] font-medium text-[#198038]">
            <CheckmarkFilled size={16} aria-hidden="true" />
            Análise concluída{conta ? ` · ${conta.nome}` : ""}
          </p>
          {demonstracao ? (
            <span
              className="rounded-full border border-[#C6C6C6] bg-background px-2.5 py-0.5 text-[11px] font-medium text-text-secondary"
              title="Nenhuma IA foi chamada: a análise vem de um cenário pré-configurado ou de regras locais."
            >
              Modo demonstração
            </span>
          ) : null}
        </div>
        {contexto ? (
          <p className="mt-1.5 text-[12px] text-text-helper">
            {contexto.idReuniao ? `Reunião #${contexto.idReuniao} · ` : ""}
            {descreverContexto(contexto)}
            {contexto.unidade ? ` · ${contexto.unidade}` : ""}
          </p>
        ) : null}
        <h2 className="mt-2 text-[20px] leading-7 font-normal text-text-primary">Resumo executivo</h2>
        <p className="mt-2 text-[14px] leading-[1.65] text-text-primary">{analise.resumoExecutivo}</p>

        {demonstracao ? (
          <p className="mt-5 border-t border-border-subtle pt-4 text-[12px] text-text-helper">
            Simulação local, sem custo · origem: {auditoria.origem} · {segundos.format(auditoria.duracaoMs / 1000)} s
          </p>
        ) : (
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-4 font-mono text-[12px] sm:grid-cols-[1fr_1fr_1fr_1.6fr]">
            <div>
              <dt className="font-sans text-[11px] text-text-helper">Tempo</dt>
              <dd className="mt-0.5 text-text-primary">{segundos.format(auditoria.duracaoMs / 1000)} s</dd>
            </div>
            <div>
              <dt className="font-sans text-[11px] text-text-helper">Tokens</dt>
              <dd className="mt-0.5 text-text-primary" title={JSON.stringify(auditoria.tokens)}>
                {numero.format(totalTokens)}
              </dd>
            </div>
            <div>
              <dt className="font-sans text-[11px] text-text-helper">Custo estimado</dt>
              <dd className="mt-0.5 text-text-primary">{dolar.format(auditoria.custoEstimadoUsd)}</dd>
            </div>
            <div>
              <dt className="font-sans text-[11px] text-text-helper">Modelo · prompt</dt>
              <dd className="mt-0.5 truncate text-text-primary" title={`${auditoria.modeloResposta} · ${auditoria.versaoPrompt}`}>
                {auditoria.modeloResposta} · {auditoria.versaoPrompt}
              </dd>
            </div>
          </dl>
        )}
        {auditoria.fallbackUsado ? (
          <p className="mt-3 text-[12px] text-text-secondary">
            O modelo principal recusou e o fallback automático ({auditoria.modeloResposta}) concluiu a análise.
          </p>
        ) : null}
      </header>

      {/* Sinais */}
      <Secao
        titulo={`Sinais de negócio (${analise.sinais.length})`}
        icon={TextLinkAnalysis}
        extra={
          <span className="text-[12px] text-text-secondary">
            {metricas.validos} de {metricas.total} com evidência literal comprovada
          </span>
        }
      >
        {analise.sinais.length === 0 ? (
          <p className="text-[14px] text-text-secondary">Nenhum sinal de churn, oportunidade ou objeção nesta reunião.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {analise.sinais.map((sinal, indice) => (
              <li key={indice} className="relative overflow-hidden rounded-[8px] border border-border-subtle">
                <span className={cn("absolute inset-y-0 left-0 w-1", SINAL[sinal.tipo].faixa)} aria-hidden="true" />
                <div className="p-4 pl-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-text-helper">[{indice + 1}]</span>
                    <SignalTag variant={varianteSinal(sinal)} className="uppercase">
                      {SINAL[sinal.tipo].rotulo} — {SEVERIDADE[sinal.severidade]}
                    </SignalTag>
                    <span className="text-[13px] font-medium text-text-primary">{sinal.subtipo}</span>
                    <span className="ml-auto font-mono text-[12px] text-text-helper" title="Confiança do modelo">
                      {Math.round(sinal.confianca * 100)}% confiança
                    </span>
                  </div>

                  <blockquote className="mt-3 border-l-2 border-[#C6C6C6] bg-background px-3 py-2 font-mono text-[12.5px] leading-[1.7] text-text-primary">
                    “{sinal.citacaoExata}”
                    <footer className="mt-1 font-sans text-[11px] text-text-helper">
                      caracteres {sinal.posicaoCaracterStart}–{sinal.posicaoCaracterEnd}
                      {sinal.evidencia.correspondencia === "normalizada" ? " · conferida ignorando espaços e aspas" : ""}
                    </footer>
                  </blockquote>

                  <p className="mt-3 flex items-start gap-2 text-[14px] leading-[1.5] font-medium text-text-primary">
                    <Idea size={16} className="mt-0.5 shrink-0 text-text-helper" aria-hidden="true" />
                    {sinal.recomendacaoAcao}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {evidencias.sinaisDescartados.length > 0 ? (
          <div className="mt-4 rounded-[8px] border border-[#F1C21B] bg-[#FCF4D6]/50 p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-[#684E00]">
              <WarningAlt size={16} aria-hidden="true" />
              {evidencias.sinaisDescartados.length} sinal(is) descartado(s) pelo validador de evidências
            </p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-[1.5] text-text-secondary">
              {evidencias.sinaisDescartados.map(({ sinal, motivo }, indice) => (
                <li key={indice}>
                  <span className="font-medium text-text-primary">{SINAL[sinal.tipo].rotulo}:</span> “{sinal.citacaoExata}” —{" "}
                  {MOTIVO_DESCARTE[motivo]}.
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Secao>

      {/* Produtos */}
      <Secao titulo="Produtos TOTVS e concorrentes citados" icon={Product}>
        {analise.mencoesProdutos.length === 0 ? (
          <p className="text-[14px] text-text-secondary">Nenhum produto do catálogo foi citado.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {analise.mencoesProdutos.map((mencao, indice) => (
              <li key={indice} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <SignalTag variant={PRODUTO[mencao.status].variant}>
                  {PRODUTO[mencao.status].rotulo}: {mencao.produto}
                </SignalTag>
                <span className="text-[13px] text-text-secondary">{mencao.contexto}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* Próximos passos */}
      <Secao titulo="Próximos passos sugeridos" icon={ListChecked}>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[14px] leading-[1.55] text-text-primary marker:text-text-helper">
          {analise.proximosPassosSugeridos.map((passo, indice) => (
            <li key={indice}>{passo}</li>
          ))}
        </ol>
      </Secao>

      {/* Rastreabilidade */}
      {analise.sinais.length > 0 ? (
        <Secao titulo="Transcrição com evidências destacadas" icon={DocumentView}>
          <TranscricaoDestacada texto={texto} sinais={analise.sinais} />
        </Secao>
      ) : null}
    </div>
  );
}

type EtapaPipeline = { nome: NomeEtapa; status: StatusEtapa; detalhe?: string };

const ROTULO_ETAPA: Record<NomeEtapa, string> = {
  RECEBIMENTO: "Recebimento e sanitização",
  TRANSCRICAO: "Transcrição do áudio (STT)",
  ANALISE_IA: "Análise de sinais com IA",
  VALIDACAO_EVIDENCIAS: "Validação das citações",
  PERSISTENCIA: "Gravação no banco",
};

function IconeEtapa({ status }: { status: StatusEtapa }) {
  if (status === "CONCLUIDA") return <CheckmarkFilled size={16} className="text-[#198038]" aria-hidden="true" />;
  if (status === "FALHOU") return <ErrorFilled size={16} className="text-[#DA1E28]" aria-hidden="true" />;
  if (status === "EM_ANDAMENTO") {
    return <span className="block h-4 w-4 animate-spin rounded-full border-2 border-interactive border-t-transparent" aria-hidden="true" />;
  }
  return (
    <span
      className={cn("block h-4 w-4 rounded-full border-2", status === "PULADA" ? "border-[#A8A8A8] bg-[#E0E0E0]" : "border-[#C6C6C6]")}
      aria-hidden="true"
    />
  );
}

/** Antes da primeira resposta da API: as 5 etapas aguardando. */
const ETAPAS_PENDENTES: EtapaPipeline[] = (Object.keys(ROTULO_ETAPA) as NomeEtapa[]).map((nome) => ({ nome, status: "PENDENTE" }));

const STATUS_ETAPA: Record<StatusEtapa, string> = {
  PENDENTE: "aguardando",
  EM_ANDAMENTO: "em andamento",
  CONCLUIDA: "concluída",
  PULADA: "não necessária",
  FALHOU: "falhou",
};

/** Progresso do pipeline, atualizado pelas consultas a GET /api/v1/reunioes/{id}. */
export function AnalisandoView({ etapas }: { etapas?: EtapaPipeline[] }) {
  return (
    <section aria-live="polite" aria-busy="true" className="rounded-[12px] border border-border-subtle bg-layer-01 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-interactive border-t-transparent" />
        <div>
          <p className="text-[15px] font-semibold text-text-primary">Analisando sinais comerciais via IA...</p>
          <p className="mt-1 text-[13px] leading-[1.55] text-text-secondary">
            Lendo a transcrição inteira, extraindo churn, oportunidades, objeções e produtos, e conferindo cada citação no texto original.
            Com o Claude, leva de 20 a 60 segundos.
          </p>
        </div>
      </div>

      <ol className="mt-5 flex flex-col gap-2.5 border-t border-border-subtle pt-4 sm:pl-9" aria-label="Etapas do processamento">
        {(etapas ?? ETAPAS_PENDENTES).map((etapa) => (
          <li key={etapa.nome} className="flex items-start gap-3 text-[13px] leading-5">
            <span className="mt-0.5 shrink-0">
              <IconeEtapa status={etapa.status} />
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  etapa.status === "PENDENTE" ? "text-text-helper" : "text-text-primary",
                  etapa.status === "EM_ANDAMENTO" && "font-semibold",
                )}
              >
                {ROTULO_ETAPA[etapa.nome]}
              </span>
              <span className="sr-only">: {STATUS_ETAPA[etapa.status]}</span>
              {etapa.detalhe && etapa.status !== "PENDENTE" ? (
                <span className="block text-[12px] text-text-helper">{etapa.detalhe}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-text-helper sm:pl-9">
        <Time size={14} aria-hidden="true" />
        Ao terminar, você é levado ao Painel Executivo com os novos alertas.
      </p>
    </section>
  );
}

export function FalhaAnaliseView({ falha }: { falha: FalhaAnalise }) {
  return (
    <section role="alert" className="flex items-start gap-3 border-l-[3px] border-[#DA1E28] bg-[#FFF1F1] p-4 sm:p-5">
      <ErrorFilled size={20} className="mt-px shrink-0 text-[#DA1E28]" aria-hidden="true" />
      <div className="min-w-0 text-[13px] leading-[1.55] text-text-primary">
        <p className="text-[14px] font-semibold">{falha.titulo}</p>
        <p className="mt-0.5">{falha.detalhe}</p>
        {falha.semChave ? (
          <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5">
            <li>
              Gere uma chave em <span className="font-medium">console.anthropic.com</span> (menu API Keys) e adicione créditos em Billing.
            </li>
            <li>
              Na raiz do projeto, crie o arquivo <code className="font-mono text-[12px]">.env.local</code> com a linha:
              <pre className="mt-1.5 overflow-x-auto rounded-[4px] bg-shell px-3 py-2 font-mono text-[12px] text-white">
                ANTHROPIC_API_KEY=sua-chave-aqui
              </pre>
            </li>
            <li>
              Pare e rode de novo o <code className="font-mono text-[12px]">npm run dev</code>. O arquivo já é ignorado pelo git: a chave
              não vai para o repositório.
            </li>
          </ol>
        ) : null}
        {falha.semChave ? (
          <p className="mt-3 border-t border-[#FFD7D9] pt-3">
            Para apresentar sem custo, use o modo demonstração: adicione{" "}
            <code className="font-mono text-[12px]">DIALYS_MODO_DEMO=true</code> ao{" "}
            <code className="font-mono text-[12px]">.env.local</code> e reinicie o servidor.
          </p>
        ) : null}
      </div>
    </section>
  );
}
