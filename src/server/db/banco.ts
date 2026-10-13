// Persistência do piloto: um arquivo JSON local (.dialys/banco.json) com as tabelas reuniao, analise,
// sinal, mencao_produto, sincronizacao_crm, conversa_assistente, compromisso e carteira_remocao. Sem custo e sem servidor de banco. O resto do sistema só
// usa as funções de src/server/db/repositorio.ts, então trocar por Postgres/Supabase na produção é
// reescrever aquele arquivo. Limite: um único processo Node (o `npm run dev`/`start` do piloto).
import path from "node:path";
import type { ContextoReuniao } from "@/lib/transcricao";
import type { ResultadoAnalise } from "../ai/analisar-reuniao";
import type { MencaoProduto } from "../ai/schemas";
import type { SinalValidado } from "../ai/validar-evidencia";
import { chaveConta } from "@/lib/insights";
import { ID_USUARIO_DEMONSTRACAO } from "../auth/usuarios";
import { completarCodigoCliente } from "../clientes/identificacao";
import { criarArmazenamentoJson } from "./arquivo-json";

export type StatusReuniao = "EM_PROCESSAMENTO" | "CONCLUIDA" | "FALHOU";
export type NomeEtapa = "RECEBIMENTO" | "TRANSCRICAO" | "ANALISE_IA" | "VALIDACAO_EVIDENCIAS" | "PERSISTENCIA";
export type StatusEtapa = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "PULADA" | "FALHOU";

export type Etapa = {
  nome: NomeEtapa;
  status: StatusEtapa;
  iniciadaEm?: string;
  concluidaEm?: string;
  detalhe?: string;
};

export type FalhaRegistrada = {
  codigo: string;
  titulo: string;
  detalhe: string;
  /** Status HTTP que melhor descreve a falha (usado no modo síncrono da API). */
  httpStatus: number;
  /** A chave da API do Claude falta ou é inválida: a tela mostra o passo a passo. */
  semChave?: boolean;
};

export type ReuniaoRegistro = {
  id: string;
  /**
   * Número sequencial da reunião, exibido como "Reunião 001". Único entre as reuniões do dono e nunca
   * reutilizado: vem da sequência dele (ver proximoNumeroReuniao), que só cresce. Reuniões gravadas antes do
   * campo existir recebem o número na leitura, pela ordem de criação (migração não destrutiva).
   */
  numero: number;
  /**
   * Dono: o usuário que enviou a reunião. Cada usuário só vê as próprias reuniões e o que derivou delas.
   * Reuniões de antes do campo existir são da persona de demonstração (migração na leitura).
   */
  usuarioId: string;
  criadaEm: string;
  atualizadaEm: string;
  status: StatusReuniao;
  origem: "texto" | "arquivo_texto";
  nomeArquivo?: string;
  contaId?: string;
  /** Nome da empresa informado no envio (a Central de Insights agrupa e exibe por ele). */
  contaNome?: string;
  /**
   * Nome do cliente pelo código da TOTVS (nome real configurado ou CNAE + UF). Calculado a cada leitura
   * em repositorio.ts (src/server/clientes/identificacao.ts) e nunca gravado.
   */
  nomeCliente?: string;
  contexto?: ContextoReuniao;
  /** Texto analisado (null só em registros antigos de áudio, que não existem mais). */
  transcricao: string | null;
  /** Quantas vezes a análise foi retomada depois de o servidor parar no meio. */
  retomadas?: number;
  etapas: Etapa[];
  analiseId?: string;
  falha?: FalhaRegistrada;
  /**
   * Remoção lógica da transcrição (Central de Insights). O registro, o número e o texto continuam no
   * banco, mas a transcrição e a análise derivada só dela saem de todas as consultas ativas.
   */
  transcricaoRemovida?: {
    em: string;
    usuarioId: string;
    /** "cliente_removido": marca da versão antiga de "Remover cliente" (convertida na leitura, ver converterRemocoesAntigas). Ausente = "transcricao". */
    motivo?: "transcricao" | "cliente_removido";
  };
};

/** Cliente que um usuário tirou da própria carteira. Os insights dele saem junto (remoção lógica nas reuniões). */
export type CarteiraRemocaoRegistro = { usuarioId: string; contaId: string; removidoEm: string };

export type AnaliseRegistro = {
  id: string;
  reuniaoId: string;
  criadaEm: string;
  resumoExecutivo: string;
  proximosPassosSugeridos: string[];
  evidencias: ResultadoAnalise["evidencias"];
  auditoria: ResultadoAnalise["auditoria"];
};

export type SinalRegistro = SinalValidado & { id: string; analiseId: string; reuniaoId: string; criadoEm: string };

