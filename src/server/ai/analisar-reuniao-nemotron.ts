// Motor de análise com o NVIDIA Nemotron (gratuito) via OpenRouter, que expõe uma API compatível com a da
// OpenAI. Mesmo prompt e mesmo schema do motor do Claude; as citações passam depois pelo mesmo validador.
// Para usar a API da própria NVIDIA (build.nvidia.com), troque DIALYS_NEMOTRON_URL e DIALYS_NEMOTRON_MODELO.
import { z } from "zod";
import { ErroAnalise, type AnaliseGerada } from "./analisar-reuniao";
import { PROMPT_ANALISE, VERSAO_PROMPT_ANALISE } from "./prompts/analise-v2";
import { AnaliseReuniaoSchema } from "./schemas";

/** Versão gratuita (sufixo ":free") e com suporte a saída estruturada no OpenRouter. */
export const MODELO_NEMOTRON_PADRAO = "nvidia/nemotron-3-super-120b-a12b:free";
const URL_PADRAO = "https://openrouter.ai/api/v1";
/** Modelos gratuitos são mais lentos e o pipeline desiste aos 6 min; aqui paramos antes. */
const TEMPO_LIMITE_MS = 5 * 60_000;

export const chaveNemotron = () => process.env.OPENROUTER_API_KEY || process.env.NVIDIA_API_KEY || "";
export const temChaveNemotron = () => Boolean(chaveNemotron());
export const modeloNemotron = () => process.env.DIALYS_NEMOTRON_MODELO || MODELO_NEMOTRON_PADRAO;

/** Erro HTTP (ou de rede, com status 0) da API do Nemotron. */
export class ErroApiNemotron extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroApiNemotron";
  }
}

export type OpcoesNemotron = {
  /** Injetável para testes. */
  fetch?: typeof fetch;
  chave?: string;
  modelo?: string;
  /** Raciocínio antes de responder (DIALYS_NEMOTRON_RACIOCINIO). Padrão "off": ligado, mesmo em "low", o modelo
   * gratuito chegou a pensar ~28 mil tokens (mais de 2 min) e às vezes estourou o limite; desligado leva ~3 s. */
  raciocinio?: "off" | "low" | "medium" | "high";
  url?: string;
};

// Gerado uma vez: o schema não muda em tempo de execução.
const SCHEMA_JSON: Record<string, unknown> = { ...z.toJSONSchema(AnaliseReuniaoSchema) };
delete SCHEMA_JSON.$schema;

export type ChamadaFerramentaChat = { id: string; type: "function"; function: { name: string; arguments: string } };

export type MensagemChat =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChamadaFerramentaChat[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type RespostaChat = {
  model?: string;
  error?: { code?: number; message?: string };
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null; tool_calls?: ChamadaFerramentaChat[] };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
};

/** Tira o raciocínio (<think>…</think>) que alguns modelos deixam no texto da resposta. */
export const semRaciocinio = (conteudo: string) => conteudo.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

/**
 * Uma chamada a /chat/completions (API compatível com a da OpenAI), usada pela análise e pelo assistente.
 * Modelo, raciocínio e credenciais vêm de `opcoes` ou do ambiente; erros de rede e HTTP viram ErroApiNemotron.
 */
