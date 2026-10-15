// Formato que a Central de Insights exibe: uma entrada por empresa, montada no servidor a partir das
// reuniões analisadas (src/server/insights/contas.ts). Só tipos e regras puras: roda no navegador também.
import type { Saude } from "./saude";

export type TipoSinal = "churn" | "oportunidade" | "objecao";
export type Urgencia = "alta" | "media";
export type ContextoProduto = "em_uso" | "expansao" | "insatisfacao" | "concorrente";
export type TipoDestaque = TipoSinal | "produto" | "concorrente";

export type Sinal = { tipo: TipoSinal; urgencia: Urgencia };

export type MencaoProduto = {
  contexto: ContextoProduto;
  nome: string;
  detalhe?: string;
  /** Como o produto aparece na conversa (dica ao passar o mouse). */
  descricao?: string;
};

export type Evidencia = {
  texto: string;
  /** Posição na gravação (hh:mm:ss), quando a transcrição tem tempo. */
  instante?: string;
  falante: string;
  /** `urgencia` define o tom do destaque (churn crítico em vermelho, atenção em laranja). */
  destaques: Array<{ trecho: string; tipo: TipoDestaque; urgencia?: Urgencia }>;
};

/** Uma reunião no histórico da conta (card da carteira e seletor da Central). */
export type ReuniaoHistorico = {
  id: string;
  /** "Reunião #1394492" (ID da TOTVS) ou "Reunião 003": código estável da reunião (ver codigoReuniao). */
  codigo: string;
  /** AAAA-MM-DD e hh:mm no fuso de Brasília. Sem data informada, são os do processamento (dataInformada = false). */
  data: string;
  hora: string;
  dataInformada: boolean;
  nps?: number;
  duracao?: string;
  sinais: { churn: number; oportunidade: number; objecao: number };
  /** Sinal mais crítico da reunião (para a etiqueta de alerta). */
  principal?: { tipo: TipoSinal; urgencia: Urgencia; subtipo: string };
};

export type ContaInsight = {
  /** Chave da empresa: contaId do envio, código do cliente TOTVS (CODT) ou a própria reunião. */
  id: string;
  nome: string;
  segmento?: string;
  vendedor?: string;
  nps?: number;
  /** Data da reunião mais recente (ISO ou "AAAA-MM-DD hh:mm:ss"). */
  reuniao: string;
  reuniaoId: string;
  /** Código da reunião exibida ("Reunião #1394492"; ver codigoReuniao). */
  reuniaoCodigo: string;
  /** false: a reunião não trouxe data; `reuniao` é a data do processamento e a tela avisa. */
  dataInformada: boolean;
  arquivo: string;
  totalReunioes: number;
  /** Um por tipo, o mais urgente, em ordem de prioridade comercial (para as tags). */
  sinais: Sinal[];
  totalSinais: number;
  /** IDs dos insights da reunião mais recente (enviados ao CRM). */
  insightIds: string[];
  sincronizadosCrm: number;
  produtos: MencaoProduto[];
  evidencias: Evidencia[];
  diagnostico: string;
  /** false: diagnóstico e recomendação vieram das regras locais (sem chave do Claude), não de IA. */
  geradoPorIa: boolean;
  acao: string;
  proximosPassos: string[];
  /** Saúde 0–10 da reunião exibida (src/lib/saude.ts) e força da relação na última conversa. */
  saude: Saude;
  relacao: "forte" | "neutra" | "fragil";
  /** Todas as reuniões analisadas da conta, da mais recente para a mais antiga. */
  reunioes: ReuniaoHistorico[];
  /** false quando a Central abriu uma reunião anterior (?reuniao=). */
  reuniaoMaisRecente: boolean;
};

/** Uma linha da Central de Insights: uma reunião, com o cliente associado e a análise dela. */
export type ReuniaoCentral = {
  /** Id da reunião no banco (reu_...). */
  id: string;
  numero: number;
  /** "Reunião #1394492" (ver codigoReuniao). */
  codigo: string;
  /** ID da reunião no sistema da TOTVS (ID_MEETING); null quando a transcrição chegou sem ele. */
  idTotvs: string | null;
  conta: { id: string; nome: string; segmento?: string };
  /** AAAA-MM-DD e hh:mm informados pela reunião; null quando ela não trouxe data (a tela sinaliza). */
  data: string | null;
  hora: string | null;
  /** Quando o Dialys recebeu a reunião (ISO). Não é a data da reunião. */
  processadaEm: string;
  /** Para ordenar: data informada ou, sem ela, a do processamento. */
  momento: string;
  /** A conta vista a partir desta reunião; null quando a transcrição foi removida. */
  detalhe: ContaInsight | null;
  transcricaoRemovidaEm: string | null;
};

