import { describe, expect, it } from "vitest";
import { dataNoFuso, diaDaSemana, horaNoFuso, inicioDaSemana, paraInstante, somarDias } from "./fuso";

describe("fuso", () => {
  it("converte data + hora de São Paulo para UTC e volta", () => {
    const instante = paraInstante("2026-10-08", "14:30", "America/Sao_Paulo");
    expect(instante.toISOString()).toBe("2026-10-08T17:30:00.000Z");
    expect(dataNoFuso(instante, "America/Sao_Paulo")).toBe("2026-10-08");
    expect(horaNoFuso(instante, "America/Sao_Paulo")).toBe("14:30");
  });

  it("meia-noite UTC ainda é o dia anterior em São Paulo", () => {
    expect(dataNoFuso(new Date("2026-10-09T01:00:00Z"), "America/Sao_Paulo")).toBe("2026-10-08");
  });

  it("respeita outro fuso com horário de verão", () => {
    expect(paraInstante("2026-07-01", "09:00", "Europe/Lisbon").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(paraInstante("2026-01-15", "09:00", "Europe/Lisbon").toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("calendário: semana começa na segunda", () => {
    expect(diaDaSemana("2026-10-07")).toBe(2); // quarta
    expect(inicioDaSemana("2026-10-07")).toBe("2026-10-05");
    expect(inicioDaSemana("2026-10-11")).toBe("2026-10-05"); // domingo
    expect(somarDias("2026-10-30", 3)).toBe("2026-11-02");
  });
});
