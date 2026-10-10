// Qual motor faz a etapa de Análise IA, e como cada erro dele vira uma falha legível.
import Anthropic from "@anthropic-ai/sdk";
import type { ContextoReuniao } from "@/lib/transcricao";
import { ErroAnalise, gerarAnalise, type AnaliseGerada } from "../ai/analisar-reuniao";
import { gerarAnaliseDemo } from "../ai/demo/analisar-reuniao-demo";
import { ErroApiNemotron, gerarAnaliseNemotron, temChaveNemotron } from "../ai/analisar-reuniao-nemotron";
import type { FalhaRegistrada } from "../db/banco";

export type MotorAnalise = {
  nome: "claude" | "nemotron" | "demonstracao";
  gerar: (transcricao: string, contexto?: ContextoReuniao) => Promise<AnaliseGerada>;
};

export const temChaveClaude = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/**
 * Simulação local quando pedida (DIALYS_MODO_DEMO=true) ou quando não há chave nenhuma (nem do
 * Nemotron, nem do Claude): a demonstração não deve parar por isso. Com DIALYS_MODO_DEMO=false e sem
 * chave, a análise falha com o passo a passo de configuração.
 */
export function usarModoDemonstracao() {
  return (
    process.env.DIALYS_MODO_DEMO === "true" ||
    (!temChaveNemotron() && !temChaveClaude() && process.env.DIALYS_MODO_DEMO !== "false")
  );
}

/** Motor que analisa as reuniões: Nemotron (gratuito) tem prioridade; o Claude entra só sem a chave dele. */
export function nomeMotorAtivo(): MotorAnalise["nome"] {
  if (usarModoDemonstracao()) return "demonstracao";
  return temChaveNemotron() || !temChaveClaude() ? "nemotron" : "claude";
}

export function escolherMotor(opcoes: { atrasoDemoMs?: number } = {}): MotorAnalise {
  const nome = nomeMotorAtivo();
  if (nome === "demonstracao") {
    return {
      nome,
      gerar: (transcricao, contexto) => gerarAnaliseDemo(transcricao, { contexto, atrasoMs: opcoes.atrasoDemoMs }),
    };
  }
  if (nome === "nemotron") {
    return {
      nome,
      gerar: (transcricao) => {
        if (!temChaveNemotron()) throw new ErroSemChave();
        return gerarAnaliseNemotron(transcricao);
      },
    };
  }
  return {
    nome: "claude",
    gerar: (transcricao) => {
      if (!temChaveClaude()) throw new ErroSemChave();
      // TODO(T02): exigir usuário autenticado antes de publicar. Sem isso qualquer visitante da URL
      // dispara análises (e gasta créditos da API).
      return gerarAnalise(transcricao);
    },
  };
}

class ErroSemChave extends Error {
  constructor() {
    super("OPENROUTER_API_KEY não configurada.");
    this.name = "ErroSemChave";
  }
}

const falha = (httpStatus: number, codigo: string, titulo: string, detalhe: string, extra: Partial<FalhaRegistrada> = {}) => ({
  httpStatus,
  codigo,
  titulo,
  detalhe,
  ...extra,
});

const FALHAS_ANALISE: Record<ErroAnalise["motivo"], FalhaRegistrada> = {
  transcricao_vazia: falha(400, "TRANSCRICAO_VAZIA", "Transcrição vazia", "Cole o texto da reunião ou anexe um arquivo .txt."),
  recusa: falha(422, "ANALISE_RECUSADA", "A IA não analisou esta transcrição", "O modelo recusou o conteúdo. Revise o texto e tente novamente."),
  resposta_truncada: falha(422, "ANALISE_TRUNCADA", "Análise incompleta", "A resposta passou do limite de tamanho. Tente uma transcrição mais curta."),
  saida_invalida: falha(502, "SAIDA_INVALIDA", "Resposta fora do formato", "A IA respondeu fora do formato esperado. Tente enviar novamente."),
};

