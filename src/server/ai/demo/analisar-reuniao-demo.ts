// Motor local por regras: mesma saída de analisarReuniao(), sem chamar IA e sem custo. É a reserva
// quando não há chave do Claude (ou com DIALYS_MODO_DEMO=true). Os resultados passam pelo mesmo
// validador de evidências; a auditoria registra modo "demonstracao" e origem "regras locais".
import type { ContextoReuniao } from "@/lib/transcricao";
import type { AnaliseGerada, ResultadoAnalise } from "../analisar-reuniao";
import { validarEvidencias } from "../validar-evidencia";
import { analisarPorRegras } from "./heuristica";

export const MODELO_DEMO = "regras-locais";

export type OpcoesDemo = {
  /** Espera para a tela mostrar o estado "analisando" (ms). */
  atrasoMs?: number;
  /** Metadados da reunião (segmento, NPS...), quando ela veio de um JSON da TOTVS. */
  contexto?: ContextoReuniao;
};

export async function analisarReuniaoDemo(texto: string, opcoes: OpcoesDemo = {}): Promise<ResultadoAnalise> {
  const { analise, auditoria } = await gerarAnaliseDemo(texto, opcoes);
  const { sinaisValidos, ...evidencias } = validarEvidencias(texto, analise.sinais);
  return { analise: { ...analise, sinais: sinaisValidos }, evidencias, auditoria };
}

/** Só a geração por regras, sem validar as citações. */
export async function gerarAnaliseDemo(texto: string, opcoes: OpcoesDemo = {}): Promise<AnaliseGerada> {
  const inicio = performance.now();
  const analise = analisarPorRegras(texto, opcoes.contexto);

  await new Promise((resolver) => setTimeout(resolver, opcoes.atrasoMs ?? 1500));

  return {
    analise,
    auditoria: {
      modo: "demonstracao",
      origem: "regras locais",
      modeloSolicitado: MODELO_DEMO,
      modeloResposta: MODELO_DEMO,
      fallbackUsado: false,
      versaoPrompt: "regras",
      duracaoMs: Math.round(performance.now() - inicio),
      tokens: { entrada: 0, saida: 0, escritaCache: 0, leituraCache: 0 },
      custoEstimadoUsd: 0,
    },
  };
}
