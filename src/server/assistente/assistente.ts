// Serviço do assistente Dialys: ponto de entrada único para perguntas, independente do canal.
// Hoje a rota de texto (POST /api/v1/assistente/mensagens) chama responderPergunta(); um canal de voz
// futuro faz fala → texto, chama a mesma função e converte a resposta em fala, sem duplicar regras.
//
// Fluxo: pergunta → motor (Claude ou regras locais) pede consultas → o serviço executa cada uma com o
// usuário autenticado (permissão em todas) → resultados voltam ao motor → resposta + fontes gravadas
// na conversa do usuário.
import Anthropic from "@anthropic-ai/sdk";
import type { ConsultaRegistrada, ConversaRegistro, FonteMensagem, MensagemConversa } from "../db/banco";
import { buscarConversa, registrarTroca } from "../db/repositorio";
import { dataNoFuso, horaNoFuso } from "@/lib/fuso";
import { buscarCompromisso } from "../agenda/agenda";
import { podeAcessarConta, type Usuario } from "../auth/usuarios";
import { fusoHorario } from "../config/dados";
import { temChaveClaude, traduzirErroAnalise, usarModoDemonstracao } from "../pipeline/motor-analise";
import { dataBr, executarFerramenta, resolverFoco, type ContextoConsulta, type EntidadeConta, type EntidadeReuniao } from "./ferramentas";
import { ehPedidoDeBriefing, gerarBriefingDoUsuario } from "./briefing";
import { ErroAssistente, type CompromissoEmFoco, type MotorAssistente } from "./motor";
import { criarMotorClaude } from "./motor-claude";
import { criarMotorDemonstracao } from "./motor-demonstracao";

export { ErroAssistente };

export const LIMITE_PERGUNTA = 2000;
const MAXIMO_FONTES = 6;
const MAXIMO_FOCO = 3;

export type PedidoPergunta = {
  usuario: Usuario;
  pergunta: string;
  /** null/ausente: começa uma conversa nova (contexto limpo). */
  conversaId?: string | null;
  /** Id da pergunta gerado pelo cliente: reenviar o mesmo não duplica a troca. */
  idCliente?: string;
  /** Empresa selecionada na tela (ex.: vinda da Central). Validada como qualquer outro id. */
  contaEmFoco?: string | null;
  /** Compromisso aberto em "Preparar com o Dialys". Id vindo do navegador: o serviço confere o dono. */
  compromissoEmFoco?: string | null;
  /** "briefing": botão "Briefing do dia" (o texto também é reconhecido sem esta ação). */
  acao?: "briefing";
};

export type RespostaPergunta = {
  conversaId: string;
  pergunta: MensagemConversa;
  resposta: MensagemConversa;
  /** true quando a pergunta já tinha sido respondida (reenvio do mesmo idCliente). */
  repetida: boolean;
};

export function escolherMotorAssistente(): MotorAssistente {
  if (usarModoDemonstracao()) return criarMotorDemonstracao();
  if (!temChaveClaude()) {
    throw new ErroAssistente(
      "CHAVE_NAO_CONFIGURADA",
      500,
      "O assistente usa a API do Claude, que precisa de uma chave (ANTHROPIC_API_KEY).",
      true,
    );
  }
  return criarMotorClaude();
}

/** Erros do motor viram ErroAssistente com status e mensagem legíveis (mesma tradução da análise). */
function traduzirErro(erro: unknown): ErroAssistente {
  if (erro instanceof ErroAssistente) return erro;
  if (erro instanceof Anthropic.APIError || erro instanceof Anthropic.AnthropicError) {
    const falha = traduzirErroAnalise(erro);
    return new ErroAssistente(falha.codigo, falha.httpStatus, `${falha.titulo}. ${falha.detalhe}`, falha.semChave);
  }
  console.error("[dialys/assistente] erro inesperado", erro);
  return new ErroAssistente("ERRO_INTERNO", 500, "Não foi possível responder agora. Tente novamente.");
}

