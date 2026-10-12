// /api/v1/agenda/{id}: um compromisso do usuário autenticado. De outra pessoa responde 404.
//   GET    detalhes
//   PATCH  { titulo?, inicio?, fim?, contaId?, local?, observacoes?, status? }
//          cancelar = { status: "cancelado" }; concluir = { status: "realizado" }. Não há exclusão.
import { atualizarCompromisso, buscarCompromisso } from "@/server/agenda/agenda";
import { SEM_SESSAO, lerCorpoJson, respostaErroAgenda } from "@/server/api/agenda";
import { comTratamento, erro, json } from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto) {
  return comTratamento("GET /agenda/{id}", async (requestId) => {
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const compromisso = await buscarCompromisso(usuario, (await params).id);
    if (!compromisso) return erro(404, "COMPROMISSO_NAO_ENCONTRADO", "Compromisso não encontrado.", requestId);
    return json(compromisso, 200, requestId);
  });
}

export async function PATCH(request: Request, { params }: Contexto) {
  return comTratamento("PATCH /agenda/{id}", async (requestId) => {
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const lido = await lerCorpoJson(request, requestId);
    if ("resposta" in lido) return lido.resposta;
    try {
      return json(await atualizarCompromisso(usuario, (await params).id, lido.corpo), 200, requestId);
    } catch (falha) {
      return respostaErroAgenda(falha, requestId);
    }
  });
}
