"use client";

import { ArrowRight, Calendar, OverflowMenuVertical, Search } from "@carbon/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ItemMenu, MenuSuspenso } from "@/components/ui/menu-suspenso";
import { cn } from "@/lib/cn";
import { formatarData, normalizarBusca } from "@/lib/formatar";
import { horaNoFuso, rotuloDia, dataNoFuso } from "@/lib/fuso";
import type { FaixaSaude } from "@/lib/saude";
import type { ClienteListagem } from "@/server/clientes/perfil";
import { ConfirmarRemocaoCliente } from "./remover-cliente";
import { ContagemAlertas, CRITICIDADE, SituacaoCliente, TendenciaCliente } from "./visual-cliente";

type Filtro = "todos" | FaixaSaude | "sem_avaliacao" | "com_compromisso";
type Ordem = "prioridade" | "nome" | "recentes" | "alertas";

const FILTROS: Array<{ id: Filtro; rotulo: string; ponto?: string }> = [
  { id: "todos", rotulo: "Todos" },
  { id: "risco", rotulo: "Em risco", ponto: "bg-[#DA1E28]" },
  { id: "estavel", rotulo: "Estável", ponto: "bg-[#F1C21B]" },
  { id: "saudavel", rotulo: "Saudável", ponto: "bg-[#24A148]" },
  { id: "sem_avaliacao", rotulo: "Sem avaliação" },
  { id: "com_compromisso", rotulo: "Com reunião marcada" },
];

const ORDENS: Array<{ id: Ordem; rotulo: string }> = [
  { id: "prioridade", rotulo: "Prioridade (saúde)" },
  { id: "nome", rotulo: "Nome (A–Z)" },
  { id: "recentes", rotulo: "Reunião mais recente" },
  { id: "alertas", rotulo: "Mais alertas" },
];

const PESO_FAIXA: Record<FaixaSaude, number> = { risco: 0, estavel: 1, saudavel: 2 };

function atende(cliente: ClienteListagem, filtro: Filtro) {
  if (filtro === "todos") return true;
  if (filtro === "sem_avaliacao") return !cliente.saude;
  if (filtro === "com_compromisso") return Boolean(cliente.proximoCompromisso);
  return cliente.saude?.faixa === filtro;
}

const dataDaUltima = (c: ClienteListagem) => c.ultimaReuniao?.data ?? c.ultimaReuniao?.processadaEm.slice(0, 10) ?? "";
const totalAlertas = (c: ClienteListagem) => c.alertas.churn + c.alertas.oportunidade + c.alertas.objecao;

