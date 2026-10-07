// Sessão em Server Components (páginas): mesmo cookie assinado das rotas da API, lido via next/headers.
import { cookies } from "next/headers";
import { COOKIE_SESSAO, lerTokenSessao } from "./sessao";

export async function usuarioDaSessao() {
  return lerTokenSessao((await cookies()).get(COOKIE_SESSAO)?.value);
}
