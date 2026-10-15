// Convenções da API pública /api/v1: erros no mesmo formato, X-Request-Id em toda resposta e
// serialização estável dos recursos (o banco pode mudar sem quebrar quem integra).
import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { chaveConta, codigoReuniao, nomeConta, temDataInformada } from "@/lib/insights";
import type { ReuniaoRegistro } from "../db/banco";
import type { InsightRegistro, ResultadoPersistido } from "../db/repositorio";
import type { Severidade, TipoSinal } from "../ai/schemas";

export const CATEGORIAS = {
  churn: "CHURN_RISK",
  upsell: "OPPORTUNITY",
  objection: "OBJECTION",
} as const satisfies Record<string, TipoSinal>;
export type Categoria = keyof typeof CATEGORIAS;
export const CATEGORIA_DO_TIPO: Record<TipoSinal, Categoria> = {
  CHURN_RISK: "churn",
  OPPORTUNITY: "upsell",
  OBJECTION: "objection",
};

/** hasOwn, não `in`: "constructor" in {} é true. */
export const ehCategoria = (valor: string): valor is Categoria => Object.hasOwn(CATEGORIAS, valor);

export function novoRequestId() {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function json(corpo: unknown, status: number, requestId: string, cabecalhos: Record<string, string> = {}) {
  return Response.json(corpo, {
    status,
    headers: { "X-Request-Id": requestId, "Cache-Control": "no-store", ...cabecalhos },
  });
}

/** Corpo de erro padrão: { erro: { codigo, mensagem, detalhe?, requestId } }. */
export function erro(status: number, codigo: string, mensagem: string, requestId: string, detalhe?: unknown) {
  return json({ erro: { codigo, mensagem, ...(detalhe === undefined ? {} : { detalhe }), requestId } }, status, requestId);
}

/** Envolve um handler: erro não tratado vira 500 no formato padrão, com log no servidor. */
export async function comTratamento(nome: string, handler: (requestId: string) => Promise<Response>) {
  const requestId = novoRequestId();
  try {
    return await handler(requestId);
  } catch (falha) {
    // Sinais internos do Next (ex.: prerender interrompido ao ler searchParams) não são falha da API.
    unstable_rethrow(falha);
    console.error(`[dialys/api] ${nome} falhou (${requestId})`, falha);
    return erro(500, "ERRO_INTERNO", "Erro inesperado no servidor.", requestId);
  }
}

export const linkReuniao = (id: string) => `/api/v1/reunioes/${id}`;

export function serializarReuniao(
  reuniao: ReuniaoRegistro,
  resultado: ResultadoPersistido | null,
  opcoes: { incluirTranscricao?: boolean } = {},
) {
  // Transcrição removida (remoção lógica): o registro e o código ficam; texto e análise derivada, não.
  const removida = Boolean(reuniao.transcricaoRemovida);
  if (removida) resultado = null;
  return {
    id: reuniao.id,
    /** Número sequencial da conta, estável (o código exibido é o ID da TOTVS quando existe; ver codigoReuniao). */
    numero: reuniao.numero,
    codigo: codigoReuniao(reuniao),
    status: reuniao.status,
    origem: reuniao.origem,
    ...(reuniao.nomeArquivo ? { nomeArquivo: reuniao.nomeArquivo } : {}),
    contaId: reuniao.contaId ?? null,
    contaNome: reuniao.contaNome ?? null,
    /** Empresa na Central de Insights (link: /insights?conta=<id>). */
    conta: { id: chaveConta(reuniao), nome: nomeConta(reuniao) },
    contexto: reuniao.contexto ?? null,
    /** false: a reunião não trouxe a própria data; criadaEm é a data do processamento, não a da reunião. */
    dataInformada: temDataInformada(reuniao),
    criadaEm: reuniao.criadaEm,
    atualizadaEm: reuniao.atualizadaEm,
    etapas: reuniao.etapas,
    transcricaoRemovidaEm: reuniao.transcricaoRemovida?.em ?? null,
    ...(opcoes.incluirTranscricao ? { transcricao: removida ? null : reuniao.transcricao } : {}),
    resultado: resultado
      ? {
          analiseId: resultado.analiseId,
          analise: {
            ...resultado.analise,
            sinais: resultado.analise.sinais.map((sinal) => ({
              id: sinal.id,
              categoria: CATEGORIA_DO_TIPO[sinal.tipo],
              tipo: sinal.tipo,
              subtipo: sinal.subtipo,
              severidade: sinal.severidade,
              confianca: sinal.confianca,
              citacaoExata: sinal.citacaoExata,
              posicaoCaracterStart: sinal.posicaoCaracterStart,
              posicaoCaracterEnd: sinal.posicaoCaracterEnd,
              recomendacaoAcao: sinal.recomendacaoAcao,
              evidencia: sinal.evidencia,
            })),
          },
          evidencias: resultado.evidencias,
          auditoria: resultado.auditoria,
        }
      : null,
    falha: reuniao.falha ? { codigo: reuniao.falha.codigo, titulo: reuniao.falha.titulo, detalhe: reuniao.falha.detalhe, ...(reuniao.falha.semChave ? { semChave: true } : {}) } : null,
    links: { self: linkReuniao(reuniao.id) },
  };
}

export function serializarInsight({ sinal, reuniao, sincronizacao }: InsightRegistro) {
  return {
    id: sinal.id,
    categoria: CATEGORIA_DO_TIPO[sinal.tipo],
    tipo: sinal.tipo,
    subtipo: sinal.subtipo,
    criticidade: sinal.severidade satisfies Severidade,
    confianca: sinal.confianca,
    citacaoExata: sinal.citacaoExata,
    posicao: { inicio: sinal.posicaoCaracterStart, fim: sinal.posicaoCaracterEnd },
    recomendacaoAcao: sinal.recomendacaoAcao,
    criadoEm: sinal.criadoEm,
    conta: { id: chaveConta(reuniao), nome: nomeConta(reuniao) },
    reuniao: {
      id: reuniao.id,
      codigo: codigoReuniao(reuniao),
      dataInformada: temDataInformada(reuniao),
      contaId: reuniao.contaId ?? null,
      contaNome: reuniao.contaNome ?? null,
      contexto: reuniao.contexto ?? null,
      criadaEm: reuniao.criadaEm,
      link: linkReuniao(reuniao.id),
    },
    crm: sincronizacao
      ? { sincronizado: true, protocolo: sincronizacao.protocolo, sincronizadoEm: sincronizacao.enviadaEm }
      : { sincronizado: false },
  };
}

/** Formatos de resposta da API, para o frontend tipar o que recebe. */
export type ReuniaoApi = ReturnType<typeof serializarReuniao>;
export type InsightApi = ReturnType<typeof serializarInsight>;
export type ErroApi = { erro: { codigo: string; mensagem: string; detalhe?: unknown; requestId: string } };
export type ListaInsightsApi = {
  dados: InsightApi[];
  paginacao: { total: number; limite: number; offset: number };
  filtros: { categoria: Categoria[]; criticidade: Severidade[]; contaId: string | null; reuniaoId: string | null };
  resumo: { total: number; porCategoria: Record<Categoria, number>; porCriticidade: Record<Severidade, number> };
};
export type SincronizacaoCrmApi = {
  insightId: string;
  sincronizado: true;
  protocolo: string;
  destino: "simulado";
  sincronizadoEm: string;
  jaSincronizado: boolean;
  payload: unknown;
};
