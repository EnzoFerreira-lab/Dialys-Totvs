// POST /api/v1/agenda/pauta { contaId, titulo?, data? }: pauta sugerida para um compromisso com o cliente
// (objetivo, assuntos com a citação do cliente e direcionamento). Não grava nada: o usuário decide se usa
// o texto nas observações. Usa 1 requisição da IA; sem IA disponível, a pauta sai das regras locais.
// O usuário vem só da sessão; cliente fora do escopo dele responde 404, como inexistente.
import { z } from "zod";
import { sugerirPauta } from "@/server/agenda/pauta";
import { SEM_SESSAO, lerCorpoJson } from "@/server/api/agenda";
import { comTratamento, erro, json } from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";

/** Uma chamada à IA leva alguns segundos; o modelo gratuito pode demorar mais. */
export const maxDuration = 120;

const Corpo = z.object({
  contaId: z.string().trim().min(1).max(200),
  titulo: z.string().max(200).nullish(),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});

export async function POST(request: Request) {
  return comTratamento("POST /agenda/pauta", async (requestId) => {
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const lido = await lerCorpoJson(request, requestId);
    if ("resposta" in lido) return lido.resposta;
    const corpo = Corpo.safeParse(lido.corpo);
    if (!corpo.success) return erro(400, "PEDIDO_INVALIDO", 'Informe "contaId" (e, se quiser, "titulo" e "data" no formato AAAA-MM-DD).', requestId);
    const pauta = await sugerirPauta(usuario, corpo.data);
    if (!pauta) return erro(404, "CLIENTE_NAO_ENCONTRADO", "Cliente não encontrado.", requestId);
    return json(pauta, 200, requestId);
  });
}
