// /api/v1/agenda: compromissos do usuário autenticado (a mesma fonte da home e do assistente).
//   GET   ?de=AAAA-MM-DD&ate=AAAA-MM-DD  datas no fuso configurado, inclusive (padrão: hoje); até 62 dias
//   POST  { titulo, inicio, fim, contaId?, local?, observacoes? }  instantes ISO 8601 com fuso
// O usuário vem só da sessão; contaId é validado contra a carteira dele.
import { connection } from "next/server";
import type { ListaAgendaApi } from "@/lib/agenda";
import { dataNoFuso, somarDias } from "@/lib/fuso";
import { MAXIMO_DIAS_CONSULTA, criarCompromisso, listarCompromissos } from "@/server/agenda/agenda";
import { SEM_SESSAO, lerCorpoJson, respostaErroAgenda } from "@/server/api/agenda";
import { comTratamento, erro, json } from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";
import { fusoHorario } from "@/server/config/dados";

const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export async function GET(request: Request) {
  await connection();
  return comTratamento("GET /agenda", async (requestId) => {
    const usuario = usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const fuso = fusoHorario();
    const hoje = dataNoFuso(new Date(), fuso);
    const params = new URL(request.url).searchParams;
    const de = params.get("de") || hoje;
    const ate = params.get("ate") || de;
    if (!DATA.test(de) || !DATA.test(ate)) return erro(400, "PERIODO_INVALIDO", 'Use "de" e "ate" no formato AAAA-MM-DD.', requestId);
    if (ate < de) return erro(400, "PERIODO_INVALIDO", '"ate" deve ser igual ou posterior a "de".', requestId);
    if (somarDias(de, MAXIMO_DIAS_CONSULTA) <= ate) {
      return erro(400, "PERIODO_INVALIDO", `Consulte no máximo ${MAXIMO_DIAS_CONSULTA} dias por vez.`, requestId);
    }
    const corpo: ListaAgendaApi = { fuso, hoje, periodo: { de, ate }, dados: await listarCompromissos(usuario, { de, ate }) };
    return json(corpo, 200, requestId);
  });
}

export async function POST(request: Request) {
  return comTratamento("POST /agenda", async (requestId) => {
    const usuario = usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const lido = await lerCorpoJson(request, requestId);
    if ("resposta" in lido) return lido.resposta;
    try {
      return json(await criarCompromisso(usuario, lido.corpo), 201, requestId);
    } catch (falha) {
      return respostaErroAgenda(falha, requestId);
    }
  });
}
