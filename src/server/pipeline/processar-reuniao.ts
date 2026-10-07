// Pipeline de processamento de uma reunião, em 5 etapas:
//   1. RECEBIMENTO          valida e sanitiza a entrada e registra a reunião (status EM_PROCESSAMENTO)
//   2. TRANSCRICAO          áudio → texto via STT; texto pula a etapa
//   3. ANALISE_IA           Claude (ou modo demonstração) gera sinais, produtos e resumo
//   4. VALIDACAO_EVIDENCIAS só ficam sinais cuja citação existe literalmente na transcrição
//   5. PERSISTENCIA         grava analise, sinal e mencao_produto e conclui a reunião
// O estado de cada etapa é gravado ao entrar e ao sair, então a API mostra o progresso e uma falha
// fica registrada na etapa onde ocorreu. No piloto a execução roda no próprio servidor Next (after());
// na produção, cada etapa vira um step de uma fila durável (Inngest), com retentativa por etapa.
import { ContextoReuniaoSchema, normalizarTranscricao, type ContextoReuniao } from "@/lib/transcricao";
import type { ResultadoAnalise } from "../ai/analisar-reuniao";
import { validarEvidencias } from "../ai/validar-evidencia";
import type { Etapa, FalhaRegistrada, NomeEtapa, ReuniaoRegistro, StatusEtapa } from "../db/banco";
import { atualizarReuniao, buscarReuniao, criarReuniao, salvarResultado } from "../db/repositorio";
import { escolherMotor, traduzirErroAnalise, type MotorAnalise } from "./motor-analise";
import { servicoTranscricao, type AudioRecebido, type ServicoTranscricao } from "./transcricao-audio";

/** ~3 horas de reunião. Acima disso, a transcrição deve ser dividida. */
export const LIMITE_CARACTERES = 200_000;
const MIN_CARACTERES = 20;
/** "Em processamento" sem atualização há mais que isso: o servidor parou no meio (ex.: reinício). */
export const TEMPO_MAXIMO_PROCESSAMENTO_MS = 6 * 60_000;

/** Espera do modo demonstração, para a tela mostrar as etapas andando (a análise local leva milissegundos). */
const ATRASO_DEMO_MS = 1500;

export const ETAPAS: NomeEtapa[] = ["RECEBIMENTO", "TRANSCRICAO", "ANALISE_IA", "VALIDACAO_EVIDENCIAS", "PERSISTENCIA"];

export type EntradaReuniao = {
  conteudo: { tipo: "texto"; texto: string; nomeArquivo?: string } | { tipo: "audio"; audio: AudioRecebido };
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
  /** undefined: usa o provedor configurado; null: força "sem STT". */
  stt?: ServicoTranscricao | null;
  /** Espera simulada do modo demonstração (ms). */
  atrasoDemoMs?: number;
};

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

