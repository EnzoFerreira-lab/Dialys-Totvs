// Recuperação de senha do piloto: SIMULADA. O fluxo é o de um sistema real (código de 6 dígitos com
// validade, limite de tentativas, espera para reenviar, token de uso único para trocar a senha e
// resposta que não revela se o e-mail existe), mas nenhum e-mail sai da máquina: o código volta para a
// tela, que mostra uma prévia identificada como "e-mail simulado". A senha nova é gravada pela ação da tela
// (definirSenha, em cadastro.ts), só depois de o código ser conferido.
// Na produção: enviar o código por um serviço de e-mail e nunca devolvê-lo na resposta.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const VALIDADE_CODIGO_MS = 10 * 60_000;
export const ESPERA_REENVIO_MS = 30_000;
export const MAXIMO_TENTATIVAS = 5;
const VALIDADE_TOKEN_MS = 10 * 60_000;
export const TAMANHO_MINIMO_SENHA = 8;

type Pedido = { codigoHash: Buffer; expiraEm: number; enviadoEm: number; tentativas: number };
type Redefinicao = { email: string; expiraEm: number };
type Estado = { pedidos: Map<string, Pedido>; redefinicoes: Map<string, Redefinicao> };

// No globalThis: as server actions e o HMR recarregam módulos, mas precisam do mesmo estado.
const chave = Symbol.for("dialys.auth.recuperacao");
function estado(): Estado {
  const global = globalThis as typeof globalThis & { [chave]?: Estado };
  return (global[chave] ??= { pedidos: new Map(), redefinicoes: new Map() });
}

const hash = (texto: string) => createHash("sha256").update(texto).digest();
export const normalizarEmail = (email: string) => email.trim().toLowerCase();
export const emailValido = (email: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) && email.length <= 254;

/** "ricardo.alves@totvs.com.br" → "r•••••••••••@totvs.com.br" (mostra a quem o código foi, sem expor o e-mail). */
export function mascararEmail(email: string) {
  const [usuario, dominio] = email.split("@");
  return `${usuario.slice(0, 1)}${"•".repeat(Math.max(3, Math.min(usuario.length - 1, 10)))}@${dominio}`;
}

export type RespostaCodigo =
  | {
      ok: true;
      emailMascarado: string;
      /** Só existe porque o envio é simulado: a tela mostra o "e-mail" com o código. */
      codigoSimulado: string;
      validadeMinutos: number;
      reenvioEmSegundos: number;
    }
  | { ok: false; erro: string; aguardarSegundos?: number };

/**
 * Gera um código de 6 dígitos para o e-mail. Qualquer e-mail válido recebe a mesma resposta (não
 * revela se existe uma conta); trocar a senha de um e-mail sem conta não cria nada.
 */
export function solicitarCodigo(emailBruto: string, agora = Date.now()): RespostaCodigo {
  const email = normalizarEmail(emailBruto);
  if (!emailValido(email)) return { ok: false, erro: "Informe um e-mail válido." };
  const anterior = estado().pedidos.get(email);
  if (anterior && agora - anterior.enviadoEm < ESPERA_REENVIO_MS) {
    const aguardarSegundos = Math.ceil((ESPERA_REENVIO_MS - (agora - anterior.enviadoEm)) / 1000);
    return { ok: false, erro: `Aguarde ${aguardarSegundos} s para pedir outro código.`, aguardarSegundos };
  }
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Um código novo invalida o anterior.
  estado().pedidos.set(email, { codigoHash: hash(`${email}:${codigo}`), expiraEm: agora + VALIDADE_CODIGO_MS, enviadoEm: agora, tentativas: 0 });
  console.info(`[dialys/auth] código de recuperação gerado para ${mascararEmail(email)} (envio de e-mail simulado)`);
  return {
    ok: true,
    emailMascarado: mascararEmail(email),
    codigoSimulado: codigo,
    validadeMinutos: VALIDADE_CODIGO_MS / 60_000,
    reenvioEmSegundos: ESPERA_REENVIO_MS / 1000,
  };
}

export type RespostaVerificacao = { ok: true; token: string } | { ok: false; erro: string; novoCodigo?: boolean };

/** Confere o código (uso único). Erros de mais ou código vencido exigem pedir outro. */
export function verificarCodigo(emailBruto: string, codigoBruto: string, agora = Date.now()): RespostaVerificacao {
  const email = normalizarEmail(emailBruto);
  const codigo = codigoBruto.replace(/\D/g, "");
  if (codigo.length !== 6) return { ok: false, erro: "Digite os 6 números do código." };
  const pedido = estado().pedidos.get(email);
  if (!pedido) return { ok: false, erro: "Peça um código de recuperação primeiro.", novoCodigo: true };
  if (agora > pedido.expiraEm) {
    estado().pedidos.delete(email);
    return { ok: false, erro: "O código expirou. Peça um novo.", novoCodigo: true };
  }
  if (pedido.tentativas >= MAXIMO_TENTATIVAS) {
    estado().pedidos.delete(email);
    return { ok: false, erro: "Muitas tentativas. Peça um novo código.", novoCodigo: true };
  }
  pedido.tentativas++;
  if (!timingSafeEqual(pedido.codigoHash, hash(`${email}:${codigo}`))) {
    const restantes = MAXIMO_TENTATIVAS - pedido.tentativas;
    if (restantes <= 0) {
      estado().pedidos.delete(email);
      return { ok: false, erro: "Código incorreto. Você esgotou as tentativas: peça um novo código.", novoCodigo: true };
    }
    return { ok: false, erro: `Código incorreto. ${restantes} ${restantes === 1 ? "tentativa restante" : "tentativas restantes"}.` };
  }
  estado().pedidos.delete(email);
  const token = randomBytes(24).toString("base64url");
  estado().redefinicoes.set(token, { email, expiraEm: agora + VALIDADE_TOKEN_MS });
  return { ok: true, token };
}

/** Regra da senha nova (a mesma mostrada na tela). null = válida. */
export function problemaNaSenha(senha: string): string | null {
  if (senha.length < TAMANHO_MINIMO_SENHA) return `Use pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) return "Use letras e números.";
  if (senha.length > 128) return "Use no máximo 128 caracteres.";
  return null;
}

export type RespostaRedefinicao = { ok: true; email: string } | { ok: false; erro: string; campo?: "senha" | "confirmacao"; reiniciar?: boolean };

/** Confere o token do código (uso único) e a senha nova. Quem grava é definirSenha (cadastro.ts). */
export function redefinirSenha(token: string, senha: string, confirmacao: string, agora = Date.now()): RespostaRedefinicao {
  const redefinicao = estado().redefinicoes.get(token);
  if (!redefinicao || agora > redefinicao.expiraEm) {
    estado().redefinicoes.delete(token);
    return { ok: false, erro: "A verificação expirou. Comece de novo.", reiniciar: true };
  }
  const problema = problemaNaSenha(senha);
  if (problema) return { ok: false, erro: problema, campo: "senha" };
  if (senha !== confirmacao) return { ok: false, erro: "As senhas não são iguais.", campo: "confirmacao" };
  estado().redefinicoes.delete(token);
  console.info(`[dialys/auth] senha redefinida para ${mascararEmail(redefinicao.email)}`);
  return { ok: true, email: redefinicao.email };
}
