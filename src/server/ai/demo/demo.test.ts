import { describe, expect, it } from "vitest";
import { TRANSCRICAO_TESTE } from "../__fixtures__/reuniao-teste";
import { validarEvidencias } from "../validar-evidencia";
import { analisarReuniaoDemo } from "./analisar-reuniao-demo";
import { lerAmostraTotvs } from "./amostra-totvs";
import { escolherCenario, lerCenarios } from "./cenarios";
import { analisarPorRegras, papeisDosLocutores } from "./heuristica";

const { cenarios, erros } = lerCenarios();

// Protege a apresentação: um JSON quebrado ou com citação inexistente falha aqui, não na frente da TOTVS.
describe("cenários de data/demo/cenarios", () => {
  it("todos os arquivos são válidos", () => {
    expect(erros).toEqual([]);
    expect(cenarios.length).toBeGreaterThan(0);
  });

  it.each(cenarios.map((cenario) => [cenario.id, cenario] as const))(
    "%s: toda citação existe literalmente na transcrição",
    (_id, cenario) => {
      const { sinaisDescartados } = validarEvidencias(cenario.transcricao, cenario.analise.sinais);
      expect(sinaisDescartados.map((d) => d.sinal.citacaoExata)).toEqual([]);
    },
  );

  it("ids são únicos", () => {
    const ids = cenarios.map((cenario) => cenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("escolherCenario", () => {
  it("reconhece a transcrição de um cenário mesmo com espaços extras", () => {
    const [primeiro] = cenarios;
    expect(escolherCenario(`  ${primeiro.transcricao.replace(/\n/g, "\n\n")}  `, cenarios)?.id).toBe(primeiro.id);
  });

  it("reconhece um cenário por citações presentes no texto", () => {
    const texto = "Cliente: Se o suporte continuar demorando assim, a diretoria vai rever o contrato na renovação de dezembro.";
    expect(escolherCenario(texto, cenarios)?.id).toBe("metalurgica-vale-forte");
  });

  it("devolve null para texto sem relação com os cenários", () => {
    expect(escolherCenario("Cliente: Tudo certo por aqui, obrigado.", cenarios)).toBeNull();
  });
});

describe("analisarPorRegras", () => {
  it("extrai da frase de teste churn, oportunidade e produtos, só com falas do cliente", () => {
    const analise = analisarPorRegras(TRANSCRICAO_TESTE);
    const tipos = new Set(analise.sinais.map((s) => s.tipo));

    expect(tipos).toContain("CHURN_RISK");
    expect(tipos).toContain("OPPORTUNITY");
    expect(analise.mencoesProdutos).toContainEqual(expect.objectContaining({ produto: "Senior Sistemas", status: "CONCORRENTE" }));
    expect(analise.mencoesProdutos.map((m) => m.produto)).toContain("TOTVS Protheus");
    for (const sinal of analise.sinais) expect(TRANSCRICAO_TESTE).toContain(sinal.citacaoExata);
    // A fala do vendedor ("Faz sentido mostrarmos a integração...") não vira sinal.
    expect(analise.sinais.some((s) => s.citacaoExata.includes("mostrarmos"))).toBe(false);
  });

  it("não inventa sinais em conversa neutra", () => {
    const analise = analisarPorRegras("Cliente (Gerente): Tudo certo por aqui, obrigado pela visita.");
    expect(analise.sinais).toEqual([]);
    expect(analise.resumoExecutivo).toMatch(/sem sinais/);
  });
});

describe("analisarReuniaoDemo", () => {
  it("usa o cenário quando a transcrição corresponde, sem custo e marcado como demonstração", async () => {
    const cenario = cenarios.find((c) => c.id === "grupo-horizonte")!;
    const { analise, evidencias, auditoria } = await analisarReuniaoDemo(cenario.transcricao, { atrasoMs: 0 });

    expect(auditoria).toMatchObject({ modo: "demonstracao", custoEstimadoUsd: 0, origem: 'cenário "grupo-horizonte"' });
    expect(analise.resumoExecutivo).toBe(cenario.analise.resumoExecutivo);
    expect(evidencias.metricas.descartados).toBe(0);
    for (const sinal of analise.sinais) {
      expect(cenario.transcricao.slice(sinal.posicaoCaracterStart, sinal.posicaoCaracterEnd)).toBe(sinal.citacaoExata);
    }
  });

  it("cai nas regras locais para texto desconhecido", async () => {
    const { auditoria, analise } = await analisarReuniaoDemo(
      "Cliente (CFO): O preço ficou muito caro e não temos orçamento este ano.",
      { atrasoMs: 0, cenarios },
    );
    expect(auditoria.origem).toBe("regras locais");
    expect(analise.sinais[0]).toMatchObject({ tipo: "OBJECTION", subtipo: "Orçamento" });
  });

  it("usa os metadados da reunião no resumo e nos próximos passos", async () => {
    const { analise } = await analisarReuniaoDemo("Cliente (CFO): Tudo certo por aqui, obrigado pela visita.", {
      atrasoMs: 0,
      cenarios,
      contexto: { segmento: "Serviços", uf: "SP", nps: 5 },
    });
    expect(analise.resumoExecutivo).toMatch(/^Reunião com cliente de Serviços \(SP\), NPS 5 \(detrator\)/);
    expect(analise.proximosPassosSugeridos[0]).toMatch(/Cliente detrator \(NPS 5\)/);
  });
});

// Amostra real enviada pela TOTVS (reuniões anonimizadas, locutores sem papel, erros de transcrição).
describe("amostra TOTVS (data/demo/totvs)", () => {
  const reunioes = lerAmostraTotvs();
  const porId = (id: string) => {
    const reuniao = reunioes.find((r) => r.id === id);
    if (!reuniao) throw new Error(`reunião ${id} não está na amostra`);
    return { ...reuniao, analise: analisarPorRegras(reuniao.transcricao, reuniao.contexto) };
  };

  it("carrega as reuniões sem duplicatas e com metadados", () => {
    expect(reunioes.length).toBe(16);
    expect(new Set(reunioes.map((r) => r.transcricao)).size).toBe(reunioes.length);
    expect(reunioes.find((r) => r.id === "920847")?.contexto).toMatchObject({ segmento: "Saúde", uf: "RS", nps: 7 });
  });

  it.each(reunioes.map((r) => [r.id, r] as const))("%s: no máximo 6 sinais, todos com citação literal", (_id, reuniao) => {
    const analise = analisarPorRegras(reuniao.transcricao, reuniao.contexto);
    expect(analise.sinais.length).toBeLessThanOrEqual(6);
    const { sinaisDescartados, sinaisValidos } = validarEvidencias(reuniao.transcricao, analise.sinais);
    expect(sinaisDescartados).toEqual([]);
    for (const sinal of sinaisValidos) expect(sinal.evidencia.posicaoCorrigida).toBe(false);
  });

  it("deduz quem fala pela TOTVS a partir do conteúdo", () => {
    expect(papeisDosLocutores(porId("959985").transcricao)).toMatchObject({
      "LOCUTOR 13": { papel: "cliente" },
      "LOCUTOR 15": { papel: "totvs" },
    });
    expect(papeisDosLocutores(porId("1227164").transcricao)).toMatchObject({
      "LOCUTOR 22": { papel: "cliente" },
      "LOCUTOR 29": { papel: "totvs" },
    });
  });

  it("920847 (Saúde): objeção de preço e parcelamento; RM, Fluig e TAI em uso", () => {
    const { analise } = porId("920847");
    expect(analise.sinais).toContainEqual(expect.objectContaining({ tipo: "OBJECTION", subtipo: "Condição de Pagamento" }));
    expect(analise.sinais.some((s) => s.citacaoExata.includes("40 mil reais"))).toBe(true);
    expect(analise.mencoesProdutos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ produto: "TOTVS RM", status: "EM_USO" }),
        expect.objectContaining({ produto: "TOTVS Assinatura Eletrônica" }),
      ]),
    );
  });

  it("959985 (Manufatura): conta sem uso da TOTVS, com Sankhya e Ploomes", () => {
    const { analise } = porId("959985");
    expect(analise.sinais[0]).toMatchObject({ tipo: "CHURN_RISK", subtipo: "Baixo Uso / Descontinuação" });
    expect(analise.mencoesProdutos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ produto: "Sankhya", status: "CONCORRENTE" }),
        expect.objectContaining({ produto: "Ploomes", status: "CONCORRENTE" }),
      ]),
    );
  });

  it("1069924 (Supermercados): insatisfação com o Analytics e interesse em cloud", () => {
    const { analise } = porId("1069924");
    expect(analise.sinais).toContainEqual(expect.objectContaining({ tipo: "CHURN_RISK", subtipo: "Insatisfação com Produto" }));
    expect(analise.sinais.some((s) => s.tipo === "OPPORTUNITY")).toBe(true);
    expect(analise.mencoesProdutos).toContainEqual(expect.objectContaining({ produto: "TOTVS Analytics", status: "INSATISFAÇÃO" }));
  });

  it("747580 e 1144435: projeto aprovado vira oportunidade de severidade alta", () => {
    for (const id of ["747580", "1144435"]) {
      expect(porId(id).analise.sinais).toContainEqual(
        expect.objectContaining({ tipo: "OPPORTUNITY", subtipo: "Projeto Aprovado", severidade: "ALTA" }),
      );
    }
  });

  it("1144435: teto de orçamento não é confundido com aprovação e fala do vendedor não vira objeção", () => {
    const { analise } = porId("1144435");
    const citacoes = analise.sinais.map((s) => s.citacaoExata);
    expect(analise.sinais.find((s) => s.citacaoExata.startsWith("Porque o que eu tenho aprovado"))).toBeUndefined();
    expect(citacoes.some((c) => c.includes("super viável a gente fazer"))).toBe(false);
    expect(analise.sinais).toContainEqual(expect.objectContaining({ tipo: "OBJECTION", subtipo: "Cobrança antes do Uso" }));
  });

  it("1282016 (clínica com sistema próprio): sem necessidade percebida", () => {
    expect(porId("1282016").analise.sinais[0]).toMatchObject({ tipo: "OBJECTION", subtipo: "Sem Necessidade Percebida" });
  });

  it("1332586 (NPS 5): resumo marca detrator e próximo passo de CS", () => {
    const { analise } = porId("1332586");
    expect(analise.resumoExecutivo).toMatch(/NPS 5 \(detrator\)/);
    expect(analise.proximosPassosSugeridos[0]).toMatch(/Cliente detrator/);
  });
});
