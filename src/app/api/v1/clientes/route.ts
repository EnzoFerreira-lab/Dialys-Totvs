// GET /api/v1/clientes: "Meus clientes", só as contas que o usuário autenticado pode ver.
//   busca                       parte do nome (sem acento/caixa)
//   limite (1–50, padrão 10), offset (padrão 0)
// situacao null = "Sem avaliação" (nenhuma reunião analisada), diferente de "saudavel".
import { connection } from "next/server";
import { SEM_SESSAO } from "@/server/api/agenda";
import { comTratamento, erro, json } from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";
import { LIMITE_CLIENTES, listarClientes } from "@/server/clientes/clientes";

function inteiro(valor: string | null, padrao: number, min: number, max: number) {
  if (valor === null || valor === "") return padrao;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= min && numero <= max ? numero : null;
}

export async function GET(request: Request) {
  await connection();
  return comTratamento("GET /clientes", async (requestId) => {
    const usuario = usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const params = new URL(request.url).searchParams;
    const limite = inteiro(params.get("limite"), LIMITE_CLIENTES, 1, 50);
    const offset = inteiro(params.get("offset"), 0, 0, 100_000);
    if (limite === null || offset === null) return erro(400, "PAGINACAO_INVALIDA", "Use limite entre 1 e 50 e offset a partir de 0.", requestId);
    const busca = (params.get("busca") ?? "").slice(0, 100);
    const { clientes, total } = await listarClientes(usuario, { busca, limite, offset });
    return json({ dados: clientes, paginacao: { total, limite, offset } }, 200, requestId);
  });
}
