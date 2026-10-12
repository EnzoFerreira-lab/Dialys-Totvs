"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { autenticar, criarUsuario, type CampoCadastro } from "@/server/auth/cadastro";
import { COOKIE_SESSAO, DURACAO_SESSAO_LEMBRADA_S, criarTokenSessao } from "@/server/auth/sessao";

/** Só caminhos internos: evita redirecionar para outro site depois do login. */
const destinoSeguro = (volta: unknown) =>
  typeof volta === "string" && volta.startsWith("/") && !volta.startsWith("//") && !volta.startsWith("/login") ? volta : "/clientes";

const texto = (formulario: FormData, campo: string, limite = 254) => {
  const valor = formulario.get(campo);
  return typeof valor === "string" ? valor.slice(0, limite) : "";
};

/**
 * Abre a sessão. O cookie só exige HTTPS quando a página veio por HTTPS: na apresentação pelo IP da rede
 * (http://192.168…), um cookie "secure" seria descartado pelo navegador e o login não pararia de pedir senha.
 */
async function abrirSessao(usuarioId: string, lembrar: boolean) {
  const cabecalhos = await headers();
  const https = (cabecalhos.get("x-forwarded-proto") ?? cabecalhos.get("origin") ?? "").startsWith("https");
  (await cookies()).set(COOKIE_SESSAO, criarTokenSessao(usuarioId, Date.now(), lembrar ? DURACAO_SESSAO_LEMBRADA_S : undefined), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    // Sem "lembrar", cookie de sessão: some quando o navegador fecha (e o token vence em 8 h de qualquer jeito).
    ...(lembrar ? { maxAge: DURACAO_SESSAO_LEMBRADA_S } : {}),
  });
}

export type EstadoLogin = { erro: string; email: string } | null;

export async function entrar(_anterior: EstadoLogin, formulario: FormData): Promise<EstadoLogin> {
  const email = texto(formulario, "email").trim();
  const senha = texto(formulario, "senha", 200);
  if (!email || !senha) return { erro: "Informe o e-mail e a senha.", email };
  const usuario = await autenticar(email, senha);
  if (!usuario) return { erro: "E-mail ou senha incorretos.", email };
  await abrirSessao(usuario.id, formulario.get("lembrar") === "on");
  redirect(destinoSeguro(formulario.get("volta")));
}

export type EstadoCadastro = { erro: string; campo?: CampoCadastro; valores: { nome: string; email: string; papel: string } } | null;

/** "Criar conta": grava o usuário e já entra com ele. A conta começa vazia: os clientes vêm das reuniões que ele enviar. */
export async function criarConta(_anterior: EstadoCadastro, formulario: FormData): Promise<EstadoCadastro> {
  const valores = { nome: texto(formulario, "nome", 120), email: texto(formulario, "email"), papel: texto(formulario, "papel", 20) };
  const resposta = await criarUsuario({ ...valores, senha: texto(formulario, "senha", 200), confirmacao: texto(formulario, "confirmacao", 200) });
  if (!resposta.ok) return { erro: resposta.erro, campo: resposta.campo, valores };
  await abrirSessao(resposta.usuario.id, false);
  redirect("/envio?boasVindas=1");
}

export async function sair() {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}
