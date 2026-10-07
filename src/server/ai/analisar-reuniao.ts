// Motor de análise: uma chamada estruturada ao Claude por reunião, seguida da validação determinística
// das evidências. Ver docs/ARQUITETURA.md §3.4.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PROMPT_ANALISE, VERSAO_PROMPT_ANALISE } from "./prompts/analise-v2";
import { AnaliseReuniaoSchema, type AnaliseReuniao } from "./schemas";
import { validarEvidencias, type ResultadoValidacao, type SinalValidado } from "./validar-evidencia";

export const MODELO_ANALISE = "claude-opus-5-5";

/** Tarifas da Claude API para o Claude Opus 5.5 (US$ por milhão de tokens). Revisar ao trocar de modelo. */
const TARIFAS_USD_POR_MTOK = { entrada: 4, saida: 20, escritaCache: 5, leituraCache: 0.2 };

export type ResultadoAnalise = {
  /** Análise já filtrada: só sinais com evidência literal comprovada. */
  analise: Omit<AnaliseReuniao, "sinais"> & { sinais: SinalValidado[] };
  evidencias: Omit<ResultadoValidacao, "sinaisValidos">;
  auditoria: {
    /** "demonstracao": nenhuma IA foi chamada (ver src/server/ai/demo). */
    modo: "claude" | "demonstracao";
    /** De onde veio a análise no modo demonstração: id do cenário JSON ou "regras locais". */
    origem?: string;
    modeloSolicitado: string;
    /** Modelo que efetivamente respondeu (difere do solicitado se o fallback do servidor atuou). */
    modeloResposta: string;
    fallbackUsado: boolean;
    versaoPrompt: string;
    duracaoMs: number;
    tokens: {
      entrada: number;
      saida: number;
      escritaCache: number;
      leituraCache: number;
    };
    /** Estimativa pelas tarifas do Opus 5.5; não vale como cobrança se outro modelo respondeu. */
    custoEstimadoUsd: number;
  };
};

/** Saída do modelo antes da validação de evidências (etapa 3 do pipeline). */
export type AnaliseGerada = { analise: AnaliseReuniao; auditoria: ResultadoAnalise["auditoria"] };

export type MotivoErroAnalise = "transcricao_vazia" | "recusa" | "resposta_truncada" | "saida_invalida";

export class ErroAnalise extends Error {
  constructor(
    readonly motivo: MotivoErroAnalise,
    mensagem: string,
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = "ErroAnalise";
  }
}

export type OpcoesAnalise = {
  /** Injetável para testes; por padrão lê credenciais do ambiente (ANTHROPIC_API_KEY). */
  client?: Anthropic;
  esforco?: "low" | "medium" | "high" | "xhigh" | "max";
};

let clientPadrao: Anthropic | undefined;

function obterClient() {
  clientPadrao ??= new Anthropic();
  return clientPadrao;
}

function custoUsd(tokens: ResultadoAnalise["auditoria"]["tokens"]) {
  const t = TARIFAS_USD_POR_MTOK;
  const total =
    tokens.entrada * t.entrada +
    tokens.saida * t.saida +
    tokens.escritaCache * t.escritaCache +
    tokens.leituraCache * t.leituraCache;
  return Math.round((total / 1_000_000) * 10_000) / 10_000;
}

/** Análise completa: gera com o Claude e mantém só os sinais com evidência literal. */
export async function analisarReuniao(
  transcricaoTexto: string,
  opcoes: OpcoesAnalise = {},
): Promise<ResultadoAnalise> {
  const { analise, auditoria } = await gerarAnalise(transcricaoTexto, opcoes);
  const { sinaisValidos, ...evidencias } = validarEvidencias(transcricaoTexto, analise.sinais);
  return { analise: { ...analise, sinais: sinaisValidos }, evidencias, auditoria };
}

/** Só a chamada ao Claude, sem validar as citações (o pipeline valida em etapa própria). */
export async function gerarAnalise(transcricaoTexto: string, opcoes: OpcoesAnalise = {}): Promise<AnaliseGerada> {
  if (!transcricaoTexto.trim()) {
    throw new ErroAnalise("transcricao_vazia", "A transcrição está vazia.");
  }

  const client = opcoes.client ?? obterClient();
  const inicio = performance.now();

  // Streaming: transcrições longas + raciocínio adaptativo podem passar do tempo limite de uma
  // requisição comum. finalMessage() devolve a mensagem completa já com parsed_output.
  const stream = client.beta.messages.stream({
    model: MODELO_ANALISE,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: PROMPT_ANALISE, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Analise a transcrição abaixo.\n\n<transcricao>\n${transcricaoTexto}\n</transcricao>`,
      },
    ],
    output_config: {
      effort: opcoes.esforco ?? "medium",
      format: betaZodOutputFormat(AnaliseReuniaoSchema),
    },
  });

  let mensagem;
  try {
    mensagem = await stream.finalMessage();
  } catch (erro) {
    // Saída fora do schema (ex.: confiança 1.2) chega como AnthropicError do parser do SDK.
    // Erros de API (rede, 429, 5xx) já são subclasses de APIError e seguem adiante.
    if (erro instanceof Anthropic.AnthropicError && !(erro instanceof Anthropic.APIError)) {
      throw new ErroAnalise("saida_invalida", "A resposta do modelo não respeitou o schema.", erro.message);
    }
    throw erro;
  }
  const duracaoMs = Math.round(performance.now() - inicio);

  if (mensagem.stop_reason === "refusal") {
    throw new ErroAnalise("recusa", "O modelo recusou a análise desta transcrição.", mensagem.stop_details);
  }
  if (mensagem.stop_reason === "max_tokens") {
    throw new ErroAnalise("resposta_truncada", "A análise excedeu o limite de tokens de saída.");
  }
  const analise = mensagem.parsed_output;
  if (!analise) {
    throw new ErroAnalise("saida_invalida", "O modelo não retornou a análise estruturada.");
  }

  const tokens = {
    entrada: mensagem.usage.input_tokens,
    saida: mensagem.usage.output_tokens,
    escritaCache: mensagem.usage.cache_creation_input_tokens ?? 0,
    leituraCache: mensagem.usage.cache_read_input_tokens ?? 0,
  };

  return {
    analise,
    auditoria: {
      modo: "claude",
      modeloSolicitado: MODELO_ANALISE,
      modeloResposta: mensagem.model,
      fallbackUsado: (mensagem.usage.iterations ?? []).some((item) => item.type === "fallback_message"),
      versaoPrompt: VERSAO_PROMPT_ANALISE,
      duracaoMs,
      tokens,
      custoEstimadoUsd: custoUsd(tokens),
    },
  };
}
