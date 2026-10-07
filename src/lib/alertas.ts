// Alerta exibido no Painel Executivo e no assistente Dialys: um insight da API (GET /api/v1/insights ou
// /api/v1/resumo) convertido para a linguagem da tela.
import type { InsightApi } from "./api-cliente";
import { formatarData, formatarDataHora } from "./formatar";
import type { TipoSinal, Urgencia } from "./insights";

export type Alerta = {
  id: string;
  tipo: TipoSinal;
  urgencia: Urgencia;
  contaId: string;
  empresa: string;
  reuniaoId: string;
  /** "Reunião 003". */
  reuniaoCodigo: string;
  /** Data e hora da reunião, ou "Data não informada" (a data do processamento não é a da reunião). */
  quando: string;
  subtipo: string;
  confianca: number;
  evidencia: string;
  acao: string;
  sincronizadoCrm: boolean;
};

const TIPO: Record<InsightApi["categoria"], TipoSinal> = { churn: "churn", upsell: "oportunidade", objection: "objecao" };

/** "2026-02-20 15:30:00" (data informada pela TOTVS, já local); sem data informada, diz isso. */
function quando(insight: InsightApi) {
  const data = insight.reuniao.contexto?.data;
  if (data && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(data)) return formatarDataHora(data.replace(" ", "T"));
  if (data && /^\d{4}-\d{2}-\d{2}/.test(data)) return formatarData(data);
  return "Data não informada";
}

export function paraAlerta(insight: InsightApi): Alerta {
  return {
    id: insight.id,
    tipo: TIPO[insight.categoria],
    urgencia: insight.criticidade === "ALTA" ? "alta" : "media",
    contaId: insight.conta.id,
    empresa: insight.conta.nome,
    reuniaoId: insight.reuniao.id,
    reuniaoCodigo: insight.reuniao.codigo,
    quando: quando(insight),
    subtipo: insight.subtipo,
    confianca: insight.confianca,
    evidencia: insight.citacaoExata,
    acao: insight.recomendacaoAcao,
    sincronizadoCrm: insight.crm.sincronizado,
  };
}

export const linkConta = (contaId: string) => `/insights?conta=${encodeURIComponent(contaId)}`;

/** A reunião na Central de Insights (cada linha da Central é uma reunião). */
export const linkReuniao = (reuniaoId: string) => `/insights?reuniao=${encodeURIComponent(reuniaoId)}`;
