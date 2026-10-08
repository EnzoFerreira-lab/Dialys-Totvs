import { ArrowRight, Building, Radar, UserMultiple, WarningAlt } from "@carbon/icons-react";
import Link from "next/link";
import { linkReuniao } from "@/lib/alertas";
import type { ResumoCarteira } from "@/lib/api-cliente";
import { formatarReais } from "@/lib/valores";

const CATEGORIAS = [
  { chave: "churn", rotulo: "Riscos de churn", cor: "bg-[#DA1E28]" },
  { chave: "upsell", rotulo: "Oportunidades", cor: "bg-[#24A148]" },
  { chave: "objection", rotulo: "Objeções de jornada", cor: "bg-[#D2A106]" },
] as const;

const CRITICIDADE = { ALTA: "Alta criticidade", MÉDIA: "Média criticidade", BAIXA: "Baixa criticidade" } as const;

/** Distribuição dos sinais da carteira e o risco de churn de maior impacto (GET /api/v1/resumo). */
export function RadarCarteira({ resumo }: { resumo: ResumoCarteira }) {
  const { sinais } = resumo.kpis;
  const total = sinais.churn + sinais.upsell + sinais.objection;
  const risco = resumo.riscoDestacado;
  const [reais, centavos] = risco?.valorEmRisco != null ? formatarReais(risco.valorEmRisco).split(",") : [];

  return (
    <section aria-labelledby="titulo-radar" className="rounded-[8px] border border-border-subtle bg-layer-01 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 id="titulo-radar" className="text-[15px] leading-5 font-semibold text-text-primary">
          Radar da carteira
        </h2>
        <Radar size={18} className="shrink-0 text-text-helper" aria-hidden="true" />
      </div>

      <p className="mt-4 flex items-baseline gap-2">
        <span className="text-[32px] leading-none font-light text-text-primary tabular-nums">{total}</span>
        <span className="text-[13px] text-text-secondary">{total === 1 ? "sinal no radar" : "sinais no radar"}</span>
      </p>

      {/* Barra empilhada: largura proporcional ao número de sinais de cada categoria. */}
      <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-[#E0E0E0]" aria-hidden="true">
        {total > 0
          ? CATEGORIAS.map(({ chave, cor }) =>
              sinais[chave] > 0 ? <span key={chave} className={cor} style={{ flexGrow: sinais[chave] }} /> : null,
            )
          : null}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5" aria-label="Sinais por categoria">
        {CATEGORIAS.map(({ chave, rotulo, cor }) => (
          <li key={chave} className="flex items-center justify-between text-[13px] text-text-primary">
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${cor}`} aria-hidden="true" />
              {rotulo}
            </span>
            <span className="font-semibold tabular-nums">{sinais[chave]}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-border-subtle pt-4">
        <p className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <WarningAlt size={14} aria-hidden="true" />
          {risco?.valorEmRisco != null ? "Valor em risco destacado" : "Maior risco de churn"}
        </p>
        {risco ? (
          <>
            {reais ? (
              <p className="mt-2 text-[26px] leading-none font-normal text-[#DA1E28] tabular-nums">
                {reais}
                <span className="text-[16px]">,{centavos}</span>
              </p>
            ) : (
              <p className="mt-2 text-[16px] leading-6 font-semibold text-[#A2191F]">{risco.insight.subtipo}</p>
            )}
            <p className="mt-1.5 text-[12px] text-text-secondary">
              {risco.insight.conta.nome} · {CRITICIDADE[risco.insight.criticidade]}
            </p>
            <Link
              href={linkReuniao(risco.insight.reuniao.id)}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-primary underline-offset-[3px] hover:underline"
            >
              Priorizar retenção
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </>
        ) : (
          <p className="mt-2 text-[13px] text-text-secondary">Nenhum risco de churn nas reuniões analisadas.</p>
        )}
      </div>
    </section>
  );
}

/** Equipe e carteira do usuário (quando configuradas) e quantas contas já passaram pelo Dialys. */
export function OperacaoComercial({ resumo }: { resumo: ResumoCarteira }) {
  const { vendedores, contasSobGestao } = resumo.operacao;
  const analisadas = resumo.kpis.contasAnalisadas;
  const cobertura = contasSobGestao ? Math.min(100, Math.round((analisadas / contasSobGestao) * 100)) : null;

  return (
    <section aria-labelledby="titulo-operacao" className="rounded-[8px] border border-border-subtle bg-layer-01 p-5">
      <h2 id="titulo-operacao" className="text-[15px] leading-5 font-semibold text-text-primary">
        Sua operação comercial
      </h2>
      {vendedores || contasSobGestao ? (
        <dl className="mt-4 grid grid-cols-2 gap-4">
          {vendedores ? (
            <div className="flex flex-col">
              <UserMultiple size={20} className="text-text-helper" aria-hidden="true" />
              <dt className="order-last text-[12px] text-text-secondary">vendedores</dt>
              <dd className="mt-1.5 text-[22px] leading-7 font-normal text-text-primary tabular-nums">{vendedores}</dd>
            </div>
          ) : null}
          {contasSobGestao ? (
            <div className="flex flex-col">
              <Building size={20} className="text-text-helper" aria-hidden="true" />
              <dt className="order-last text-[12px] text-text-secondary">contas sob gestão</dt>
              <dd className="mt-1.5 text-[22px] leading-7 font-normal text-text-primary tabular-nums">{contasSobGestao}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className={vendedores || contasSobGestao ? "mt-4 border-t border-border-subtle pt-3" : "mt-3"}>
        <p className="flex justify-between text-[12px] text-text-secondary">
          <span>Contas com reunião analisada</span>
          <span className="font-semibold text-text-primary tabular-nums">
            {analisadas}
            {cobertura !== null ? ` (${cobertura}%)` : ""}
          </span>
        </p>
        {cobertura !== null ? (
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E0E0E0]"
            role="progressbar"
            aria-label="Cobertura da carteira"
            aria-valuenow={cobertura}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span className="block h-full bg-interactive" style={{ width: `${Math.max(cobertura, analisadas > 0 ? 2 : 0)}%` }} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
