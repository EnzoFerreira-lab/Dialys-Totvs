// Peças comuns das rotas /api/v1/agenda e /api/v1/clientes.
import { ErroAgenda } from "../agenda/agenda";
import { erro } from "./http";

/** Corpo JSON da requisição, ou a resposta de erro pronta (415/400). */
export async function lerCorpoJson(request: Request, requestId: string): Promise<{ corpo: unknown } | { resposta: Response }> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return { resposta: erro(415, "TIPO_NAO_SUPORTADO", "Use Content-Type application/json.", requestId) };
  }
  try {
    return { corpo: await request.json() };
  } catch {
    return { resposta: erro(400, "JSON_INVALIDO", "O corpo não é um JSON válido.", requestId) };
  }
}

/** ErroAgenda vira o erro padrão da API, com os campos inválidos em `detalhe.campos`. */
export function respostaErroAgenda(falha: unknown, requestId: string) {
  if (!(falha instanceof ErroAgenda)) throw falha;
  return erro(falha.status, falha.codigo, falha.message, requestId, falha.campos ? { campos: falha.campos } : undefined);
}

export const SEM_SESSAO = "Entre na plataforma para ver sua agenda e seus clientes.";
