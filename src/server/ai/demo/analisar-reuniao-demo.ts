// Modo demonstração: mesma saída de analisarReuniao(), sem chamar IA e sem custo.
// Ativado por DIALYS_MODO_DEMO=true ou pela ausência de chave. Os resultados passam pelo mesmo validador de evidências.
import type { ContextoReuniao } from "@/lib/transcricao";
import type { AnaliseGerada, ResultadoAnalise } from "../analisar-reuniao";
import { validarEvidencias } from "../validar-evidencia";
import { escolherCenario, lerCenarios, type Cenario } from "./cenarios";
import { analisarPorRegras } from "./heuristica";

export const MODELO_DEMO = "modo-demonstracao";

export type OpcoesDemo = {
  /** Espera simulada para a tela mostrar o estado "analisando" (ms). */
  atrasoMs?: number;
  /** Injetável para testes; por padrão lê data/demo/cenarios. */
  cenarios?: Cenario[];
  /** Metadados da reunião (segmento, NPS...), quando ela veio de um JSON da TOTVS. */
  contexto?: ContextoReuniao;
};

export async function analisarReuniaoDemo(texto: string, opcoes: OpcoesDemo = {}): Promise<ResultadoAnalise> {
  const { analise, auditoria } = await gerarAnaliseDemo(texto, opcoes);
  const { sinaisValidos, ...evidencias } = validarEvidencias(texto, analise.sinais);
  return { analise: { ...analise, sinais: sinaisValidos }, evidencias, auditoria };
}

/** Só a geração (cenário roteirizado ou regras locais), sem validar as citações. */
export async function gerarAnaliseDemo(texto: string, opcoes: OpcoesDemo = {}): Promise<AnaliseGerada> {
  const inicio = performance.now();
  const cenarios = opcoes.cenarios ?? lerCenarios().cenarios;
  const cenario = escolherCenario(texto, cenarios);
  const analise = cenario ? cenario.analise : analisarPorRegras(texto, opcoes.contexto);

  await new Promise((resolver) => setTimeout(resolver, opcoes.atrasoMs ?? 3500));

  return {
    analise,
    auditoria: {
      modo: "demonstracao",
      origem: cenario ? `cenário "${cenario.id}"` : "regras locais",
      modeloSolicitado: MODELO_DEMO,
      modeloResposta: MODELO_DEMO,
      fallbackUsado: false,
      versaoPrompt: "demo",
      duracaoMs: Math.round(performance.now() - inicio),
      tokens: { entrada: 0, saida: 0, escritaCache: 0, leituraCache: 0 },
      custoEstimadoUsd: 0,
    },
  };
}
