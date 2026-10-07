import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { montarBriefing } from "@/lib/briefing";
import { TRANSCRICAO_TESTE } from "../ai/__fixtures__/reuniao-teste";
import { ANALISE_FALSA, motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar, type EntradaReuniao } from "../pipeline/processar-reuniao";
import { montarResumo } from "./resumo";

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-resumo-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
});
afterEach(async () => {
  delete process.env.DIALYS_BANCO_ARQUIVO;
  await rm(pasta, { recursive: true, force: true });
});

const analisar = (extra: Partial<EntradaReuniao> = {}, motor = motorFalso()) =>
  receberEProcessar({ conteudo: { tipo: "texto", texto: TRANSCRICAO_TESTE }, ...extra }, { motor });

const soObjecao = motorFalso(async () => ({
  ...structuredClone(ANALISE_FALSA),
  analise: {
    ...structuredClone(ANALISE_FALSA.analise),
    sinais: [{ ...ANALISE_FALSA.analise.sinais[1], tipo: "OBJECTION" as const, severidade: "MÉDIA" as const }],
  },
}));

describe("montarResumo (GET /api/v1/resumo)", () => {
  it("carteira vazia: tudo zerado e briefing pedindo o primeiro envio", async () => {
    const resumo = await montarResumo();
    expect(resumo.kpis).toMatchObject({ reunioesAnalisadas: 0, contasAnalisadas: 0, contasEmRiscoChurn: 0, npsMedio: null });
    expect(resumo.urgencias).toEqual([]);
    expect(resumo.agenda).toEqual([]);

    const briefing = montarBriefing(resumo, new Date(2026, 9, 7, 8, 0));
    expect(briefing.saudacao).toBe("Bom dia, Ricardo");
    expect(briefing.trechos.map((t) => t.texto).join(" ")).toContain("Ainda não há reuniões analisadas");
  });

  it("KPIs, matriz de urgência e agenda saem das reuniões analisadas", async () => {
    await analisar({ contaId: "conta-acme", contaNome: "Indústria Acme", contexto: { nps: 6 } });
    await analisar({ contaId: "conta-beta", contaNome: "Beta Ltda", contexto: { nps: 9 } }, soObjecao);

    const resumo = await montarResumo();
    expect(resumo.kpis).toEqual({
      reunioesAnalisadas: 2,
      reunioesUltimos7Dias: 2,
      contasAnalisadas: 2,
      contasEmRiscoChurn: 1,
      contasEmRiscoCritico: 1,
      sinais: { churn: 1, upsell: 1, objection: 1 },
      npsMedio: 7.5,
      contasComNps: 2,
    });
    // Ordem do Dialys: churn → oportunidade → objeção.
    expect(resumo.urgencias.map((u) => [u.categoria, u.conta.nome])).toEqual([
      ["churn", "Indústria Acme"],
      ["upsell", "Indústria Acme"],
      ["objection", "Beta Ltda"],
    ]);
    expect(resumo.agenda.map((a) => [a.conta.nome, a.categoria])).toEqual([
      ["Indústria Acme", "churn"],
      ["Beta Ltda", "objection"],
    ]);

    const briefing = montarBriefing(resumo, new Date(2026, 9, 7, 19, 0));
    const texto = briefing.trechos.map((t) => t.texto).join(" ");
    expect(briefing.saudacao).toBe("Boa noite, Ricardo");
    expect(texto).toContain("Analisei 2 reuniões de 2 contas");
    expect(texto).toContain("1 conta está em risco de churn, 1 em atenção crítica");
    expect(texto).toContain("Primeiro, crítico: Indústria Acme");
    expect(texto).toContain("“O pessoal viu uma demo da Senior e gostou”");
    expect(texto).toContain("Nas ações sugeridas pelo Dialys, sem horário marcado, priorize Indústria Acme e Beta Ltda.");
    expect(briefing.chamada).toBe("Seu briefing de hoje: 3 alertas por urgência e 2 ações sugeridas.");
    expect(briefing.duracaoSegundos).toBeGreaterThan(10);

    // Com a agenda: compromissos (com horário) separados das ações sugeridas (sem horário).
    const comAgenda = montarBriefing(resumo, new Date(2026, 9, 7, 8, 0), "Ricardo", {
      compromissos: [
        { titulo: "Revisão do funil", inicio: "09:00", cliente: null },
        { titulo: "Visita técnica", inicio: "14:30", cliente: "Beta Ltda" },
      ],
    });
    const trecho = comAgenda.trechos.find((t) => t.texto.startsWith("Ainda hoje na sua agenda"))!;
    expect(trecho.texto).toBe("Ainda hoje na sua agenda, 2 compromissos: às 09:00, Revisão do funil e às 14:30, Visita técnica com Beta Ltda.");
    expect(trecho.fala).toBe("Ainda hoje na sua agenda, 2 compromissos: às 9 horas, Revisão do funil e às 14 e 30, Visita técnica com Beta Ltda.");
    expect(comAgenda.chamada).toBe("Seu briefing de hoje: 3 alertas por urgência, 2 compromissos na agenda e 2 ações sugeridas.");
    const semCompromissos = montarBriefing(resumo, new Date(2026, 9, 7, 19, 0), "Ricardo", { compromissos: [] });
    expect(semCompromissos.trechos.map((t) => t.texto)).toContain("Você não tem mais compromissos agendados para hoje.");
  });
});
