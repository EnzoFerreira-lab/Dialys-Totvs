// Operações de dados do Dialys. Único ponto que conhece o formato das tabelas.
import { randomUUID } from "node:crypto";
import { chaveConta, nomeConta } from "@/lib/insights";
import type { ResultadoAnalise } from "../ai/analisar-reuniao";
import type { Severidade, TipoSinal } from "../ai/schemas";
import { identificarClientes } from "../clientes/identificacao";
import {
  apagarReunioes,
  lerBanco as lerBancoGravado,
  proximoNumeroReuniao,
  transacao,
  type AnaliseRegistro,
  type Banco,
  type ConversaRegistro,
  type MensagemConversa,
  type MencaoProdutoRegistro,
  type ReuniaoRegistro,
  type SinalRegistro,
  type SincronizacaoCrmRegistro,
} from "./banco";

export const novoId = (prefixo: "reu" | "ana" | "sin" | "men" | "crm" | "cnv" | "msg") => `${prefixo}_${randomUUID().replace(/-/g, "")}`;

const agora = () => new Date().toISOString();

/**
 * Leitura para consultas: as reuniões vêm com o nome do cliente (nomeCliente) calculado na hora. As
 * transações leem o arquivo cru, então o nome calculado nunca é gravado.
 */
async function lerBanco(): Promise<Banco> {
  const banco = await lerBancoGravado();
  identificarClientes(banco.reuniao);
  return banco;
}

const comNome = (reuniao: ReuniaoRegistro) => identificarClientes([reuniao])[0];

/* ---------- Reunião ---------- */

/** A mesma reunião já está no Dashboard (concluída) ou em análise. */
export class ErroReuniaoDuplicada extends Error {
  constructor(readonly existente: ReuniaoRegistro) {
    super(`Reunião já enviada (${existente.id}).`);
    this.name = "ErroReuniaoDuplicada";
  }
}

/** Texto comparável: diferenças de espaço e quebra de linha não tornam uma reunião nova. */
const textoComparavel = (texto: string | null) => (texto ?? "").replace(/\s+/g, " ").trim();

/**
 * Reunião ativa (concluída ou em análise) com o mesmo texto ou o mesmo ID de reunião da TOTVS. As que
 * falharam, as com transcrição removida e as de clientes excluídos não contam: podem ser enviadas de novo.
 */
function reuniaoDuplicada(banco: Banco, dados: Pick<ReuniaoRegistro, "transcricao" | "contexto">) {
  const texto = textoComparavel(dados.transcricao);
  const idReuniao = dados.contexto?.idReuniao;
  return banco.reuniao.find(
    (r) =>
      (r.status === "CONCLUIDA" || r.status === "EM_PROCESSAMENTO") &&
      transcricaoAtiva(r) &&
      ((texto && textoComparavel(r.transcricao) === texto) || (idReuniao !== undefined && r.contexto?.idReuniao === idReuniao)),
  );
}

/**
 * Cada reunião é um registro próprio (id + número), mesmo quando o cliente já tem outras: nada é sobrescrito.
 * A mesma reunião não entra duas vezes (ErroReuniaoDuplicada); a checagem fica na transação para valer
 * também com dois envios simultâneos.
 */
export async function criarReuniao(dados: Omit<ReuniaoRegistro, "id" | "numero" | "criadaEm" | "atualizadaEm">): Promise<ReuniaoRegistro> {
  return transacao((banco) => {
    const duplicada = reuniaoDuplicada(banco, dados);
    if (duplicada) throw new ErroReuniaoDuplicada(comNome(structuredClone(duplicada)));
    const reuniao: ReuniaoRegistro = { ...dados, id: novoId("reu"), numero: proximoNumeroReuniao(banco), criadaEm: agora(), atualizadaEm: agora() };
    banco.reuniao.push(reuniao);
    return structuredClone(reuniao);
  }).then(comNome);
}

/** A transcrição da reunião não foi removida (remoção lógica). Só reuniões ativas entram nas consultas. */
export const transcricaoAtiva = (reuniao: ReuniaoRegistro) => !reuniao.transcricaoRemovida;