/** Valida, sanitiza e registra a reunião. Lança ErroEntrada sem gravar nada se a entrada for inválida. */
export async function receberReuniao(entrada: EntradaReuniao, deps: DependenciasPipeline = {}): Promise<ReuniaoRegistro> {
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

  let transcricao: string | null = null;
  let detalhe: string;
  if (entrada.conteudo.tipo === "texto") {
    transcricao = sanitizar(entrada.conteudo.texto);
    validarTexto(transcricao);
    detalhe = `Texto recebido (${transcricao.length.toLocaleString("pt-BR")} caracteres)${
      entrada.conteudo.nomeArquivo ? ` do arquivo ${entrada.conteudo.nomeArquivo}` : ""
    }.`;
  } else {
    const stt = deps.stt === undefined ? servicoTranscricao() : deps.stt;
    if (!stt) {
      throw new ErroEntrada(
        "STT_NAO_CONFIGURADO",
        422,
        "Transcrição de áudio não está habilitada no piloto (o serviço de STT é pago). Envie a transcrição em texto.",
      );
    }
    if (entrada.conteudo.audio.bytes.length === 0) throw new ErroEntrada("ARQUIVO_VAZIO", 400, "O arquivo de áudio está vazio.");
    detalhe = `Áudio recebido: ${entrada.conteudo.audio.nomeArquivo}.`;
  }

  const instante = agora();
  return criarReuniao({
    status: "EM_PROCESSAMENTO",
    origem: entrada.conteudo.tipo === "audio" ? "audio" : entrada.conteudo.nomeArquivo ? "arquivo_texto" : "texto",
    nomeArquivo: entrada.conteudo.tipo === "audio" ? entrada.conteudo.audio.nomeArquivo : entrada.conteudo.nomeArquivo,
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
}

/* ---------- Etapas 2 a 5 ---------- */

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
 * Executa as etapas 2 a 5 de uma reunião já recebida. Não lança por falha de transcrição ou de
 * análise: a falha fica gravada na reunião (status FALHOU) e a reunião é devolvida.
 */
export async function processarReuniao(
  reuniaoId: string,
  entrada: EntradaReuniao,
  deps: DependenciasPipeline = {},
): Promise<ReuniaoRegistro> {
  let etapaAtual: NomeEtapa = "TRANSCRICAO";
  try {
    const recebida = await buscarReuniao(reuniaoId);
    if (!recebida) throw new Error(`Reunião ${reuniaoId} não existe.`);

    // 2. Transcrição
    let transcricao: string;
    if (entrada.conteudo.tipo === "texto") {
      transcricao = recebida.transcricao ?? "";
      await concluir(reuniaoId, "TRANSCRICAO", "Entrada já em texto: STT não necessário.", "PULADA");
    } else {
      const stt = deps.stt === undefined ? servicoTranscricao() : deps.stt;
      if (!stt) throw new Error("STT não configurado.");
      await iniciar(reuniaoId, "TRANSCRICAO");
      transcricao = sanitizar(await stt.transcrever(entrada.conteudo.audio));
      validarTexto(transcricao);
      await atualizarReuniao(reuniaoId, (r) => {
        r.transcricao = transcricao;
        marcarEtapa(r, "TRANSCRICAO", "CONCLUIDA", `Transcrito por ${stt.nome} (${transcricao.length.toLocaleString("pt-BR")} caracteres).`);
      });
    }

    // 3. Análise IA
    etapaAtual = "ANALISE_IA";
    await iniciar(reuniaoId, "ANALISE_IA");
    const motor = deps.motor ?? escolherMotor({ atrasoDemoMs: deps.atrasoDemoMs ?? ATRASO_DEMO_MS });
    const gerada = await motor.gerar(transcricao, recebida.contexto);
    await concluir(
      reuniaoId,
      "ANALISE_IA",
      `${
        motor.nome === "claude" ? `Claude (${gerada.auditoria.modeloResposta})` : `Modo demonstração, sem custo (${gerada.auditoria.origem})`
      }: ${gerada.analise.sinais.length} sinal(is) proposto(s).`,
    );

    // 4. Validação de evidências
    etapaAtual = "VALIDACAO_EVIDENCIAS";
    await iniciar(reuniaoId, "VALIDACAO_EVIDENCIAS");
    const { sinaisValidos, ...evidencias } = validarEvidencias(transcricao, gerada.analise.sinais);
    const { validos, total, descartados } = evidencias.metricas;
    await concluir(
      reuniaoId,
      "VALIDACAO_EVIDENCIAS",
      `${validos} de ${total} sinal(is) com citação literal confirmada${descartados ? `; ${descartados} descartado(s)` : ""}.`,
    );

    // 5. Persistência
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
          : etapaAtual === "TRANSCRICAO"
            ? { codigo: "STT_FALHOU", httpStatus: 502, titulo: "Falha na transcrição do áudio", detalhe: "O serviço de STT não respondeu. Tente novamente." }
            : { codigo: "ERRO_INTERNO", httpStatus: 500, titulo: "Erro inesperado", detalhe: "Não foi possível concluir o processamento." };
    if (falha.codigo === "ERRO_INTERNO" || falha.codigo === "STT_FALHOU") {
      console.error(`[dialys/pipeline] reunião ${reuniaoId} falhou na etapa ${etapaAtual}`, erro);
    }
    return atualizarReuniao(reuniaoId, (r) => {
      marcarEtapa(r, etapaAtual, "FALHOU", falha.titulo);
      r.status = "FALHOU";
      r.falha = falha;
    });
  }
}

/** Recebimento + processamento na mesma chamada (modo síncrono da API e testes). */
export async function receberEProcessar(entrada: EntradaReuniao, deps: DependenciasPipeline = {}) {
  const reuniao = await receberReuniao(entrada, deps);
  return processarReuniao(reuniao.id, entrada, deps);
}

/**
 * Reunião como está agora. Uma reunião "em processamento" parada há mais de 6 minutos foi interrompida
 * (servidor reiniciado no meio) e passa a FALHOU, para o cliente não esperar para sempre.
 */
export async function consultarReuniao(id: string): Promise<ReuniaoRegistro | null> {
  const reuniao = await buscarReuniao(id);
  if (!reuniao || reuniao.status !== "EM_PROCESSAMENTO") return reuniao;
  if (Date.now() - Date.parse(reuniao.atualizadaEm) < TEMPO_MAXIMO_PROCESSAMENTO_MS) return reuniao;
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