export async function chamarChatNemotron(
  corpo: { messages: MensagemChat[] } & Record<string, unknown>,
  opcoes: OpcoesNemotron = {},
): Promise<RespostaChat> {
  const modelo = opcoes.modelo ?? modeloNemotron();
  const raciocinio = opcoes.raciocinio ?? (process.env.DIALYS_NEMOTRON_RACIOCINIO as OpcoesNemotron["raciocinio"]) ?? "off";
  const url = (opcoes.url ?? process.env.DIALYS_NEMOTRON_URL ?? URL_PADRAO).replace(/\/+$/, "");

  let resposta: Response;
  try {
    resposta = await (opcoes.fetch ?? fetch)(`${url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opcoes.chave ?? chaveNemotron()}`,
        // Identificação opcional do app no OpenRouter.
        "X-Title": "Dialys",
      },
      body: JSON.stringify({
        model: modelo,
        // O raciocínio conta no limite de saída.
        max_tokens: 32000,
        temperature: 0.2,
        ...(raciocinio === "off" ? { reasoning: { enabled: false } } : { reasoning: { effort: raciocinio } }),
        ...corpo,
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (erro) {
    throw new ErroApiNemotron(0, erro instanceof Error ? erro.message : String(erro));
  }

  const lido = (await resposta.json().catch(() => ({}))) as RespostaChat;
  // O OpenRouter às vezes responde 200 com o erro no corpo (ex.: falha no provedor do modelo).
  if (!resposta.ok || lido.error) {
    throw new ErroApiNemotron(lido.error?.code ?? resposta.status, lido.error?.message ?? `HTTP ${resposta.status}`);
  }
  return lido;
}

/** Tira raciocínio (<think>) e cercas de código que alguns modelos devolvem em volta do JSON. */
function extrairJson(conteudo: string) {
  const limpo = semRaciocinio(conteudo);
  const cercado = limpo.match(/```(?:json)?\s*([\s\S]*?)```/);
  const texto = cercado ? cercado[1] : limpo;
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  return inicio >= 0 && fim > inicio ? texto.slice(inicio, fim + 1) : texto;
}

/** Só a chamada ao Nemotron, sem validar as citações (o pipeline valida em etapa própria). */
export async function gerarAnaliseNemotron(transcricaoTexto: string, opcoes: OpcoesNemotron = {}): Promise<AnaliseGerada> {
  if (!transcricaoTexto.trim()) {
    throw new ErroAnalise("transcricao_vazia", "A transcrição está vazia.");
  }

  const modelo = opcoes.modelo ?? modeloNemotron();
  const inicio = performance.now();
  const corpo = await chamarChatNemotron(
    {
      messages: [
        {
          role: "system",
          content: `${PROMPT_ANALISE}\n\nResponda somente com um objeto JSON válido que siga este JSON Schema, sem texto antes ou depois:\n${JSON.stringify(SCHEMA_JSON)}`,
        },
        { role: "user", content: `Analise a transcrição abaixo.\n\n<transcricao>\n${transcricaoTexto}\n</transcricao>` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "analise_reuniao", strict: true, schema: SCHEMA_JSON } },
    },
    { ...opcoes, modelo },
  );
  const duracaoMs = Math.round(performance.now() - inicio);

  const escolha = corpo.choices?.[0];
  if (escolha?.message?.refusal || escolha?.finish_reason === "content_filter") {
    throw new ErroAnalise("recusa", "O modelo recusou a análise desta transcrição.", escolha?.message?.refusal);
  }
  if (escolha?.finish_reason === "length") {
    throw new ErroAnalise("resposta_truncada", "A análise excedeu o limite de tokens de saída.");
  }
  const conteudo = escolha?.message?.content;
  if (!conteudo) {
    throw new ErroAnalise("saida_invalida", "O modelo não retornou a análise estruturada.");
  }

  let json: unknown;
  try {
    json = JSON.parse(extrairJson(conteudo));
  } catch {
    throw new ErroAnalise("saida_invalida", "A resposta do modelo não é um JSON válido.", conteudo.slice(0, 500));
  }
  const lido = AnaliseReuniaoSchema.safeParse(json);
  if (!lido.success) {
    throw new ErroAnalise("saida_invalida", "A resposta do modelo não respeitou o schema.", lido.error.issues);
  }

  return {
    analise: lido.data,
    auditoria: {
      modo: "nemotron",
      modeloSolicitado: modelo,
      modeloResposta: corpo.model ?? modelo,
      fallbackUsado: false,
      versaoPrompt: VERSAO_PROMPT_ANALISE,
      duracaoMs,
      tokens: {
        entrada: corpo.usage?.prompt_tokens ?? 0,
        saida: corpo.usage?.completion_tokens ?? 0,
        escritaCache: 0,
        leituraCache: corpo.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      },
      // Modelo gratuito: sem custo.
      custoEstimadoUsd: 0,
    },
  };
}