export class ErroRemocao extends Error {
  constructor(
    readonly codigo: "REUNIAO_EM_PROCESSAMENTO",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/**
 * Remoção lógica da transcrição de uma reunião: marca quando e quem removeu. Nada é apagado (nem em
 * cascata); a análise derivada só desta transcrição deixa de aparecer porque as consultas filtram.
 * Repetir a chamada não muda nada (`jaRemovida: true`). null: reunião inexistente.
 */
export async function removerTranscricao(reuniaoId: string, usuarioId: string) {
  return transacao((banco) => {
    const reuniao = banco.reuniao.find((r) => r.id === reuniaoId);
    if (!reuniao) return null;
    if (reuniao.transcricaoRemovida) return { reuniao: structuredClone(reuniao), jaRemovida: true };
    if (reuniao.status === "EM_PROCESSAMENTO") {
      throw new ErroRemocao("REUNIAO_EM_PROCESSAMENTO", "A reunião ainda está sendo analisada. Aguarde a conclusão para remover a transcrição.");
    }
    reuniao.transcricaoRemovida = { em: agora(), usuarioId };
    reuniao.atualizadaEm = agora();
    return { reuniao: structuredClone(reuniao), jaRemovida: false };
  });
}

/**
 * Reuniões concluídas cuja transcrição foi removida pela Central: a linha e o código ficam, sem a análise.
 * Reuniões com a marca antiga "cliente_removido" não entram (a leitura do banco já as converte e apaga).
 */
export async function listarReunioesSemTranscricao(): Promise<ReuniaoRegistro[]> {
  return (await lerBanco()).reuniao.filter(
    (r) => r.status === "CONCLUIDA" && r.transcricaoRemovida && r.transcricaoRemovida.motivo !== "cliente_removido",
  );
}

/* ---------- Carteira do usuário (dados reais) ---------- */

/**
 * "Excluir cliente": apaga de vez, numa transação, todas as reuniões do cliente e o que derivou delas
 * (análises, sinais, menções de produto e sincronizações do CRM).
 * Não há como desfazer. Uma reunião nova desse cliente começa um histórico novo, só com ela.
 * Compromissos da agenda e conversas do assistente ficam (citações de reuniões apagadas deixam de abrir).
 * Recusa enquanto alguma reunião do cliente está em análise (o pipeline ainda vai gravar nela).
 */
export async function excluirReunioesDoCliente(contaId: string) {
  return transacao((banco) => {
    const reunioes = banco.reuniao.filter((r) => chaveConta(r) === contaId);
    if (reunioes.some((r) => r.status === "EM_PROCESSAMENTO")) {
      throw new ErroRemocao("REUNIAO_EM_PROCESSAMENTO", "Uma reunião deste cliente ainda está sendo analisada. Aguarde a conclusão para excluí-lo.");
    }
    apagarReunioes(banco, new Set(reunioes.map((r) => r.id)));
    return { reunioes: reunioes.length };
  });
}

/** Nome do cliente pelas reuniões dele (inclusive as sem transcrição ativa). */
export async function nomeDoClienteNasReunioes(contaId: string): Promise<string | null> {
  const reuniao = (await lerBanco()).reuniao.find((r) => chaveConta(r) === contaId);
  return reuniao ? nomeConta(reuniao) : null;
}

export async function buscarReuniao(id: string): Promise<ReuniaoRegistro | null> {
  return (await lerBanco()).reuniao.find((r) => r.id === id) ?? null;
}

/** Altera a reunião dentro de uma transação e devolve a versão gravada. */
export async function atualizarReuniao(id: string, alterar: (reuniao: ReuniaoRegistro) => void): Promise<ReuniaoRegistro> {
  return transacao((banco) => {
    const reuniao = banco.reuniao.find((r) => r.id === id);
    if (!reuniao) throw new Error(`Reunião ${id} não existe.`);
    alterar(reuniao);
    reuniao.atualizadaEm = agora();
    return structuredClone(reuniao);
  }).then(comNome);
}

/* ---------- Resultado da análise (análise + sinais + menções, numa transação só) ---------- */

export async function salvarResultado(
  reuniaoId: string,
  resultado: ResultadoAnalise,
  concluir: (reuniao: ReuniaoRegistro) => void,
): Promise<{ reuniao: ReuniaoRegistro; analise: AnaliseRegistro }> {
  return transacao((banco) => {
    const reuniao = banco.reuniao.find((r) => r.id === reuniaoId);
    if (!reuniao) throw new Error(`Reunião ${reuniaoId} não existe.`);
    const criadaEm = agora();
    const analise: AnaliseRegistro = {
      id: novoId("ana"),
      reuniaoId,
      criadaEm,
      resumoExecutivo: resultado.analise.resumoExecutivo,
      proximosPassosSugeridos: resultado.analise.proximosPassosSugeridos,
      evidencias: resultado.evidencias,
      auditoria: resultado.auditoria,
    };
    banco.analise.push(analise);
    banco.sinal.push(
      ...resultado.analise.sinais.map(
        (sinal): SinalRegistro => ({ ...sinal, id: novoId("sin"), analiseId: analise.id, reuniaoId, criadoEm: criadaEm }),
      ),
    );
    banco.mencao_produto.push(
      ...resultado.analise.mencoesProdutos.map(
        (mencao): MencaoProdutoRegistro => ({ ...mencao, id: novoId("men"), analiseId: analise.id, reuniaoId }),
      ),
    );
    reuniao.analiseId = analise.id;
    concluir(reuniao);
    reuniao.atualizadaEm = agora();
    return { reuniao: structuredClone(reuniao), analise };
  });
}

export type ResultadoPersistido = Omit<ResultadoAnalise, "analise"> & {
  analiseId: string;
  analise: Omit<ResultadoAnalise["analise"], "sinais"> & { sinais: SinalRegistro[] };
};

function montarResultado(banco: Banco, analiseId: string): ResultadoPersistido | null {
  const analise = banco.analise.find((a) => a.id === analiseId);
  if (!analise) return null;
  return {
    analiseId,
    analise: {
      resumoExecutivo: analise.resumoExecutivo,
      proximosPassosSugeridos: analise.proximosPassosSugeridos,
      sinais: banco.sinal.filter((s) => s.analiseId === analiseId),
      mencoesProdutos: banco.mencao_produto
        .filter((m) => m.analiseId === analiseId)
        .map(({ produto, status, contexto }) => ({ produto, status, contexto })),
    },
    evidencias: analise.evidencias,
    auditoria: analise.auditoria,
  };
}

export async function buscarResultado(analiseId: string): Promise<ResultadoPersistido | null> {
  return montarResultado(await lerBanco(), analiseId);
}

export type AnaliseConcluida = {
  reuniao: ReuniaoRegistro;
  resultado: ResultadoPersistido;
  sincronizacoes: SincronizacaoCrmRegistro[];
};

/**
 * Reuniões concluídas com a análise completa e a transcrição ativa, da mais recente para a mais antiga
 * (uma leitura do banco). É a fonte da Central, do Dashboard, do resumo e do assistente.
 */
export async function listarAnalisesConcluidas(): Promise<AnaliseConcluida[]> {
  const banco = await lerBanco();
  return banco.reuniao
    .filter((r) => r.status === "CONCLUIDA" && r.analiseId && transcricaoAtiva(r))
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))
    .flatMap((reuniao) => {
      const resultado = montarResultado(banco, reuniao.analiseId!);
      if (!resultado) return [];
      const ids = new Set(resultado.analise.sinais.map((s) => s.id));
      return [{ reuniao, resultado, sincronizacoes: banco.sincronizacao_crm.filter((s) => ids.has(s.sinalId)) }];
    });
}

