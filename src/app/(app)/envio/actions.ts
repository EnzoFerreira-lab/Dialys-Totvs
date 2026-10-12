"use server";

// A análise em si vai pela API pública (POST /api/v1/reunioes/processar, ver envio-workspace.tsx).
// Aqui ficam só as leituras auxiliares da tela.
import type { ContaResumo } from "@/lib/contas";
import type { ExemploCompleto } from "@/lib/transcricao";
import { buscarExemplo } from "@/server/ai/demo/exemplos";
import { usuarioDaSessao } from "@/server/auth/sessao-pagina";
import { podeAcessarConta } from "@/server/auth/usuarios";
import { listarContasParaEnvio } from "@/server/insights/contas";

export type FalhaAnalise = {
  ok: false;
  titulo: string;
  detalhe: string;
  /** A chave da API não está configurada: a tela mostra o passo a passo. */
  semChave?: boolean;
};

/** Texto e metadados de um exemplo do menu (amostra TOTVS). */
export async function carregarExemplo(id: string): Promise<ExemploCompleto | null> {
  if (typeof id !== "string" || id.length > 120) return null;
  if (!(await usuarioDaSessao())) return null;
  return buscarExemplo(id);
}

/** Empresas do usuário com reunião já analisada, para associar uma nova reunião (seletor "Criar ˅"). */
export async function listarContasAnalisadas(): Promise<ContaResumo[]> {
  const usuario = await usuarioDaSessao();
  if (!usuario) return [];
  return (await listarContasParaEnvio(usuario.id)).filter((conta) => podeAcessarConta(usuario, conta.id));
}
