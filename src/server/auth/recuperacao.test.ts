import { describe, expect, it } from "vitest";
import {
  ESPERA_REENVIO_MS,
  MAXIMO_TENTATIVAS,
  VALIDADE_CODIGO_MS,
  mascararEmail,
  problemaNaSenha,
  redefinirSenha,
  solicitarCodigo,
  verificarCodigo,
} from "./recuperacao";

let seq = 0;
const novoEmail = () => `pessoa${++seq}.teste@totvs.com.br`;

function codigoPara(email: string, agora = Date.now()) {
  const r = solicitarCodigo(email, agora);
  if (!r.ok) throw new Error(r.erro);
  return r.codigoSimulado;
}

describe("recuperação de senha (simulada)", () => {
  it("gera código de 6 dígitos, mascara o e-mail e recusa e-mail inválido", () => {
    const r = solicitarCodigo("Ricardo.Alves@totvs.com.br");
    expect(r).toMatchObject({ ok: true, emailMascarado: "r••••••••••@totvs.com.br", validadeMinutos: 10 });
    if (r.ok) expect(r.codigoSimulado).toMatch(/^\d{6}$/);
    expect(solicitarCodigo("nao-e-email").ok).toBe(false);
    expect(mascararEmail("ab@x.com")).toBe("a•••@x.com");
  });

  it("espera para reenviar; um código novo invalida o anterior", () => {
    const email = novoEmail();
    const t0 = 1_000_000;
    const primeiro = codigoPara(email, t0);
    expect(solicitarCodigo(email, t0 + 5_000)).toMatchObject({ ok: false, aguardarSegundos: 25 });
    const segundo = codigoPara(email, t0 + ESPERA_REENVIO_MS);
    if (primeiro !== segundo) expect(verificarCodigo(email, primeiro, t0 + ESPERA_REENVIO_MS + 1).ok).toBe(false);
    expect(verificarCodigo(email, segundo, t0 + ESPERA_REENVIO_MS + 2).ok).toBe(true);
  });

  it("código certo vira token de uso único; a senha nova segue a regra e precisa ser confirmada", () => {
    const email = novoEmail();
    const verificado = verificarCodigo(email, codigoPara(email));
    expect(verificado.ok).toBe(true);
    if (!verificado.ok) return;
    expect(redefinirSenha(verificado.token, "curta1", "curta1")).toMatchObject({ ok: false, campo: "senha" });
    expect(redefinirSenha(verificado.token, "somenteletras", "somenteletras")).toMatchObject({ ok: false, campo: "senha" });
    expect(redefinirSenha(verificado.token, "NovaSenha2026", "NovaSenha2025")).toMatchObject({ ok: false, campo: "confirmacao" });
    expect(redefinirSenha(verificado.token, "NovaSenha2026", "NovaSenha2026")).toEqual({ ok: true, email });
    // Uso único.
    expect(redefinirSenha(verificado.token, "NovaSenha2026", "NovaSenha2026")).toMatchObject({ ok: false, reiniciar: true });
    // O código também é de uso único.
    expect(verificarCodigo(email, "000000")).toMatchObject({ ok: false, novoCodigo: true });
  });

  it("limita as tentativas e expira o código", () => {
    const email = novoEmail();
    const certo = codigoPara(email);
    const errado = certo === "111111" ? "222222" : "111111";
    for (let i = 1; i < MAXIMO_TENTATIVAS; i++) expect(verificarCodigo(email, errado)).toMatchObject({ ok: false, erro: expect.stringContaining("restante") });
    expect(verificarCodigo(email, errado)).toMatchObject({ ok: false, novoCodigo: true });
    expect(verificarCodigo(email, certo)).toMatchObject({ ok: false, novoCodigo: true });

    const outro = novoEmail();
    const t0 = 5_000_000;
    const codigo = codigoPara(outro, t0);
    expect(verificarCodigo(outro, codigo, t0 + VALIDADE_CODIGO_MS + 1)).toMatchObject({ ok: false, erro: "O código expirou. Peça um novo." });
  });

  it("regra da senha", () => {
    expect(problemaNaSenha("abc12345")).toBeNull();
    expect(problemaNaSenha("12345678")).toBe("Use letras e números.");
  });
});