/* ---------- Insights (sinais) ---------- */

export type FiltroInsights = {
  tipos?: TipoSinal[];
  severidades?: Severidade[];
  reuniaoId?: string;
  contaId?: string;
};

export type InsightRegistro = {
  sinal: SinalRegistro;
  reuniao: ReuniaoRegistro;
  sincronizacao?: SincronizacaoCrmRegistro;
};

const PESO_SEVERIDADE: Record<Severidade, number> = { ALTA: 0, MÉDIA: 1, BAIXA: 2 };

/** Sinais das reuniões concluídas com transcrição ativa, do mais crítico e recente para o menos. */
export async function listarInsights(filtro: FiltroInsights = {}): Promise<InsightRegistro[]> {
  const banco = await lerBanco();
  const reunioes = new Map(banco.reuniao.filter((r) => r.status === "CONCLUIDA" && transcricaoAtiva(r)).map((r) => [r.id, r]));
  const sincronizacoes = new Map(banco.sincronizacao_crm.map((s) => [s.sinalId, s]));
  return banco.sinal
    .filter((sinal) => reunioes.has(sinal.reuniaoId))
    .filter((sinal) => !filtro.tipos?.length || filtro.tipos.includes(sinal.tipo))
    .filter((sinal) => !filtro.severidades?.length || filtro.severidades.includes(sinal.severidade))
    .filter((sinal) => !filtro.reuniaoId || sinal.reuniaoId === filtro.reuniaoId)
    .filter((sinal) => !filtro.contaId || reunioes.get(sinal.reuniaoId)?.contaId === filtro.contaId)
    .sort(
      (a, b) =>
        PESO_SEVERIDADE[a.severidade] - PESO_SEVERIDADE[b.severidade] || b.criadoEm.localeCompare(a.criadoEm),
    )
    .map((sinal) => ({ sinal, reuniao: reunioes.get(sinal.reuniaoId)!, sincronizacao: sincronizacoes.get(sinal.id) }));
}

