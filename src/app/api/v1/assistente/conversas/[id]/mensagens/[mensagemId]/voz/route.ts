// GET /api/v1/assistente/conversas/{id}/mensagens/{mensagemId}/voz: áudio do briefing na voz do ElevenLabs,
// com o segundo em que cada trecho começa (para o player destacar a frase e avançar). Só briefings da
// conversa do próprio usuário; outra conversa ou mensagem responde 404.
import type { VozBriefingApi } from "@/server/api/assistente";
import { comTratamento, erro, json } from "@/server/api/http";
import { ErroVoz, vozDoBriefing } from "@/server/assistente/voz";
import { usuarioDaRequisicao } from "@/server/auth/sessao";

/** A primeira geração de um briefing de ~90 s leva alguns segundos no ElevenLabs. */
export const maxDuration = 120;

export async function GET(request: Request, { params }: { params: Promise<{ id: string; mensagemId: string }> }) {
  return comTratamento("GET /assistente/conversas/{id}/mensagens/{mensagemId}/voz", async (requestId) => {
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", "Entre na plataforma para ouvir o briefing.", requestId);
    const { id, mensagemId } = await params;
    if (!/^cnv_[0-9a-f]{32}$/.test(id) || !/^[\w-]{1,80}$/.test(mensagemId)) return erro(400, "ID_INVALIDO", "ID inválido.", requestId);
    try {
      const { mp3, marcas } = await vozDoBriefing(usuario, id, mensagemId);
      const corpo: VozBriefingApi = { ...marcas, audio: `data:audio/mpeg;base64,${mp3.toString("base64")}` };
      return json(corpo, 200, requestId);
    } catch (falha) {
      if (falha instanceof ErroVoz) return erro(falha.httpStatus, falha.codigo, falha.message, requestId);
      throw falha;
    }
  });
}
