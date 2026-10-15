"use client";

import { ChevronLeft, ChevronRight, DocumentAdd, Filter, OverflowMenuVertical, Search } from "@carbon/icons-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ItemMenu, MenuSuspenso, TituloMenu } from "@/components/ui/menu-suspenso";
import { ModalConfirmacao } from "@/components/ui/modal-confirmacao";
import { useToast } from "@/components/ui/provedor-toast";
import { api, ErroDaApi } from "@/lib/api-cliente";
import { cn } from "@/lib/cn";
import { formatarData, normalizarBusca } from "@/lib/formatar";
import { criticidadeConta, type Criticidade, type ReuniaoCentral, type TipoSinal } from "@/lib/insights";
import { DetalheConta, DetalheSemTranscricao } from "./detalhe-conta";

type Filtro = "todos" | TipoSinal | "produtos" | "sem_transcricao";
type Ordem = "prioridade" | "recentes" | "cliente" | "codigo";

const FILTROS: Array<{ id: Filtro; rotulo: string }> = [
  { id: "todos", rotulo: "Todas as reuniões" },
  { id: "churn", rotulo: "Risco de churn" },
  { id: "oportunidade", rotulo: "Oportunidades" },
  { id: "objecao", rotulo: "Objeções" },
  { id: "produtos", rotulo: "Produtos TOTVS citados" },
  { id: "sem_transcricao", rotulo: "Transcrição removida" },
];

const ORDENS: Array<{ id: Ordem; rotulo: string }> = [
  { id: "prioridade", rotulo: "Prioridade comercial" },
  { id: "recentes", rotulo: "Reunião mais recente" },
  { id: "cliente", rotulo: "Cliente (A–Z)" },
  { id: "codigo", rotulo: "ID da reunião" },
];

const POR_PAGINA = 8;

const CRITICIDADE: Record<Criticidade, { rotulo: string; classe: string }> = {
  alta: { rotulo: "Alta", classe: "bg-[#FFD7D9] text-[#A2191F]" },
  atencao: { rotulo: "Atenção", classe: "bg-[#FFE8BA] text-[#8A3800]" },
  baixa: { rotulo: "Baixa", classe: "bg-[#E0E0E0] text-[#525252]" },
};

function atendeFiltro(reuniao: ReuniaoCentral, filtro: Filtro) {
  if (filtro === "sem_transcricao") return !reuniao.detalhe;
  if (filtro === "todos") return true;
  const detalhe = reuniao.detalhe;
  if (!detalhe) return false;
  if (filtro === "produtos") return detalhe.produtos.some((produto) => produto.contexto !== "concorrente");
  return detalhe.sinais.some((sinal) => sinal.tipo === filtro);
}

function ordenar(reunioes: ReuniaoCentral[], ordem: Ordem) {
  if (ordem === "prioridade") return reunioes; // o servidor já entrega da mais crítica para a menos
  return [...reunioes].sort((a, b) => {
    if (ordem === "cliente") return a.conta.nome.localeCompare(b.conta.nome, "pt-BR") || b.momento.localeCompare(a.momento);
    // Pelo ID da TOTVS (o código exibido); reuniões sem ele, pelo número sequencial, depois das que têm.
    if (ordem === "codigo") return Number(a.idTotvs ?? Infinity) - Number(b.idTotvs ?? Infinity) || a.numero - b.numero;
    return b.momento.localeCompare(a.momento);
  });
}

/** Data da reunião; sem data informada, diz isso (a data do processamento não é a da reunião). */
function CelulaData({ reuniao }: { reuniao: ReuniaoCentral }) {
  if (reuniao.data) return <span className="font-mono text-[11px] text-text-secondary">{formatarData(reuniao.data)}</span>;
  return (
    <span className="text-[11px] text-text-helper italic" title={`A reunião não trouxe data. Processada em ${formatarData(reuniao.processadaEm)}.`}>
      Sem data
    </span>
  );
}

