// Contrato da agenda "Minha agenda", igual para dados reais e de demonstração. Compartilhado entre a
// tela (validação do formulário) e o servidor (que valida de novo e decide permissões).
// Compromisso é um evento com horário marcado pelo usuário. Ação sugerida pelo Dialys NÃO é compromisso:
// nada aqui é criado a partir de recomendações da IA.
import { z } from "zod";

export type StatusCompromisso = "agendado" | "realizado" | "cancelado";

export const ROTULO_STATUS: Record<StatusCompromisso, string> = {
  agendado: "Agendado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

/** Formato público (API e tela). Instantes em ISO UTC; a tela exibe no fuso informado pela API. */
export type Compromisso = {
  id: string;
  titulo: string;
  /** Cliente associado; null para compromissos internos. */
  cliente: { id: string; nome: string } | null;
  inicio: string;
  fim: string;
  status: StatusCompromisso;
  local: string | null;
  observacoes: string | null;
  origem: "demonstracao" | "usuario";
  criadoEm: string;
  atualizadoEm: string;
};

export type ModoDados = "demonstracao" | "real";

export type ListaAgendaApi = {
  modo: ModoDados;
  fuso: string;
  /** Data de hoje ("AAAA-MM-DD") no fuso configurado, segundo o relógio do servidor. */
  hoje: string;
  periodo: { de: string; ate: string };
  dados: Compromisso[];
};

export const LIMITE_TITULO = 120;
export const LIMITE_LOCAL = 120;
export const LIMITE_OBSERVACOES = 1000;

const textoOpcional = (limite: number, campo: string) =>
  z
    .string()
    .trim()
    .max(limite, `${campo}: no máximo ${limite} caracteres.`)
    .nullable()
    .optional()
    .transform((valor) => (valor ? valor : null));

const instante = (campo: string) => z.iso.datetime({ offset: true, message: `${campo}: data e hora inválidas.` });

const campos = {
  titulo: z.string({ message: "Informe o título." }).trim().min(1, "Informe o título.").max(LIMITE_TITULO, `Título: no máximo ${LIMITE_TITULO} caracteres.`),
  contaId: z.string().trim().max(200).nullable().optional().transform((valor) => (valor ? valor : null)),
  inicio: instante("Início"),
  fim: instante("Término"),
  local: textoOpcional(LIMITE_LOCAL, "Local"),
  observacoes: textoOpcional(LIMITE_OBSERVACOES, "Observações"),
  status: z.enum(["agendado", "realizado", "cancelado"], { message: "Status inválido." }),
};

export const terminoDepoisDoInicio = (dados: { inicio: string; fim: string }) => Date.parse(dados.fim) > Date.parse(dados.inicio);
const MENSAGEM_TERMINO = "O término deve ser depois do início.";

/** Cadastro: título, início e término são obrigatórios; status começa "agendado". */
export const NovoCompromissoSchema = z
  .object({ ...campos, status: campos.status.optional().default("agendado") })
  .strict()
  .refine(terminoDepoisDoInicio, { path: ["fim"], message: MENSAGEM_TERMINO });

/** Edição: só os campos enviados mudam; o servidor revalida o resultado completo. */
export const AlteracaoCompromissoSchema = z
  .object({
    titulo: campos.titulo.optional(),
    // Sem transform: campo ausente não muda o cliente; null ou "" remove.
    contaId: z.string().trim().max(200).nullable().optional(),
    inicio: campos.inicio.optional(),
    fim: campos.fim.optional(),
    local: z.string().trim().max(LIMITE_LOCAL, `Local: no máximo ${LIMITE_LOCAL} caracteres.`).nullable().optional(),
    observacoes: z.string().trim().max(LIMITE_OBSERVACOES, `Observações: no máximo ${LIMITE_OBSERVACOES} caracteres.`).nullable().optional(),
    status: campos.status.optional(),
  })
  .strict()
  .refine((dados) => Object.keys(dados).length > 0, { message: "Nada para alterar." });

export type NovoCompromisso = z.input<typeof NovoCompromissoSchema>;
export type AlteracaoCompromisso = z.input<typeof AlteracaoCompromissoSchema>;

export { MENSAGEM_TERMINO };
