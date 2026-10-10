// Resumo agregado da carteira analisada: KPIs do Painel Executivo e briefing do assistente Dialys (GET /api/v1/resumo).
// Tudo sai das reuniões concluídas no banco; nada é fixo.
import { chaveConta, type TipoSinal } from "@/lib/insights";
import { extrairValorReais } from "@/lib/valores";
import { serializarInsight, type Categoria } from "../api/http";
import { lerOperacaoComercial } from "../config/operacao";
import { nomeMotorAtivo } from "../pipeline/motor-analise";
import { listarAnalisesConcluidas, listarInsights, type InsightRegistro } from "../db/repositorio";
import { listarContasInsight } from "./contas";

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const PRIORIDADE_CATEGORIA = { CHURN_RISK: 0, OPPORTUNITY: 1, OBJECTION: 2 } as const;
const MAXIMO_URGENCIAS = 3;
const MAXIMO_AGENDA = 4;
const CATEGORIA: Record<TipoSinal, Categoria> = { churn: "churn", oportunidade: "upsell", objecao: "objection" };

/**
 * Matriz de urgência do assistente Dialys: o insight mais crítico de cada categoria (churn → oportunidade → objeção);
 * se faltar alguma categoria, completa com os próximos mais críticos. `insights` já vem do mais crítico
 * e recente para o menos.
 */
function escolherUrgencias(insights: InsightRegistro[]) {
  const escolhidos: InsightRegistro[] = [];
  for (const tipo of ["CHURN_RISK", "OPPORTUNITY", "OBJECTION"] as const) {
    const primeiro = insights.find((i) => i.sinal.tipo === tipo);
    if (primeiro) escolhidos.push(primeiro);
  }
  for (const insight of insights) {
    if (escolhidos.length >= MAXIMO_URGENCIAS) break;
    if (!escolhidos.includes(insight)) escolhidos.push(insight);
  }
  return escolhidos
    .slice(0, MAXIMO_URGENCIAS)
    .sort((a, b) => PRIORIDADE_CATEGORIA[a.sinal.tipo] - PRIORIDADE_CATEGORIA[b.sinal.tipo]);
}

/**
 * Churn em destaque no radar: o de maior valor em reais citado na reunião (citação ou recomendação);
 * se nenhum cita valor, o mais crítico e recente.
 */
function escolherRiscoDestacado(insights: InsightRegistro[]) {
  const churn = insights.filter((i) => i.sinal.tipo === "CHURN_RISK");
  if (churn.length === 0) return null;
  const comValor = churn
    .map((insight) => ({ insight, valor: extrairValorReais(`${insight.sinal.citacaoExata} ${insight.sinal.recomendacaoAcao}`) }))
    .filter((c): c is { insight: InsightRegistro; valor: number } => c.valor !== null)
    .sort((a, b) => b.valor - a.valor);
  const escolhido = comValor[0] ?? { insight: churn[0], valor: null };
  return { insight: serializarInsight(escolhido.insight), valorEmRisco: escolhido.valor };
}

/**
 * `podeVer`: filtro de escopo do usuário (o briefing do assistente passa a permissão dele); sem filtro,
 * a carteira inteira (rota /api/v1/resumo do piloto).
 */
export async function montarResumo(agora = new Date(), podeVer: (contaId: string) => boolean = () => true) {
  const [todasAnalises, todasContas, todosInsights] = await Promise.all([listarAnalisesConcluidas(), listarContasInsight(), listarInsights()]);
  const analises = todasAnalises.filter((a) => podeVer(chaveConta(a.reuniao)));
  const contas = todasContas.filter((c) => podeVer(c.id));
  const insights = todosInsights.filter((i) => podeVer(chaveConta(i.reuniao)));

  const contarSinais = (tipo: InsightRegistro["sinal"]["tipo"]) => insights.filter((i) => i.sinal.tipo === tipo).length;
  const comNps = contas.filter((conta) => conta.nps !== undefined);
  const npsMedio = comNps.length ? Math.round((comNps.reduce((soma, c) => soma + c.nps!, 0) / comNps.length) * 10) / 10 : null;

  return {
    geradoEm: agora.toISOString(),
    /** Motor das análises: "nemotron" (gratuito), "claude" ou "demonstracao" (regras locais, sem IA). */
    modoAnalise: nomeMotorAtivo(),
    operacao: lerOperacaoComercial(),
    kpis: {
      reunioesAnalisadas: analises.length,
      reunioesUltimos7Dias: analises.filter((a) => agora.getTime() - Date.parse(a.reuniao.criadaEm) <= SETE_DIAS_MS).length,
      contasAnalisadas: contas.length,
      /** Contas cuja última reunião tem sinal de churn (mesmo critério do filtro da Central de Insights). */
      contasEmRiscoChurn: contas.filter((c) => c.sinais.some((s) => s.tipo === "churn")).length,
      contasEmRiscoCritico: contas.filter((c) => c.sinais.some((s) => s.tipo === "churn" && s.urgencia === "alta")).length,
      sinais: { churn: contarSinais("CHURN_RISK"), upsell: contarSinais("OPPORTUNITY"), objection: contarSinais("OBJECTION") },
      /** Média do NPS por conta (só reuniões que trouxeram NPS, como as exportadas pela TOTVS). */
      npsMedio,
      contasComNps: comNps.length,
    },
    urgencias: escolherUrgencias(insights).map(serializarInsight),
    riscoDestacado: escolherRiscoDestacado(insights),
    /** Ações sugeridas para hoje: a recomendação principal das contas mais críticas (não há calendário integrado). */
    agenda: contas
      .filter((conta) => conta.sinais.length > 0)
      .slice(0, MAXIMO_AGENDA)
      .map((conta) => ({
        conta: { id: conta.id, nome: conta.nome },
        categoria: CATEGORIA[conta.sinais[0].tipo],
        urgencia: conta.sinais[0].urgencia,
        acao: conta.acao,
        reuniaoId: conta.reuniaoId,
      })),
  };
}

export type ResumoCarteira = Awaited<ReturnType<typeof montarResumo>>;