function SemReunioes() {
  return (
    <div className="mt-6 border border-border-subtle bg-layer-01 px-6 py-16 text-center">
      <p className="text-[16px] leading-6 font-medium text-text-primary">Nenhuma reunião analisada ainda</p>
      <p className="mx-auto mt-2 max-w-[460px] text-[13px] leading-[1.6] text-text-secondary">
        Cada transcrição enviada e analisada entra aqui automaticamente, uma linha por reunião, com o cliente, os sinais, as evidências
        literais e a recomendação comercial.
      </p>
      <Link
        href="/envio"
        className="mt-6 inline-flex h-10 items-center gap-3 rounded-[4px] bg-interactive px-4 text-[13px] font-medium text-on-interactive hover:bg-interactive-hover"
      >
        Enviar uma transcrição
        <DocumentAdd size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Reunião inicial: ?reuniao= exata; ?conta= abre a reunião mais recente desse cliente. */
function reuniaoInicial(todas: ReuniaoCentral[], reuniaoId: string | null, contaId: string | null) {
  if (reuniaoId && todas.some((r) => r.id === reuniaoId)) return reuniaoId;
  if (contaId) {
    const doCliente = todas.filter((r) => r.conta.id === contaId);
    const ativa = doCliente.filter((r) => r.detalhe).sort((a, b) => b.momento.localeCompare(a.momento))[0];
    return (ativa ?? doCliente.sort((a, b) => b.momento.localeCompare(a.momento))[0])?.id ?? null;
  }
  return null;
}

/** Filtro inicial: ?filtro=churn|oportunidade|objecao|... (vindo do dashboard); valor desconhecido vira "todos". */
function filtroInicial(valor: string | null): Filtro {
  return FILTROS.find((f) => f.id === valor)?.id ?? "todos";
}

export function CentralInsights({ reunioes: todas }: { reunioes: ReuniaoCentral[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const avisar = useToast();

  const filtroDaUrl = searchParams.get("filtro");
  const [filtro, setFiltro] = useState<Filtro>(() => filtroInicial(filtroDaUrl));
  const [ordem, setOrdem] = useState<Ordem>("prioridade");
  const [busca, setBusca] = useState("");
  // A seleção é sempre o id da reunião: ordenar, filtrar ou remover outras linhas não muda o que está aberto.
  const [selecionadaId, setSelecionadaId] = useState(() => reuniaoInicial(todas, searchParams.get("reuniao"), searchParams.get("conta")));
  const [pagina, setPagina] = useState(() => {
    const indice = todas.findIndex((r) => r.id === selecionadaId);
    return indice > 0 ? Math.floor(indice / POR_PAGINA) : 0;
  });
  // A página fica preservada entre navegações (Activity): o useState acima não roda de novo, então um link com
  // outro ?filtro= (ex.: "Ver todos" do dashboard) reaplica o filtro aqui.
  const [ultimoFiltroDaUrl, setUltimoFiltroDaUrl] = useState(filtroDaUrl);
  if (filtroDaUrl !== ultimoFiltroDaUrl) {
    setUltimoFiltroDaUrl(filtroDaUrl);
    setFiltro(filtroInicial(filtroDaUrl));
    setPagina(0);
  }
  const [sincronizando, setSincronizando] = useState(false);
  const [erroCrm, setErroCrm] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [removendo, setRemovendo] = useState<ReuniaoCentral | null>(null);
  const [ocupadoRemocao, setOcupadoRemocao] = useState(false);
  const [erroRemocao, setErroRemocao] = useState<string | null>(null);
  /** Trava síncrona: dois cliques seguidos em "Remover" mandam um pedido só (o estado só muda no próximo render). */
  const removendoAgora = useRef(false);
  /** Depois de remover, a linha (que vai para o fim da lista) continua visível: a página acompanha. */
  const [acompanharSelecionada, setAcompanharSelecionada] = useState(false);
  const detalheRef = useRef<HTMLDivElement>(null);

  const totais = useMemo(
    () => Object.fromEntries(FILTROS.map(({ id }) => [id, todas.filter((r) => atendeFiltro(r, id)).length])) as Record<Filtro, number>,
    [todas],
  );

  const reunioes = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    const filtradas = todas.filter(
      (r) => atendeFiltro(r, filtro) && (!termo || normalizarBusca(`${r.codigo} ${r.idTotvs ?? ""} ${r.conta.nome} ${r.conta.segmento ?? ""}`).includes(termo)),
    );
    return ordenar(filtradas, ordem);
  }, [todas, filtro, busca, ordem]);

  if (acompanharSelecionada) {
    const indice = reunioes.findIndex((r) => r.id === selecionadaId && !r.detalhe);
    if (indice >= 0) {
      setAcompanharSelecionada(false);
      setPagina(Math.floor(indice / POR_PAGINA));
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(reunioes.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const daPagina = reunioes.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);

  // Se o filtro esconder a reunião aberta, o detalhe acompanha a primeira reunião visível.
  const selecionada = reunioes.find((r) => r.id === selecionadaId) ?? daPagina[0] ?? null;

  function selecionar(reuniao: ReuniaoCentral, rolar = true) {
    setSelecionadaId(reuniao.id);
    setErroCrm(null);
    router.replace(urlCentral(reuniao.id, filtro), { scroll: false });
    if (rolar && window.matchMedia("(max-width: 1023px)").matches) {
      detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /** A URL guarda a reunião aberta e o filtro: recarregar ou voltar pelo dashboard mantém os dois coerentes. */
  function urlCentral(reuniaoId: string | null | undefined, filtroAtual: Filtro) {
    const params = new URLSearchParams();
    if (reuniaoId) params.set("reuniao", reuniaoId);
    if (filtroAtual !== "todos") params.set("filtro", filtroAtual);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function mudarFiltro(novo: Filtro) {
    setFiltro(novo);
    setPagina(0);
    setUltimoFiltroDaUrl(novo === "todos" ? null : novo);
    router.replace(urlCentral(selecionadaId, novo), { scroll: false });
  }

  async function copiarLink(reuniao: ReuniaoCentral) {
    const url = `${window.location.origin}/insights?reuniao=${encodeURIComponent(reuniao.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      avisar({ titulo: "Link copiado", descricao: `Quem abrir o link vai direto para a ${reuniao.codigo} (${reuniao.conta.nome}).` });
    } catch {
      avisar({ titulo: "Não foi possível copiar", descricao: url });
    }
  }

  /** "Sincronizar e Enriquecer CRM" (no detalhe ou no menu da linha): confere se há o que enviar e pede confirmação. */
  function pedirSincronizacao(reuniao: ReuniaoCentral | null = selecionada) {
    if (!reuniao || sincronizando) return;
    if (reuniao.id !== selecionada?.id) selecionar(reuniao, false);
    if (!reuniao.detalhe) {
      setErroCrm("A transcrição desta reunião foi removida; não há insights ativos para enviar ao CRM.");
      return;
    }
    if (reuniao.detalhe.insightIds.length === 0) {
      setErroCrm("Esta reunião não tem sinais para enviar ao CRM.");
      return;
    }
    setErroCrm(null);
    setConfirmando(true);
  }

  /** Envia cada insight da reunião pelo webhook de enriquecimento (POST /api/v1/crm/sincronizar, US-06). */
  async function sincronizarCrm() {
    const detalhe = selecionada?.detalhe;
    if (!selecionada || !detalhe || sincronizando) return;
    setSincronizando(true);
    try {
      const protocolos: string[] = [];
      // Em sequência: o registro no banco é uma transação por vez, e a ordem dos protocolos fica estável.
      for (const insightId of detalhe.insightIds) protocolos.push((await api.sincronizarCrm(insightId)).protocolo);
      setConfirmando(false);
      avisar({
        titulo: "CRM da TOTVS atualizado!",
        descricao: `${protocolos.length} ${protocolos.length === 1 ? "insight" : "insights"} da ${selecionada.codigo} (${selecionada.conta.nome}) enviados com evidência e recomendação, sem nenhuma nota manual do vendedor. Protocolo ${protocolos[0]}.`,
      });
      router.refresh();
    } catch (erro) {
      setConfirmando(false);
      setErroCrm(erro instanceof Error ? erro.message : "Não foi possível enviar ao CRM.");
    } finally {
      setSincronizando(false);
    }
  }

  function pedirRemocao(reuniao: ReuniaoCentral) {
    if (!reuniao.detalhe) return;
    setErroRemocao(null);
    setRemovendo(reuniao);
  }

  /** Remoção lógica só da transcrição desta reunião. Um clique por vez; erro não é mostrado como sucesso. */
  async function removerTranscricao() {
    if (!removendo || removendoAgora.current) return;
    removendoAgora.current = true;
    setOcupadoRemocao(true);
    setErroRemocao(null);
    try {
      const r = await api.removerTranscricao(removendo.id);
      setRemovendo(null);
      setSelecionadaId(r.reuniaoId);
      setAcompanharSelecionada(true);
      avisar({
        titulo: r.jaRemovida ? "A transcrição já estava removida" : "Transcrição removida",
        descricao: `${r.codigo} (${r.conta.nome}): a análise desta transcrição saiu da Central, do Dashboard e do assistente. O registro da reunião continua.`,
      });
      // Recarrega os dados do servidor (lista, detalhe e contagens) sem recarregar a página.
      router.refresh();
    } catch (erro) {
      setErroRemocao(erro instanceof ErroDaApi ? erro.message : "Não foi possível remover a transcrição. Nada foi alterado.");
    } finally {
      removendoAgora.current = false;
      setOcupadoRemocao(false);
    }
  }

  if (todas.length === 0) return <SemReunioes />;

  const filtroAtivo = filtro !== "todos" || ordem !== "prioridade";
  const primeiro = reunioes.length === 0 ? 0 : paginaAtual * POR_PAGINA + 1;
  const ultimo = paginaAtual * POR_PAGINA + daPagina.length;
  const plural = (n: number) => (n === 1 ? "reunião" : "reuniões");

  return (
    <>
      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[440px_minmax(0,1fr)] xl:grid-cols-[520px_minmax(0,1fr)]">
        {/* Master: uma linha por reunião */}
        <div className="print:hidden">
          <section aria-labelledby="titulo-reunioes" className="border border-border-subtle bg-layer-01">
            <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
              <div>
                <h2 id="titulo-reunioes" className="text-[16px] leading-6 font-semibold text-text-primary">
                  Reuniões processadas
                </h2>
                <p className="text-[12px] text-text-secondary">Selecione uma reunião para ver o detalhamento.</p>
              </div>
              <span className="mt-0.5 shrink-0 rounded-full bg-[#E0E0E0] px-2.5 py-0.5 text-[11px] font-medium text-text-primary tabular-nums">
                {todas.length} {plural(todas.length)}
              </span>
            </div>

            {/* Busca + filtro/ordenação */}
            <div className="flex items-center gap-1 border-y border-border-subtle bg-field-01 pr-1">
              <label htmlFor="busca-reunioes" className="sr-only">
                Buscar por cliente ou código da reunião
              </label>
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-helper" aria-hidden="true" />
                <input
                  id="busca-reunioes"
                  type="search"
                  value={busca}
                  onChange={(event) => {
                    setBusca(event.target.value);
                    setPagina(0);
                  }}
                  placeholder="Buscar cliente ou ID da reunião (ex.: 1394492)"
                  className="h-10 w-full bg-transparent pr-2 pl-9 text-[13px] text-text-primary placeholder:text-text-placeholder focus:outline-2 focus:-outline-offset-2 focus:outline-focus"
                />
              </div>
              <MenuSuspenso
                rotulo="Filtrar e ordenar reuniões"
                gatilho={
                  <span className="relative">
                    <Filter size={16} />
                    {filtroAtivo ? <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-interactive" aria-hidden="true" /> : null}
                  </span>
                }
              >
                {(fechar) => (
                  <>
                    <TituloMenu>Filtrar</TituloMenu>
                    {FILTROS.map((item) => (
                      <ItemMenu
                        key={item.id}
                        marcado={filtro === item.id}
                        onSelect={() => {
                          mudarFiltro(item.id);
                          fechar();
                        }}
                      >
                        {item.rotulo}
                        <span className="text-[12px] font-normal text-text-helper tabular-nums">{totais[item.id]}</span>
                      </ItemMenu>
                    ))}
                    <div className="my-1 border-t border-border-subtle" />
                    <TituloMenu>Ordenar por</TituloMenu>
                    {ORDENS.map((item) => (
                      <ItemMenu
                        key={item.id}
                        marcado={ordem === item.id}
                        onSelect={() => {
                          setOrdem(item.id);
                          setPagina(0);
                          fechar();
                        }}
                      >
                        {item.rotulo}
                      </ItemMenu>
                    ))}
                  </>
                )}
              </MenuSuspenso>
            </div>

            {filtro !== "todos" ? (
              <p className="flex items-center justify-between border-b border-border-subtle bg-[#FFF8E6] px-4 py-1.5 text-[12px] text-text-primary">
                Filtro: {FILTROS.find((f) => f.id === filtro)?.rotulo}
                <button type="button" onClick={() => mudarFiltro("todos")} className="font-medium underline underline-offset-[3px]">
                  Limpar
                </button>
              </p>
            ) : null}

            {/* Tabela */}
            <table className="w-full table-fixed border-collapse text-left">
              <caption className="sr-only">Reuniões analisadas, uma por linha</caption>
              <thead>
                <tr className="border-b border-border-subtle bg-[#F4F4F4] text-[11px] font-semibold text-text-primary">
                  <th scope="col" className="w-[92px] py-2.5 pl-4">
                    Reunião
                  </th>
                  <th scope="col" className="py-2.5 pl-2">
                    Cliente
                  </th>
                  <th scope="col" className="w-[76px] py-2.5">
                    Data
                  </th>
                  <th scope="col" className="w-[74px] py-2.5">
                    Criticidade
                  </th>
                  <th scope="col" className="hidden w-[92px] py-2.5 xl:table-cell">
                    Análise
                  </th>
                  <th scope="col" className="w-10 py-2.5">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {daPagina.map((reuniao) => {
                  const ativa = reuniao.id === selecionada?.id;
                  const criticidade = reuniao.detalhe ? CRITICIDADE[criticidadeConta(reuniao.detalhe.sinais)] : null;
                  return (
                    <tr
                      key={reuniao.id}
                      onClick={() => selecionar(reuniao)}
                      className={cn(
                        "h-14 cursor-pointer border-b border-border-subtle text-[12px] transition-colors last:border-b-0",
                        ativa ? "bg-[#FFF8E6] outline-2 -outline-offset-2 outline-interactive" : "hover:bg-[#F7F7F7]",
                        !reuniao.detalhe && "text-text-helper",
                      )}
                    >
                      <td className="py-2 pl-4">
                        <button
                          type="button"
                          onClick={(evento) => {
                            evento.stopPropagation();
                            selecionar(reuniao);
                          }}
                          aria-current={ativa ? "true" : undefined}
                          aria-label={`${reuniao.codigo}, ${reuniao.conta.nome}`}
                          className={cn("block w-full text-left font-mono text-[12px] whitespace-nowrap text-text-primary", ativa && "font-semibold")}
                        >
                          {/* ID da reunião no sistema da TOTVS; sem ele (transcrição colada à mão), o código da conta. */}
                          {reuniao.idTotvs ? <span title="ID da reunião na TOTVS">#{reuniao.idTotvs}</span> : reuniao.codigo}
                        </button>
                      </td>
                      <td className="truncate py-2 pl-2 text-[13px] text-text-primary" title={reuniao.conta.nome}>
                        {reuniao.conta.nome}
                      </td>
                      <td className="py-2">
                        <CelulaData reuniao={reuniao} />
                      </td>
                      <td className="py-2">
                        {criticidade ? (
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", criticidade.classe)}>{criticidade.rotulo}</span>
                        ) : (
                          <span className="text-[11px]" title="Sem transcrição ativa">
                            —
                          </span>
                        )}
                      </td>
                      <td
                        className={cn("hidden py-2 text-[11px] xl:table-cell", reuniao.detalhe ? "text-[#198038]" : "text-text-helper")}
                        title={reuniao.detalhe?.sincronizadosCrm ? "Insights já enviados ao CRM" : undefined}
                      >
                        {!reuniao.detalhe ? "Sem transcrição" : reuniao.detalhe.sincronizadosCrm > 0 ? "No CRM" : "Concluída"}
                      </td>
                      <td className="py-2 pr-1">
                        <MenuSuspenso rotulo={`Ações da ${reuniao.codigo}`} gatilho={<OverflowMenuVertical size={16} />}>
                          {(fechar) => (
                            <>
                              <ItemMenu
                                onSelect={() => {
                                  fechar();
                                  selecionar(reuniao);
                                }}
                              >
                                Ver detalhamento
                              </ItemMenu>
                              {reuniao.detalhe ? (
                                <ItemMenu
                                  onSelect={() => {
                                    fechar();
                                    pedirSincronizacao(reuniao);
                                  }}
                                >
                                  Sincronizar com o CRM
                                </ItemMenu>
                              ) : null}
                              <ItemMenu
                                onSelect={() => {
                                  fechar();
                                  void copiarLink(reuniao);
                                }}
                              >
                                Copiar link da reunião
                              </ItemMenu>
                              {reuniao.detalhe ? (
                                <>
                                  <div className="my-1 border-t border-border-subtle" />
                                  <ItemMenu
                                    perigo
                                    onSelect={() => {
                                      fechar();
                                      pedirRemocao(reuniao);
                                    }}
                                  >
                                    Remover transcrição
                                  </ItemMenu>
                                </>
                              ) : null}
                            </>
                          )}
                        </MenuSuspenso>
                      </td>
                    </tr>
                  );
                })}
                {daPagina.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-text-secondary">
                      {busca ? `Nenhuma reunião encontrada para “${busca}”.` : "Nenhuma reunião neste filtro."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {/* Paginação */}
            <div className="flex items-center justify-between gap-3 border-t border-border-subtle py-1 pr-1 pl-4 text-[12px] text-text-secondary">
              <span aria-live="polite">
                {primeiro}–{ultimo} de {reunioes.length} {plural(reunioes.length)}
              </span>
              <span className="flex items-center gap-1">
                <span className="mr-1 tabular-nums">
                  Página {paginaAtual + 1} de {totalPaginas}
                </span>
                <button
                  type="button"
                  onClick={() => setPagina(paginaAtual - 1)}
                  disabled={paginaAtual === 0}
                  aria-label="Página anterior"
                  className="flex h-8 w-8 items-center justify-center text-text-primary hover:bg-[#E8E8E8] disabled:text-[#C6C6C6] disabled:hover:bg-transparent"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setPagina(paginaAtual + 1)}
                  disabled={paginaAtual >= totalPaginas - 1}
                  aria-label="Próxima página"
                  className="flex h-8 w-8 items-center justify-center text-text-primary hover:bg-[#E8E8E8] disabled:text-[#C6C6C6] disabled:hover:bg-transparent"
                >
                  <ChevronRight size={16} />
                </button>
              </span>
            </div>
          </section>
          <p className="mt-2 px-1 text-[11px] leading-4 text-text-helper">
            Cada linha é uma reunião enviada e analisada; o código não muda ao ordenar, filtrar ou remover.
          </p>
        </div>

        {/* Detail: reunião selecionada */}
        <div ref={detalheRef} className="scroll-mt-16">
          {selecionada?.detalhe ? (
            <DetalheConta
              conta={selecionada.detalhe}
              reuniao={selecionada}
              sincronizando={sincronizando}
              erroCrm={erroCrm}
              onSincronizar={() => pedirSincronizacao()}
              onRemoverTranscricao={() => pedirRemocao(selecionada)}
            />
          ) : selecionada ? (
            <DetalheSemTranscricao reuniao={selecionada} />
          ) : (
            <div className="border border-border-subtle bg-layer-01 px-6 py-16 text-center text-[14px] text-text-secondary">
              Selecione uma reunião para ver o diagnóstico.
            </div>
          )}
        </div>
      </div>

      {selecionada?.detalhe ? (
        <ModalConfirmacao
          aberto={confirmando}
          rotulo={`${selecionada.codigo} · ${selecionada.conta.nome}`}
          titulo="Sincronizar e enriquecer o CRM?"
          rotuloConfirmar="Enviar ao CRM"
          ocupado={sincronizando}
          onConfirmar={() => void sincronizarCrm()}
          onCancelar={() => setConfirmando(false)}
        >
          <p>
            {selecionada.detalhe.insightIds.length === 1 ? "O insight" : `Os ${selecionada.detalhe.insightIds.length} insights`} desta reunião
            serão gravados no CRM da TOTVS com a citação literal do cliente, a criticidade e a ação recomendada.
          </p>
          <p className="mt-2 text-text-secondary">
            O vendedor não precisa digitar nenhuma nota.{" "}
            {selecionada.detalhe.sincronizadosCrm > 0
              ? `${selecionada.detalhe.sincronizadosCrm} já foram enviados antes e não serão duplicados.`
              : "Reenviar depois não duplica registros."}
          </p>
        </ModalConfirmacao>
      ) : null}

      <ModalConfirmacao
        aberto={Boolean(removendo)}
        rotulo={removendo ? `${removendo.codigo} · ${removendo.conta.nome}` : undefined}
        titulo={`Remover a transcrição da ${removendo?.codigo ?? "reunião"}?`}
        rotuloConfirmar="Remover"
        rotuloOcupado="Removendo..."
        perigo
        ocupado={ocupadoRemocao}
        onConfirmar={() => void removerTranscricao()}
        onCancelar={() => setRemovendo(null)}
      >
        <p>
          A transcrição da <strong className="font-semibold">{removendo?.codigo}</strong> de{" "}
          <strong className="font-semibold">{removendo?.conta.nome}</strong> deixa de ser usada. A análise gerada só a partir dela (sinais,
          evidências, diagnóstico e ações sugeridas) sai da Central, do Dashboard, dos indicadores e das respostas do Dialys.
        </p>
        <p className="mt-2 text-text-secondary">
          A reunião e o código {removendo?.codigo} continuam registrados, e as outras reuniões deste cliente não mudam.
          {removendo?.detalhe?.sincronizadosCrm ? " Os insights já enviados ao CRM não são apagados de lá." : ""}
        </p>
        {erroRemocao ? (
          <p role="alert" className="mt-3 text-[13px] text-support-error">
            {erroRemocao}
          </p>
        ) : null}
      </ModalConfirmacao>
    </>
  );
}
