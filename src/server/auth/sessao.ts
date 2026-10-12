// Sessão do piloto: cookie httpOnly com o id do usuário e a validade, assinado com HMAC-SHA256.
// O navegador não consegue forjar nem alterar o usuário; o servidor sempre deriva quem é a pessoa
// daqui, nunca de um id enviado no corpo da requisição.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { arquivoBanco } from "../db/banco";
import { buscarUsuario } from "./cadastro";
import type { Usuario } from "./usuarios";

export const COOKIE_SESSAO = "dialys_sessao";
/** Sessão comum: dura o expediente (e some ao fechar o navegador). */
export const DURACAO_SESSAO_S = 8 * 60 * 60;
/** "Lembrar meu acesso neste dispositivo". */
export const DURACAO_SESSAO_LEMBRADA_S = 30 * 24 * 60 * 60;

// Sem DIALYS_SESSAO_SEGREDO, um segredo gerado na primeira vez e guardado ao lado do banco
// (.dialys/sessao.chave): as sessões continuam valendo quando o servidor reinicia. Fica no globalThis para
// as rotas (empacotadas em separado) usarem o mesmo.
const chaveSegredo = Symbol.for("dialys.sessao.segredo");
type GlobalComSegredo = typeof globalThis & { [chaveSegredo]?: Buffer };

function segredoGuardado(): Buffer {
  const arquivo = path.join(path.dirname(arquivoBanco()), "sessao.chave");
  try {
    const lido = readFileSync(arquivo, "utf8").trim();
    if (lido.length >= 43) return Buffer.from(lido, "base64url");
  } catch {
    // Ainda não existe: gera abaixo.
  }
  const novo = randomBytes(32);
  try {
    mkdirSync(path.dirname(arquivo), { recursive: true });
    writeFileSync(arquivo, novo.toString("base64url"), { encoding: "utf8", mode: 0o600 });
  } catch (erro) {
    console.warn("[dialys/auth] não foi possível guardar o segredo da sessão; as sessões expiram ao reiniciar o servidor.", erro);
  }
  return novo;
}

function segredo(): Buffer {
  const configurado = process.env.DIALYS_SESSAO_SEGREDO;
  if (configurado && configurado.length >= 32) return Buffer.from(configurado, "utf8");
  const global = globalThis as GlobalComSegredo;
  return (global[chaveSegredo] ??= segredoGuardado());
}

const assinar = (conteudo: string) => createHmac("sha256", segredo()).update(conteudo).digest("base64url");

export function criarTokenSessao(usuarioId: string, agora = Date.now(), duracaoS = DURACAO_SESSAO_S) {
  const conteudo = Buffer.from(JSON.stringify({ u: usuarioId, exp: agora + duracaoS * 1000 })).toString("base64url");
  return `${conteudo}.${assinar(conteudo)}`;
}

/** Id do usuário de um token íntegro e dentro da validade; null se faltar, estiver adulterado ou vencido. */
export function idDoTokenSessao(token: string | null | undefined, agora = Date.now()): string | null {
  if (!token) return null;
  const [conteudo, assinatura] = token.split(".");
  if (!conteudo || !assinatura) return null;
  const esperada = Buffer.from(assinar(conteudo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(conteudo, "base64url").toString("utf8")) as { u?: unknown; exp?: unknown };
    return typeof u === "string" && typeof exp === "number" && exp >= agora ? u : null;
  } catch {
    return null;
  }
}

/** Usuário do token, ou null se o token faltar, estiver adulterado, expirado ou apontar para usuário inexistente. */
export async function lerTokenSessao(token: string | null | undefined, agora = Date.now()): Promise<Usuario | null> {
  const id = idDoTokenSessao(token, agora);
  return id ? buscarUsuario(id) : null;
}

/** Valor do cookie de sessão num cabeçalho Cookie. */
export function tokenDoCabecalho(cookies: string | null) {
  const valor = (cookies ?? "")
    .split(";")
    .map((parte) => parte.trim())
    .find((parte) => parte.startsWith(`${COOKIE_SESSAO}=`))
    ?.slice(COOKIE_SESSAO.length + 1);
  return valor ? decodeURIComponent(valor) : null;
}

/** Lê o cookie de sessão direto do cabeçalho da requisição (Route Handlers). */
export function usuarioDaRequisicao(request: Request): Promise<Usuario | null> {
  return lerTokenSessao(tokenDoCabecalho(request.headers.get("cookie")));
}