function fontesDe(contas: EntidadeConta[], reunioes: EntidadeReuniao[]): FonteMensagem[] {
  const fontes = new Map<string, FonteMensagem>();
  for (const r of reunioes)
    fontes.set(r.id, {
      tipo: "reuniao",
      id: r.id,
      contaId: r.contaId,
      rotulo: `${r.contaNome} · ${r.codigo} · ${r.dataInformada ? dataBr(r.data) : "data não informada"}`,
      ...(r.dataInformada ? { data: r.data } : {}),
    });
  for (const c of contas) {
    // A conta só vira fonte própria se nenhuma reunião dela já estiver listada.
    if (![...fontes.values()].some((f) => f.contaId === c.id)) fontes.set(c.id, { tipo: "conta", id: c.id, contaId: c.id, rotulo: c.nome });
  }
  return [...fontes.values()].slice(0, MAXIMO_FONTES);
}

/** Argumentos guardados na auditoria: só o necessário, sem textos longos. */
const argumentosSeguros = (args: unknown): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(typeof args === "object" && args ? args : {}).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 120) : v]),
  );

export async function responderPergunta(
  pedido: PedidoPergunta,
  deps: { motor?: MotorAssistente; agora?: Date } = {},
): Promise<RespostaPergunta> {
  const pergunta = pedido.pergunta.trim();
  if (!pergunta) throw new ErroAssistente("PERGUNTA_VAZIA", 400, "Escreva uma pergunta.");
  if (pergunta.length > LIMITE_PERGUNTA) {
    throw new ErroAssistente("PERGUNTA_LONGA", 400, `A pergunta passa de ${LIMITE_PERGUNTA} caracteres. Resuma e tente de novo.`);
  }

  // A conversa precisa ser do usuário autenticado; de outro, ela "não existe".
  let conversa: ConversaRegistro | null = null;
  if (pedido.conversaId) {
    conversa = await buscarConversa(pedido.conversaId, pedido.usuario.id);
    if (!conversa) throw new ErroAssistente("CONVERSA_NAO_ENCONTRADA", 404, "Conversa não encontrada. Comece uma nova conversa.");
  }

  // Reenvio da mesma pergunta (clique duplo, nova tentativa após timeout): devolve a resposta já dada.
  if (conversa && pedido.idCliente) {
    const indice = conversa.mensagens.findIndex((m) => m.papel === "usuario" && m.idCliente === pedido.idCliente);
    const resposta = conversa.mensagens[indice + 1];
    if (indice >= 0 && resposta?.papel === "assistente") {
      return { conversaId: conversa.id, pergunta: conversa.mensagens[indice], resposta, repetida: true };
    }
  }

  const ctx: ContextoConsulta = { usuario: pedido.usuario, agora: deps.agora ?? new Date() };
  const compromisso = pedido.compromissoEmFoco ? await compromissoDoUsuario(ctx, pedido.compromissoEmFoco) : null;
  if (pedido.contaEmFoco) {
    const [selecionada] = (await resolverFoco(ctx, [pedido.contaEmFoco], [])).contas;
    if (!selecionada)
      throw new ErroAssistente("CONTA_NAO_ENCONTRADA", 404, "A empresa selecionada não foi encontrada entre as suas contas.");
  }
  // O cliente do compromisso (se tiver reuniões analisadas) vem primeiro: "esse cliente" se refere a ele.
  const clienteDoCompromisso = compromisso?.cliente?.temReunioesAnalisadas ? [compromisso.cliente.id] : [];
  const contasFoco = [...new Set([...clienteDoCompromisso, ...(pedido.contaEmFoco ? [pedido.contaEmFoco] : []), ...(conversa?.contasEmFoco ?? [])])].slice(
    0,
    MAXIMO_FOCO,
  );
  const foco = await resolverFoco(ctx, contasFoco, conversa?.reunioesEmFoco ?? []);

  const consultas: ConsultaRegistrada[] = [];
  const vistas = { contas: new Map<string, EntidadeConta>(), reunioes: new Map<string, EntidadeReuniao>() };

  let texto: string;
  let extras: Pick<MensagemConversa, "modo" | "tipo" | "fala">;
  // Briefing do dia: resposta montada dos dados (sem IA) e a única que a tela lê em voz.
  if (pedido.acao === "briefing" || ehPedidoDeBriefing(pergunta)) {
    const briefing = await gerarBriefingDoUsuario(pedido.usuario, ctx.agora);
    consultas.push({ ferramenta: "briefing_diario", argumentos: {}, resumo: briefing.resumoConsulta });
    for (const c of briefing.contas) vistas.contas.set(c.id, c);
    for (const r of briefing.reunioes) vistas.reunioes.set(r.id, r);
    texto = briefing.texto;
    extras = { tipo: "briefing", fala: briefing.fala };
  } else {
    const motor = deps.motor ?? escolherMotorAssistente();
    extras = { modo: motor.nome };
    try {
      ({ texto } = await motor.responder({
        pergunta,
        historico: conversa?.mensagens ?? [],
        foco,
        ctx,
        compromisso,
        consultar: async (ferramenta, argumentos) => {
          const resultado = await executarFerramenta(ctx, ferramenta, argumentos);
          consultas.push({
            ferramenta,
            argumentos: argumentosSeguros(argumentos),
            resumo: resultado.resumo,
            ...(resultado.erro ? { erro: true } : {}),
          });
          for (const c of resultado.entidades.contas) vistas.contas.set(c.id, c);
          for (const r of resultado.entidades.reunioes) vistas.reunioes.set(r.id, r);
          return resultado;
        },
      }));
    } catch (erro) {
      // Nada é gravado: a pergunta pode ser reenviada sem duplicar.
      throw traduzirErro(erro);
    }
  }

  const contasVistas = [...vistas.contas.values()];
  const reunioesVistas = [...vistas.reunioes.values()];
  const gravada = await registrarTroca(pedido.usuario.id, conversa?.id ?? null, {
    pergunta: { texto: pergunta, ...(pedido.idCliente ? { idCliente: pedido.idCliente } : {}) },
    resposta: { texto, ...extras, fontes: fontesDe(contasVistas, reunioesVistas), consultas },
    // Foco novo: o que esta resposta consultou; se não consultou nada específico, mantém o anterior.
    contasEmFoco: contasVistas.length ? contasVistas.slice(0, MAXIMO_FOCO).map((c) => c.id) : foco.contas.map((c) => c.id),
    reunioesEmFoco: reunioesVistas.length ? reunioesVistas.slice(0, MAXIMO_FOCO).map((r) => r.id) : foco.reunioes.map((r) => r.id),
  });
  if (!gravada) throw new ErroAssistente("CONVERSA_NAO_ENCONTRADA", 404, "Conversa não encontrada. Comece uma nova conversa.");
  return { conversaId: gravada.conversa.id, pergunta: gravada.pergunta, resposta: gravada.resposta, repetida: false };
}

