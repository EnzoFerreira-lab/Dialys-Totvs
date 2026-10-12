// GET /api/v1/insights: sinais das reuniões concluídas, do mais crítico e recente para o menos (Dashboard e CRM).
//   categoria    churn | upsell | objection           (várias: separadas por vírgula ou parâmetro repetido)
//   criticidade  ALTA | MÉDIA | BAIXA (aceita MEDIA)  (idem)
//   contaId, reuniaoId                                filtros exatos
//   limite (1–200, padrão 50), offset (padrão 0)      paginação
import type { NextRequest } from "next/server";
import { SEM_SESSAO } from "@/server/api/agenda";
import type { Severidade, TipoSinal } from "@/server/ai/schemas";
import {
  CATEGORIAS,
  CATEGORIA_DO_TIPO,
  comTratamento,
  ehCategoria,
  erro,
  json,
  serializarInsight,
  type ListaInsightsApi,
} from "@/server/api/http";
import { usuarioDaRequisicao } from "@/server/auth/sessao";
import { listarInsights } from "@/server/db/repositorio";

const CRITICIDADES: Record<string, Severidade> = { ALTA: "ALTA", MÉDIA: "MÉDIA", MEDIA: "MÉDIA", BAIXA: "BAIXA" };
const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

/** Valores de um parâmetro que aceita lista ("a,b" ou ?p=a&p=b), sem vazios. */
function lista(params: URLSearchParams, nome: string) {
  return params
    .getAll(nome)
    .flatMap((valor) => valor.split(","))
    .map((valor) => valor.trim())
    .filter(Boolean);
}

function inteiro(valor: string | null, padrao: number, min: number, max: number) {
  if (valor === null || valor === "") return padrao;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= min && numero <= max ? numero : null;
}

export async function GET(request: NextRequest) {
  return comTratamento("GET /insights", async (requestId) => {
    const usuario = await usuarioDaRequisicao(request);
    if (!usuario) return erro(401, "SESSAO_AUSENTE", SEM_SESSAO, requestId);
    const params = request.nextUrl.searchParams;

    const categoriasLidas = lista(params, "categoria").map((c) => c.toLowerCase());
    const categoriaInvalida = categoriasLidas.find((c) => !ehCategoria(c));
    if (categoriaInvalida) {
      return erro(400, "CATEGORIA_INVALIDA", `Categoria "${categoriaInvalida}" inválida.`, requestId, {
        aceitos: Object.keys(CATEGORIAS),
      });
    }
    const categorias = categoriasLidas.filter(ehCategoria);
    const criticidades = lista(params, "criticidade").map((c) => c.toUpperCase());
    const criticidadeInvalida = criticidades.find((c) => !Object.hasOwn(CRITICIDADES, c));
    if (criticidadeInvalida) {
      return erro(400, "CRITICIDADE_INVALIDA", `Criticidade "${criticidadeInvalida}" inválida.`, requestId, {
        aceitos: ["ALTA", "MÉDIA", "BAIXA"],
      });
    }
    const limite = inteiro(params.get("limite"), LIMITE_PADRAO, 1, LIMITE_MAXIMO);
    const offset = inteiro(params.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
    if (limite === null || offset === null) {
      return erro(400, "PAGINACAO_INVALIDA", `Use "limite" entre 1 e ${LIMITE_MAXIMO} e "offset" ≥ 0.`, requestId);
    }

    const tipos: TipoSinal[] = [...new Set(categorias.map((c) => CATEGORIAS[c]))];
    const severidades: Severidade[] = [...new Set(criticidades.map((c) => CRITICIDADES[c]))];
    const insights = await listarInsights(usuario.id, {
      tipos,
      severidades,
      contaId: params.get("contaId") || undefined,
      reuniaoId: params.get("reuniaoId") || undefined,
    });

    // Contagens sobre todo o resultado filtrado (não só a página), para os KPIs do Dashboard.
    const resumo = {
      total: insights.length,
      porCategoria: { churn: 0, upsell: 0, objection: 0 },
      porCriticidade: { ALTA: 0, MÉDIA: 0, BAIXA: 0 } satisfies Record<Severidade, number>,
    };
    for (const { sinal } of insights) {
      resumo.porCategoria[CATEGORIA_DO_TIPO[sinal.tipo]]++;
      resumo.porCriticidade[sinal.severidade]++;
    }

    const corpo: ListaInsightsApi = {
      dados: insights.slice(offset, offset + limite).map(serializarInsight),
      paginacao: { total: insights.length, limite, offset },
      filtros: {
        categoria: tipos.map((t) => CATEGORIA_DO_TIPO[t]),
        criticidade: severidades,
        contaId: params.get("contaId") || null,
        reuniaoId: params.get("reuniaoId") || null,
      },
      resumo,
    };
    return json(corpo, 200, requestId);
  });
}
