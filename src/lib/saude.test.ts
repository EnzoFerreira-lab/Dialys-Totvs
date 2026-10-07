import { describe, expect, it } from "vitest";
import { calcularSaude, confiancaRelacional, faixaDaNota } from "./saude";

describe("calcularSaude", () => {
  it("sem sinais e sem NPS: 10, saudável", () => {
    expect(calcularSaude([])).toMatchObject({ nota: 10, faixa: "saudavel" });
  });

  it("churn crítico e objeção derrubam a nota; oportunidade soma pouco", () => {
    const saude = calcularSaude([
      { tipo: "CHURN_RISK", severidade: "ALTA" },
      { tipo: "OBJECTION", severidade: "MÉDIA" },
      { tipo: "OPPORTUNITY", severidade: "ALTA" },
    ]);
    expect(saude.nota).toBe(5.5); // 10 − 4 − 1 + 0,5
    expect(saude.faixa).toBe("estavel");
    expect(saude.fatores).toContain("Risco de churn (alta): −4,0");
  });

  it("NPS entra com 30% e a nota fica entre 0 e 10", () => {
    expect(calcularSaude([{ tipo: "CHURN_RISK", severidade: "ALTA" }, { tipo: "CHURN_RISK", severidade: "ALTA" }], 4).nota).toBe(2.6); // 2×0,7 + 4×0,3
    expect(calcularSaude([{ tipo: "CHURN_RISK", severidade: "ALTA" }, { tipo: "CHURN_RISK", severidade: "ALTA" }, { tipo: "CHURN_RISK", severidade: "ALTA" }]).nota).toBe(0);
    expect(calcularSaude([{ tipo: "OPPORTUNITY", severidade: "ALTA" }], 9).nota).toBe(9.7);
  });

  it("faixas e confiança relacional", () => {
    expect([faixaDaNota(4.9), faixaDaNota(5), faixaDaNota(7.4), faixaDaNota(7.5)]).toEqual(["risco", "estavel", "estavel", "saudavel"]);
    const boa = calcularSaude([], 9);
    expect(confiancaRelacional(boa, false, false, 9)).toBe("forte");
    expect(confiancaRelacional(boa, false, false, 6)).toBe("fragil");
    expect(confiancaRelacional(calcularSaude([{ tipo: "CHURN_RISK", severidade: "ALTA" }]), true, true)).toBe("fragil");
  });
});
