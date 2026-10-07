import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { analisarReuniao, ErroAnalise, MODELO_ANALISE } from "./analisar-reuniao";
import { VERSAO_PROMPT_ANALISE } from "./prompts/analise-v2";
import type { AnaliseReuniao } from "./schemas";
import { FRASE_TESTE, TRANSCRICAO_TESTE } from "./__fixtures__/reuniao-teste";

/** Resposta que o Claude daria para a frase de teste, incluindo um sinal com citação inventada. */
const ANALISE_MODELO: AnaliseReuniao = {
  resumoExecutivo:
    "Cliente satisfeito com o Protheus no backoffice, mas com dor na folha manual do RH e avaliando a Senior. Prefere consolidar na TOTVS se o RM for integrado.",
  mencoesProdutos: [
    { produto: "TOTVS Protheus", status: "EM_USO", contexto: "Atende bem o backoffice." },
    { produto: "TOTVS RM", status: "INTERESSE", contexto: "Consolidaria a folha se o RM for integrado." },
    { produto: "Senior Sistemas", status: "CONCORRENTE", contexto: "Equipe de RH viu uma demo." },
  ],
  sinais: [
    {
      tipo: "CHURN_RISK",
      subtipo: "Avaliação de Concorrente",
      severidade: "ALTA",
      confianca: 0.86,
      citacaoExata: "o RH sofre com a folha manual... O pessoal viu uma demo da Senior e gostou",
      posicaoCaracterStart: 120,
      posicaoCaracterEnd: 190,
      recomendacaoAcao: "Acionar o gestor de Customer Success antes da renovação.",
    },
    {
      tipo: "OPPORTUNITY",
      subtipo: "Interesse Módulo",
      severidade: "ALTA",
      confianca: 0.9,
      citacaoExata: "eu prefiro consolidar tudo na TOTVS se o RM for realmente integrado",
      posicaoCaracterStart: 230,
      posicaoCaracterEnd: 296,
      recomendacaoAcao: "Levar especialista em RM Folha para demonstrar a integração com o Protheus.",
    },
    {
      tipo: "OBJECTION",
      subtipo: "Dúvida ROI/Preço",
      severidade: "MÉDIA",
      confianca: 0.6,
      citacaoExata: "o preço do RM está muito acima do orçamento deste ano",
      posicaoCaracterStart: 400,
      posicaoCaracterEnd: 452,
      recomendacaoAcao: "Apresentar estudo de TCO.",
    },
  ],
  proximosPassosSugeridos: ["Agendar demo de integração RM Folha + Protheus.", "Enviar cronograma de implantação."],
};

type MensagemFalsa = {
  model: string;
  stop_reason: string;
  stop_details?: unknown;
  parsed_output: AnaliseReuniao | null;
  usage: Record<string, unknown>;
};

function clientFalso(mensagem: Partial<MensagemFalsa> = {}) {
  const stream = vi.fn(() => ({
    finalMessage: async (): Promise<MensagemFalsa> => ({
      model: MODELO_ANALISE,
      stop_reason: "end_turn",
      parsed_output: ANALISE_MODELO,
      usage: {
        input_tokens: 420,
        output_tokens: 1800,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 1300,
        iterations: [],
      },
      ...mensagem,
    }),
  }));
  return { client: { beta: { messages: { stream } } } as unknown as Anthropic, stream };
}

