// GET /api/v1/resumo: agregado da carteira analisada do usuário da sessão (KPIs do Painel Executivo, matriz de urgência e
// agenda sugerida do assistente Dialys). Calculado a cada chamada a partir das reuniões concluídas.
import { connection } from "next/server";
import { SEM_SESSAO } from "@/server/api/agenda";
import { comTratamento, erro, json } from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";
import { podeAcessarConta } from "@/server/auth/usuarios";
import { montarResumo } from "@/server/insights/resumo";

export async function GET(request: Request) {
  return comTratamento("GET /resumo", async (requestId) => {
    // Sem isso o Next pré-renderiza a rota no build (não lê nada da requisição).
    await connection();
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    return json(await montarResumo(usuario.id, new Date(), (contaId) => podeAcessarConta(usuario, contaId)), 200, requestId);
  });
}
