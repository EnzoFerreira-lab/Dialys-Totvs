// POST /api/v1/assistente/mensagens: pergunta ao assistente Dialys. Exige sessão (cookie assinado);
// o usuário vem só dela. Sem conversaId, começa uma conversa nova; com, continua a do próprio usuário.
import { z } from "zod";
import { serializarMensagem, type RespostaMensagemApi } from "@/server/api/assistente";
import { comTratamento, erro, json } from "@/server/api/http";
import { ErroAssistente, LIMITE_PERGUNTA, responderPergunta } from "@/server/assistente/assistente";
import { usuarioDaRequisicao } from "@/server/auth/sessao";

/** Uma resposta pode encadear várias consultas e chamadas ao modelo. */
export const maxDuration = 120;

const CorpoSchema = z.object({
  mensagem: z.string().max(LIMITE_PERGUNTA + 500),
  conversaId: z.string().regex(/^cnv_[0-9a-f]{32}$/).nullish(),
  idCliente: z.string().min(8).max(64).regex(/^[\w-]+$/).optional(),
  // Empresa selecionada na tela: tratada como qualquer id vindo do navegador (validada no serviço).
  // compromissoId: compromisso da agenda do usuário em foco (uso pela API); o serviço confere o dono.
  filtros: z
    .object({ contaId: z.string().min(1).max(80).nullish(), compromissoId: z.string().regex(/^cmp_[0-9a-f]{32}$/).nullish() })
    .optional(),
  /** "briefing": botão "Briefing do dia"; a resposta vem com tipo "briefing" e o roteiro para a voz. */
  acao: z.enum(["briefing"]).optional(),
});

export async function POST(request: Request) {
  return comTratamento("POST /assistente/mensagens", async (requestId) => {
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", "Entre na plataforma para conversar com o Dialys.", requestId);
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      return erro(415, "TIPO_NAO_SUPORTADO", "Use Content-Type application/json.", requestId);
    }
    let corpo: unknown;
    try {
      corpo = await request.json();
    } catch {
      return erro(400, "JSON_INVALIDO", "O corpo não é um JSON válido.", requestId);
    }
    const lido = CorpoSchema.safeParse(corpo);
    if (!lido.success) {
      const problema = lido.error.issues[0];
      return erro(400, "PEDIDO_INVALIDO", `Campo "${problema?.path.join(".")}" inválido: ${problema?.message}.`, requestId);
    }

    try {
      const r = await responderPergunta({
        usuario,
        pergunta: lido.data.mensagem,
        conversaId: lido.data.conversaId ?? null,
        idCliente: lido.data.idCliente,
        contaEmFoco: lido.data.filtros?.contaId ?? null,
        compromissoEmFoco: lido.data.filtros?.compromissoId ?? null,
        acao: lido.data.acao,
      });
      const corpoResposta: RespostaMensagemApi = {
        conversaId: r.conversaId,
        pergunta: serializarMensagem(r.pergunta),
        resposta: serializarMensagem(r.resposta),
        repetida: r.repetida,
      };
      return json(corpoResposta, 200, requestId);
    } catch (falha) {
      if (falha instanceof ErroAssistente) {
        return erro(falha.httpStatus, falha.codigo, falha.message, requestId, falha.semChave ? { semChave: true } : undefined);
      }
      throw falha;
    }
  });
}
