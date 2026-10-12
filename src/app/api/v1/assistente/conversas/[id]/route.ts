// GET /api/v1/assistente/conversas/{id}: histórico de uma conversa do usuário autenticado.
// Conversa de outra pessoa responde 404, como se não existisse.
import { serializarMensagem, type ConversaApi } from "@/server/api/assistente";
import { comTratamento, erro, json } from "@/server/api/http";
import { lerConversa } from "@/server/assistente/assistente";
import { usuarioDaRequisicao } from "@/server/auth/sessao";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return comTratamento("GET /assistente/conversas/{id}", async (requestId) => {
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", "Entre na plataforma para conversar com o Dialys.", requestId);
    const { id } = await params;
    if (!/^cnv_[0-9a-f]{32}$/.test(id)) return erro(400, "ID_INVALIDO", "ID de conversa inválido.", requestId);
    const conversa = await lerConversa(usuario, id);
    if (!conversa) return erro(404, "CONVERSA_NAO_ENCONTRADA", "Conversa não encontrada.", requestId);
    const corpo: ConversaApi = { conversaId: conversa.id, mensagens: conversa.mensagens.map(serializarMensagem), contasEmFoco: conversa.contasEmFoco };
    return json(corpo, 200, requestId);
  });
}