describe("analisarReuniao", () => {
  it("extrai a análise da frase de teste e descarta o sinal sem evidência", async () => {
    expect(TRANSCRICAO_TESTE).toContain(FRASE_TESTE);
    const { client } = clientFalso();

    const { analise, evidencias } = await analisarReuniao(TRANSCRICAO_TESTE, { client });

    expect(analise.mencoesProdutos).toContainEqual(expect.objectContaining({ produto: "TOTVS Protheus", status: "EM_USO" }));
    expect(analise.sinais.map((s) => s.tipo)).toEqual(["CHURN_RISK", "OPPORTUNITY"]);
    for (const sinal of analise.sinais) {
      expect(TRANSCRICAO_TESTE.slice(sinal.posicaoCaracterStart, sinal.posicaoCaracterEnd)).toBe(sinal.citacaoExata);
    }
    expect(evidencias.sinaisDescartados).toEqual([
      expect.objectContaining({ motivo: "citacao_nao_encontrada", sinal: expect.objectContaining({ tipo: "OBJECTION" }) }),
    ]);
    expect(evidencias.metricas).toMatchObject({ total: 3, validos: 2, descartados: 1 });
  });

  it("monta a requisição com modelo, fallback, cache do prompt e saída estruturada", async () => {
    const { client, stream } = clientFalso();
    await analisarReuniao(TRANSCRICAO_TESTE, { client });

    type ParamsEnviados = {
      model: string;
      fallbacks: unknown;
      betas: string[];
      system: Array<{ cache_control: unknown }>;
      output_config: { effort: string; format: { type: string; schema: { additionalProperties: boolean } } };
      messages: Array<{ content: string }>;
    };
    const [params] = stream.mock.calls[0] as unknown as [ParamsEnviados];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.output_config.effort).toBe("medium");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.output_config.format.schema.additionalProperties).toBe(false);
    expect(params.messages[0].content).toContain(`<transcricao>\n${TRANSCRICAO_TESTE}\n</transcricao>`);
    expect(params).not.toHaveProperty("thinking"); // Opus 5.5: thinking adaptativo é o padrão
  });

  it("registra tokens, custo, tempo e versão do prompt para auditoria", async () => {
    const { client } = clientFalso();
    const { auditoria } = await analisarReuniao(TRANSCRICAO_TESTE, { client });

    expect(auditoria).toMatchObject({
      modeloSolicitado: MODELO_ANALISE,
      modeloResposta: MODELO_ANALISE,
      fallbackUsado: false,
      versaoPrompt: VERSAO_PROMPT_ANALISE,
      tokens: { entrada: 420, saida: 1800, escritaCache: 0, leituraCache: 1300 },
    });
    // 420 × $4 + 1800 × $20 + 1300 × $0,20, por milhão de tokens
    expect(auditoria.custoEstimadoUsd).toBeCloseTo(0.0379, 4);
    expect(auditoria.duracaoMs).toBeGreaterThanOrEqual(0);
  });

  it("sinaliza quando o fallback do servidor respondeu", async () => {
    const { client } = clientFalso({
      model: "claude-opus-4-8",
      usage: { input_tokens: 1, output_tokens: 1, iterations: [{ type: "fallback_message" }] },
    });
    const { auditoria } = await analisarReuniao(TRANSCRICAO_TESTE, { client });
    expect(auditoria).toMatchObject({ fallbackUsado: true, modeloResposta: "claude-opus-4-8" });
  });

  it("falha com motivo explícito em recusa, truncamento e transcrição vazia", async () => {
    await expect(
      analisarReuniao(TRANSCRICAO_TESTE, { client: clientFalso({ stop_reason: "refusal", parsed_output: null }).client }),
    ).rejects.toMatchObject({ name: "ErroAnalise", motivo: "recusa" });

    await expect(
      analisarReuniao(TRANSCRICAO_TESTE, { client: clientFalso({ stop_reason: "max_tokens" }).client }),
    ).rejects.toMatchObject({ motivo: "resposta_truncada" });

    const { client, stream } = clientFalso();
    await expect(analisarReuniao("   ", { client })).rejects.toBeInstanceOf(ErroAnalise);
    expect(stream).not.toHaveBeenCalled();
  });
});

// Teste com a API real: roda só com ANTHROPIC_API_KEY definida (custa alguns centavos por execução).
describe.skipIf(!process.env.ANTHROPIC_API_KEY)("analisarReuniao (Claude real)", () => {
  it("identifica Protheus em uso e sinais com evidência literal na frase de teste", { timeout: 180_000 }, async () => {
    const { analise, evidencias, auditoria } = await analisarReuniao(TRANSCRICAO_TESTE);

    expect(analise.mencoesProdutos).toContainEqual(expect.objectContaining({ produto: "TOTVS Protheus", status: "EM_USO" }));
    expect(analise.sinais.length).toBeGreaterThan(0);
    for (const sinal of analise.sinais) {
      expect(TRANSCRICAO_TESTE).toContain(sinal.citacaoExata);
    }
    console.info("Evidências:", evidencias.metricas, "Auditoria:", auditoria);
  });
});
