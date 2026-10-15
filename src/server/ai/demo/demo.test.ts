import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extrairReunioes } from "@/lib/transcricao";
import { TRANSCRICAO_TESTE } from "../__fixtures__/reuniao-teste";
import { validarEvidencias } from "../validar-evidencia";
import { analisarReuniaoDemo } from "./analisar-reuniao-demo";
import { atividadeCnae } from "@/lib/cnae";
import { lerAmostraTotvs } from "./amostra-totvs";
import { EMPRESAS_EM_DESTAQUE, listarExemplos } from "./exemplos";
import { analisarPorRegras, papeisDosLocutores } from "./heuristica";

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

describe("analisarReuniaoDemo (regras locais)", () => {
  it("cai nas regras locais para texto desconhecido", async () => {
    const { auditoria, analise } = await analisarReuniaoDemo(
      "Cliente (CFO): O preço ficou muito caro e não temos orçamento este ano.",
      { atrasoMs: 0 },
    );
    expect(auditoria.origem).toBe("regras locais");
    expect(analise.sinais[0]).toMatchObject({ tipo: "OBJECTION", subtipo: "Orçamento" });
  });

  it("usa os metadados da reunião no resumo e nos próximos passos", async () => {
    const { analise } = await analisarReuniaoDemo("Cliente (CFO): Tudo certo por aqui, obrigado pela visita.", {
      atrasoMs: 0,
      contexto: { segmento: "Serviços", uf: "SP", nps: 5 },
    });
    expect(analise.resumoExecutivo).toMatch(/^Reunião com cliente de Serviços \(SP\), NPS 5 \(detrator\)/);
    expect(analise.proximosPassosSugeridos[0]).toMatch(/Cliente detrator \(NPS 5\)/);
  });
});

// Amostra real enviada pela TOTVS (reuniões anonimizadas, locutores sem papel, erros de transcrição).
// O menu Exemplo (data/exemplos/totvs) ficou só com reuniões em que o Nemotron encontrou insights com
// citação literal confirmada. Reuniões que saíram do menu, mas cobrem casos das regras locais, ficam em
// __fixtures__/amostra-regras.json (mesmo formato, registros originais).
const REGRESSAO = extrairReunioes(readFileSync(path.join(__dirname, "__fixtures__", "amostra-regras.json"), "utf8")) ?? [];

describe("amostra TOTVS (data/exemplos/totvs)", () => {
  const reunioes = lerAmostraTotvs();
  const porId = (id: string) => {
    const reuniao = [...reunioes, ...REGRESSAO].find((r) => r.id === id);
    if (!reuniao) throw new Error(`reunião ${id} não está na amostra nem nas fixtures`);
    return { ...reuniao, analise: analisarPorRegras(reuniao.transcricao, reuniao.contexto) };
  };

  it("carrega as reuniões sem duplicatas e com metadados", () => {
    // 37 reuniões de 16 empresas: 36 com insights validados na análise com o Nemotron, mais a #702922 (Hospital · BA),
    // incluída por ter risco de churn com valor em R$ (valor em risco no Dashboard), ainda não validada com o Nemotron.
    expect(reunioes.length).toBe(37);
    expect(new Set(reunioes.map((r) => r.transcricao)).size).toBe(reunioes.length);
    expect(reunioes.every((r) => r.contexto.codigoCliente && r.contexto.data)).toBe(true);
    expect(REGRESSAO.map((r) => r.id).sort()).toEqual(["1069924", "1144435", "1227164", "1282016", "747580", "920847", "959985"]);
    expect(REGRESSAO.find((r) => r.id === "920847")?.contexto).toMatchObject({ segmento: "Saúde", uf: "RS", nps: 7 });
  });

  it("clientes recorrentes: a maioria das empresas tem várias reuniões, todas com CNAE com nome", () => {
    const porCliente = new Map<string, typeof reunioes>();
    for (const r of reunioes)
      porCliente.set(r.contexto.codigoCliente ?? "", [...(porCliente.get(r.contexto.codigoCliente ?? "") ?? []), r]);
    expect(porCliente.size).toBe(16);
    expect([...porCliente.values()].filter((lista) => lista.length >= 2).length).toBe(11);
    for (const r of reunioes) expect(atividadeCnae(r.contexto.cnae)).toBeTruthy();
  });

  it("menu Exemplo: empresas em destaque primeiro, depois em ordem alfabética, reunião mais recente primeiro", () => {
    const exemplos = listarExemplos();
    expect(exemplos).toHaveLength(37);
    const todosGrupos = [...new Set(exemplos.map((e) => e.grupo))];
    // Destaque no topo, na ordem configurada: o primeiro é o Plano de saúde · SP, com a reunião de 07/04/2026 primeiro.
    EMPRESAS_EM_DESTAQUE.forEach((codigo, i) => expect(todosGrupos[i]).toContain(`(${codigo})`));
    expect(todosGrupos[0]).toBe("Plano de saúde · SP (TFCKHB) · 4 reuniões");
    expect(exemplos[0].id).toBe("totvs-1394492");
    expect(todosGrupos[1]).toBe("Hospital · BA (TEZHIV) · 1 reunião");
    const grupos = todosGrupos.slice(EMPRESAS_EM_DESTAQUE.length);
    const empresas = grupos.map((g) => g.replace(/ · \d+ reuni(ão|ões)$/, ""));
    // Com nome, em ordem alfabética; sem nome ("Cliente <código>"), no fim.
    const semNome = (e: string) => e.startsWith("Cliente ") || e === "Sem cliente identificado";
    const comNome = empresas.filter((e) => !semNome(e));
    expect(comNome).toEqual([...comNome].sort((a, b) => a.localeCompare(b, "pt-BR")));
    expect(empresas.slice(comNome.length).every(semNome)).toBe(true);
    // Cada empresa aparece num bloco só, e o rótulo traz o total de reuniões dela.
    for (const g of grupos) {
      const doGrupo = exemplos.filter((e) => e.grupo === g);
      expect(g).toContain(`· ${doGrupo.length} ${doGrupo.length === 1 ? "reunião" : "reuniões"}`);
      const datas = doGrupo.map((e) => reunioes.find((r) => `totvs-${r.id}` === e.id)?.contexto.data ?? "");
      expect(datas).toEqual([...datas].sort().reverse());
    }
    expect(grupos).toContain("Estaleiro · RS (TFEHER) · 2 reuniões");
  });

  it.each([...reunioes, ...REGRESSAO].map((r) => [r.id, r] as const))("%s: no máximo 6 sinais, todos com citação literal", (_id, reuniao) => {
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
