"use client";

import { ArrowRight, OverflowMenuVertical, Search } from "@carbon/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ItemMenu, MenuSuspenso } from "@/components/ui/menu-suspenso";
import { ModalConfirmacao } from "@/components/ui/modal-confirmacao";
import { useToast } from "@/components/ui/provedor-toast";
import { api, ErroDaApi, type ClienteResumo } from "@/lib/api-cliente";
import { EVENTO_CARTEIRA_ALTERADA } from "@/lib/eventos";
import { cn } from "@/lib/cn";
import { ROTULO_FAIXA, type FaixaSaude } from "@/lib/saude";

const POR_PAGINA = 10;

const COR_FAIXA: Record<FaixaSaude, string> = {
  risco: "bg-[#FFD7D9] text-[#A2191F]",
  estavel: "bg-[#FCF4D6] text-[#684E00]",
  saudavel: "bg-[#A7F0BA] text-[#044317]",
};

const linkCliente = (cliente: ClienteResumo) => `/insights?${new URLSearchParams({ conta: cliente.id })}`;

function Situacao({ situacao }: { situacao: ClienteResumo["situacao"] }) {
  if (!situacao) {
    return (
      <span className="rounded-full border border-dashed border-[#A8A8A8] px-2 py-0.5 text-[11px] text-text-secondary" title="Nenhuma reunião analisada ainda">
        Sem avaliação
      </span>
    );
  }
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums", COR_FAIXA[situacao.faixa])} title="Saúde da última reunião analisada (0 a 10)">
      {ROTULO_FAIXA[situacao.faixa]} · {situacao.nota.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
    </span>
  );
}

type Estado = { clientes: ClienteResumo[]; total: number; demonstracao: boolean; termo: string };

