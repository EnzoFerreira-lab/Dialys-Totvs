// Porta de entrada das telas: sem sessão válida, qualquer página do app vai para o login (e volta para ela
// depois de entrar); com sessão, o endereço raiz abre a Home. É a checagem otimista (assinatura e validade do
// cookie): cada página, rota da API e server action continua conferindo o usuário por conta própria.
// O /login nunca redireciona quem tem sessão: assim um cookie de usuário apagado não prende ninguém num laço.
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, idDoTokenSessao } from "@/server/auth/sessao";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const logado = idDoTokenSessao(request.cookies.get(COOKIE_SESSAO)?.value) !== null;

  if (pathname === "/") return NextResponse.redirect(new URL(logado ? "/clientes" : "/login", request.url));
  if (logado) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("volta", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/clientes/:path*", "/dashboard/:path*", "/contas/:path*", "/insights/:path*", "/assistente/:path*", "/envio/:path*"],
};
