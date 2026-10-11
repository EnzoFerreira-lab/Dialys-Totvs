"use client";

import { Add, Building, Close, Renew, Send, VolumeUp, WarningFilled } from "@carbon/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { TotvsLogo } from "@/components/brand/totvs-logo";
import { api, ErroDaApi, type MensagemAssistenteApi } from "@/lib/api-cliente";
import { cn } from "@/lib/cn";
import { BalaoBriefing } from "./balao-briefing";
import { FontesMensagem } from "./fontes-mensagem";
import { SeletorEmpresaFoco } from "./seletor-empresa-foco";
import { TextoFormatado } from "./texto-formatado";

const CHAVE_CONVERSA = "dialys.assistente.conversa";
const LIMITE = 2000;

type Acao = "briefing";

/** O briefing é a única sugestão respondida em voz. */
const PEDIDO_BRIEFING = "Quero ouvir o briefing do dia.";
const SUGESTOES: Array<{ texto: string; acao?: Acao }> = [
  { texto: "Ouvir o briefing do dia", acao: "briefing" },
  { texto: "Quais clientes precisam de atenção?" },
  { texto: "O que tenho na agenda hoje?" },
  { texto: "Mostre as reuniões deste mês." },
  { texto: "Explique a ação sugerida para esta empresa." },
  { texto: "Quais oportunidades de upsell foram identificadas?" },
];

/**
 * Com uma empresa em foco, as sugestões viram perguntas sobre ela. O servidor sabe qual é a empresa
 * (filtros.contaId), então "ela" e "esta empresa" bastam; o nome entra só onde ajuda a leitura.
 */
const sugestoesDaEmpresa = (nome: string) => [
  `Avalie a ${nome} em geral`,
  "Liste os insights desta empresa",
  "Explique o insight mais crítico",
  "Quais riscos de churn ela tem?",
  "Que produtos TOTVS ela usa e onde há upsell?",
  "Como ela evoluiu entre as reuniões?",
  "Qual ação devo priorizar com ela?",
  "Monte uma pauta para a próxima reunião com ela",
];

type Falha = { mensagem: string; sessao?: boolean; semChave?: boolean };

type Item =
  | { tipo: "usuario"; id: string; idCliente: string; texto: string; estado: "enviando" | "ok" | "erro"; falha?: Falha; acao?: Acao }
  | { tipo: "assistente"; id: string; mensagem: MensagemAssistenteApi };

// sessionStorage pode faltar (aba privada, bloqueio): a conversa só não sobrevive ao recarregar.
const lerSessao = () => {
  try {
    return sessionStorage.getItem(CHAVE_CONVERSA);
  } catch {
    return null;
  }
};
const gravarSessao = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(CHAVE_CONVERSA, id);
    else sessionStorage.removeItem(CHAVE_CONVERSA);
  } catch {
    /* sem armazenamento: segue só em memória */
  }
};
const novoIdCliente = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const paraItens = (mensagens: MensagemAssistenteApi[]): Item[] =>
  mensagens.map((m) =>
    m.papel === "usuario"
      ? { tipo: "usuario", id: m.id, idCliente: m.id, texto: m.texto, estado: "ok" }
      : { tipo: "assistente", id: m.id, mensagem: m },
  );

function falhaDe(erro: unknown): Falha {
  if (erro instanceof ErroDaApi) {
    if (erro.status === 401) return { mensagem: "Sua sessão expirou. Entre novamente para continuar.", sessao: true };
    const semChave = typeof erro.detalhe === "object" && erro.detalhe !== null && "semChave" in erro.detalhe;
    return { mensagem: erro.message, semChave };
  }
  return { mensagem: "Não foi possível falar com o Dialys agora." };
}

