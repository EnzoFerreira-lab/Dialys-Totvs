import { describe, expect, it, vi } from "vitest";
import { ErroAnalise } from "./analisar-reuniao";
import { ErroApiNemotron, gerarAnaliseNemotron, MODELO_NEMOTRON_PADRAO } from "./analisar-reuniao-nemotron";
import type { AnaliseReuniao } from "./schemas";
import { TRANSCRICAO_TESTE } from "./__fixtures__/reuniao-teste";

const ANALISE: AnaliseReuniao = {
  resumoExecutivo: "Cliente usa o Protheus e tem interesse no RM.",
  mencoesProdutos: [{ produto: "TOTVS RM", status: "INTERESSE", contexto: "Quer consolidar a folha." }],
  sinais: [],
  proximosPassosSugeridos: ["Agendar demo do RM Folha."],
};

const responder = (corpo: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(corpo), { status }));

const respostaChat = (content: string, finish_reason = "stop") => ({
  model: MODELO_NEMOTRON_PADRAO,
  choices: [{ finish_reason, message: { content } }],
  usage: { prompt_tokens: 1200, completion_tokens: 300 },
});

describe("gerarAnaliseNemotron", () => {
  it("envia o schema e devolve a análise validada, sem custo", async () => {
    const fetchFalso = responder(respostaChat(JSON.stringify(ANALISE)));
    const { analise, auditoria } = await gerarAnaliseNemotron(TRANSCRICAO_TESTE, { fetch: fetchFalso, chave: "k" });

    expect(analise).toEqual(ANALISE);
    expect(auditoria).toMatchObject({ modo: "nemotron", modeloResposta: MODELO_NEMOTRON_PADRAO, custoEstimadoUsd: 0 });
    expect(auditoria.tokens).toMatchObject({ entrada: 1200, saida: 300 });

    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const corpo = JSON.parse(String(init?.body));
    expect(corpo.model).toBe(MODELO_NEMOTRON_PADRAO);
    expect(corpo.response_format.json_schema.schema.required).toContain("sinais");
    expect(corpo.messages[1].content).toContain(TRANSCRICAO_TESTE);
  });

  it("aceita JSON cercado por raciocínio ou bloco de código", async () => {
    const conteudo = `<think>pensando...</think>\n\`\`\`json\n${JSON.stringify(ANALISE)}\n\`\`\``;
    const { analise } = await gerarAnaliseNemotron(TRANSCRICAO_TESTE, { fetch: responder(respostaChat(conteudo)), chave: "k" });
    expect(analise).toEqual(ANALISE);
  });

  it("rejeita saída fora do schema e resposta truncada", async () => {
    const invalida = { ...ANALISE, sinais: [{ tipo: "CHURN_RISK", confianca: 1.2 }] };
    await expect(
      gerarAnaliseNemotron(TRANSCRICAO_TESTE, { fetch: responder(respostaChat(JSON.stringify(invalida))), chave: "k" }),
    ).rejects.toMatchObject({ motivo: "saida_invalida" });
    await expect(
      gerarAnaliseNemotron(TRANSCRICAO_TESTE, { fetch: responder(respostaChat("{", "length")), chave: "k" }),
    ).rejects.toMatchObject({ motivo: "resposta_truncada" });
  });

  it("converte erros HTTP e erros no corpo em ErroApiNemotron", async () => {
    const limite = gerarAnaliseNemotron(TRANSCRICAO_TESTE, { fetch: responder({ error: { message: "rate" } }, 429), chave: "k" });
    await expect(limite).rejects.toBeInstanceOf(ErroApiNemotron);
    await expect(limite).rejects.toMatchObject({ status: 429 });

    const noCorpo = gerarAnaliseNemotron(TRANSCRICAO_TESTE, { fetch: responder({ error: { code: 502, message: "provider" } }), chave: "k" });
    await expect(noCorpo).rejects.toMatchObject({ status: 502 });
  });

  it("não chama a API com transcrição vazia", async () => {
    const fetchFalso = responder({});
    await expect(gerarAnaliseNemotron("   ", { fetch: fetchFalso })).rejects.toBeInstanceOf(ErroAnalise);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