/**
 * Compromisso da agenda do próprio usuário, com o cliente só se ele ainda puder ver a conta. Outro
 * usuário (ou id inexistente) recebe 404, sem revelar se o compromisso existe.
 */
async function compromissoDoUsuario(ctx: ContextoConsulta, id: string): Promise<CompromissoEmFoco> {
  const c = await buscarCompromisso(ctx.usuario, id);
  if (!c) throw new ErroAssistente("COMPROMISSO_NAO_ENCONTRADO", 404, "O compromisso selecionado não foi encontrado na sua agenda.");
  const fuso = fusoHorario();
  const cliente = c.cliente && podeAcessarConta(ctx.usuario, c.cliente.id) ? c.cliente : null;
  const analisado = cliente ? (await resolverFoco(ctx, [cliente.id], [])).contas.length > 0 : false;
  return {
    id: c.id,
    titulo: c.titulo,
    data: dataNoFuso(new Date(c.inicio), fuso),
    inicio: horaNoFuso(new Date(c.inicio), fuso),
    fim: horaNoFuso(new Date(c.fim), fuso),
    status: c.status,
    local: c.local,
    observacoes: c.observacoes,
    cliente: cliente ? { ...cliente, temReunioesAnalisadas: analisado } : null,
  };
}

/** Histórico de uma conversa do usuário (null se não existir ou for de outra pessoa). */
export async function lerConversa(usuario: Usuario, conversaId: string) {
  return buscarConversa(conversaId, usuario.id);
}