function BalaoAssistente({ mensagem }: { mensagem: MensagemAssistenteApi }) {
  return (
    <div className="max-w-[min(680px,92%)] rounded-[12px] rounded-tl-[2px] border border-white/10 bg-[#2B2B2B] px-4 py-3 text-[14px] leading-[1.6] text-[#E0E0E0]">
      <TextoFormatado texto={mensagem.texto} />
      <FontesMensagem fontes={mensagem.fontes} />
    </div>
  );
}

/**
 * "Converse com o Dialys": chat de texto sobre os dados analisados (POST /api/v1/assistente/mensagens).
 * A conversa fica no servidor, ligada ao usuário da sessão; o id dela fica na aba (sessionStorage)
 * para sobreviver a recarregamentos. Nova conversa = contexto limpo.
 */
export function ChatAssistente() {
  const params = useSearchParams();
  const [contaFoco, setContaFoco] = useState<{ id: string; nome: string } | null>(null);
  // ?conta= também muda sem recarregar a página (a página fica viva entre navegações): acompanha na renderização.
  const contaParam = params.get("conta");
  const [contaLida, setContaLida] = useState<string | null | undefined>(undefined);
  if (contaParam !== contaLida) {
    setContaLida(contaParam);
    setContaFoco(contaParam ? { id: contaParam, nome: params.get("nome") ?? contaParam } : null);
  }
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [rascunho, setRascunho] = useState("");
  const [processando, setProcessando] = useState(false);
  // Só renderiza no navegador (useSearchParams dentro de Suspense): ler a sessão aqui é seguro.
  const [carregandoHistorico, setCarregandoHistorico] = useState(() => lerSessao() !== null);
  const [aviso, setAviso] = useState<Falha | null>(null);
  /** Id do briefing que acabou de chegar: começa a falar sozinho uma vez (só quando foi pedido agora). */
  const [falarAgora, setFalarAgora] = useState<string | null>(null);
  const jaFalou = useCallback(() => setFalarAgora(null), []);
  const listaRef = useRef<HTMLOListElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const campoId = useId();
  const dicaId = useId();

  // Recupera a conversa da aba (o servidor confere se ela é do usuário da sessão).
  useEffect(() => {
    const salvo = lerSessao();
    if (!salvo) return;
    let ativo = true;
    api
      .lerConversa(salvo)
      .then((conversa) => {
        if (!ativo) return;
        setConversaId(conversa.conversaId);
        setItens(paraItens(conversa.mensagens));
      })
      .catch((erro) => {
        if (!ativo) return;
        gravarSessao(null);
        if (erro instanceof ErroDaApi && erro.status === 401) setAviso(falhaDe(erro));
      })
      .finally(() => ativo && setCarregandoHistorico(false));
    return () => {
      ativo = false;
    };
    // Só na montagem: a conversa salva é recuperada uma vez.
  }, []);

  // Rola para a mensagem mais nova.
  useEffect(() => {
    const lista = listaRef.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [itens, processando]);

  async function enviar(texto: string, idExistente?: string, acao?: Acao) {
    const pergunta = texto.trim();
    if (!pergunta || processando || pergunta.length > LIMITE) return;
    const idCliente = idExistente ?? novoIdCliente();
    setItens((anteriores) => [
      ...anteriores.filter((i) => !(i.tipo === "usuario" && i.idCliente === idCliente)),
      { tipo: "usuario", id: idCliente, idCliente, texto: pergunta, estado: "enviando", acao },
    ]);
    setRascunho("");
    setProcessando(true);
    setAviso(null);
    try {
      const r = await api.perguntarAoAssistente({
        mensagem: pergunta,
        conversaId,
        idCliente,
        ...(contaFoco ? { filtros: { contaId: contaFoco.id } } : {}),
        ...(acao ? { acao } : {}),
      });
      if (r.resposta.tipo === "briefing") setFalarAgora(r.resposta.id);
      setConversaId(r.conversaId);
      gravarSessao(r.conversaId);
      setItens((anteriores) => [
        ...anteriores.map((i): Item => (i.tipo === "usuario" && i.idCliente === idCliente ? { ...i, estado: "ok" } : i)),
        { tipo: "assistente", id: r.resposta.id, mensagem: r.resposta },
      ]);
    } catch (erro) {
      const falha = falhaDe(erro);
      // Conversa sumiu (outro dispositivo, banco limpo): a nova tentativa abre uma conversa nova.
      if (erro instanceof ErroDaApi && erro.codigo === "CONVERSA_NAO_ENCONTRADA") {
        setConversaId(null);
        gravarSessao(null);
      }
      setItens((anteriores) =>
        anteriores.map((i): Item => (i.tipo === "usuario" && i.idCliente === idCliente ? { ...i, estado: "erro", falha } : i)),
      );
    } finally {
      setProcessando(false);
      campoRef.current?.focus();
    }
  }

  function editar(item: Extract<Item, { tipo: "usuario" }>) {
    setItens((anteriores) => anteriores.filter((i) => i.id !== item.id));
    setRascunho(item.texto);
    campoRef.current?.focus();
  }

  function novaConversa() {
    if (processando) return;
    setConversaId(null);
    gravarSessao(null);
    setItens([]);
    setAviso(null);
    setFalarAgora(null);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    campoRef.current?.focus();
  }

  function onTeclado(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault();
      void enviar(rascunho);
    }
  }

  const vazio = itens.length === 0;
  const longo = rascunho.length > LIMITE;
  const sugestoesEmpresa = contaFoco ? sugestoesDaEmpresa(contaFoco.nome) : null;

  return (
    <section aria-labelledby="titulo-chat" className="on-shell overflow-hidden rounded-[12px] bg-shell text-shell-text">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-8">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-interactive text-[#161616]">
            <TotvsLogo variante="simbolo" className="h-4" />
          </span>
          <div>
            <h2 id="titulo-chat" className="text-[18px] leading-6 font-normal text-white">
              Converse com o Dialys<span className="text-interactive">.</span>
            </h2>
            <p className="text-[12px] text-shell-text-secondary">
              Peça o briefing do dia para ouvi-lo em voz, ou pergunte sobre empresas, reuniões e insights.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void enviar(PEDIDO_BRIEFING, undefined, "briefing")}
            disabled={processando}
            className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-interactive px-3 text-[13px] font-medium text-white transition-colors hover:bg-interactive/10 disabled:cursor-not-allowed disabled:border-white/20 disabled:text-[#8D8D8D]"
          >
            <VolumeUp size={16} className="text-interactive" aria-hidden="true" />
            Briefing do dia
          </button>
          <button
            type="button"
            onClick={novaConversa}
            disabled={processando || vazio}
            className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-white/20 px-3 text-[13px] text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:text-[#8D8D8D]"
          >
            <Add size={16} aria-hidden="true" />
            Nova conversa
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-5 py-2 text-[12px] sm:px-8">
        <span className="text-shell-text-secondary">Empresa em foco:</span>
        {contaFoco ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-interactive/15 py-0.5 pr-1 pl-2.5 text-white">
            <Building size={12} aria-hidden="true" />
            <span className="truncate">{contaFoco.nome}</span>
            <button
              type="button"
              onClick={() => setContaFoco(null)}
              aria-label="Remover empresa em foco"
              className="rounded-full p-0.5 hover:bg-white/10"
            >
              <Close size={12} />
            </button>
          </span>
        ) : (
          <span className="text-shell-text-secondary">nenhuma · as perguntas valem para toda a carteira</span>
        )}
        <SeletorEmpresaFoco rotulo={contaFoco ? "Trocar" : "Focar em uma empresa"} onEscolher={setContaFoco} desabilitado={processando} />
      </div>

      {/* Histórico */}
      <ol
        ref={listaRef}
        aria-live="polite"
        aria-busy={processando}
        aria-label="Mensagens da conversa"
        className="flex max-h-[560px] min-h-[220px] flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-8"
      >
        {carregandoHistorico ? (
          <li className="text-[13px] text-shell-text-secondary">Carregando a conversa…</li>
        ) : vazio ? (
          <li className="py-2">
            <p className="text-[14px] leading-[1.6] text-[#E0E0E0]">
              {contaFoco ? (
                <>
                  Foco em <span className="font-semibold text-white">{contaFoco.nome}</span>: pergunte sem repetir o nome. Avalie a empresa,
                  liste e explique os insights, veja produtos e oportunidades ou prepare a próxima conversa. O Dialys responde só com o que
                  foi analisado e mostra de onde tirou cada informação.
                </>
              ) : (
                <>
                  Comece pelo briefing do dia, lido em voz, ou pergunte sobre clientes, reuniões, riscos, oportunidades e ações sugeridas.
                  Fixe uma empresa em foco para perguntas e análises só dela. O Dialys responde só com o que foi analisado e mostra de onde
                  tirou cada informação.
                </>
              )}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Sugestões de perguntas">
              {(sugestoesEmpresa ? sugestoesEmpresa.map((texto): (typeof SUGESTOES)[number] => ({ texto })) : SUGESTOES).map((sugestao) => (
                <li key={sugestao.texto}>
                  <button
                    type="button"
                    onClick={() => void enviar(sugestao.acao ? PEDIDO_BRIEFING : sugestao.texto, undefined, sugestao.acao)}
                    disabled={processando}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[13px] text-white transition-colors hover:border-interactive hover:bg-interactive/10",
                      sugestao.acao ? "border-interactive/70" : "border-white/20",
                    )}
                  >
                    {sugestao.acao ? <VolumeUp size={14} className="text-interactive" aria-hidden="true" /> : null}
                    {sugestao.texto}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ) : (
          itens.map((item) =>
            item.tipo === "usuario" ? (
              <li key={item.id} className="flex flex-col items-end gap-1.5">
                <p
                  className={cn(
                    "max-w-[min(560px,88%)] rounded-[12px] rounded-tr-[2px] bg-[#4C4C4C] px-4 py-2.5 text-[14px] leading-[1.55] whitespace-pre-wrap text-white",
                    item.estado === "enviando" && "opacity-80",
                    item.estado === "erro" && "border border-[#FA4D56]",
                  )}
                >
                  {item.texto}
                </p>
                {item.estado === "erro" && item.falha ? (
                  <div role="alert" className="flex max-w-[min(560px,88%)] flex-col items-end gap-1.5 text-right text-[12px]">
                    <p className="flex items-start gap-1.5 text-[#FFB3B8]">
                      <WarningFilled size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {item.falha.mensagem}
                    </p>
                    <span className="flex gap-3">
                      {item.falha.sessao ? (
                        <Link href="/login?volta=/assistente" className="font-medium text-interactive underline underline-offset-[3px]">
                          Entrar novamente
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void enviar(item.texto, item.idCliente, item.acao)}
                          disabled={processando}
                          className="inline-flex items-center gap-1 font-medium text-interactive underline underline-offset-[3px] disabled:opacity-50"
                        >
                          <Renew size={12} aria-hidden="true" />
                          Tentar novamente
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => editar(item)}
                        className="font-medium text-white underline underline-offset-[3px]"
                      >
                        Editar
                      </button>
                    </span>
                  </div>
                ) : null}
              </li>
            ) : (
              <li key={item.id} className="flex flex-col items-start">
                <span className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-interactive uppercase">Dialys</span>
                {item.mensagem.tipo === "briefing" ? (
                  <BalaoBriefing mensagem={item.mensagem} tocarAoChegar={falarAgora === item.mensagem.id} onTocou={jaFalou} />
                ) : (
                  <BalaoAssistente mensagem={item.mensagem} />
                )}
              </li>
            ),
          )
        )}
        {processando ? (
          <li className="flex flex-col items-start" aria-label="Dialys está respondendo">
            <span className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-interactive uppercase">Dialys</span>
            <span className="inline-flex items-center gap-2 rounded-[12px] rounded-tl-[2px] border border-white/10 bg-[#2B2B2B] px-4 py-3 text-[13px] text-shell-text-secondary">
              <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-interactive motion-safe:animate-bounce"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </span>
              Consultando os dados analisados…
            </span>
          </li>
        ) : null}
      </ol>

      {aviso ? (
        <p role="alert" className="flex items-center gap-2 border-t border-white/10 px-5 py-2.5 text-[12px] text-[#FFB3B8] sm:px-8">
          <WarningFilled size={14} aria-hidden="true" />
          {aviso.mensagem}{" "}
          {aviso.sessao ? (
            <Link href="/login?volta=/assistente" className="font-medium text-interactive underline underline-offset-[3px]">
              Entrar novamente
            </Link>
          ) : null}
        </p>
      ) : null}

      {/* Atalhos da empresa em foco durante a conversa (na conversa vazia, as sugestões acima já são estas). */}
      {sugestoesEmpresa && !vazio ? (
        <div className="border-t border-white/10 px-5 pt-3 sm:px-8">
          <p className="text-[11px] text-shell-text-secondary">Atalhos para {contaFoco?.nome}</p>
          <ul className="mt-1.5 flex gap-2 overflow-x-auto pb-1" aria-label={`Atalhos para ${contaFoco?.nome}`}>
            {sugestoesEmpresa.map((texto) => (
              <li key={texto} className="shrink-0">
                <button
                  type="button"
                  onClick={() => void enviar(texto)}
                  disabled={processando}
                  className="rounded-full border border-white/20 px-3 py-1 text-[12px] whitespace-nowrap text-white transition-colors hover:border-interactive hover:bg-interactive/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {texto}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Campo */}
      <form
        className="border-t border-white/10 px-5 py-4 sm:px-8"
        onSubmit={(evento) => {
          evento.preventDefault();
          void enviar(rascunho);
        }}
      >
        <label htmlFor={campoId} className="sr-only">
          Pergunta para o Dialys
        </label>
        <div className="flex items-end gap-2 rounded-[8px] border border-white/15 bg-[#262626] p-2 focus-within:border-interactive">
          <textarea
            ref={campoRef}
            id={campoId}
            value={rascunho}
            onChange={(evento) => setRascunho(evento.target.value)}
            onKeyDown={onTeclado}
            rows={1}
            aria-describedby={dicaId}
            placeholder={contaFoco ? `Pergunte sobre ${contaFoco.nome}...` : "Pergunte ao Dialys sobre empresas, reuniões e insights..."}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] leading-[1.5] text-white [field-sizing:content] placeholder:text-[#8D8D8D] focus:outline-none"
          />
          <button
            type="submit"
            disabled={processando || !rascunho.trim() || longo}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[6px] bg-interactive px-4 text-[13px] font-medium text-on-interactive transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:bg-[#525252] disabled:text-[#A8A8A8]"
          >
            <span className="hidden sm:inline">{processando ? "Enviando…" : "Enviar"}</span>
            <Send size={16} aria-hidden="true" />
            <span className="sr-only sm:hidden">Enviar</span>
          </button>
        </div>
        <p id={dicaId} className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-text-on-shell-muted">
          <span>
            Enter envia · Shift+Enter quebra a linha · Só o briefing é respondido em voz · O Dialys só lê os dados; não registra nem envia
            nada.
          </span>
          {rascunho.length > LIMITE - 200 ? (
            <span className={cn("tabular-nums", longo && "text-[#FFB3B8]")}>
              {rascunho.length}/{LIMITE}
            </span>
          ) : null}
        </p>
      </form>
    </section>
  );
}
