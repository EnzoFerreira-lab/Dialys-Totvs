"use client";

import { Building, Search } from "@carbon/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { api, type ClienteResumo } from "@/lib/api-cliente";
import { cn } from "@/lib/cn";

const FAIXA: Record<NonNullable<ClienteResumo["situacao"]>["faixa"], { rotulo: string; cor: string }> = {
  risco: { rotulo: "Risco", cor: "bg-[#FA4D56]" },
  estavel: { rotulo: "Estável", cor: "bg-[#F1C21B]" },
  saudavel: { rotulo: "Saudável", cor: "bg-[#42BE65]" },
};

/**
 * "Focar em uma empresa": busca entre as contas que o usuário pode ver (GET /api/v1/clientes) e fixa uma
 * no chat. O servidor confere a permissão de novo a cada pergunta.
 */
export function SeletorEmpresaFoco({
  rotulo,
  onEscolher,
  desabilitado,
}: {
  rotulo: string;
  onEscolher: (conta: { id: string; nome: string }) => void;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [contas, setContas] = useState<ClienteResumo[] | null>(null);
  const [erro, setErro] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const listaId = useId();

  useEffect(() => {
    if (!aberto) return;
    function fora(evento: PointerEvent) {
      if (!ref.current?.contains(evento.target as Node)) setAberto(false);
    }
    function tecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    buscaRef.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  // Busca no servidor com uma pequena espera entre as teclas.
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    const espera = setTimeout(() => {
      api
        .listarClientes({ busca: busca.trim() || undefined, limite: 20 })
        .then((r) => {
          if (!ativo) return;
          setContas(r.dados);
          setErro(false);
        })
        .catch(() => ativo && setErro(true));
    }, 200);
    return () => {
      ativo = false;
      clearTimeout(espera);
    };
  }, [aberto, busca]);

  function escolher(conta: ClienteResumo) {
    onEscolher({ id: conta.id, nome: conta.nome });
    setAberto(false);
    setBusca("");
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        disabled={desabilitado}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={listaId}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-0.5 text-white transition-colors hover:border-interactive hover:bg-interactive/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Building size={12} aria-hidden="true" />
        {rotulo}
      </button>

      {aberto ? (
        <div className="absolute top-full left-0 z-30 mt-2 w-[min(340px,calc(100vw-48px))] overflow-hidden rounded-[8px] border border-white/15 bg-[#262626] shadow-[0_4px_16px_rgba(0,0,0,0.45)]">
          <label className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <Search size={14} className="shrink-0 text-shell-text-secondary" aria-hidden="true" />
            <span className="sr-only">Buscar empresa</span>
            <input
              ref={buscaRef}
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar empresa..."
              className="w-full bg-transparent text-[13px] text-white placeholder:text-[#8D8D8D] focus:outline-none"
            />
          </label>
          <ul id={listaId} role="listbox" aria-label="Empresas" className="max-h-[280px] overflow-y-auto py-1">
            {erro ? (
              <li className="px-3 py-3 text-[12px] text-[#FFB3B8]">Não foi possível carregar as empresas.</li>
            ) : contas === null ? (
              <li className="px-3 py-3 text-[12px] text-shell-text-secondary">Carregando…</li>
            ) : contas.length === 0 ? (
              <li className="px-3 py-3 text-[12px] text-shell-text-secondary">
                {busca.trim() ? "Nenhuma empresa encontrada." : "Nenhuma empresa com reunião analisada."}
              </li>
            ) : (
              contas.map((conta) => (
                <li key={conta.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => escolher(conta)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5"
                  >
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", conta.situacao ? FAIXA[conta.situacao.faixa].cor : "bg-[#6F6F6F]")}
                      title={conta.situacao ? `${FAIXA[conta.situacao.faixa].rotulo} · ${conta.situacao.nota}/10` : "Sem situação calculada"}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-white">{conta.nome}</span>
                      {conta.segmento ? <span className="block truncate text-[11px] text-shell-text-secondary">{conta.segmento}</span> : null}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
