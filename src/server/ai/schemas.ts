// Contratos da análise de reuniões. Os mesmos schemas definem o formato exigido do Claude
// (structured outputs), validam a resposta e tipam o restante do sistema.
import { z } from "zod";

export const PRODUTOS_TOTVS = [
  "TOTVS Protheus",
  "TOTVS RM",
  "TOTVS Fluig",
  "TOTVS Techfin",
  "RD Station",
  "TOTVS Assinatura Eletrônica",
  "TOTVS Transmite",
  "TOTVS Cloud",
  "TOTVS Analytics",
] as const;
export const CONCORRENTES = [
  "Senior Sistemas",
  "SAP",
  "Oracle",
  "Sankhya",
  "Omie",
  "Ploomes",
  "Salesforce",
  "Mercanet",
  "Power BI",
] as const;

export const ProdutoTotvsSchema = z
  .enum([...PRODUTOS_TOTVS, ...CONCORRENTES])
  .describe("Produto do ecossistema TOTVS ou concorrente citado. Use exatamente um dos nomes da lista.");

export const TipoSinalSchema = z.enum(["CHURN_RISK", "OPPORTUNITY", "OBJECTION"]);
export const SeveridadeSchema = z.enum(["ALTA", "MÉDIA", "BAIXA"]);
export const StatusProdutoSchema = z.enum(["EM_USO", "INTERESSE", "INSATISFAÇÃO", "CONCORRENTE"]);

export const SinalNegocioSchema = z.object({
  tipo: TipoSinalSchema,
  subtipo: z
    .string()
    .describe('Categoria curta do sinal, ex.: "Insatisfação Suporte", "Interesse Módulo", "Dúvida ROI/Preço".'),
  severidade: SeveridadeSchema,
  confianca: z.number().min(0).max(1).describe("Certeza de que o sinal é real, dada a evidência (0.0 a 1.0)."),
  citacaoExata: z
    .string()
    .describe("Trecho copiado caractere por caractere da transcrição, sem reticências ou aspas acrescentadas."),
  posicaoCaracterStart: z
    .number()
    .int()
    .min(0)
    .describe("Índice (base 0) do início da citação na transcrição. Estimativa: o sistema recalcula."),
  posicaoCaracterEnd: z.number().int().min(0).describe("Índice (exclusivo) do fim da citação na transcrição."),
  recomendacaoAcao: z.string().describe("Ação prática para a gestão comercial: quem acionar, o quê e quando."),
});

export const MencaoProdutoSchema = z.object({
  produto: ProdutoTotvsSchema,
  status: StatusProdutoSchema,
  contexto: z.string().describe("Como o produto aparece na conversa, em uma frase."),
});

export const AnaliseReuniaoSchema = z.object({
  resumoExecutivo: z.string().describe("Resumo de no máximo 3 linhas para o Diretor Comercial."),
  mencoesProdutos: z.array(MencaoProdutoSchema),
  sinais: z.array(SinalNegocioSchema),
  proximosPassosSugeridos: z.array(z.string()).describe("De 1 a 5 ações, da mais para a menos prioritária."),
});

export type ProdutoTotvs = z.infer<typeof ProdutoTotvsSchema>;
export type TipoSinal = z.infer<typeof TipoSinalSchema>;
export type Severidade = z.infer<typeof SeveridadeSchema>;
export type StatusProduto = z.infer<typeof StatusProdutoSchema>;
export type SinalNegocio = z.infer<typeof SinalNegocioSchema>;
export type MencaoProduto = z.infer<typeof MencaoProdutoSchema>;
export type AnaliseReuniao = z.infer<typeof AnaliseReuniaoSchema>;