export type MencaoProdutoRegistro = MencaoProduto & { id: string; analiseId: string; reuniaoId: string };

export type SincronizacaoCrmRegistro = {
  id: string;
  sinalId: string;
  protocolo: string;
  /** No piloto o webhook é simulado: nada sai da máquina. */
  destino: "simulado";
  enviadaEm: string;
  payload: unknown;
};

/** De onde a resposta do assistente tirou a informação (link para a Central de Insights). */
export type FonteMensagem = { tipo: "conta" | "reuniao"; id: string; contaId: string; rotulo: string; data?: string };

/** Consulta controlada que o assistente executou para responder (auditoria; nunca SQL livre). */
export type ConsultaRegistrada = { ferramenta: string; argumentos: Record<string, unknown>; resumo: string; erro?: boolean };

export type MensagemConversa = {
  id: string;
  papel: "usuario" | "assistente";
  texto: string;
  criadaEm: string;
  /** Id gerado pelo navegador para a pergunta: reenviar o mesmo id não duplica a troca. */
  idCliente?: string;
  /** "demonstracao": resposta montada por regras a partir do banco, sem IA. */
  modo?: "claude" | "nemotron" | "demonstracao";
  fontes?: FonteMensagem[];
  consultas?: ConsultaRegistrada[];
  /**
   * "briefing": resposta do briefing do dia, a única que a tela lê em voz.
   * "nao_entendida": o Dialys não entendeu ou não consegue atender; a tela sugere perguntas de novo.
   */
  tipo?: "briefing" | "nao_entendida";
  /** Roteiro para a voz: `texto` é exibido, `fala` (quando diferente) é o que se sintetiza. */
  fala?: Array<{ texto: string; fala?: string; novoParagrafo?: boolean }>;
};

/** Conversa com o assistente Dialys. Sempre de um usuário; ninguém mais lê. */
export type ConversaRegistro = {
  id: string;
  usuarioId: string;
  criadaEm: string;
  atualizadaEm: string;
  /** Empresas e reuniões citadas por último: resolvem "essa empresa" e "qual ação devo priorizar?". */
  contasEmFoco: string[];
  reunioesEmFoco: string[];
  mensagens: MensagemConversa[];
};

export type StatusCompromisso = "agendado" | "realizado" | "cancelado";

/** Compromisso da agenda: sempre de um usuário. Instantes em ISO UTC; a tela converte para o fuso configurado. */
export type CompromissoRegistro = {
  id: string;
  usuarioId: string;
  titulo: string;
  /** Cliente associado (chave da conta); null para compromissos internos. */
  contaId: string | null;
  contaNome: string | null;
  inicio: string;
  fim: string;
  status: StatusCompromisso;
  local: string | null;
  observacoes: string | null;
  /** "demonstracao": criado pela semente fictícia; "usuario": cadastrado na tela. */
  origem: "usuario";
  criadoEm: string;
  atualizadoEm: string;
};

export type Banco = {
  versao: 1;
  reuniao: ReuniaoRegistro[];
  analise: AnaliseRegistro[];
  sinal: SinalRegistro[];
  mencao_produto: MencaoProdutoRegistro[];
  sincronizacao_crm: SincronizacaoCrmRegistro[];
  /** Adicionada com o chat do assistente; bancos antigos ganham a tabela vazia ao serem lidos. */
  conversa_assistente: ConversaRegistro[];
  /** Agenda real do usuário (fonte "real"). Adicionada com a Home; começa vazia. */
  compromisso: CompromissoRegistro[];
  /** Clientes retirados da carteira de cada usuário (fonte "real"). */
  carteira_remocao: CarteiraRemocaoRegistro[];
  /**
   * Último número emitido por sequência. Nunca diminui, então números removidos não voltam. `reuniao` é a
   * da persona de demonstração (dona das reuniões antigas); `porUsuario`, a de cada usuário cadastrado.
   */
  sequencias: { reuniao: number; porUsuario?: Record<string, number> };
};

const bancoVazio = (): Banco => ({
  versao: 1,
  reuniao: [],
  analise: [],
  sinal: [],
  mencao_produto: [],
  sincronizacao_crm: [],
  conversa_assistente: [],
  compromisso: [],
  carteira_remocao: [],
  sequencias: { reuniao: 0 },
});

/**
 * Migração na leitura (não destrutiva): numera reuniões antigas pela ordem de criação, depois do maior
 * número já emitido. Determinística: a leitura e a próxima escrita chegam aos mesmos números.
 */