export async function buscarInsight(sinalId: string): Promise<InsightRegistro | null> {
  const banco = await lerBanco();
  const sinal = banco.sinal.find((s) => s.id === sinalId);
  const reuniao = sinal && banco.reuniao.find((r) => r.id === sinal.reuniaoId);
  // Insight de transcrição removida não existe mais para as consultas (nem para o CRM).
  if (!sinal || !reuniao || !transcricaoAtiva(reuniao)) return null;
  return { sinal, reuniao, sincronizacao: banco.sincronizacao_crm.find((s) => s.sinalId === sinalId) };
}

/* ---------- CRM ---------- */

/**
 * Registra o envio ao CRM uma única vez por insight (idempotente): repetir a chamada devolve o
 * registro existente com `novo: false`.
 */
export async function registrarSincronizacao(
  sinalId: string,
  montar: (protocolo: string) => unknown,
): Promise<{ registro: SincronizacaoCrmRegistro; novo: boolean }> {
  return transacao((banco) => {
    const existente = banco.sincronizacao_crm.find((s) => s.sinalId === sinalId);
    if (existente) return { registro: existente, novo: false };
    const enviadaEm = agora();
    const protocolo = `CRM-${enviadaEm.slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const registro: SincronizacaoCrmRegistro = {
      id: novoId("crm"),
      sinalId,
      protocolo,
      destino: "simulado",
      enviadaEm,
      payload: montar(protocolo),
    };
    banco.sincronizacao_crm.push(registro);
    return { registro, novo: true };
  });
}

/* ---------- Conversas do assistente ---------- */

/** Mensagens guardadas por conversa (as mais antigas saem) e conversas guardadas por usuário. */
export const MAXIMO_MENSAGENS_CONVERSA = 60;
export const MAXIMO_CONVERSAS_USUARIO = 30;

/** A conversa só é devolvida ao próprio dono; para qualquer outro usuário, ela "não existe". */
export async function buscarConversa(id: string, usuarioId: string): Promise<ConversaRegistro | null> {
  const conversa = (await lerBanco()).conversa_assistente.find((c) => c.id === id);
  return conversa && conversa.usuarioId === usuarioId ? conversa : null;
}

export type TrocaConversa = {
  pergunta: Omit<MensagemConversa, "id" | "criadaEm" | "papel">;
  resposta: Omit<MensagemConversa, "id" | "criadaEm" | "papel">;
  contasEmFoco: string[];
  reunioesEmFoco: string[];
};

/**
 * Grava pergunta e resposta juntas (nunca uma sem a outra). Sem conversaId, cria a conversa.
 * Devolve null se a conversa não existe ou é de outro usuário.
 */
export async function registrarTroca(usuarioId: string, conversaId: string | null, troca: TrocaConversa) {
  return transacao((banco): { conversa: ConversaRegistro; pergunta: MensagemConversa; resposta: MensagemConversa } | null => {
    const instante = agora();
    let conversa = conversaId ? banco.conversa_assistente.find((c) => c.id === conversaId) : undefined;
    if (conversaId && (!conversa || conversa.usuarioId !== usuarioId)) return null;
    if (!conversa) {
      conversa = { id: novoId("cnv"), usuarioId, criadaEm: instante, atualizadaEm: instante, contasEmFoco: [], reunioesEmFoco: [], mensagens: [] };
      banco.conversa_assistente.push(conversa);
      // Limite por usuário: descarta as conversas mais antigas.
      const doUsuario = banco.conversa_assistente.filter((c) => c.usuarioId === usuarioId).sort((a, b) => a.atualizadaEm.localeCompare(b.atualizadaEm));
      const excedentes = new Set(doUsuario.slice(0, Math.max(0, doUsuario.length - MAXIMO_CONVERSAS_USUARIO)).map((c) => c.id));
      banco.conversa_assistente = banco.conversa_assistente.filter((c) => !excedentes.has(c.id));
    }
    const pergunta: MensagemConversa = { ...troca.pergunta, id: novoId("msg"), papel: "usuario", criadaEm: instante };
    const resposta: MensagemConversa = { ...troca.resposta, id: novoId("msg"), papel: "assistente", criadaEm: agora() };
    conversa.mensagens.push(pergunta, resposta);
    conversa.mensagens = conversa.mensagens.slice(-MAXIMO_MENSAGENS_CONVERSA);
    conversa.contasEmFoco = troca.contasEmFoco;
    conversa.reunioesEmFoco = troca.reunioesEmFoco;
    conversa.atualizadaEm = agora();
    return { conversa: structuredClone(conversa), pergunta, resposta };
  });
}
