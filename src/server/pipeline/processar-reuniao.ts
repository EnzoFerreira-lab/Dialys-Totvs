// Pipeline de processamento de uma reunião (só texto: o Dialys não recebe áudio), em 4 etapas:
//   1. RECEBIMENTO          valida e sanitiza a entrada e registra a reunião (status EM_PROCESSAMENTO)
//   2. ANALISE_IA           Nemotron (ou Claude, ou as regras locais sem chave) gera sinais, produtos e resumo
//   3. VALIDACAO_EVIDENCIAS só ficam sinais cuja citação existe literalmente na transcrição
//   4. PERSISTENCIA         grava analise, sinal e mencao_produto e conclui a reunião
// O estado de cada etapa é gravado ao entrar e ao sair, então a API mostra o progresso e uma falha
// fica registrada na etapa onde ocorreu. No piloto a execução roda no próprio servidor Next (after());
// na produção, cada etapa vira um step de uma fila durável (Inngest), com retentativa por etapa.
import { ContextoReuniaoSchema, normalizarTranscricao, type ContextoReuniao } from "@/lib/transcricao";
import type { ResultadoAnalise } from "../ai/analisar-reuniao";
import { validarEvidencias } from "../ai/validar-evidencia";
import type { Etapa, FalhaRegistrada, NomeEtapa, ReuniaoRegistro, StatusEtapa } from "../db/banco";
import { ID_USUARIO_DEMONSTRACAO } from "../auth/usuarios";
import { codigoReuniao } from "@/lib/insights";
import { atualizarReuniao, buscarReuniao, criarReuniao, ErroReuniaoDuplicada, salvarResultado } from "../db/repositorio";
import { escolherMotor, traduzirErroAnalise, type MotorAnalise } from "./motor-analise";

/** ~3 horas de reunião. Acima disso, a transcrição deve ser dividida. */
export const LIMITE_CARACTERES = 200_000;
const MIN_CARACTERES = 20;
/** "Em processamento" sem atualização há mais que isso: a análise travou (a do Claude leva até ~2 min). */
export const TEMPO_MAXIMO_PROCESSAMENTO_MS = 6 * 60_000;
/** Agendada e não iniciada em até este tempo: o after() não rodou. */
const TEMPO_PARA_INICIAR_MS = 15_000;
/** Quantas vezes uma reunião interrompida é retomada antes de falhar. */
const MAXIMO_RETOMADAS = 2;

/** Espera das regras locais, para a tela mostrar as etapas andando (a análise local leva milissegundos). */
const ATRASO_DEMO_MS = 1500;

export const ETAPAS: NomeEtapa[] = ["RECEBIMENTO", "ANALISE_IA", "VALIDACAO_EVIDENCIAS", "PERSISTENCIA"];

export type EntradaReuniao = {
  conteudo: { tipo: "texto"; texto: string; nomeArquivo?: string };
  contexto?: unknown;
  contaId?: unknown;
  contaNome?: unknown;
};

/** Entrada inválida: a reunião nem é registrada. */
export class ErroEntrada extends Error {
  constructor(
    readonly codigo: string,
    readonly httpStatus: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroEntrada";
  }
}

export type DependenciasPipeline = {
  motor?: MotorAnalise;
  /** Espera das regras locais (ms). */
  atrasoDemoMs?: number;
};

/* ---------- Reuniões em execução neste processo ---------- */

// No globalThis: as rotas são empacotadas separadamente e o HMR recarrega módulos, mas todas precisam
// ver o mesmo registro. Um servidor reiniciado começa vazio, e é assim que uma reunião parada é notada.
type Execucao = { agendadaEm: number; iniciada: boolean };
const chaveExecucoes = Symbol.for("dialys.pipeline.execucoes");
function execucoes(): Map<string, Execucao> {
  const global = globalThis as typeof globalThis & { [chaveExecucoes]?: Map<string, Execucao> };
  return (global[chaveExecucoes] ??= new Map());
}

/** A rota chama antes de responder: daqui em diante a reunião conta como "em execução". */
export function agendarProcessamento(reuniaoId: string) {
  execucoes().set(reuniaoId, { agendadaEm: Date.now(), iniciada: false });
}

