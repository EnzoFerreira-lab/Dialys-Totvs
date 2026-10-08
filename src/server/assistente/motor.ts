// Contrato entre o serviço do assistente e quem gera a resposta (Claude ou regras locais).
// O motor recebe a pergunta, o histórico e o foco da conversa, e só lê dados por `consultar`, que o
// serviço já amarrou ao usuário autenticado. Texto entra, texto sai: um canal de voz futuro troca só
// as pontas (fala → texto e texto → fala), sem mexer aqui.
import type { MensagemConversa } from "../db/banco";
import type { ContextoConsulta, EntidadeConta, EntidadeReuniao, ResultadoFerramenta } from "./ferramentas";

/**
 * Compromisso da agenda aberto pelo usuário ("Preparar com o Dialys"), já validado: é dele e o cliente
 * está no escopo dele. Título e observações foram escritos pelo usuário: são dados, não instruções.
 */
export type CompromissoEmFoco = {
  id: string;
  titulo: string;
  /** Data e horas no fuso configurado. */
  data: string;
  inicio: string;
  fim: string;
  status: "agendado" | "realizado" | "cancelado";
  local: string | null;
  observacoes: string | null;
  cliente: { id: string; nome: string; temReunioesAnalisadas: boolean } | null;
};

export type EntradaMotor = {
  pergunta: string;
  /** Trocas anteriores da conversa, da mais antiga para a mais recente. */
  historico: MensagemConversa[];
  /** Empresas e reuniões em foco (já filtradas pela permissão do usuário). */
  foco: { contas: EntidadeConta[]; reunioes: EntidadeReuniao[] };
  ctx: ContextoConsulta;
  /** Compromisso selecionado na agenda, quando a conversa veio de "Preparar com o Dialys". */
  compromisso?: CompromissoEmFoco | null;
  /** Única porta para os dados: executa uma consulta controlada e registra na auditoria da conversa. */
  consultar: (ferramenta: string, argumentos: unknown) => Promise<ResultadoFerramenta>;
};

export type MotorAssistente = {
  nome: "claude" | "demonstracao";
  responder: (entrada: EntradaMotor) => Promise<{ texto: string }>;
};

/** Erro com status HTTP e mensagem para o usuário (a rota devolve no formato padrão da API). */
export class ErroAssistente extends Error {
  constructor(
    readonly codigo: string,
    readonly httpStatus: number,
    mensagem: string,
    readonly semChave = false,
  ) {
    super(mensagem);
    this.name = "ErroAssistente";
  }
}
