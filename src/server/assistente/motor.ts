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
  /**
   * Empresa que o usuário fixou na tela ("Empresa em foco"), já validada. Modo empresa em foco: perguntas
   * sem outra empresa se referem a ela.
   */
  empresaSelecionada?: EntidadeConta | null;
  ctx: ContextoConsulta;
  /** Compromisso selecionado na agenda, quando a conversa veio de "Preparar com o Dialys". */
  compromisso?: CompromissoEmFoco | null;
  /** Única porta para os dados: executa uma consulta controlada e registra na auditoria da conversa. */
  consultar: (ferramenta: string, argumentos: unknown) => Promise<ResultadoFerramenta>;
};

/** naoEntendida: o motor não entendeu o pedido ou não consegue atendê-lo; a resposta só orienta o que perguntar. */
export type RespostaMotor = { texto: string; naoEntendida?: boolean };

export type MotorAssistente = {
  nome: "claude" | "nemotron" | "demonstracao";
  responder: (entrada: EntradaMotor) => Promise<RespostaMotor>;
};

/**
 * Sinal que os motores com IA usam quando não entendem a mensagem ou não conseguem atendê-la. Sem ele,
 * a consulta obrigatória da primeira rodada fazia o modelo repetir a consulta (e a resposta) anterior.
 */
export const FERRAMENTA_NAO_ENTENDIDA = {
  nome: "pedido_nao_compreendido",
  descricao:
    "Use quando a mensagem do usuário não for compreensível (texto sem sentido, incompleto ou ambíguo demais) ou pedir algo que o Dialys não consegue fazer (fora do escopo comercial, ou uma ação como registrar, enviar ou alterar dados). Não repita a consulta nem a resposta anterior nesse caso.",
} as const;

/** Resposta padrão quando o pedido não foi entendido: o que o Dialys sabe fazer (a tela mostra as sugestões). */
export const TEXTO_NAO_ENTENDIDA = [
  "Não entendi o que você pediu, ou é algo que eu não consigo fazer por aqui. Posso consultar os dados analisados pelo Dialys, por exemplo:",
  "- o briefing do dia, lido em voz",
  "- seus compromissos de hoje ou da semana",
  "- quais clientes precisam de atenção",
  "- reuniões de um período (este mês, 01/09 a 15/09)",
  "- o resumo, os insights, os produtos ou a ação sugerida de uma empresa, citando o nome dela",
  "- oportunidades, objeções ou riscos de churn registrados",
  "",
  "Escolha uma das sugestões abaixo ou reformule a pergunta.",
].join("\n");

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
