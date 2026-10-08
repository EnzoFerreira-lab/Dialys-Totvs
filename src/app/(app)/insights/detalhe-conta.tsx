"use client";

import { AiGenerate, Chat, ChevronDown, ChevronUp, CheckmarkOutline, Copy, DocumentBlank, Download, Renew, TrashCan, UserProfile, WarningFilled } from "@carbon/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { TotvsLogo } from "@/components/brand/totvs-logo";
import { SignalTag, type SignalVariant } from "@/components/sinais/signal-tag";
import { useToast } from "@/components/ui/provedor-toast";
import { linkCliente } from "@/lib/alertas";
import { cn } from "@/lib/cn";
import { formatarData } from "@/lib/formatar";
import type { ContaInsight, ContextoProduto, ReuniaoCentral, Sinal } from "@/lib/insights";
import { ROTULO_FAIXA } from "@/lib/saude";
import { EvidenciaSnippet, LegendaDestaques } from "./evidencia-snippet";

const PRODUTO: Record<ContextoProduto, { classe: string; prefixo: string }> = {
  em_uso: { classe: "bg-[#D0E2FF] text-[#002D9C]", prefixo: "Em Uso" },
  expansao: { classe: "bg-[#A7F0BA] text-[#044317]", prefixo: "Oportunidade" },
  insatisfacao: { classe: "bg-[#FFD9BE] text-[#8A3800]", prefixo: "Insatisfação" },
  concorrente: { classe: "bg-[#E0E0E0] text-[#161616]", prefixo: "Concorrente Citado" },
};

export function rotuloSinal(sinal: Sinal): { variant: SignalVariant; texto: string } {
  if (sinal.tipo === "churn") {
    return sinal.urgencia === "alta"
      ? { variant: "churn-critico", texto: "Churn crítico" }
      : { variant: "churn-atencao", texto: "Churn atenção" };
  }
  if (sinal.tipo === "oportunidade") return { variant: "oportunidade", texto: "Oportunidade" };
  return { variant: "objecao", texto: sinal.urgencia === "alta" ? "Objeção crítica" : "Objeção" };
}

