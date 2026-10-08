"use server";

// "Esqueceu a senha?": as três etapas rodam no servidor (src/server/auth/recuperacao.ts). Envio de
// e-mail simulado no piloto.
import {
  redefinirSenha as redefinir,
  solicitarCodigo as solicitar,
  verificarCodigo as verificar,
  type RespostaCodigo,
  type RespostaRedefinicao,
  type RespostaVerificacao,
} from "@/server/auth/recuperacao";

const texto = (valor: unknown, limite: number) => (typeof valor === "string" ? valor.slice(0, limite) : "");

export async function pedirCodigoRecuperacao(email: unknown): Promise<RespostaCodigo> {
  return solicitar(texto(email, 254));
}

export async function conferirCodigoRecuperacao(email: unknown, codigo: unknown): Promise<RespostaVerificacao> {
  return verificar(texto(email, 254), texto(codigo, 12));
}

export async function trocarSenha(token: unknown, senha: unknown, confirmacao: unknown): Promise<RespostaRedefinicao> {
  return redefinir(texto(token, 64), texto(senha, 200), texto(confirmacao, 200));
}