/** Converte qualquer erro do motor em uma falha registrável, do mais específico para o mais genérico. */
export function traduzirErroAnalise(erro: unknown): FalhaRegistrada {
  if (erro instanceof ErroAnalise) return FALHAS_ANALISE[erro.motivo];
  if (erro instanceof ErroSemChave) {
    return falha(500, "CHAVE_NAO_CONFIGURADA", "Chave da API não configurada", "A análise usa o Nemotron gratuito via OpenRouter, que precisa de uma chave.", {
      semChave: true,
    });
  }
  if (erro instanceof ErroApiNemotron) return traduzirErroNemotron(erro);
  // Todas as abaixo estendem APIError: a ordem importa.
  if (erro instanceof Anthropic.AuthenticationError) {
    return falha(500, "CHAVE_INVALIDA", "Chave da API inválida", "Confira o valor de ANTHROPIC_API_KEY no arquivo .env.local.", {
      semChave: true,
    });
  }
  if (erro instanceof Anthropic.PermissionDeniedError) {
    return falha(502, "SEM_PERMISSAO_MODELO", "Sem permissão na API", "A chave não tem acesso ao modelo Claude Opus 5.5. Verifique a conta no console.");
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return falha(503, "LIMITE_DE_USO", "Limite de uso atingido", "Muitas análises em pouco tempo. Aguarde alguns segundos e tente de novo.");
  }
  if (erro instanceof Anthropic.BadRequestError) {
    // Inclui saldo de créditos insuficiente; a mensagem da API explica o motivo.
    return falha(502, "API_RECUSOU", "A API recusou a requisição", erro.message);
  }
  if (erro instanceof Anthropic.APIConnectionError) {
    return falha(502, "SEM_CONEXAO_API", "Sem conexão com a API do Claude", "Verifique a internet e tente novamente.");
  }
  if (erro instanceof Anthropic.APIError) {
    return falha(502, "API_INDISPONIVEL", "Serviço do Claude indisponível", `Erro ${erro.status ?? "desconhecido"}. Tente novamente em instantes.`);
  }
  console.error("[dialys/pipeline] erro inesperado na análise", erro);
  return falha(500, "ERRO_INTERNO", "Erro inesperado", "Não foi possível concluir a análise. Veja o terminal do servidor para detalhes.");
}

function traduzirErroNemotron(erro: ErroApiNemotron): FalhaRegistrada {
  switch (erro.status) {
    case 0:
      return falha(502, "SEM_CONEXAO_API", "Sem conexão com o Nemotron", "Verifique a internet e tente novamente. Se a reunião for longa, o modelo gratuito pode ter passado do tempo limite.");
    case 401:
      return falha(500, "CHAVE_INVALIDA", "Chave da API inválida", "Confira o valor de OPENROUTER_API_KEY no arquivo .env.local.", { semChave: true });
    case 402:
      return falha(502, "API_RECUSOU", "A API recusou a requisição", `${erro.message} Confira se o modelo configurado é a versão gratuita (termina em ":free").`);
    case 403:
      return falha(502, "SEM_PERMISSAO_MODELO", "Sem permissão na API", erro.message);
    case 404:
      return falha(502, "MODELO_NAO_ENCONTRADO", "Modelo não encontrado", `${erro.message} Confira DIALYS_NEMOTRON_MODELO.`);
    case 429:
      return falha(503, "LIMITE_DE_USO", "Limite de uso atingido", "O plano gratuito do Nemotron tem limite por minuto e por dia. Aguarde e tente de novo.");
    default:
      return erro.status >= 400 && erro.status < 500
        ? falha(502, "API_RECUSOU", "A API recusou a requisição", erro.message)
        : falha(502, "API_INDISPONIVEL", "Serviço do Nemotron indisponível", `Erro ${erro.status}: ${erro.message}. Tente novamente em instantes.`);
  }
}