/** Seção do detalhe com barra de título e uma ação à direita (recolher, copiar...). */
function Secao({ titulo, acao, children, id }: { titulo: string; acao?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="border border-border-subtle print:break-inside-avoid">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border-subtle bg-[#F4F4F4] pr-1.5 pl-4">
        <h3 id={id} className="py-2.5 text-[13px] leading-5 font-semibold text-text-primary">
          {titulo}
        </h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

const botaoIcone = "flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-text-primary hover:bg-[#E0E0E0] print:hidden";

type DetalheContaProps = {
  conta: ContaInsight;
  /** A linha da Central (reunião) que este detalhe mostra. */
  reuniao: ReuniaoCentral;
  sincronizando: boolean;
  erroCrm: string | null;
  onSincronizar: () => void;
  onRemoverTranscricao: () => void;
};

/** "07/10/2026" ou, sem data informada, o aviso (a data do processamento não é a da reunião). */
function textoData(reuniao: Pick<ReuniaoCentral, "data" | "processadaEm">) {
  return reuniao.data ? formatarData(reuniao.data) : `não informada (processada em ${formatarData(reuniao.processadaEm)})`;
}

export function DetalheConta({ conta, reuniao, sincronizando, erroCrm, onSincronizar, onRemoverTranscricao }: DetalheContaProps) {
  const avisar = useToast();
  const router = useRouter();
  const [produtosAbertos, setProdutosAbertos] = useState(true);
  const ids = { produtos: useId(), evidencia: useId(), diagnostico: useId(), corpoProdutos: useId() };
  const dataReuniao = textoData(reuniao);

  async function copiarEvidencias() {
    const texto = conta.evidencias.map((e) => `${e.falante}: ${e.texto}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(texto);
      avisar({ titulo: "Evidência copiada", descricao: "O trecho literal da reunião está na área de transferência." });
    } catch {
      avisar({ titulo: "Não foi possível copiar", descricao: "O navegador bloqueou o acesso à área de transferência." });
    }
  }

  return (
    <article aria-labelledby="titulo-conta" className="border border-border-subtle bg-layer-01 print:border-0">
      {/* Cabeçalho exclusivo do PDF (US-07) */}
      <div className="hidden items-center justify-between border-b-2 border-interactive px-5 pb-3 print:flex">
        <p className="flex items-center gap-3 text-[14px] font-semibold text-text-primary">
          <TotvsLogo className="h-4 text-[#012233]" />
          <span className="h-4 w-px bg-border-subtle" aria-hidden="true" />
          <span>
            Dialys<span className="text-interactive">.</span> Resumo Executivo da Conta
          </span>
        </p>
        <p className="text-[11px] text-text-secondary">Inteligência Conversacional TOTVS · Uso interno</p>
      </div>

      {/* Cabeçalho da conta */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-medium text-text-secondary">{reuniao.codigo}</p>
          <h2 id="titulo-conta" className="text-[24px] leading-8 font-normal text-text-primary">
            {conta.nome}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[13px] text-text-secondary">
            <span>
              NPS: <strong className="font-semibold text-text-primary">{conta.nps ?? "não informado"}</strong>
            </span>
            <span className="h-3 w-px bg-[#C6C6C6]" aria-hidden="true" />
            <span>
              Data da reunião: <span className={reuniao.data ? "text-text-primary" : "text-text-helper italic"}>{dataReuniao}</span>
            </span>
            {conta.reunioes.length > 1 ? (
              <>
                <span className="h-3 w-px bg-[#C6C6C6] print:hidden" aria-hidden="true" />
                <label className="flex items-center gap-1.5 print:hidden">
                  Outras reuniões do cliente:
                  <select
                    value={conta.reuniaoId}
                    onChange={(evento) => router.push(`/insights?reuniao=${encodeURIComponent(evento.target.value)}`, { scroll: false })}
                    className="h-7 border-0 border-b border-border-strong bg-field-01 px-1.5 text-[13px] text-text-primary focus:outline-2 focus:outline-focus"
                  >
                    {conta.reunioes.map((r, i) => (
                      <option key={r.id} value={r.id}>
                        {r.codigo} · {r.dataInformada ? `${formatarData(r.data)} ${r.hora}` : "sem data"}
                        {i === 0 ? " (mais recente)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <span className="h-3 w-px bg-[#C6C6C6]" aria-hidden="true" />
            <span title={`Como a nota foi calculada:\n${conta.saude.fatores.join("\n")}`}>
              Saúde: <strong className="font-semibold text-text-primary">{conta.saude.nota.toLocaleString("pt-BR")}/10</strong> (
              {ROTULO_FAIXA[conta.saude.faixa]})
            </span>
            {conta.segmento ? (
              <>
                <span className="h-3 w-px bg-[#C6C6C6]" aria-hidden="true" />
                <span>{conta.segmento}</span>
              </>
            ) : null}
            {conta.totalReunioes > 1 ? (
              <>
                <span className="h-3 w-px bg-[#C6C6C6]" aria-hidden="true" />
                <span>{conta.totalReunioes} reuniões analisadas</span>
              </>
            ) : null}
          </p>
          {!conta.reuniaoMaisRecente ? (
            <p className="mt-2 inline-flex items-center gap-2 bg-[#FFF8E6] px-2.5 py-1 text-[12px] text-text-primary print:hidden">
              Você está vendo uma reunião anterior deste cliente.
              <Link href={`/insights?conta=${encodeURIComponent(conta.id)}`} className="font-medium underline underline-offset-[3px]">
                Ver a mais recente
              </Link>
            </p>
          ) : null}
          <ul className="mt-2.5 flex flex-wrap gap-1.5 empty:hidden" aria-label="Sinais detectados na reunião exibida">
            {conta.sinais.map((sinal) => {
              const { variant, texto } = rotuloSinal(sinal);
              return (
                <li key={sinal.tipo}>
                  <SignalTag variant={variant}>{texto}</SignalTag>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-col items-start gap-2 pt-1.5 sm:items-end">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#198038]">
            <CheckmarkOutline size={16} aria-hidden="true" />
            Análise concluída
          </p>
          <Link
            href={`/assistente?conta=${encodeURIComponent(conta.id)}&nome=${encodeURIComponent(conta.nome)}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-primary underline-offset-[3px] hover:underline print:hidden"
          >
            <Chat size={16} aria-hidden="true" />
            Perguntar ao Dialys
          </Link>
          <Link
            href={linkCliente(conta.id)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-primary underline-offset-[3px] hover:underline print:hidden"
          >
            <UserProfile size={16} aria-hidden="true" />
            Ver cliente
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-5 sm:p-6">
        {/* Produtos (NER) */}
        <Secao
          id={ids.produtos}
          titulo="Produtos do Ecossistema TOTVS (NER Identificado)"
          acao={
            <button
              type="button"
              onClick={() => setProdutosAbertos((v) => !v)}
              aria-expanded={produtosAbertos}
              aria-controls={ids.corpoProdutos}
              aria-label={produtosAbertos ? "Recolher produtos" : "Mostrar produtos"}
              className={botaoIcone}
            >
              {produtosAbertos ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          }
        >
          <div id={ids.corpoProdutos} hidden={!produtosAbertos} className="px-4 py-3">
            {conta.produtos.length === 0 ? (
              <p className="text-[13px] text-text-secondary">Nenhum produto TOTVS ou concorrente citado na última reunião.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {conta.produtos.map((produto) => {
                  const { classe, prefixo } = PRODUTO[produto.contexto];
                  return (
                    <li
                      key={`${produto.contexto}-${produto.nome}`}
                      title={produto.descricao}
                      className={cn("rounded-full px-2.5 py-1 text-[12px] leading-4", classe)}
                    >
                      {prefixo}: {produto.nome}
                      {produto.detalhe ? ` (${produto.detalhe})` : ""}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Secao>

        {/* Evidência literal */}
        <Secao
          id={ids.evidencia}
          titulo="Evidência textual da reunião"
          acao={
            conta.evidencias.length > 0 ? (
              <button type="button" onClick={copiarEvidencias} aria-label="Copiar evidência" title="Copiar evidência" className={botaoIcone}>
                <Copy size={16} />
              </button>
            ) : null
          }
        >
          <div className="flex flex-col gap-4 px-4 py-3">
            {conta.evidencias.length === 0 ? (
              <p className="text-[13px] text-text-secondary">Sem sinais na última reunião, portanto sem trechos a destacar.</p>
            ) : (
              conta.evidencias.map((evidencia, indice) => <EvidenciaSnippet key={indice} evidencia={evidencia} />)
            )}
            <LegendaDestaques evidencias={conta.evidencias} />
            <p className="text-[11px] text-text-helper">
              Trechos exatos da {reuniao.codigo} (<span className="font-mono">{conta.arquivo}</span>). Nenhum sinal é exibido sem evidência.
            </p>
          </div>
        </Secao>

        {/* Diagnóstico e recomendação */}
        <Secao
          id={ids.diagnostico}
          titulo={conta.geradoPorIa ? "Diagnóstico e recomendação de IA" : "Diagnóstico e recomendação"}
          acao={conta.geradoPorIa ? <AiGenerate size={18} className="mr-2 text-text-secondary" aria-label="Gerado por IA" /> : null}
        >
          <div className="grid md:grid-cols-2">
            <div className="px-4 py-4">
              <p className="text-[12px] font-semibold text-text-secondary">Diagnóstico</p>
              <p className="mt-1.5 text-[14px] leading-[1.6] text-text-primary">{conta.diagnostico}</p>
            </div>
            <div className="border-t-2 border-interactive bg-[#FFF8E6] px-4 py-4 md:border-t-0 md:border-l-2">
              <p className="text-[12px] font-semibold text-text-secondary">Ação Sugerida</p>
              <p className="mt-1.5 text-[14px] leading-[1.6] text-text-primary">{conta.acao}</p>
            </div>
          </div>
          {conta.proximosPassos.length > 1 ? (
            <div className="border-t border-border-subtle px-4 py-3">
              <p className="text-[12px] font-semibold text-text-secondary">Próximos passos</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] leading-[1.55] text-text-primary">
                {conta.proximosPassos.map((passo) => (
                  <li key={passo}>{passo}</li>
                ))}
              </ol>
            </div>
          ) : null}
          <p className="border-t border-border-subtle px-4 py-2 text-[11px] text-text-helper">
            {conta.geradoPorIa ? "Gerado por IA" : "Gerado automaticamente"} a partir da {reuniao.codigo} (data {dataReuniao}). Revise antes de
            agir.
          </p>
        </Secao>

        {erroCrm ? (
          <p role="alert" className="flex items-start gap-2 border-l-[3px] border-[#DA1E28] bg-[#FFF1F1] px-4 py-3 text-[13px] text-text-primary print:hidden">
            <WarningFilled size={16} className="mt-0.5 shrink-0 text-[#DA1E28]" aria-hidden="true" />
            {erroCrm}
          </p>
        ) : null}

        {/* Ações */}
        <div className="print:hidden">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onSincronizar}
              disabled={sincronizando}
              aria-busy={sincronizando}
              className="flex h-12 items-center justify-between gap-3 bg-interactive px-4 text-left text-[13px] font-medium text-on-interactive transition-colors hover:bg-interactive-hover active:bg-interactive-active disabled:cursor-wait"
            >
              {sincronizando ? "Sincronizando..." : "Sincronizar e Enriquecer CRM (UC05)"}
              {sincronizando ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-interactive border-t-transparent" aria-hidden="true" />
              ) : (
                <Renew size={16} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-12 items-center justify-between gap-3 bg-[#262626] px-4 text-left text-[13px] font-medium text-white transition-colors hover:bg-[#393939] active:bg-[#525252]"
            >
              Exportar Resumo Executivo em PDF (US-07)
              <Download size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-text-helper">
              {conta.sincronizadosCrm > 0 ? `${conta.sincronizadosCrm} de ${conta.insightIds.length} insight(s) já enviados ao CRM.` : null}
            </p>
            <button
              type="button"
              onClick={onRemoverTranscricao}
              className="inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2 text-[12px] text-[#A2191F] transition-colors hover:bg-[#FFF1F1]"
            >
              <TrashCan size={14} aria-hidden="true" />
              Remover transcrição
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Reunião cuja transcrição foi removida: o registro e o código ficam; a análise não aparece mais. */
export function DetalheSemTranscricao({ reuniao }: { reuniao: ReuniaoCentral }) {
  const removidaEm = reuniao.transcricaoRemovidaEm
    ? new Date(reuniao.transcricaoRemovidaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
    : null;
  return (
    <article aria-labelledby="titulo-conta" className="border border-border-subtle bg-layer-01 px-5 py-6 sm:px-6">
      <p className="font-mono text-[12px] font-medium text-text-secondary">{reuniao.codigo}</p>
      <h2 id="titulo-conta" className="text-[24px] leading-8 font-normal text-text-primary">
        {reuniao.conta.nome}
      </h2>
      <p className="mt-1 text-[13px] text-text-secondary">
        Data da reunião: <span className={reuniao.data ? "text-text-primary" : "text-text-helper italic"}>{textoData(reuniao)}</span>
      </p>
      <div className="mt-5 flex items-start gap-3 border-l-[3px] border-[#8D8D8D] bg-[#F4F4F4] px-4 py-4">
        <DocumentBlank size={20} className="mt-0.5 shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="text-[14px] leading-[1.6] text-text-primary">
          <p className="font-semibold">Sem transcrição ativa</p>
          <p className="mt-1 text-text-secondary">
            A transcrição desta reunião foi removida{removidaEm ? ` em ${removidaEm}` : ""}. A análise gerada a partir dela (sinais,
            evidências, diagnóstico e ações sugeridas) não aparece mais na Central, no Dashboard, nos indicadores nem nas respostas do
            Dialys. O registro e o código {reuniao.codigo} foram preservados.
          </p>
        </div>
      </div>
      <Link
        href={`/insights?conta=${encodeURIComponent(reuniao.conta.id)}`}
        className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-primary underline-offset-[3px] hover:underline"
      >
        Ver a reunião mais recente de {reuniao.conta.nome}
      </Link>
      <Link
        href={linkCliente(reuniao.conta.id)}
        className="mt-5 ml-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-primary underline-offset-[3px] hover:underline"
      >
        Ver cliente
      </Link>
    </article>
  );
}
