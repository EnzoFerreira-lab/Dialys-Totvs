// Cenários do modo demonstração: análises prontas em JSON (data/demo/cenarios/*.json), sem chamar IA.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { normalizarBusca } from "@/lib/formatar";
import { AnaliseReuniaoSchema, SinalNegocioSchema } from "../schemas";

export const PASTA_CENARIOS = path.join(process.cwd(), "data", "demo", "cenarios");

/** No JSON as posições são opcionais: o validador de evidências sempre as recalcula. */
const SinalCenarioSchema = SinalNegocioSchema.extend({
  posicaoCaracterStart: z.number().int().min(0).default(0),
  posicaoCaracterEnd: z.number().int().min(0).default(0),
});

export const CenarioSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  /** Conta fictícia (src/lib/mock/contas.ts) selecionada ao carregar o exemplo. */
  contaId: z.string().optional(),
  transcricao: z.string().min(1),
  analise: AnaliseReuniaoSchema.extend({ sinais: z.array(SinalCenarioSchema) }),
});

export type Cenario = z.infer<typeof CenarioSchema>;

export type ResultadoLeitura = { cenarios: Cenario[]; erros: Array<{ arquivo: string; erro: string }> };

/**
 * Lê todos os .json da pasta. Arquivo inválido não derruba a demo: entra em `erros`
 * (mostrado no terminal) e os demais continuam valendo.
 */
export function lerCenarios(): ResultadoLeitura {
  const resultado: ResultadoLeitura = { cenarios: [], erros: [] };
  let arquivos: string[];
  try {
    arquivos = readdirSync(PASTA_CENARIOS).filter((nome) => nome.toLowerCase().endsWith(".json")).sort();
  } catch {
    return resultado;
  }

  for (const arquivo of arquivos) {
    try {
      // Caminho escrito de forma estática para o build rastrear só data/demo/cenarios.
      const conteudo = readFileSync(path.join(process.cwd(), "data", "demo", "cenarios", arquivo), "utf8").replace(
        /^﻿/,
        "",
      );
      const validado = CenarioSchema.safeParse(JSON.parse(conteudo));
      if (validado.success) {
        resultado.cenarios.push(validado.data);
      } else {
        const problemas = validado.error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`);
        resultado.erros.push({ arquivo, erro: problemas.join("; ") });
      }
    } catch (erro) {
      resultado.erros.push({ arquivo, erro: erro instanceof Error ? erro.message : String(erro) });
    }
  }
  for (const { arquivo, erro } of resultado.erros) console.warn(`[dialys/demo] cenário ignorado (${arquivo}): ${erro}`);
  return resultado;
}

const normalizar = (texto: string) =>
  normalizarBusca(texto)
    .replace(/[“”"'‘’]/g, "")
    .replace(/\.\.\.|…/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Escolhe o cenário do texto colado: a transcrição inteira do cenário contida no texto vence;
 * senão, o cenário com mais citações presentes no texto. Nenhuma citação presente: null.
 */
export function escolherCenario(texto: string, cenarios: Cenario[]): Cenario | null {
  const alvo = normalizar(texto);
  let melhor: Cenario | null = null;
  let melhorPontos = 0;

  for (const cenario of cenarios) {
    if (alvo.includes(normalizar(cenario.transcricao))) return cenario;
    const pontos = cenario.analise.sinais.filter((sinal) => {
      const citacao = normalizar(sinal.citacaoExata);
      return citacao.length > 0 && alvo.includes(citacao);
    }).length;
    if (pontos > melhorPontos) {
      melhor = cenario;
      melhorPontos = pontos;
    }
  }
  return melhor;
}
