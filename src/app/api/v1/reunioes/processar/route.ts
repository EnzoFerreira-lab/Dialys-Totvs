// POST /api/v1/reunioes/processar: recebe uma reunião (texto, .txt, JSON da TOTVS ou áudio) e aciona o pipeline.
//   padrão               202 Accepted + reunião EM_PROCESSAMENTO; as etapas 2 a 5 rodam depois da resposta
//                        e o cliente acompanha em GET /api/v1/reunioes/{id} (header Location).
//   ?modo=sincrono       espera o pipeline terminar: 201 com o resultado, ou o status HTTP da falha.
import { after } from "next/server";
import { lerEntrada } from "@/server/api/entrada-reuniao";
import { comTratamento, erro, json, linkReuniao, serializarReuniao } from "@/server/api/http";
import { buscarResultado } from "@/server/db/repositorio";
import { ErroEntrada, processarReuniao, receberReuniao } from "@/server/pipeline/processar-reuniao";

/** Análise com o Claude leva de 30 s a 2 min; o modo síncrono precisa da margem. */
export const maxDuration = 300;

export async function POST(request: Request) {
  return comTratamento("POST /reunioes/processar", async (requestId) => {
    const modo = new URL(request.url).searchParams.get("modo") ?? "assincrono";
    if (modo !== "assincrono" && modo !== "sincrono") {
      return erro(400, "MODO_INVALIDO", 'Parâmetro "modo" deve ser "assincrono" ou "sincrono".', requestId);
    }

    let entrada;
    let reuniao;
    try {
      entrada = await lerEntrada(request);
      reuniao = await receberReuniao(entrada);
    } catch (falha) {
      if (falha instanceof ErroEntrada) return erro(falha.httpStatus, falha.codigo, falha.message, requestId);
      throw falha;
    }
    console.info(`[dialys/api] reunião ${reuniao.id} recebida (${reuniao.origem}, modo ${modo}, ${requestId})`);

    if (modo === "assincrono") {
      const id = reuniao.id;
      after(() => processarReuniao(id, entrada));
      return json(serializarReuniao(reuniao, null), 202, requestId, { Location: linkReuniao(id) });
    }

    const processada = await processarReuniao(reuniao.id, entrada);
    if (processada.status === "FALHOU" && processada.falha) {
      const { httpStatus, codigo, titulo, detalhe } = processada.falha;
      return erro(httpStatus, codigo, titulo, requestId, { detalhe, reuniao: serializarReuniao(processada, null) });
    }
    const resultado = processada.analiseId ? await buscarResultado(processada.analiseId) : null;
    return json(serializarReuniao(processada, resultado), 201, requestId, { Location: linkReuniao(processada.id) });
  });
}
