// Cliente da API REST v1 para as telas (navegador). Um erro da API vira ErroDaApi com o código e a
// mensagem do contrato (docs/CONTRATO_API.md), para a tela mostrar algo legível.
import type { ErroApi, InsightApi, ListaInsightsApi, ReuniaoApi, SincronizacaoCrmApi } from "@/server/api/http";
import type { ConversaApi, MensagemAssistenteApi, RespostaMensagemApi, VozBriefingApi } from "@/server/api/assistente";
import type { ResumoCarteira } from "@/server/insights/resumo";
import type { ClienteResumo } from "@/server/clientes/clientes";
import type { PautaSugerida } from "@/server/agenda/pauta";
import type { AlteracaoCompromisso, Compromisso, ListaAgendaApi, NovoCompromisso } from "@/lib/agenda";

export type ListaClientesApi = { dados: ClienteResumo[]; paginacao: { total: number; limite: number; offset: number } };

export type { ClienteResumo, Compromisso, ListaAgendaApi, PautaSugerida };
export type { ConversaApi, VozBriefingApi, InsightApi, ListaInsightsApi, MensagemAssistenteApi, RespostaMensagemApi, ReuniaoApi, ResumoCarteira, SincronizacaoCrmApi };

export type PerguntaAssistente = {
  mensagem: string;
  conversaId: string | null;
  /** Id da pergunta: reenviar o mesmo (nova tentativa) não duplica a resposta. */
  idCliente: string;
  /** Ids vindos da tela: o servidor confere a permissão de cada um. */
  filtros?: { contaId?: string; compromissoId?: string };
};

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhe?: unknown,
  ) {
    super(mensagem);
    this.name = "ErroDaApi";
  }
}

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ErroDaApi(0, "SEM_CONEXAO", "Sem conexão com o servidor do Dialys. Verifique se ele está rodando.");
  }
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = (corpo as ErroApi | null)?.erro;
    // Sessão vencida (ou conta removida) no meio do uso: volta ao login e, depois de entrar, a esta tela.
    if (resposta.status === 401 && erro?.codigo === "SESSAO_AUSENTE" && typeof window !== "undefined") {
      // Fora de um componente (sem router) e de propósito com recarga: nada da sessão anterior fica na tela.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?${new URLSearchParams({ volta: `${window.location.pathname}${window.location.search}` })}`);
    }
    throw new ErroDaApi(resposta.status, erro?.codigo ?? "ERRO_HTTP", erro?.mensagem ?? `Erro ${resposta.status} na API.`, erro?.detalhe);
  }
  return corpo as T;
}

const postJson = (corpo: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(corpo),
});

export type NovaReuniao = {
  texto: string;
  contexto?: unknown;
  contaId?: string;
  contaNome?: string;
};

export const api = {
  /** Modo assíncrono: responde na hora com a reunião EM_PROCESSAMENTO. */
  processarReuniao: (corpo: NovaReuniao) => chamar<ReuniaoApi>("/api/v1/reunioes/processar", postJson(corpo)),
  consultarReuniao: (id: string) => chamar<ReuniaoApi>(`/api/v1/reunioes/${encodeURIComponent(id)}`),
  listarInsights: (params: Record<string, string> = {}) =>
    chamar<ListaInsightsApi>(`/api/v1/insights?${new URLSearchParams(params)}`),
  sincronizarCrm: (insightId: string) => chamar<SincronizacaoCrmApi>("/api/v1/crm/sincronizar", postJson({ insightId })),
  resumo: () => chamar<ResumoCarteira>("/api/v1/resumo"),
  perguntarAoAssistente: (corpo: PerguntaAssistente) => chamar<RespostaMensagemApi>("/api/v1/assistente/mensagens", postJson(corpo)),
  lerConversa: (id: string) => chamar<ConversaApi>(`/api/v1/assistente/conversas/${encodeURIComponent(id)}`),
  /** Áudio do briefing na voz do ElevenLabs, com o segundo em que cada trecho começa. */
  vozDoBriefing: (conversaId: string, mensagemId: string) =>
    chamar<VozBriefingApi>(`/api/v1/assistente/conversas/${encodeURIComponent(conversaId)}/mensagens/${encodeURIComponent(mensagemId)}/voz`),
  listarClientes: (params: { busca?: string; limite?: number; offset?: number } = {}) =>
    chamar<ListaClientesApi>(
      `/api/v1/clientes?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`,
    ),
  /** Datas "AAAA-MM-DD" no fuso configurado no servidor, inclusive. */
  listarAgenda: (de: string, ate: string) => chamar<ListaAgendaApi>(`/api/v1/agenda?${new URLSearchParams({ de, ate })}`),
  /** Compromissos de hoje no fuso configurado. */
  agendaDeHoje: () => chamar<ListaAgendaApi>("/api/v1/agenda"),
  lerCompromisso: (id: string) => chamar<Compromisso>(`/api/v1/agenda/${encodeURIComponent(id)}`),
  /** Pauta sugerida pela IA para um compromisso com o cliente (não grava nada). */
  sugerirPauta: (corpo: { contaId: string; titulo?: string; data?: string }) => chamar<PautaSugerida>("/api/v1/agenda/pauta", postJson(corpo)),
  criarCompromisso: (corpo: NovoCompromisso) => chamar<Compromisso>("/api/v1/agenda", postJson(corpo)),
  alterarCompromisso: (id: string, corpo: AlteracaoCompromisso) =>
    chamar<Compromisso>(`/api/v1/agenda/${encodeURIComponent(id)}`, { ...postJson(corpo), method: "PATCH" }),
  /** Exclui o cliente: apaga de vez as reuniões dele e tudo o que derivou delas (sem desfazer). */
  excluirCliente: (contaId: string) =>
    chamar<{ excluido: true; cliente: { id: string; nome: string }; reunioesExcluidas: number }>(`/api/v1/carteira/${encodeURIComponent(contaId)}`, { method: "DELETE" }),
  /** Remoção lógica da transcrição de uma reunião (e da análise derivada só dela). */
  removerTranscricao: (reuniaoId: string) =>
    chamar<{ reuniaoId: string; codigo: string; conta: { id: string; nome: string }; transcricaoRemovidaEm: string | null; jaRemovida: boolean }>(
      `/api/v1/reunioes/${encodeURIComponent(reuniaoId)}/transcricao`,
      { method: "DELETE" },
    ),
};

/**
 * Espera o pipeline terminar, consultando a reunião; `aoAtualizar` recebe cada estado (etapas).
 * `sinal` interrompe a espera (ex.: o usuário saiu da página) com ErroDaApi código CANCELADO.
 */
export async function aguardarReuniao(
  id: string,
  aoAtualizar: (reuniao: ReuniaoApi) => void,
  { intervaloMs = 1000, limiteMs = 6 * 60_000, sinal }: { intervaloMs?: number; limiteMs?: number; sinal?: AbortSignal } = {},
): Promise<ReuniaoApi> {
  const inicio = Date.now();
  for (;;) {
    if (sinal?.aborted) throw new ErroDaApi(0, "CANCELADO", "Acompanhamento cancelado.");
    const reuniao = await api.consultarReuniao(id);
    aoAtualizar(reuniao);
    if (reuniao.status !== "EM_PROCESSAMENTO") return reuniao;
    if (Date.now() - inicio > limiteMs) {
      throw new ErroDaApi(504, "TEMPO_ESGOTADO", "A análise passou de 6 minutos. Veja o terminal do servidor.");
    }
    await new Promise((resolver) => setTimeout(resolver, intervaloMs));
  }
}
