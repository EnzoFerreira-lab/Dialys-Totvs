"use client";

import { ArrowRight, ArrowUp, ArrowUpRight, ChartLine, DocumentAdd, Growth, Search, WarningAlt, WarningFilled } from "@carbon/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { classificarNps } from "@/app/(app)/insights/nps";
import { paraAlerta } from "@/lib/alertas";
import { api } from "@/lib/api-cliente";
import { cn } from "@/lib/cn";
import type { TipoSinal } from "@/lib/insights";
import { useDadosApi } from "@/lib/use-dados-api";
import { AlertaCard } from "./alerta-card";
import { OperacaoComercial, RadarCarteira } from "./radar-carteira";

type Filtro = "todos" | TipoSinal;

const ABAS: Array<{ id: Filtro; rotulo: string }> = [
  { id: "todos", rotulo: "Todos os Alertas" },
  { id: "churn", rotulo: "Riscos de Churn" },
  { id: "oportunidade", rotulo: "Oportunidades" },
  { id: "objecao", rotulo: "Objeções de Jornada" },
];

/** Quantos cards o feed mostra por aba; o restante fica na Central de Insights. */
const MAXIMO_FEED = 5;
const ATUALIZACAO_MS = 10_000;

const umaCasa = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Dados do painel: KPIs agregados (GET /api/v1/resumo) e alertas (GET /api/v1/insights). */
const carregarPainel = () => Promise.all([api.resumo(), api.listarInsights({ limite: "200" })]);

/* ---------- KPI tile ---------- */

type KpiTileProps = {
  rotulo: string;
  valor: string;
  unidade?: string;
  corValor?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  corIcone?: string;
  rodape: ReactNode;
  acao: string;
  onClick?: () => void;
  href?: string;
};

const TILE_CLASSES =
  "group flex h-full w-full flex-col rounded-[8px] border border-border-subtle bg-layer-01 p-4 text-left transition-colors hover:border-[#C6C6C6] hover:bg-[#FAFAFA] sm:p-5";

function KpiTile({ rotulo, valor, unidade, corValor, icon: Icon, corIcone, rodape, acao, onClick, href }: KpiTileProps) {
  const conteudo = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="text-[12px] leading-4 text-text-secondary">{rotulo}</span>
        <Icon size={18} className={cn("shrink-0", corIcone ?? "text-text-helper")} aria-hidden="true" />
      </span>
      <span className="mt-3 flex items-baseline gap-2">
        <span className={cn("text-[36px] leading-none font-light tracking-[-0.01em] tabular-nums", corValor ?? "text-text-primary")}>
          {valor}
        </span>
        {unidade ? <span className="text-[12px] text-text-secondary">{unidade}</span> : null}
      </span>
      <span className="mt-auto flex items-center justify-between gap-2 pt-4">
        {rodape}
        <ArrowUpRight size={16} className="shrink-0 text-text-helper transition-colors group-hover:text-text-primary" aria-hidden="true" />
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={TILE_CLASSES} aria-label={`${rotulo}: ${valor}${unidade ? ` ${unidade}` : ""}. ${acao}`}>
        {conteudo}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={TILE_CLASSES} aria-label={`${rotulo}: ${valor}${unidade ? ` ${unidade}` : ""}. ${acao}`}>
      {conteudo}
    </button>
  );
}

const Etiqueta = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className={cn("rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium", className)}>{children}</span>
);

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando o painel">
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="h-[136px] animate-pulse rounded-[8px] border border-border-subtle bg-layer-01" />
        ))}
      </ul>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-[360px] animate-pulse rounded-[8px] border border-border-subtle bg-layer-01" />
        <div className="h-[360px] animate-pulse rounded-[8px] border border-border-subtle bg-layer-01" />
      </div>
    </div>
  );
}