export const PRIORIDADE_SINAL: Record<TipoSinal, number> = { churn: 0, oportunidade: 1, objecao: 2 };

export type Criticidade = "alta" | "atencao" | "baixa";

/** Criticidade da conta na lista da Central: churn crítico → Alta; outro churn ou objeção forte → Atenção; resto → Baixa. */
export function criticidadeConta(sinais: Sinal[]): Criticidade {
  if (sinais.some((s) => s.tipo === "churn" && s.urgencia === "alta")) return "alta";
  if (sinais.some((s) => s.tipo === "churn" || (s.tipo === "objecao" && s.urgencia === "alta"))) return "atencao";
  return "baixa";
}

const FUSO = "America/Sao_Paulo";

/**
 * Código da reunião em todas as telas, na API e no assistente: o ID da reunião na TOTVS ("Reunião #1394492"),
 * o mesmo em qualquer conta. Sem ele (transcrição colada à mão), o número sequencial da conta ("Reunião 003").
 * Nenhum dos dois muda ao ordenar, filtrar ou remover outras reuniões.
 */
export const codigoReuniao = (reuniao: { numero: number; contexto?: { idReuniao?: string } | null }) =>
  reuniao.contexto?.idReuniao ? `Reunião #${reuniao.contexto.idReuniao}` : `Reunião ${String(reuniao.numero).padStart(3, "0")}`;

/** A reunião trouxe a própria data (contexto.data)? Sem ela, só se conhece a data do processamento. */
export const temDataInformada = (reuniao: { contexto?: { data?: string } | null }) => /^\d{4}-\d{2}-\d{2}/.test(reuniao.contexto?.data ?? "");

/** Data da reunião (informada pela TOTVS, já local) ou do registro, como AAAA-MM-DD no fuso de Brasília. */
export function dataDaReuniao(reuniao: { contexto?: { data?: string } | null; criadaEm: string }) {
  const informada = reuniao.contexto?.data;
  if (informada && /^\d{4}-\d{2}-\d{2}/.test(informada)) return informada.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(reuniao.criadaEm));
}

/** hh:mm da reunião (informada) ou do envio, no fuso de Brasília. */
export function horaDaReuniao(reuniao: { contexto?: { data?: string } | null; criadaEm: string }) {
  const informada = reuniao.contexto?.data?.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/);
  if (informada) return informada[1];
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(reuniao.criadaEm));
}

/** "AAAA-MM-DD hh:mm" da reunião: ordena pelo quando aconteceu, não pelo quando foi analisada. */
export const momentoDaReuniao = (reuniao: { contexto?: { data?: string } | null; criadaEm: string }) =>
  `${dataDaReuniao(reuniao)} ${horaDaReuniao(reuniao)}`;

/** Campos da reunião que identificam a empresa. */
export type IdentidadeReuniao = {
  id: string;
  contaId?: string | null;
  contaNome?: string | null;
  /** Nome pelo código da TOTVS, preenchido na leitura do banco (identificacao.ts). */
  nomeCliente?: string | null;
  contexto?: { codigoCliente?: string; idReuniao?: string } | null;
};

/**
 * Chave da empresa. Sem conta escolhida no envio, o código do cliente da TOTVS (CODT) agrupa as reuniões;
 * sem nenhum dos dois, a reunião fica sozinha. "codt-<código>" também é o contaId que o /envio usa ao
 * reassociar uma reunião a essa empresa, então as duas origens caem no mesmo grupo.
 */
export function chaveConta(reuniao: IdentidadeReuniao) {
  if (reuniao.contaId) return reuniao.contaId;
  if (reuniao.contexto?.codigoCliente) return `codt-${reuniao.contexto.codigoCliente}`;
  return `reuniao-${reuniao.id}`;
}

export function nomeConta(reuniao: IdentidadeReuniao) {
  if (reuniao.contaNome) return reuniao.contaNome;
  if (reuniao.nomeCliente) return reuniao.nomeCliente;
  if (reuniao.contexto?.codigoCliente) return `Cliente ${reuniao.contexto.codigoCliente}`;
  if (reuniao.contexto?.idReuniao) return `Reunião #${reuniao.contexto.idReuniao}`;
  return "Cliente não identificado";
}