export function numerarReunioes(banco: Banco) {
  banco.sequencias = { ...banco.sequencias, reuniao: banco.sequencias?.reuniao ?? 0 };
  // Só existem reuniões sem número de antes de cada reunião ter dono: todas da persona de demonstração.
  const antigas = banco.reuniao.filter((r) => (r.usuarioId ?? ID_USUARIO_DEMONSTRACAO) === ID_USUARIO_DEMONSTRACAO);
  let ultimo = Math.max(banco.sequencias.reuniao, 0, ...antigas.map((r) => (Number.isInteger(r.numero) ? r.numero : 0)));
  const semNumero = antigas
    .filter((r) => !Number.isInteger(r.numero) || r.numero <= 0)
    .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm) || a.id.localeCompare(b.id));
  for (const reuniao of semNumero) reuniao.numero = ++ultimo;
  banco.sequencias.reuniao = ultimo;
}

/** Próximo número de reunião do usuário (dentro de uma transação). Cada usuário tem a própria sequência. */
export function proximoNumeroReuniao(banco: Banco, usuarioId: string) {
  numerarReunioes(banco);
  if (usuarioId === ID_USUARIO_DEMONSTRACAO) return ++banco.sequencias.reuniao;
  const porUsuario = (banco.sequencias.porUsuario ??= {});
  return (porUsuario[usuarioId] = (porUsuario[usuarioId] ?? 0) + 1);
}

/** DIALYS_BANCO_ARQUIVO troca o arquivo (os testes usam uma pasta temporária). */
export function arquivoBanco() {
  // turbopackIgnore: o banco é estado de execução, não arquivo do build (sem isso o tracing copia o projeto inteiro).
  return process.env.DIALYS_BANCO_ARQUIVO ?? path.join(/* turbopackIgnore: true */ process.cwd(), ".dialys", "banco.json");
}

/**
 * Apaga reuniões e tudo o que derivou delas (análises, sinais, menções de produto, sincronizações do CRM).
 * Usado por "Excluir cliente" (repositorio.ts) e pela conversão das remoções antigas. Sem desfazer.
 */
export function apagarReunioes(banco: Banco, ids: Set<string>) {
  if (!ids.size) return;
  const sinais = new Set(banco.sinal.filter((s) => ids.has(s.reuniaoId)).map((s) => s.id));
  banco.reuniao = banco.reuniao.filter((r) => !ids.has(r.id));
  banco.analise = banco.analise.filter((a) => !ids.has(a.reuniaoId));
  banco.sinal = banco.sinal.filter((s) => !ids.has(s.reuniaoId));
  banco.mencao_produto = banco.mencao_produto.filter((m) => !ids.has(m.reuniaoId));
  banco.sincronizacao_crm = banco.sincronizacao_crm.filter((s) => !sinais.has(s.sinalId));
}

/**
 * Migração na leitura (determinística): converte o "Remover cliente" antigo (remoção lógica, com volta)
 * para a exclusão atual, que apaga. De cada cliente marcado como removido saem as reuniões que já existiam
 * na remoção, e saem as reuniões com a marca "cliente_removido". As enviadas depois da remoção ficam: são o
 * histórico novo do cliente. As marcas da tabela carteira_remocao deixam de existir.
 */
export function converterRemocoesAntigas(banco: Banco) {
  const marcadas = banco.reuniao.some((r) => r.transcricaoRemovida?.motivo === "cliente_removido");
  if (!banco.carteira_remocao.length && !marcadas) return;
  const removidoEm = new Map<string, string>();
  for (const { contaId, removidoEm: em } of banco.carteira_remocao) {
    if (em > (removidoEm.get(contaId) ?? "")) removidoEm.set(contaId, em);
  }
  const apagar = banco.reuniao.filter((r) => {
    if (r.status === "EM_PROCESSAMENTO") return false;
    if (r.transcricaoRemovida?.motivo === "cliente_removido") return true;
    const em = removidoEm.get(chaveConta(r));
    return em !== undefined && r.criadaEm <= em;
  });
  apagarReunioes(banco, new Set(apagar.map((r) => r.id)));
  banco.carteira_remocao = [];
}

/** Migrações na leitura: dono, numeração, código do cliente das reuniões da amostra e remoções antigas. */
function migrarBanco(banco: Banco) {
  for (const reuniao of banco.reuniao) reuniao.usuarioId ??= ID_USUARIO_DEMONSTRACAO;
  numerarReunioes(banco);
  completarCodigoCliente(banco.reuniao);
  converterRemocoesAntigas(banco);
}

const armazenamento = criarArmazenamentoJson<Banco>({ nome: "banco", arquivo: arquivoBanco, vazio: bancoVazio, migrar: migrarBanco });

export const lerBanco = armazenamento.ler;

/** Lê, altera e grava o banco com exclusividade (uma transação por vez no processo). */
export const transacao = armazenamento.transacao;
