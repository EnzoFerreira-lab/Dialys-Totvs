// Motor de análise determinístico para os testes do pipeline e da API: dois sinais com citação real
// e um com citação inventada (que a etapa de validação precisa descartar).
import { FRASE_TESTE } from "../../ai/__fixtures__/reuniao-teste";
import type { AnaliseGerada } from "../../ai/analisar-reuniao";
import type { MotorAnalise } from "../motor-analise";

export const CITACAO_INVENTADA = "Vamos cancelar o contrato com a TOTVS no mês que vem.";

export const ANALISE_FALSA: AnaliseGerada = {
  analise: {
    resumoExecutivo: "Cliente satisfeito com o Protheus, avalia a Senior para o RH.",
    mencoesProdutos: [
      { produto: "TOTVS Protheus", status: "EM_USO", contexto: "Atende o backoffice." },
      { produto: "Senior Sistemas", status: "CONCORRENTE", contexto: "Viram uma demo." },
    ],
    sinais: [
      {
        tipo: "CHURN_RISK",
        subtipo: "Menção a Concorrente",
        severidade: "ALTA",
        confianca: 0.9,
        citacaoExata: "O pessoal viu uma demo da Senior e gostou",
        posicaoCaracterStart: 0,
        posicaoCaracterEnd: 0,
        recomendacaoAcao: "Gerente de contas liga para o diretor esta semana.",
      },
      {
        tipo: "OPPORTUNITY",
        subtipo: "Interesse Módulo",
        severidade: "MÉDIA",
        confianca: 0.8,
        citacaoExata: FRASE_TESTE,
        posicaoCaracterStart: 0,
        posicaoCaracterEnd: 0,
        recomendacaoAcao: "Agendar demo do RM Folha integrado ao Protheus.",
      },
      {
        tipo: "OBJECTION",
        subtipo: "Cancelamento",
        severidade: "BAIXA",
        confianca: 0.5,
        citacaoExata: CITACAO_INVENTADA,
        posicaoCaracterStart: 0,
        posicaoCaracterEnd: 0,
        recomendacaoAcao: "—",
      },
    ],
    proximosPassosSugeridos: ["Demo do RM Folha."],
  },
  auditoria: {
    modo: "demonstracao",
    origem: "teste",
    modeloSolicitado: "teste",
    modeloResposta: "teste",
    fallbackUsado: false,
    versaoPrompt: "teste",
    duracaoMs: 0,
    tokens: { entrada: 0, saida: 0, escritaCache: 0, leituraCache: 0 },
    custoEstimadoUsd: 0,
  },
};

export const motorFalso = (gerar: MotorAnalise["gerar"] = async () => structuredClone(ANALISE_FALSA)): MotorAnalise => ({
  nome: "demonstracao",
  gerar,
});
