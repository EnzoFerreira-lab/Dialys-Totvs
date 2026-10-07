import { describe, expect, it } from "vitest";
import type { SinalNegocio } from "./schemas";
import { validarEvidencias } from "./validar-evidencia";
import { TRANSCRICAO_TESTE } from "./__fixtures__/reuniao-teste";

function sinal(citacaoExata: string, extra: Partial<SinalNegocio> = {}): SinalNegocio {
  return {
    tipo: "CHURN_RISK",
    subtipo: "Insatisfação Operacional",
    severidade: "ALTA",
    confianca: 0.9,
    citacaoExata,
    posicaoCaracterStart: 0,
    posicaoCaracterEnd: 0,
    recomendacaoAcao: "Acionar Customer Success.",
    ...extra,
  };
}

describe("validarEvidencias", () => {
  it("aceita citação literal e recalcula a posição real", () => {
    const citacao = "o RH sofre com a folha manual";
    const { sinaisValidos, metricas } = validarEvidencias(TRANSCRICAO_TESTE, [sinal(citacao)]);

    expect(sinaisValidos).toHaveLength(1);
    const [valido] = sinaisValidos;
    expect(TRANSCRICAO_TESTE.slice(valido.posicaoCaracterStart, valido.posicaoCaracterEnd)).toBe(citacao);
    expect(valido.evidencia).toEqual({ correspondencia: "exata", posicaoCorrigida: true });
    expect(metricas).toMatchObject({ total: 1, validos: 1, descartados: 0, taxaValidacao: 1, posicoesCorrigidas: 1 });
  });

  it("descarta citação alucinada e registra a métrica", () => {
    const { sinaisValidos, sinaisDescartados, metricas } = validarEvidencias(TRANSCRICAO_TESTE, [
      sinal("o RH sofre com a folha manual"),
      sinal("vamos cancelar o contrato com a TOTVS no fim do mês"),
    ]);

    expect(sinaisValidos).toHaveLength(1);
    expect(sinaisDescartados).toEqual([
      expect.objectContaining({ motivo: "citacao_nao_encontrada" }),
    ]);
    expect(metricas.taxaValidacao).toBe(0.5);
  });

  it("tolera só diferenças tipográficas e guarda o trecho original", () => {
    const transcricao = "Cliente: o go-live   atrasou\ndois meses — e o CFO “não aprovou”.";
    const { sinaisValidos } = validarEvidencias(transcricao, [
      sinal('...o go-live atrasou dois meses - e o CFO "não aprovou"...'),
    ]);

    expect(sinaisValidos).toHaveLength(1);
    expect(sinaisValidos[0].evidencia.correspondencia).toBe("normalizada");
    expect(sinaisValidos[0].citacaoExata).toBe("o go-live   atrasou\ndois meses — e o CFO “não aprovou”");
  });

  it("não aceita paráfrase nem mudança de palavras", () => {
    const { sinaisValidos } = validarEvidencias(TRANSCRICAO_TESTE, [sinal("o RH sofre muito com a folha manual")]);
    expect(sinaisValidos).toHaveLength(0);
  });

  it("descarta citação curta demais para servir de evidência", () => {
    const { sinaisDescartados } = validarEvidencias(TRANSCRICAO_TESTE, [sinal("Faz.")]);
    expect(sinaisDescartados[0].motivo).toBe("citacao_curta");
  });

  it("com várias ocorrências, usa a mais próxima da posição sugerida", () => {
    const transcricao = "prazo de implantação curto. ... prazo de implantação curto.";
    const segunda = transcricao.lastIndexOf("prazo");
    const { sinaisValidos } = validarEvidencias(transcricao, [
      sinal("prazo de implantação curto", { posicaoCaracterStart: segunda - 2 }),
    ]);
    expect(sinaisValidos[0].posicaoCaracterStart).toBe(segunda);
  });

  it("sem sinais, a taxa de validação é 1", () => {
    expect(validarEvidencias(TRANSCRICAO_TESTE, []).metricas.taxaValidacao).toBe(1);
  });
});
