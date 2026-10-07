"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, DURACAO_SESSAO_S, criarTokenSessao } from "@/server/auth/sessao";
import { USUARIO_PADRAO, usuarioPorEmail } from "@/server/auth/usuarios";

/** Só caminhos internos: evita redirecionar para outro site depois do login. */
const destinoSeguro = (volta: unknown) =>
  typeof volta === "string" && volta.startsWith("/") && !volta.startsWith("//") ? volta : "/clientes";

/**
 * Piloto: qualquer credencial entra, como a persona configurada para o e-mail (ou a persona padrão).
 * A senha não é verificada até a autenticação real (T02, IdP corporativo). O que muda agora é que
 * a identidade passa a viver numa sessão assinada no servidor.
 */
export async function entrar(formulario: FormData) {
  const usuario = usuarioPorEmail(String(formulario.get("email") ?? "")) ?? USUARIO_PADRAO;
  (await cookies()).set(COOKIE_SESSAO, criarTokenSessao(usuario.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.DIALYS_COOKIE_INSEGURO !== "true",
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
  redirect(destinoSeguro(formulario.get("volta")));
}

export async function sair() {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}