function ordenar(clientes: ClienteListagem[], ordem: Ordem) {
  return [...clientes].sort((a, b) => {
    if (ordem === "nome") return a.nome.localeCompare(b.nome, "pt-BR");
    if (ordem === "recentes") return dataDaUltima(b).localeCompare(dataDaUltima(a));
    if (ordem === "alertas") return totalAlertas(b) - totalAlertas(a) || a.nome.localeCompare(b.nome, "pt-BR");
    // Prioridade: em risco primeiro (nota menor), sem avaliação no fim.
    const pa = a.saude ? PESO_FAIXA[a.saude.faixa] * 100 + a.saude.nota : 999;
    const pb = b.saude ? PESO_FAIXA[b.saude.faixa] * 100 + b.saude.nota : 999;
    return pa - pb || a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/** Lista unificada de clientes: busca, filtro pela situação, ordenação e o próximo compromisso de cada um. */
export function ListaClientes({ clientes: recebidos, fuso }: { clientes: ClienteListagem[]; fuso: string }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [removendo, setRemovendo] = useState<ClienteListagem | null>(null);
  // Removidos nesta tela somem na hora; o refresh traz a lista do servidor logo depois.
  const [removidos, setRemovidos] = useState<Set<string>>(() => new Set());
  const clientes = useMemo(() => recebidos.filter((c) => !removidos.has(c.id)), [recebidos, removidos]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [ordem, setOrdem] = useState<Ordem>("prioridade");

  const totais = useMemo(
    () => Object.fromEntries(FILTROS.map(({ id }) => [id, clientes.filter((c) => atende(c, id)).length])) as Record<Filtro, number>,
    [clientes],
  );
  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return ordenar(
      clientes.filter((c) => atende(c, filtro) && (!termo || normalizarBusca(`${c.nome} ${c.segmento ?? ""}`).includes(termo))),
      ordem,
    );
  }, [clientes, busca, filtro, ordem]);

  if (clientes.length === 0) {
    return (
      <div className="mt-6 rounded-[12px] border border-border-subtle bg-layer-01 px-6 py-16 text-center">
        <p className="text-[16px] leading-6 font-medium text-text-primary">Nenhum cliente ainda</p>
        <p className="mx-auto mt-2 max-w-[460px] text-[13px] leading-[1.6] text-text-secondary">
          Cada reunião enviada e analisada cria (ou atualiza) o cliente dela aqui, com o histórico, os alertas e a agenda.
        </p>
        <Link
          href="/envio"
          className="mt-6 inline-flex h-10 items-center gap-3 rounded-[4px] bg-interactive px-4 text-[13px] font-medium text-on-interactive hover:bg-interactive-hover"
        >
          Enviar uma reunião
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <section aria-labelledby="titulo-lista-clientes" className="mt-6 rounded-[12px] border border-border-subtle bg-layer-01">
      <h2 id="titulo-lista-clientes" className="sr-only">
        Lista de clientes
      </h2>
      <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label htmlFor="busca-clientes-aba" className="sr-only">
            Buscar cliente pelo nome ou segmento
          </label>
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-helper"
              aria-hidden="true"
            />
            <input
              id="busca-clientes-aba"
              type="search"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar pelo nome ou segmento"
              className="h-10 w-full border-0 border-b border-border-strong bg-field-01 pr-3 pl-9 text-[13px] text-text-primary placeholder:text-text-placeholder focus:outline-2 focus:-outline-offset-2 focus:outline-focus"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-text-secondary">
            Ordenar por
            <select
              value={ordem}
              onChange={(evento) => setOrdem(evento.target.value as Ordem)}
              className="h-10 border-0 border-b border-border-strong bg-field-01 px-2 text-[13px] text-text-primary focus:outline-2 focus:-outline-offset-2 focus:outline-focus"
            >
              {ORDENS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div role="group" aria-label="Filtrar pela situação" className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors",
                filtro === f.id
                  ? "border-shell bg-shell font-medium text-white"
                  : "border-[#C6C6C6] bg-layer-01 text-text-primary hover:bg-[#F2F2F2]",
              )}
            >
              {f.ponto ? <span className={cn("h-2 w-2 rounded-full", f.ponto)} aria-hidden="true" /> : null}
              {f.rotulo}
              <span className="text-[11px] tabular-nums opacity-80">{totais[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Clientes com reuniões no Dialys</caption>
        <thead className="hidden bg-[#F4F4F4] text-[11px] font-semibold text-text-primary md:table-header-group">
          <tr>
            <th scope="col" className="py-2.5 pl-5">
              Cliente
            </th>
            <th scope="col" className="py-2.5">
              Situação
            </th>
            <th scope="col" className="py-2.5">
              Criticidade
            </th>
            <th scope="col" className="py-2.5">
              Reuniões
            </th>
            <th scope="col" className="py-2.5">
              Alertas
            </th>
            <th scope="col" className="hidden py-2.5 lg:table-cell">
              Próxima reunião marcada
            </th>
            <th scope="col" className="py-2.5 pr-5">
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((cliente) => {
            const proximo = cliente.proximoCompromisso;
            const dia = proximo ? dataNoFuso(new Date(proximo.inicio), fuso) : null;
            return (
              <tr
                key={cliente.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border-subtle px-4 py-3 text-[13px] md:table-row md:px-0 md:py-0"
              >
                <td className="w-full md:w-auto md:py-3 md:pr-4 md:pl-5">
                  <Link href={`/contas/${encodeURIComponent(cliente.id)}`} className="font-medium text-text-primary hover:underline">
                    {cliente.nome}
                  </Link>
                  {cliente.segmento ? <span className="block text-[12px] text-text-helper">{cliente.segmento}</span> : null}
                </td>
                <td className="md:py-3 md:pr-4">
                  <span className="inline-flex items-center gap-1.5">
                    <SituacaoCliente saude={cliente.saude} />
                    <TendenciaCliente tendencia={cliente.tendencia} />
                  </span>
                </td>
                <td className="md:py-3 md:pr-4">
                  {cliente.criticidade ? (
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", CRITICIDADE[cliente.criticidade].classe)}>
                      {CRITICIDADE[cliente.criticidade].rotulo}
                    </span>
                  ) : (
                    <span className="text-[12px] text-text-helper">—</span>
                  )}
                </td>
                <td className="text-text-secondary md:py-3 md:pr-4">
                  <span className="tabular-nums">{cliente.totalReunioes}</span>
                  {cliente.ultimaReuniao ? (
                    <span className="block text-[11px] text-text-helper">
                      última: {cliente.ultimaReuniao.data ? formatarData(cliente.ultimaReuniao.data) : "sem data"}
                    </span>
                  ) : null}
                </td>
                <td className="md:py-3 md:pr-4">
                  <ContagemAlertas alertas={cliente.alertas} />
                </td>
                <td className="hidden text-[12px] text-text-secondary md:py-3 md:pr-4 lg:table-cell">
                  {proximo && dia ? (
                    <span className="inline-flex items-center gap-1.5" title={proximo.titulo}>
                      <Calendar size={14} aria-hidden="true" />
                      <span className="first-letter:uppercase">
                        {rotuloDia(dia)} · {horaNoFuso(new Date(proximo.inicio), fuso)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-text-helper">—</span>
                  )}
                </td>
                <td className="ml-auto md:py-2.5 md:pr-5 md:text-right">
                  <span className="inline-flex items-center gap-1">
                    <Link
                      href={`/contas/${encodeURIComponent(cliente.id)}`}
                      className="inline-flex h-8 items-center gap-1 rounded-[4px] border border-[#8D8D8D] px-2.5 text-[12px] font-medium whitespace-nowrap text-text-primary transition-colors hover:bg-[#F2F2F2]"
                      aria-label={`Ver cliente ${cliente.nome}`}
                    >
                      Ver cliente
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                    <MenuSuspenso rotulo={`Ações de ${cliente.nome}`} gatilho={<OverflowMenuVertical size={16} />}>
                      {(fechar) => (
                        <ItemMenu
                          perigo
                          onSelect={() => {
                            fechar();
                            setRemovendo(cliente);
                          }}
                        >
                          Remover cliente
                        </ItemMenu>
                      )}
                    </MenuSuspenso>
                  </span>
                </td>
              </tr>
            );
          })}
          {visiveis.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-5 py-10 text-center text-[13px] text-text-secondary">
                {busca ? `Nenhum cliente encontrado para “${busca}”.` : "Nenhum cliente neste filtro."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="border-t border-border-subtle px-5 py-2.5 text-[11px] leading-4 text-text-helper">
        {visiveis.length} de {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"}. Situação = saúde da reunião mais recente (0
        a 10); a seta compara com a reunião anterior.
      </p>
      <ConfirmarRemocaoCliente
        cliente={removendo}
        onFechar={() => setRemovendo(null)}
        onRemovido={(cliente) => {
          setRemovendo(null);
          setRemovidos((atual) => new Set(atual).add(cliente.id));
          router.refresh();
        }}
      />
    </section>
  );
}
