// DELETE /api/v1/reunioes/{id}/transcricao: remoção lógica da transcrição desta reunião (só dela).
// A reunião e o código ("Reunião #1394492") ficam; a transcrição e a análise derivada só dela (sinais,
// evidências, diagnóstico) saem da Central, do Dashboard, dos indicadores e do assistente. Nada é
// apagado do banco. Exige sessão e acesso à conta da reunião (senão 404, como inexistente).
// Repetir a chamada não duplica nada: responde 200 com jaRemovida = true.
import { chaveConta, codigoReuniao, nomeConta } from "@/lib/insights";
import { SEM_SESSAO } from "@/server/api/agenda";
import { comTratamento, erro, json } from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";
import { podeAcessarConta } from "@/server/auth/usuarios";
import { buscarReuniaoDoUsuario, ErroRemocao, removerTranscricao } from "@/server/db/repositorio";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return comTratamento("DELETE /reunioes/{id}/transcricao", async (requestId) => {
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const { id } = await params;
    if (!/^reu_[0-9a-f]{32}$/.test(id)) return erro(400, "ID_INVALIDO", "ID de reunião inválido (formato reu_<32 hex>).", requestId);

    const existente = await buscarReuniaoDoUsuario(id, usuario.id);
    if (!existente || !podeAcessarConta(usuario, chaveConta(existente))) {
      return erro(404, "REUNIAO_NAO_ENCONTRADA", "Reunião não encontrada.", requestId);
    }
    try {
      const removida = await removerTranscricao(id, usuario.id);
      if (!removida) return erro(404, "REUNIAO_NAO_ENCONTRADA", "Reunião não encontrada.", requestId);
      const { reuniao, jaRemovida } = removida;
      return json(
        {
          reuniaoId: reuniao.id,
          codigo: codigoReuniao(reuniao),
          conta: { id: chaveConta(reuniao), nome: nomeConta(reuniao) },
          transcricaoRemovidaEm: reuniao.transcricaoRemovida?.em ?? null,
          jaRemovida,
        },
        200,
        requestId,
      );
    } catch (falha) {
      if (falha instanceof ErroRemocao) return erro(409, falha.codigo, falha.message, requestId);
      throw falha;
    }
  });
}
