import { describe, expect, it } from "vitest";
import { extrairValorReais } from "./valores";

describe("extrairValorReais", () => {
  it.each([
    ["São cerca de R$ 50 mil em risco no módulo de RH.", 50_000],
    ["Valor em risco: R$ 50.000,00.", 50_000],
    ["contrato de R$1,2 milhão por ano", 1_200_000],
    ["perderíamos uns 80 mil reais na safra", 80_000],
    ["R$ 300 de diferença e R$ 2.500 por mês", 2_500],
  ])("%s → %d", (texto, esperado) => {
    expect(extrairValorReais(texto)).toBe(esperado);
  });

  it("sem montante citado, devolve null", () => {
    expect(extrairValorReais("O pessoal viu uma demo da Senior e gostou")).toBeNull();
    expect(extrairValorReais("Faltam 3 dias para a renovação e 50 usuários ativos")).toBeNull();
  });
});
