import { ArrowRight, Calendar } from "@carbon/icons-react";
import Link from "next/link";
import { SignalTag, type SignalVariant } from "@/components/sinais/signal-tag";
import { linkCliente, linkReuniao } from "@/lib/alertas";
import type { ResumoCarteira } from "@/lib/api-cliente";

const TAG: Record<ResumoCarteira["agenda"][number]["categoria"], { variant: SignalVariant; rotulo: string }> = {
  churn: { variant: "churn-critico", rotulo: "Risco de churn" },
  upsell: { variant: "oportunidade", rotulo: "Oportunidade" },
  objection: { variant: "objecao", rotulo: "Objeção" },
};

/**
 * Ações sugeridas: as recomendações da análise para as contas mais críticas, em ordem de prioridade.
 * Não são compromissos: não têm horário e não entram na agenda (só o usuário marca compromissos).
 */
export function AcoesSugeridas({ agenda }: { agenda: ResumoCarteira["agenda"] }) {
  return (
    <section
      aria-labelledby="titulo-acoes-sugeridas"
      className="rounded-[12px] border border-border-subtle bg-layer-01"
    >
      <h2
        id="titulo-acoes-sugeridas"
        className="flex items-center gap-2 border-b border-border-subtle px-5 py-4 text-[15px] leading-5 font-semibold text-text-primary"
      >
        <Calendar size={16} aria-hidden="true" />
        Ações sugeridas · sem horário
      </h2>

      {agenda.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-text-secondary">Nenhuma ação pendente nas contas analisadas.</p>
      ) : (
        <ol>
          {agenda.map((item, indice) => (
            <li
              key={item.conta.id}
              className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-b border-border-subtle px-5 py-4 last:border-b-0"
            >
              <span className="pt-px font-mono text-[14px] font-medium text-text-helper tabular-nums">
                {String(indice + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="text-[14px] leading-5 font-semibold text-text-primary">
                  <Link href={linkCliente(item.conta.id)} className="hover:underline">
                    {item.conta.nome}
                  </Link>
                </p>
                <SignalTag variant={TAG[item.categoria].variant} className="mt-1.5">
                  {TAG[item.categoria].rotulo}
                </SignalTag>
                <p className="mt-2 text-[13px] leading-[1.5] text-text-primary">{item.acao}</p>
                <Link
                  href={linkReuniao(item.reuniaoId)}
                  className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-text-primary underline-offset-[3px] hover:underline"
                >
                  Preparar com as evidências
                  <ArrowRight size={12} aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="border-t border-border-subtle px-5 py-3 text-[11px] leading-4 text-text-helper">
        Recomendações registradas nas reuniões analisadas. Não são compromissos e não entram na agenda automaticamente.
      </p>
    </section>
  );
}
