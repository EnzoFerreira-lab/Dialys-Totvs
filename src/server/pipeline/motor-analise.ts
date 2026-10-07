// Qual motor faz a etapa de Análise IA, e como cada erro dele vira uma falha legível.
import Anthropic from "@anthropic-ai/sdk";
import type { ContextoReuniao } from "@/lib/transcricao";
import { ErroAnalise, gerarAnalise, type AnaliseGerada } from "../ai/analisar-reuniao";
import { gerarAnaliseDemo } from "../ai/demo/analisar-reuniao-demo";
import type { FalhaRegistrada } from "../db/banco";

export type MotorAnalise = {
  nome: "claude" | "demonstracao";
  gerar: (transcricao: string, contexto?: ContextoReuniao) => Promise<AnaliseGerada>;
};

export const temChaveClaude = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/**
 * Simulação local quando pedida (DIALYS_MODO_DEMO=true) ou quando não há chave: sem chave não há
 * como chamar o Claude, e a demonstração não deve parar por isso. Com DIALYS_MODO_DEMO=false e sem
 * chave, a análise falha com o passo a passo de configuração.
 */
export function usarModoDemonstracao() {
  return process.env.DIALYS_MODO_DEMO === "true" || (!temChaveClaude() && process.env.DIALYS_MODO_DEMO !== "false");
}

export function escolherMotor(opcoes: { atrasoDemoMs?: number } = {}): MotorAnalise {
  if (usarModoDemonstracao()) {
    return {
      nome: "demonstracao",
      gerar: (transcricao, contexto) => gerarAnaliseDemo(transcricao, { contexto, atrasoMs: opcoes.atrasoDemoMs }),
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
    super("ANTHROPIC_API_KEY não configurada.");
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
    return falha(500, "CHAVE_NAO_CONFIGURADA", "Chave da API não configurada", "A análise usa a API do Claude, que precisa de uma chave.", {
      semChave: true,
    });
  }
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