/** O processamento desta reunião está rodando (ou acabou de ser agendado) neste processo? */
function estaEmExecucao(reuniaoId: string) {
  const execucao = execucoes().get(reuniaoId);
  return Boolean(execucao && (execucao.iniciada || Date.now() - execucao.agendadaEm < TEMPO_PARA_INICIAR_MS));
}

const agora = () => new Date().toISOString();

/** Remove caracteres de controle (menos quebra de linha e tab) e ajusta texto copiado de JSON. */
function sanitizar(texto: string) {
  return normalizarTranscricao(texto).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function validarTexto(texto: string) {
  if (texto.length < MIN_CARACTERES) {
    throw new ErroEntrada("TRANSCRICAO_VAZIA", 400, `A transcrição precisa ter pelo menos ${MIN_CARACTERES} caracteres.`);
  }
  if (texto.length > LIMITE_CARACTERES) {
    throw new ErroEntrada(
      "TRANSCRICAO_LONGA",
      413,
      `O limite é de ${LIMITE_CARACTERES.toLocaleString("pt-BR")} caracteres (cerca de 3 horas de reunião).`,
    );
  }
}

/* ---------- Etapa 1 ---------- */

/**
 * Valida, sanitiza e registra a reunião em nome de `usuarioId` (o dono, que passa a ser o único a vê-la).
 * Lança ErroEntrada sem gravar nada se a entrada for inválida.
 */
export async function receberReuniao(entrada: EntradaReuniao, usuarioId: string): Promise<ReuniaoRegistro> {
  let contexto: ContextoReuniao | undefined;
  if (entrada.contexto !== undefined && entrada.contexto !== null) {
    const lido = ContextoReuniaoSchema.safeParse(entrada.contexto);
    if (!lido.success) throw new ErroEntrada("CONTEXTO_INVALIDO", 400, `Campo "contexto" inválido: ${lido.error.issues[0]?.message}.`);
    contexto = lido.data;
  }
  let contaId: string | undefined;
  if (entrada.contaId !== undefined && entrada.contaId !== null && entrada.contaId !== "") {
    if (typeof entrada.contaId !== "string" || !/^[\w.-]{1,60}$/.test(entrada.contaId)) {
      throw new ErroEntrada("CONTA_INVALIDA", 400, 'Campo "contaId" inválido: use até 60 letras, números, ".", "_" ou "-".');
    }
    contaId = entrada.contaId;
  }
  let contaNome: string | undefined;
  if (entrada.contaNome !== undefined && entrada.contaNome !== null && entrada.contaNome !== "") {
    const nome = typeof entrada.contaNome === "string" ? sanitizar(entrada.contaNome).replace(/\s+/g, " ").trim() : "";
    if (!nome || nome.length > 120) throw new ErroEntrada("CONTA_INVALIDA", 400, 'Campo "contaNome" inválido: use de 1 a 120 caracteres.');
    contaNome = nome;
  }

  const transcricao = sanitizar(entrada.conteudo.texto);
  validarTexto(transcricao);
  const detalhe = `Texto recebido (${transcricao.length.toLocaleString("pt-BR")} caracteres)${
    entrada.conteudo.nomeArquivo ? ` do arquivo ${entrada.conteudo.nomeArquivo}` : ""
  }.`;

  const instante = agora();
  try {
      return await criarReuniao({
      usuarioId,
      status: "EM_PROCESSAMENTO",
      origem: entrada.conteudo.nomeArquivo ? "arquivo_texto" : "texto",
      nomeArquivo: entrada.conteudo.nomeArquivo,
      contaId,
      contaNome,
      contexto,
      transcricao,
      etapas: ETAPAS.map(
        (nome): Etapa =>
          nome === "RECEBIMENTO"
            ? { nome, status: "CONCLUIDA", iniciadaEm: instante, concluidaEm: instante, detalhe }
            : { nome, status: "PENDENTE" },
      ),
    });
  } catch (erro) {
    if (!(erro instanceof ErroReuniaoDuplicada)) throw erro;
    const { existente } = erro;
    const situacao = existente.status === "EM_PROCESSAMENTO" ? "já está sendo analisada" : "já foi analisada e está no Dashboard";
    const cliente = existente.nomeCliente ?? existente.contaNome;
    throw new ErroEntrada(
      "REUNIAO_DUPLICADA",
      409,
      `Esta reunião ${situacao} (${codigoReuniao(existente.numero)}${cliente ? ` · ${cliente}` : ""}). Envie uma reunião diferente.`,
    );
  }
}

/* ---------- Etapas 2 a 4 ---------- */

function marcarEtapa(reuniao: ReuniaoRegistro, nome: NomeEtapa, status: StatusEtapa, detalhe?: string) {
  const etapa = reuniao.etapas.find((e) => e.nome === nome);
  if (!etapa) return;
  etapa.status = status;
  if (status === "EM_ANDAMENTO") etapa.iniciadaEm = agora();
  else {
    etapa.iniciadaEm ??= agora();
    etapa.concluidaEm = agora();
  }
  if (detalhe) etapa.detalhe = detalhe;
}

const iniciar = (id: string, nome: NomeEtapa) => atualizarReuniao(id, (r) => marcarEtapa(r, nome, "EM_ANDAMENTO"));
const concluir = (id: string, nome: NomeEtapa, detalhe: string, status: StatusEtapa = "CONCLUIDA") =>
  atualizarReuniao(id, (r) => marcarEtapa(r, nome, status, detalhe));

/**
 * Executa as etapas 2 a 4 de uma reunião já recebida. Não lança por falha de análise: a falha fica
 * gravada na reunião (status FALHOU) e a reunião é devolvida.
 */
export async function processarReuniao(
  reuniaoId: string,
  entrada: EntradaReuniao,
  deps: DependenciasPipeline = {},
): Promise<ReuniaoRegistro> {
  let etapaAtual: NomeEtapa = "ANALISE_IA";
  execucoes().set(reuniaoId, { agendadaEm: Date.now(), iniciada: true });
  try {
    const recebida = await buscarReuniao(reuniaoId);
    if (!recebida) throw new Error(`Reunião ${reuniaoId} não existe.`);
    // O texto gravado no recebimento (já sanitizado) é o analisado; serve também para retomar.
    const transcricao = recebida.transcricao ?? sanitizar(entrada.conteudo.texto);

    // 2. Análise
    etapaAtual = "ANALISE_IA";
    await iniciar(reuniaoId, "ANALISE_IA");
    const motor = deps.motor ?? escolherMotor({ atrasoDemoMs: deps.atrasoDemoMs ?? ATRASO_DEMO_MS });
    const gerada = await motor.gerar(transcricao, recebida.contexto);
    await concluir(
      reuniaoId,
      "ANALISE_IA",
      `${
        motor.nome === "claude"
          ? `Claude (${gerada.auditoria.modeloResposta})`
          : motor.nome === "nemotron"
            ? `Nemotron (${gerada.auditoria.modeloResposta})`
            : "Análise por regras locais"
      }: ${gerada.analise.sinais.length} sinal(is) proposto(s).`,
    );

    // 3. Validação de evidências
    etapaAtual = "VALIDACAO_EVIDENCIAS";
    await iniciar(reuniaoId, "VALIDACAO_EVIDENCIAS");
    const { sinaisValidos, ...evidencias } = validarEvidencias(transcricao, gerada.analise.sinais);
    const { validos, total, descartados } = evidencias.metricas;
    await concluir(
      reuniaoId,
      "VALIDACAO_EVIDENCIAS",
      `${validos} de ${total} sinal(is) com citação literal confirmada${descartados ? `; ${descartados} descartado(s)` : ""}.`,
    );

    // 4. Persistência
    etapaAtual = "PERSISTENCIA";
    await iniciar(reuniaoId, "PERSISTENCIA");
    const resultado: ResultadoAnalise = {
      analise: { ...gerada.analise, sinais: sinaisValidos },
      evidencias,
      auditoria: gerada.auditoria,
    };
    const { reuniao } = await salvarResultado(reuniaoId, resultado, (r) => {
      marcarEtapa(
        r,
        "PERSISTENCIA",
        "CONCLUIDA",
        `Gravados 1 análise, ${sinaisValidos.length} sinal(is) e ${gerada.analise.mencoesProdutos.length} menção(ões) a produto.`,
      );
      r.status = "CONCLUIDA";
    });
    return reuniao;
  } catch (erro) {
    const falha: FalhaRegistrada =
      etapaAtual === "ANALISE_IA"
        ? traduzirErroAnalise(erro)
        : erro instanceof ErroEntrada
          ? { codigo: erro.codigo, httpStatus: erro.httpStatus, titulo: "Transcrição inválida", detalhe: erro.message }
          : { codigo: "ERRO_INTERNO", httpStatus: 500, titulo: "Erro inesperado", detalhe: "Não foi possível concluir o processamento." };
    if (falha.codigo === "ERRO_INTERNO") {
      console.error(`[dialys/pipeline] reunião ${reuniaoId} falhou na etapa ${etapaAtual}`, erro);
    }
    return atualizarReuniao(reuniaoId, (r) => {
      marcarEtapa(r, etapaAtual, "FALHOU", falha.titulo);
      r.status = "FALHOU";
      r.falha = falha;
    });
  } finally {
    execucoes().delete(reuniaoId);
  }
}

/** Recebimento + processamento na mesma chamada (testes). Sem dono informado, a persona de demonstração. */
export async function receberEProcessar(entrada: EntradaReuniao, deps: DependenciasPipeline = {}, usuarioId = ID_USUARIO_DEMONSTRACAO) {
  const reuniao = await receberReuniao(entrada, usuarioId);
  return processarReuniao(reuniao.id, entrada, deps);
}

/**
 * Reunião como está agora (a tela consulta a cada segundo enquanto processa).
 *  - "Em processamento" sem estar rodando neste processo (servidor reiniciado ou código recarregado no
 *    meio, ou o after() que não rodou): a análise é retomada na hora a partir do texto gravado, em vez
 *    de a tela esperar até o limite. Depois de MAXIMO_RETOMADAS retomadas, falha.
 *  - Rodando, mas parada há mais de 6 minutos: falha, para o cliente não esperar para sempre.
 */
export async function consultarReuniao(id: string, deps: DependenciasPipeline = {}): Promise<ReuniaoRegistro | null> {
  const reuniao = await buscarReuniao(id);
  if (!reuniao || reuniao.status !== "EM_PROCESSAMENTO") return reuniao;
  if (!estaEmExecucao(id)) {
    if (reuniao.transcricao && (reuniao.retomadas ?? 0) < MAXIMO_RETOMADAS) {
      const retomada = await atualizarReuniao(id, (r) => {
        r.retomadas = (r.retomadas ?? 0) + 1;
        for (const etapa of r.etapas) if (etapa.nome !== "RECEBIMENTO" && etapa.status !== "PULADA") etapa.status = "PENDENTE";
      });
      agendarProcessamento(id);
      console.warn(`[dialys/pipeline] reunião ${id} estava parada; retomando a análise (tentativa ${retomada.retomadas}).`);
      void processarReuniao(id, { conteudo: { tipo: "texto", texto: reuniao.transcricao } }, deps);
      return retomada;
    }
    return interromper(id);
  }
  if (Date.now() - Date.parse(reuniao.atualizadaEm) < TEMPO_MAXIMO_PROCESSAMENTO_MS) return reuniao;
  return interromper(id);
}

function interromper(id: string) {
  return atualizarReuniao(id, (r) => {
    const parada = r.etapas.find((e) => e.status === "EM_ANDAMENTO" || e.status === "PENDENTE");
    if (parada) marcarEtapa(r, parada.nome, "FALHOU", "Processamento interrompido.");
    r.status = "FALHOU";
    r.falha = {
      codigo: "PROCESSAMENTO_INTERROMPIDO",
      httpStatus: 500,
      titulo: "Processamento interrompido",
      detalhe: "O servidor parou antes do fim do processamento. Envie a reunião de novo.",
    };
  });
}
