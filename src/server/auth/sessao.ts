// Sessão do piloto: cookie httpOnly com o id do usuário e a validade, assinado com HMAC-SHA256.
// O navegador não consegue forjar nem alterar o usuário; o servidor sempre deriva quem é a pessoa
// daqui, nunca de um id enviado no corpo da requisição.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { buscarUsuario, type Usuario } from "./usuarios";

export const COOKIE_SESSAO = "dialys_sessao";
export const DURACAO_SESSAO_S = 8 * 60 * 60;

// Sem DIALYS_SESSAO_SEGREDO, um segredo aleatório por processo: seguro, mas as sessões caem quando o
// servidor reinicia. Fica no globalThis para as rotas (empacotadas em separado) usarem o mesmo.
const chaveSegredo = Symbol.for("dialys.sessao.segredo");
type GlobalComSegredo = typeof globalThis & { [chaveSegredo]?: Buffer };

function segredo(): Buffer {
  const configurado = process.env.DIALYS_SESSAO_SEGREDO;
  if (configurado && configurado.length >= 32) return Buffer.from(configurado, "utf8");
  const global = globalThis as GlobalComSegredo;
  if (!global[chaveSegredo]) {
    global[chaveSegredo] = randomBytes(32);
    console.warn(
      "[dialys/auth] DIALYS_SESSAO_SEGREDO ausente (ou com menos de 32 caracteres): usando um segredo temporário. As sessões expiram ao reiniciar o servidor.",
    );
  }
  return global[chaveSegredo];
}

const assinar = (conteudo: string) => createHmac("sha256", segredo()).update(conteudo).digest("base64url");

export function criarTokenSessao(usuarioId: string, agora = Date.now()) {
  const conteudo = Buffer.from(JSON.stringify({ u: usuarioId, exp: agora + DURACAO_SESSAO_S * 1000 })).toString("base64url");
  return `${conteudo}.${assinar(conteudo)}`;
}

/** Usuário do token, ou null se o token faltar, estiver adulterado, expirado ou apontar para usuário inexistente. */
export function lerTokenSessao(token: string | null | undefined, agora = Date.now()): Usuario | null {
  if (!token) return null;
  const [conteudo, assinatura] = token.split(".");
  if (!conteudo || !assinatura) return null;
  const esperada = Buffer.from(assinar(conteudo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(conteudo, "base64url").toString("utf8")) as { u?: unknown; exp?: unknown };
    if (typeof u !== "string" || typeof exp !== "number" || exp < agora) return null;
    return buscarUsuario(u);
  } catch {
    return null;
  }
}

/** Lê o cookie de sessão direto do cabeçalho da requisição (Route Handlers). */
export function usuarioDaRequisicao(request: Request): Usuario | null {
  const cookies = request.headers.get("cookie") ?? "";
  const valor = cookies
    .split(";")
    .map((parte) => parte.trim())
    .find((parte) => parte.startsWith(`${COOKIE_SESSAO}=`))
    ?.slice(COOKIE_SESSAO.length + 1);
  return lerTokenSessao(valor ? decodeURIComponent(valor) : null);
}
