// POST /api/v1/agenda/demonstracao: "Restaurar demonstração". Descarta as alterações do usuário na
// agenda fictícia e gera de novo a da semana atual. Fora do modo demonstração responde 409.
import { restaurarDemonstracao } from "@/server/agenda/agenda";
import { SEM_SESSAO, respostaErroAgenda } from "@/server/api/agenda";
import { comTratamento, erro, json } from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";

export async function POST(request: Request) {
  return comTratamento("POST /agenda/demonstracao", async (requestId) => {
    const usuario = usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    try {
      return json({ restaurado: true, compromissos: await restaurarDemonstracao(usuario) }, 200, requestId);
    } catch (falha) {
      return respostaErroAgenda(falha, requestId);
    }
  });
}