function SemReunioes() {
  return (
    <div className="mt-6 rounded-[8px] border border-border-subtle bg-layer-01 px-6 py-16 text-center">
      <p className="text-[16px] leading-6 font-medium text-text-primary">Nenhuma reunião analisada ainda</p>
      <p className="mx-auto mt-2 max-w-[480px] text-[13px] leading-[1.6] text-text-secondary">
        Os indicadores, alertas e o radar deste painel saem das reuniões processadas pelo Dialys. Envie a primeira
        transcrição para ver os sinais de churn, oportunidades e objeções aparecerem aqui.
      </p>
      <Link
        href="/envio"
        className="mt-6 inline-flex h-10 items-center gap-3 rounded-[4px] bg-interactive px-4 text-[13px] font-medium text-on-interactive hover:bg-interactive-hover"
      >
        Enviar uma transcrição
        <DocumentAdd size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

function ErroCarregamento({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  return (
    <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 border-l-[3px] border-[#DA1E28] bg-[#FFF1F1] px-4 py-3 text-[13px] text-text-primary">
      <WarningFilled size={16} className="shrink-0 text-[#DA1E28]" aria-hidden="true" />
      <span className="flex-1">{mensagem}</span>
      <button type="button" onClick={onTentar} className="font-medium underline underline-offset-[3px]">
        Tentar de novo
      </button>
    </div>
  );
}

/* ---------- Painel ---------- */

export function PainelExecutivo() {
  // ?nova=<reuniaoId>: vindo do /envio, os alertas dessa reunião aparecem no topo, destacados.
  const nova = useSearchParams().get("nova");
  const { dados, erro, atualizadoEm, recarregar } = useDadosApi(carregarPainel, ATUALIZACAO_MS);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const feedRef = useRef<HTMLElement>(null);
  const abasRef = useRef<Array<HTMLButtonElement | null>>([]);

  const todos = useMemo(() => (dados ? dados[1].dados.map(paraAlerta) : []), [dados]);

  if (!dados) return erro ? <ErroCarregamento mensagem={erro.message} onTentar={recarregar} /> : <Esqueleto />;

  const [resumo, lista] = dados;
  const { kpis } = resumo;
  if (kpis.reunioesAnalisadas === 0) return <SemReunioes />;

  const totais: Record<Filtro, number> = {
    todos: lista.resumo.total,
    churn: lista.resumo.porCategoria.churn,
    oportunidade: lista.resumo.porCategoria.upsell,
    objecao: lista.resumo.porCategoria.objection,
  };
  const filtrados = filtro === "todos" ? todos : todos.filter((alerta) => alerta.tipo === filtro);
  const ordenados = nova ? [...filtrados].sort((a, b) => Number(b.reuniaoId === nova) - Number(a.reuniaoId === nova)) : filtrados;
  const visiveis = ordenados.slice(0, MAXIMO_FEED);
  const nps = kpis.npsMedio === null ? null : classificarNps(kpis.npsMedio);

  function filtrarEIrParaFeed(novo: Filtro) {
    setFiltro(novo);
    feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onTecladoAbas(event: KeyboardEvent<HTMLDivElement>) {
    const atual = ABAS.findIndex((aba) => aba.id === filtro);
    let proximo: number | null = null;
    if (event.key === "ArrowRight") proximo = (atual + 1) % ABAS.length;
    if (event.key === "ArrowLeft") proximo = (atual - 1 + ABAS.length) % ABAS.length;
    if (event.key === "Home") proximo = 0;
    if (event.key === "End") proximo = ABAS.length - 1;
    if (proximo === null) return;
    event.preventDefault();
    setFiltro(ABAS[proximo].id);
    abasRef.current[proximo]?.focus();
  }

  return (
    <>
      {erro ? <ErroCarregamento mensagem={`Não foi possível atualizar: ${erro.message}`} onTentar={recarregar} /> : null}

      {/* KPIs */}
      <section aria-label="Indicadores da carteira" className="mt-6">
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <li>
            <KpiTile
              rotulo="Total de Reuniões Analisadas"
              valor={String(kpis.reunioesAnalisadas)}
              icon={Search}
              acao="Ver todos os alertas"
              onClick={() => filtrarEIrParaFeed("todos")}
              rodape={
                kpis.reunioesUltimos7Dias > 0 ? (
                  <span className="flex items-center gap-1 text-[12px] text-text-secondary">
                    <ArrowUp size={14} className="text-[#198038]" aria-hidden="true" />
                    <span className="font-semibold text-[#198038]">+{kpis.reunioesUltimos7Dias}</span> esta semana
                  </span>
                ) : (
                  <span className="text-[12px] text-text-helper">Nenhuma esta semana</span>
                )
              }
            />
          </li>
          <li>
            <KpiTile
              rotulo="Contas em Risco de Churn"
              valor={String(kpis.contasEmRiscoChurn)}
              unidade={kpis.contasEmRiscoChurn === 1 ? "conta" : "contas"}
              corValor={kpis.contasEmRiscoChurn > 0 ? "text-[#DA1E28]" : undefined}
              icon={WarningAlt}
              corIcone="text-[#DA1E28]"
              acao="Filtrar riscos de churn"
              onClick={() => filtrarEIrParaFeed("churn")}
              rodape={
                kpis.contasEmRiscoCritico > 0 ? (
                  <Etiqueta className="bg-[#FFD7D9] text-[#750E13]">Atenção prioritária · {kpis.contasEmRiscoCritico} crítica(s)</Etiqueta>
                ) : (
                  <span className="text-[12px] text-text-helper">Nenhuma em risco crítico</span>
                )
              }
            />
          </li>
          <li>
            <KpiTile
              rotulo="Oportunidades de Upsell/Cross-sell"
              valor={String(kpis.sinais.upsell)}
              unidade={kpis.sinais.upsell === 1 ? "oportunidade" : "oportunidades"}
              corValor={kpis.sinais.upsell > 0 ? "text-[#198038]" : undefined}
              icon={Growth}
              corIcone="text-[#198038]"
              acao="Filtrar oportunidades"
              onClick={() => filtrarEIrParaFeed("oportunidade")}
              rodape={<Etiqueta className="bg-[#A7F0BA] text-[#044317]">Potencial de expansão</Etiqueta>}
            />
          </li>
          <li>
            <KpiTile
              rotulo="NPS Médio da Base (Confiança)"
              valor={kpis.npsMedio === null ? "—" : umaCasa.format(kpis.npsMedio)}
              icon={ChartLine}
              acao="Abrir Central de Insights"
              href="/insights"
              rodape={
                <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                  <span className="h-2 w-2 rounded-full bg-interactive" aria-hidden="true" />
                  {nps ? `Qualidade da base · ${nps.rotulo.toLowerCase()}` : "Sem NPS nas reuniões enviadas"}
                </span>
              }
            />
          </li>
        </ul>
      </section>

      <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Feed de alertas */}
        <section ref={feedRef} aria-labelledby="titulo-feed" className="scroll-mt-16">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="titulo-feed" className="text-[20px] leading-7 font-normal text-text-primary">
                Alertas prioritários
              </h2>
              <p className="text-[12px] text-text-secondary">O que merece sua atenção agora.</p>
            </div>
            <span className="mt-1 shrink-0 rounded-full bg-[#E0E0E0] px-2.5 py-0.5 text-[11px] font-medium text-text-primary">
              Foco em impacto
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Filtrar alertas por tipo"
            onKeyDown={onTecladoAbas}
            className="mt-4 flex overflow-x-auto border-b border-border-subtle [scrollbar-width:none]"
          >
            {ABAS.map((aba, indice) => {
              const ativa = aba.id === filtro;
              return (
                <button
                  key={aba.id}
                  ref={(el) => {
                    abasRef.current[indice] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`aba-${aba.id}`}
                  aria-selected={ativa}
                  aria-controls="painel-alertas"
                  tabIndex={ativa ? 0 : -1}
                  onClick={() => setFiltro(aba.id)}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors sm:px-4",
                    ativa
                      ? "border-text-primary font-semibold text-text-primary"
                      : "border-transparent text-text-secondary hover:border-[#C6C6C6] hover:text-text-primary",
                  )}
                >
                  {aba.rotulo}
                  {aba.id === "todos" ? "" : ` (${totais[aba.id]})`}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-secondary">
            <p>
              {visiveis.length} {visiveis.length === 1 ? "alerta em destaque" : "alertas em destaque"}
              {totais[filtro] > visiveis.length ? ` de ${totais[filtro]}` : ""}
            </p>
            <p className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#24A148] motion-safe:animate-pulse" aria-hidden="true" />
              Ordenados por prioridade · atualizado às {atualizadoEm?.toLocaleTimeString("pt-BR")}
            </p>
          </div>

          <div id="painel-alertas" role="tabpanel" aria-labelledby={`aba-${filtro}`} className="mt-3">
            {visiveis.length === 0 ? (
              <p className="rounded-[4px] border border-border-subtle bg-layer-01 px-6 py-10 text-center text-[13px] text-text-secondary">
                Nenhum alerta nesta categoria nas reuniões analisadas.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {visiveis.map((alerta) => (
                  <li key={alerta.id}>
                    <AlertaCard alerta={alerta} novo={alerta.reuniaoId === nova} />
                  </li>
                ))}
              </ul>
            )}
            {totais[filtro] > visiveis.length ? (
              <Link
                href={filtro === "todos" ? "/insights" : `/insights?filtro=${filtro}`}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-primary underline-offset-[3px] hover:underline"
              >
                Ver todos os {totais[filtro]} na Central de Insights
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </section>

        {/* Coluna lateral */}
        <aside aria-label="Resumo da carteira" className="flex flex-col gap-4 lg:sticky lg:top-16">
          <RadarCarteira resumo={resumo} />
          <OperacaoComercial resumo={resumo} />
        </aside>
      </div>
    </>
  );
}
