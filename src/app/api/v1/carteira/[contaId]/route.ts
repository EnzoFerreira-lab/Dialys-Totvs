// /api/v1/carteira/{contaId}: a carteira do usuário autenticado ("Meus clientes" da Home).
//   DELETE  "Remover cliente": tira o cliente só da carteira deste usuário. Não apaga o cadastro, as
//           reuniões, as transcrições, o histórico nem os compromissos, e não afeta outros usuários.
//   PUT     devolve à carteira um cliente removido.
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
    const cliente = await removerDaCarteira(usuario, contaId);
    if (!cliente) return erro(404, "CLIENTE_NAO_ENCONTRADO", "Cliente não encontrado na sua carteira.", requestId);
    return json({ removido: true, cliente: { id: cliente.id, nome: cliente.nome } }, 200, requestId);
  });
}

export async function PUT(request: Request, { params }: Contexto) {
  return comTratamento("PUT /carteira/{contaId}", async (requestId) => {
    const usuario = usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const contaId = await contaIdValido(params);
    if (!contaId) return erro(400, "ID_INVALIDO", "Id de cliente inválido.", requestId);
    const cliente = await devolverACarteira(usuario, contaId);
    if (!cliente) return erro(404, "CLIENTE_NAO_ENCONTRADO", "Cliente não encontrado.", requestId);
    return json({ naCarteira: true, cliente: { id: cliente.id, nome: cliente.nome } }, 200, requestId);
  });
}
