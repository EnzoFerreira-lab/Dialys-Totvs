// /api/v1/carteira/{contaId}: a carteira do usuário autenticado (aba Clientes).
//   DELETE  "Excluir cliente": apaga de vez as reuniões do cliente e tudo o que derivou delas (análises,
//           sinais, produtos citados, sincronizações do CRM), para todos. Não há como desfazer; uma reunião
//           nova desse cliente começa um histórico novo, só com ela. Os compromissos continuam na agenda.
// O usuário vem só da sessão; o cliente precisa estar no escopo dele (senão 404, como inexistente).
import { SEM_SESSAO } from "@/server/api/agenda";
import { comTratamento, erro, json } from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";
import { excluirCliente } from "@/server/clientes/clientes";
import { ErroRemocao } from "@/server/db/repositorio";

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
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const contaId = await contaIdValido(params);
    if (!contaId) return erro(400, "ID_INVALIDO", "Id de cliente inválido.", requestId);
    try {
      const excluido = await excluirCliente(usuario, contaId);
      if (!excluido) return erro(404, "CLIENTE_NAO_ENCONTRADO", "Cliente não encontrado.", requestId);
      return json({ excluido: true, cliente: excluido.cliente, reunioesExcluidas: excluido.reunioesExcluidas }, 200, requestId);
    } catch (falha) {
      if (falha instanceof ErroRemocao) return erro(409, falha.codigo, falha.message, requestId);
      throw falha;
    }
  });
}
