// Sessão em Server Components (páginas): mesmo cookie assinado das rotas da API, lido via next/headers.
import { cookies } from "next/headers";
import { connection } from "next/server";
import { COOKIE_SESSAO, lerTokenSessao } from "./sessao";

export async function usuarioDaSessao() {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  // A validade do token é comparada com a hora atual: só na requisição, nunca no pré-render.
  await connection();
  return lerTokenSessao(token);
}
