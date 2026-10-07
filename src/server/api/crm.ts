// Webhook de enriquecimento do CRM (UC05 / US-06). No piloto o envio é simulado: o payload é montado,
// gravado em sincronizacao_crm e registrado no log, mas nada sai da máquina. Para ligar um CRM real,
// troque enviarWebhookCrm() por um POST assinado (HMAC) para a URL configurada.
import type { InsightRegistro } from "../db/repositorio";
import { CATEGORIA_DO_TIPO, linkReuniao } from "./http";

export const EVENTO_ENRIQUECIMENTO = "dialys.insight.enriquecimento";

export function montarPayloadCrm({ sinal, reuniao }: InsightRegistro, protocolo: string) {
  return {
    evento: EVENTO_ENRIQUECIMENTO,
    versao: 1,
    protocolo,
    conta: {
      id: reuniao.contaId ?? null,
      segmento: reuniao.contexto?.segmento ?? null,
      tipoRecurso: reuniao.contexto?.tipoRecurso ?? null,
    },
    insight: {
      id: sinal.id,
      categoria: CATEGORIA_DO_TIPO[sinal.tipo],
      subtipo: sinal.subtipo,
      criticidade: sinal.severidade,
      confianca: sinal.confianca,
      evidencia: sinal.citacaoExata,
      recomendacaoAcao: sinal.recomendacaoAcao,
    },
    origem: { reuniaoId: reuniao.id, dataReuniao: reuniao.contexto?.data ?? reuniao.criadaEm, link: linkReuniao(reuniao.id) },
  };
}

export type PayloadCrm = ReturnType<typeof montarPayloadCrm>;

/** Envio simulado: só registra no log do servidor. */
export function enviarWebhookCrm(payload: PayloadCrm) {
  console.info(
    `[dialys/crm] webhook simulado ${payload.protocolo}: ${payload.insight.categoria}/${payload.insight.criticidade} ` +
      `do insight ${payload.insight.id} (conta ${payload.conta.id ?? "não informada"}) enviado com sucesso`,
  );
}
