// GET /api/v1/resumo: agregado da carteira analisada (KPIs do Painel Executivo, matriz de urgência e
// agenda sugerida do assistente Dialys). Calculado a cada chamada a partir das reuniões concluídas.
import { connection } from "next/server";
import { comTratamento, json } from "@/server/api/http";
import { montarResumo } from "@/server/insights/resumo";

export async function GET() {
  return comTratamento("GET /resumo", async (requestId) => {
    // Sem isso o Next pré-renderiza a rota no build (não lê nada da requisição).
    await connection();
    return json(await montarResumo(), 200, requestId);
  });
}
