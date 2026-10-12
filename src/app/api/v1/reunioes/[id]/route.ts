// GET /api/v1/reunioes/{id}: estado do pipeline (etapas) e, quando concluída, a análise com sinais e menções.
//   ?incluirTranscricao=true  devolve também o texto analisado (as posições dos sinais apontam para ele).
import { SEM_SESSAO } from "@/server/api/agenda";
import { comTratamento, erro, json, serializarReuniao } from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";
import { buscarReuniaoDoUsuario, buscarResultado } from "@/server/db/repositorio";
import { consultarReuniao } from "@/server/pipeline/processar-reuniao";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return comTratamento("GET /reunioes/{id}", async (requestId) => {
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const { id } = await params;
    if (!/^reu_[0-9a-f]{32}$/.test(id)) return erro(400, "ID_INVALIDO", "ID de reunião inválido (formato reu_<32 hex>).", requestId);

    // Reunião de outro usuário: a mesma resposta de inexistente.
    if (!(await buscarReuniaoDoUsuario(id, usuario.id))) return erro(404, "REUNIAO_NAO_ENCONTRADA", `Reunião ${id} não encontrada.`, requestId);
    const reuniao = await consultarReuniao(id);
    if (!reuniao) return erro(404, "REUNIAO_NAO_ENCONTRADA", `Reunião ${id} não encontrada.`, requestId);

    const resultado = reuniao.analiseId ? await buscarResultado(reuniao.analiseId) : null;
    const incluirTranscricao = new URL(request.url).searchParams.get("incluirTranscricao") === "true";
    // Enquanto processa, o cliente consulta de novo: Retry-After sugere o intervalo.
    const cabecalhos: Record<string, string> = reuniao.status === "EM_PROCESSAMENTO" ? { "Retry-After": "2" } : {};
    return json(serializarReuniao(reuniao, resultado, { incluirTranscricao }), 200, requestId, cabecalhos);
  });
}
