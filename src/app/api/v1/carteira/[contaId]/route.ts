// /api/v1/carteira/{contaId}: a carteira do usuário autenticado ("Meus clientes" da Home).
//   DELETE  "Remover cliente": tira o cliente da carteira deste usuário e remove os insights dele
//           (Central, Dashboard, indicadores e assistente). Remoção lógica: nada é apagado do banco e
//           os compromissos continuam com o nome do cliente.
//   PUT     devolve o cliente à carteira e reativa os insights removidos junto com ele.
// O usuário vem só da sessão; o cliente precisa estar no escopo dele (senão 404, como inexistente).
import { SEM_SESSAO } from "@/server/api/agenda";
import { comTratamento, erro, json } from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";
import { devolverACarteira, removerDaCarteira } from "@/server/clientes/clientes";

type Contexto = { params: Promise<{ contaId: string }> };

async function contaIdValido(params: Contexto["params"]) {
  const { contaId } = await params;
  let id = contaId;
  try {
    id = decodeURIComponent(contaId);
  } catch {
    /* já decodificado ou malformado: usa como veio */
  }
  return id.length > 0 && id.length <= 200 ? id : null;
}

export async function DELETE(request: Request, { params }: Contexto) {
  return comTratamento("DELETE /carteira/{contaId}", async (requestId) => {
    const usuario = usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const contaId = await contaIdValido(params);
    if (!contaId) return erro(400, "ID_INVALIDO", "Id de cliente inválido.", requestId);
    const removido = await removerDaCarteira(usuario, contaId);
    if (!removido) return erro(404, "CLIENTE_NAO_ENCONTRADO", "Cliente não encontrado na sua carteira.", requestId);
    return json(
      { removido: true, cliente: { id: removido.cliente.id, nome: removido.cliente.nome }, reunioesComInsightsRemovidos: removido.reunioesComInsightsRemovidos },
      200,
      requestId,
    );
  });
}

export async function PUT(request: Request, { params }: Contexto) {
  return comTratamento("PUT /carteira/{contaId}", async (requestId) => {
    const usuario = usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const contaId = await contaIdValido(params);
    if (!contaId) return erro(400, "ID_INVALIDO", "Id de cliente inválido.", requestId);
    const devolvido = await devolverACarteira(usuario, contaId);
    if (!devolvido) return erro(404, "CLIENTE_NAO_ENCONTRADO", "Cliente não encontrado.", requestId);
    return json({ naCarteira: true, ...devolvido }, 200, requestId);
  });
}
