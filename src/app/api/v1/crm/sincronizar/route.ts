// POST /api/v1/crm/sincronizar: envia um insight ao CRM pelo webhook de enriquecimento (UC05 / US-06).
// Idempotente por insight: o primeiro envio responde 201; repetir devolve o mesmo protocolo com 200,
// sem reenviar o webhook.
import { z } from "zod";
import { enviarWebhookCrm, montarPayloadCrm, type PayloadCrm } from "@/server/api/crm";
import { comTratamento, erro, json, type SincronizacaoCrmApi } from "@/server/api/http";
import { buscarInsight, registrarSincronizacao } from "@/server/db/repositorio";

const CorpoSchema = z.object({
  insightId: z.string().regex(/^sin_[0-9a-f]{32}$/, "use o id do insight (formato sin_<32 hex>)"),
});

export async function POST(request: Request) {
  return comTratamento("POST /crm/sincronizar", async (requestId) => {
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      return erro(415, "TIPO_NAO_SUPORTADO", "Use Content-Type application/json.", requestId);
    }
    let corpo: unknown;
    try {
      corpo = await request.json();
    } catch {
      return erro(400, "JSON_INVALIDO", "O corpo não é um JSON válido.", requestId);
    }
    const lido = CorpoSchema.safeParse(corpo);
    if (!lido.success) {
      const problema = lido.error.issues[0];
      return erro(400, "INSIGHT_ID_INVALIDO", `Campo "insightId" inválido: ${problema?.message}.`, requestId);
    }

    const insight = await buscarInsight(lido.data.insightId);
    if (!insight) return erro(404, "INSIGHT_NAO_ENCONTRADO", `Insight ${lido.data.insightId} não encontrado.`, requestId);

    const { registro, novo } = await registrarSincronizacao(insight.sinal.id, (protocolo) => montarPayloadCrm(insight, protocolo));
    if (novo) enviarWebhookCrm(registro.payload as PayloadCrm);

    const resposta: SincronizacaoCrmApi = {
      insightId: registro.sinalId,
      sincronizado: true,
      protocolo: registro.protocolo,
      destino: registro.destino,
      sincronizadoEm: registro.enviadaEm,
      jaSincronizado: !novo,
      payload: registro.payload,
    };
    return json(resposta, novo ? 201 : 200, requestId);
  });
}