/** Lista compacta da carteira do usuário (o servidor filtra pelo escopo dele), com busca e "Carregar mais". */
export function MeusClientes() {
  const toast = useToast();
  const [busca, setBusca] = useState("");
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
  /** Incrementado quando a carteira muda fora daqui ("Restaurar demonstração"): refaz a busca. */
  const [versao, setVersao] = useState(0);
  const [removendo, setRemovendo] = useState<ClienteResumo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erroRemocao, setErroRemocao] = useState<string | null>(null);
  /** Trava síncrona contra clique duplo em "Remover". */
  const removendoAgora = useRef(false);

  useEffect(() => {
    const aoMudar = () => setVersao((v) => v + 1);
    window.addEventListener(EVENTO_CARTEIRA_ALTERADA, aoMudar);
    return () => window.removeEventListener(EVENTO_CARTEIRA_ALTERADA, aoMudar);
  }, []);

  // Busca no servidor, com uma pausa curta enquanto a pessoa digita.
  useEffect(() => {
    const termo = busca.trim();
    let valido = true;
    const timer = window.setTimeout(
      async () => {
        try {
          const lista = await api.listarClientes({ busca: termo, limite: POR_PAGINA });
          if (valido) {
            setEstado({ clientes: lista.dados, total: lista.paginacao.total, demonstracao: lista.modo === "demonstracao", termo });
            setErro(null);
          }
        } catch (falha) {
          if (valido) setErro(falha instanceof ErroDaApi ? falha.message : "Não foi possível carregar os clientes.");
        }
      },
      termo ? 250 : 0,
    );
    return () => {
      valido = false;
      window.clearTimeout(timer);
    };
  }, [busca, versao]);

  /** Tira o cliente só da carteira deste usuário (DELETE /api/v1/carteira/{id}); histórico e reuniões ficam. */
  async function remover() {
    if (!removendo || removendoAgora.current) return;
    removendoAgora.current = true;
    setOcupado(true);
    setErroRemocao(null);
    try {
      await api.removerDaCarteira(removendo.id);
      const removido = removendo;
      // Atualiza a lista na hora; "Carregar mais" continua do ponto certo porque o servidor também já não o conta.
      setEstado((atual) =>
        atual ? { ...atual, clientes: atual.clientes.filter((c) => c.id !== removido.id), total: Math.max(0, atual.total - 1) } : atual,
      );
      setRemovendo(null);
      window.dispatchEvent(new Event(EVENTO_CARTEIRA_ALTERADA + ":agenda"));
      toast({ titulo: "Cliente removido da sua carteira", descricao: `${removido.nome} saiu de "Meus clientes". Reuniões, transcrições e compromissos continuam disponíveis.` });
    } catch (falha) {
      // Erro fica no modal: nada foi removido.
      setErroRemocao(falha instanceof ErroDaApi ? falha.message : "Não foi possível remover o cliente. Tente novamente.");
    } finally {
      removendoAgora.current = false;
      setOcupado(false);
    }
  }

  async function carregarMais() {
    if (!estado) return;
    setCarregandoMais(true);
    try {
      const lista = await api.listarClientes({ busca: estado.termo, limite: POR_PAGINA, offset: estado.clientes.length });
      setEstado((atual) => (atual && atual.termo === estado.termo ? { ...atual, clientes: [...atual.clientes, ...lista.dados], total: lista.paginacao.total } : atual));
    } catch (falha) {
      setErro(falha instanceof ErroDaApi ? falha.message : "Não foi possível carregar mais clientes.");
    } finally {
      setCarregandoMais(false);
    }
  }

  return (
    <section aria-labelledby="titulo-meus-clientes" className="flex flex-col rounded-[12px] border border-border-subtle bg-layer-01">
      <div className="px-4 pt-4 sm:px-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="titulo-meus-clientes" className="text-[18px] leading-6 font-normal text-text-primary">
            Meus clientes
          </h2>
          {estado ? (
            <span className="text-[12px] text-text-secondary tabular-nums" aria-live="polite">
              {estado.total} {estado.total === 1 ? "cliente" : "clientes"}
            </span>
          ) : null}
        </div>
        <label htmlFor="busca-meus-clientes" className="sr-only">
          Buscar cliente pelo nome
        </label>
        <div className="relative mt-3">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-helper" aria-hidden="true" />
          <input
            id="busca-meus-clientes"
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar pelo nome"
            maxLength={100}
            className="h-10 w-full border-0 border-b border-border-strong bg-field-01 pr-3 pl-9 text-[13px] text-text-primary placeholder:text-text-placeholder focus:outline-2 focus:-outline-offset-2 focus:outline-focus"
          />
        </div>
      </div>

      {erro && !estado ? (
        <p role="alert" className="px-5 py-8 text-center text-[13px] text-support-error">
          {erro}
        </p>
      ) : !estado ? (
        <ul aria-busy="true" aria-label="Carregando clientes" className="mt-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="mx-4 my-3 h-9 animate-pulse rounded-[4px] bg-[#F2F2F2] sm:mx-5" />
          ))}
        </ul>
      ) : estado.clientes.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-text-secondary">
          {estado.termo ? `Nenhum cliente encontrado para “${estado.termo}”.` : "Nenhum cliente na sua carteira ainda."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
          {estado.clientes.map((cliente) => (
            <li key={cliente.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] leading-5 font-medium text-text-primary" title={cliente.nome}>
                  {cliente.nome}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Situacao situacao={cliente.situacao} />
                  {cliente.segmento ? <span className="text-[12px] text-text-helper">{cliente.segmento}</span> : null}
                </div>
              </div>
              <MenuSuspenso rotulo={`Ações de ${cliente.nome}`} gatilho={<OverflowMenuVertical size={16} />} className="shrink-0">
                {(fechar) => (
                  <ItemMenu
                    perigo
                    onSelect={() => {
                      fechar();
                      setErroRemocao(null);
                      setRemovendo(cliente);
                    }}
                  >
                    Remover cliente
                  </ItemMenu>
                )}
              </MenuSuspenso>
              <Link
                href={linkCliente(cliente)}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[4px] border border-[#8D8D8D] px-2.5 text-[12px] font-medium text-text-primary transition-colors hover:bg-[#F2F2F2]"
                aria-label={`Ver cliente ${cliente.nome}`}
              >
                Ver cliente
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {estado && estado.clientes.length < estado.total ? (
        <div className="border-t border-border-subtle px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={carregarMais}
            disabled={carregandoMais}
            className="h-9 w-full rounded-[4px] text-[13px] font-medium text-[#0F62FE] transition-colors hover:bg-[#EDF5FF] disabled:cursor-wait disabled:text-text-helper"
          >
            {carregandoMais ? "Carregando..." : `Carregar mais (${estado.total - estado.clientes.length})`}
          </button>
        </div>
      ) : null}
      {erro && estado ? (
        <p role="alert" className="px-5 pb-3 text-[12px] text-support-error">
          {erro}
        </p>
      ) : null}

      <ModalConfirmacao
        aberto={Boolean(removendo)}
        rotulo="Meus clientes"
        titulo={`Remover ${removendo?.nome ?? "cliente"} da sua carteira?`}
        rotuloConfirmar="Remover"
        rotuloOcupado="Removendo..."
        perigo
        ocupado={ocupado}
        onConfirmar={() => void remover()}
        onCancelar={() => setRemovendo(null)}
      >
        <p>
          <strong className="font-semibold">{removendo?.nome}</strong> deixa de aparecer em “Meus clientes” só para você. O cadastro, as
          reuniões, as transcrições, o histórico e os compromissos já marcados continuam como estão, e a carteira de outros usuários não muda.
        </p>
        {erroRemocao ? (
          <p role="alert" className="mt-3 text-[13px] text-support-error">
            {erroRemocao}
          </p>
        ) : null}
      </ModalConfirmacao>
    </section>
  );
}
