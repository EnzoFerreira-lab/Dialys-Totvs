import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FRASE_TESTE, transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import type { SinalRegistro } from "../db/banco";
import { ANALISE_FALSA, motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar, type EntradaReuniao } from "../pipeline/processar-reuniao";
import { listarContasInsight, listarContasParaEnvio, montarEvidencias } from "./contas";

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-contas-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
});
afterEach(async () => {
  delete process.env.DIALYS_BANCO_ARQUIVO;
  await rm(pasta, { recursive: true, force: true });
});

const analisar = (extra: Partial<EntradaReuniao> = {}, motor = motorFalso()) =>
  receberEProcessar({ conteudo: { tipo: "texto", texto: transcricaoTeste() }, ...extra }, { motor });

/** Motor que só devolve uma objeção (sem churn): para conferir a ordenação entre contas. */
const soObjecao = motorFalso(async () => ({
  ...structuredClone(ANALISE_FALSA),
  analise: {
    ...structuredClone(ANALISE_FALSA.analise),
    sinais: [{ ...ANALISE_FALSA.analise.sinais[1], tipo: "OBJECTION" as const, severidade: "MÉDIA" as const }],
  },
}));

describe("Central de Insights a partir das reuniões analisadas", () => {
  it("sem reuniões analisadas, a Central fica vazia", async () => {
    expect(await listarContasInsight()).toEqual([]);
  });

  it("cada empresa analisada entra uma vez, com sinais, produtos, evidências e diagnóstico", async () => {
    await analisar({ contaId: "conta-acme", contaNome: "Indústria Acme" });
    const [conta] = await listarContasInsight();

    expect(conta).toMatchObject({
      id: "conta-acme",
      nome: "Indústria Acme",
      totalReunioes: 1,
      totalSinais: 2,
      sinais: [
        { tipo: "churn", urgencia: "alta" },
        { tipo: "oportunidade", urgencia: "media" },
      ],
      diagnostico: ANALISE_FALSA.analise.resumoExecutivo,
      acao: "Gerente de contas liga para o diretor esta semana.",
      sincronizadosCrm: 0,
    });
    expect(conta.produtos.map((p) => [p.contexto, p.nome])).toEqual([
      ["em_uso", "TOTVS Protheus"],
      ["concorrente", "Senior Sistemas"],
    ]);
    // As duas citações estão na mesma fala: um trecho só, com os dois destaques.
    expect(conta.evidencias).toHaveLength(1);
    expect(conta.evidencias[0].falante).toBe("Cliente (Diretor Administrativo)");
    expect(conta.evidencias[0].destaques.map((d) => d.tipo)).toEqual(["churn", "oportunidade"]);
    for (const { trecho } of conta.evidencias[0].destaques) expect(conta.evidencias[0].texto).toContain(trecho);
  });

  it("agrupa reuniões da mesma empresa pelo contaId ou pelo código do cliente TOTVS", async () => {
    await analisar({ contaId: "conta-acme", contaNome: "Indústria Acme" });
    await analisar({ contaId: "conta-acme", contaNome: "Indústria Acme" });
    await analisar({ contexto: { codigoCliente: "TB5392", segmento: "Varejo", nps: 8 } });
    // Reassociada pelo /envio à mesma empresa do CODT: cai no mesmo grupo.
    await analisar({ contaId: "codt-TB5392", contaNome: "Cliente TB5392" });
    await analisar({ contexto: { idReuniao: "999001" } });
    // Reunião da amostra enviada sem o código do cliente: o ID_MEETING recupera o código (TFBES6) e o
    // nome sai do CNAE + UF da amostra.
    await analisar({ contexto: { idReuniao: "959985" } });

    const contas = await listarContasInsight();
    expect(contas.map((c) => [c.nome, c.totalReunioes])).toEqual(
      expect.arrayContaining([
        ["Indústria Acme", 2],
        ["Cliente TB5392", 2],
        ["Reunião #999001", 1],
        ["Vinícola · RS (TFBES6)", 1],
      ]),
    );
    expect(contas).toHaveLength(4);
    expect(contas.find((c) => c.nome === "Cliente TB5392")).toMatchObject({ segmento: "Varejo", nps: 8 });
    expect(contas.find((c) => c.nome.startsWith("Vinícola"))?.id).toBe("codt-TFBES6");

    // O /envio só oferece empresas com identidade própria (não a reunião avulsa).
    expect((await listarContasParaEnvio()).map((c) => c.id)).toEqual(["codt-TB5392", "conta-acme", "codt-TFBES6"]);
  });

  it("ordena da mais crítica para a menos e mostra empresa sem sinais no fim", async () => {
    await analisar({ contaId: "conta-objecao", contaNome: "Só Objeção" }, soObjecao);
    await analisar({ contaId: "conta-sem-sinal", contaNome: "Sem Sinal" }, motorFalso(async () => ({
      ...structuredClone(ANALISE_FALSA),
      analise: { ...structuredClone(ANALISE_FALSA.analise), sinais: [] },
    })));
    await analisar({ contaId: "conta-churn", contaNome: "Com Churn" });

    const contas = await listarContasInsight();
    expect(contas.map((c) => c.nome)).toEqual(["Com Churn", "Só Objeção", "Sem Sinal"]);
    expect(contas[2]).toMatchObject({ sinais: [], evidencias: [], insightIds: [] });
  });
});

describe("montarEvidencias", () => {
  const sinal = (texto: string, citacao: string): SinalRegistro => {
    const inicio = texto.indexOf(citacao);
    return {
      ...ANALISE_FALSA.analise.sinais[0],
      citacaoExata: citacao,
      posicaoCaracterStart: inicio,
      posicaoCaracterEnd: inicio + citacao.length,
      evidencia: { correspondencia: "exata", posicaoCorrigida: false },
      id: "sin_x",
      analiseId: "ana_x",
      reuniaoId: "reu_x",
      criadoEm: "2026-10-07T00:00:00.000Z",
    };
  };

  it("fala longa vira janela em volta da citação, sem cortar palavra", () => {
    const longa = `[LOCUTOR 2]: ${"palavra ".repeat(80)}${FRASE_TESTE} ${"depois ".repeat(80)}`.trim();
    const [evidencia] = montarEvidencias(longa, [sinal(longa, FRASE_TESTE)]);

    expect(evidencia.falante).toBe("Locutor 2");
    expect(evidencia.texto.startsWith("…palavra ")).toBe(true);
    expect(evidencia.texto.endsWith(" depois…")).toBe(true);
    expect(evidencia.texto).toContain(FRASE_TESTE);
    expect(evidencia.texto.length).toBeLessThan(longa.length);
  });

  it("transcrição sem locutor usa um rótulo genérico", () => {
    const texto = `Linha qualquer.\n${FRASE_TESTE}`;
    expect(montarEvidencias(texto, [sinal(texto, FRASE_TESTE)])[0]).toMatchObject({ falante: "Trecho da reunião", texto: FRASE_TESTE });
  });
});
