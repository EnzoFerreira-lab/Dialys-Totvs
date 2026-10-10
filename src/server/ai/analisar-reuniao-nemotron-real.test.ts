// Validação com a API REAL do Nemotron (gratuito, mas sujeito ao limite diário). Desligada por padrão; para rodar:
//   OPENROUTER_API_KEY=... DIALYS_TESTE_IA_REAL=1 npx vitest run src/server/ai/analisar-reuniao-nemotron-real.test.ts
// Não confere texto exato (a resposta varia): só o formato e que alguma citação sobrevive ao validador.
import { describe, expect, it } from "vitest";
import { gerarAnaliseNemotron, temChaveNemotron } from "./analisar-reuniao-nemotron";
import { validarEvidencias } from "./validar-evidencia";
import { TRANSCRICAO_TESTE } from "./__fixtures__/reuniao-teste";

const ligado = temChaveNemotron() && Boolean(process.env.DIALYS_TESTE_IA_REAL);

describe.skipIf(!ligado)("análise com a API real do Nemotron", () => {
  it("devolve análise no schema com sinais de evidência literal", { timeout: 300_000 }, async () => {
    const { analise, auditoria } = await gerarAnaliseNemotron(TRANSCRICAO_TESTE);
    const { sinaisValidos, metricas } = validarEvidencias(TRANSCRICAO_TESTE, analise.sinais);
    console.info("[nemotron real]", JSON.stringify({ auditoria, metricas, analise }, null, 2));
    console.info("[nemotron real] descartados:", JSON.stringify(analise.sinais.filter((s) => !sinaisValidos.some((v) => v.citacaoExata === s.citacaoExata)).map((s) => s.citacaoExata)));

    expect(auditoria.modo).toBe("nemotron");
    expect(analise.resumoExecutivo.length).toBeGreaterThan(0);
    expect(sinaisValidos.length).toBeGreaterThan(0);
  });
});
