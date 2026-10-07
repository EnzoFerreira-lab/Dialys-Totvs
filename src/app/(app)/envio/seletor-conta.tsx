"use client";

import { Add, Checkmark, ChevronDown } from "@carbon/icons-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { normalizarBusca } from "@/lib/formatar";
import type { ContaResumo } from "@/lib/mock/contas";
import { listarContasAnalisadas } from "./actions";

/** "Indústria Acme Ltda." → "conta-industria-acme-ltda" (mesmo nome, mesma conta na Central de Insights). */
function idDaConta(nome: string) {
  const slug = normalizarBusca(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return `conta-${slug || Date.now()}`;
}

/** Seletor "Criar ˅": associa a reunião a uma empresa já analisada ou cadastra uma nova pelo nome. */
export function SeletorConta({
  conta,
  onChange,
}: {
  conta: ContaResumo | null;
  onChange: (conta: ContaResumo | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [contas, setContas] = useState<ContaResumo[] | null>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const listaId = useId();
  const nomeId = useId();

  useEffect(() => {
    if (!aberto) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setAberto(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [aberto]);

  function abrir() {
    const abrindo = !aberto;
    setAberto(abrindo);
    setCriando(false);
    setNome("");
    // Recarrega a cada abertura: uma análise recém-concluída já aparece na lista.
    if (abrindo) listarContasAnalisadas().then(setContas, () => setContas([]));
  }

  function escolher(item: ContaResumo | null) {
    onChange(item);
    setAberto(false);
  }

  function criar(event: FormEvent) {
    event.preventDefault();
    const limpo = nome.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!limpo) return;
    // Nome igual ao de uma empresa já analisada: reaproveita a conta em vez de duplicar.
    const existente = contas?.find((item) => normalizarBusca(item.nome) === normalizarBusca(limpo));
    escolher(existente ?? { id: idDaConta(limpo), nome: limpo });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={abrir}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={listaId}
        title="Associar a uma conta de cliente"
        className="flex h-8 max-w-[220px] items-center gap-2 rounded-[4px] px-2 text-[13px] font-medium text-text-primary hover:bg-[#F2F2F2]"
      >
        <span className="truncate">{conta ? conta.nome : "Criar"}</span>
        <ChevronDown size={16} className={cn("shrink-0 transition-transform", aberto && "rotate-180")} />
      </button>

      {aberto ? (
        <div
          id={listaId}
          role="listbox"
          aria-label="Conta do cliente"
          className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-[4px] border border-border-subtle bg-layer-01 py-1 shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
        >
          <p className="px-4 pt-2 pb-1.5 text-[11px] tracking-[0.08em] text-text-helper uppercase">Associar à conta</p>
          <div className="max-h-60 overflow-y-auto">
            {contas === null ? (
              <p className="px-4 py-2 text-[12px] text-text-helper">Carregando contas…</p>
            ) : contas.length === 0 ? (
              <p className="px-4 py-2 text-[12px] leading-4 text-text-helper">
                Nenhuma empresa analisada ainda. Cadastre a primeira abaixo.
              </p>
            ) : (
              contas.map((item) => {
                const selecionada = conta?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={selecionada}
                    onClick={() => escolher(selecionada ? null : item)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-[#F2F2F2]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-text-primary">{item.nome}</span>
                      {item.segmento ? <span className="block text-[11px] text-text-helper">{item.segmento}</span> : null}
                    </span>
                    {selecionada ? <Checkmark size={16} className="shrink-0" /> : null}
                  </button>
                );
              })
            )}
          </div>
          <div className="my-1 border-t border-border-subtle" />
          {criando ? (
            <form onSubmit={criar} className="flex flex-col gap-2 px-4 py-2">
              <label htmlFor={nomeId} className="text-[12px] text-text-secondary">
                Nome da empresa
              </label>
              <input
                id={nomeId}
                autoFocus
                value={nome}
                maxLength={120}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Ex.: Indústria Acme Ltda."
                className="h-8 w-full border-0 border-b border-border-strong bg-field-01 px-2 text-[13px] text-text-primary placeholder:text-text-placeholder focus:outline-2 focus:-outline-offset-2 focus:outline-focus"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCriando(false)}
                  className="h-8 rounded-[4px] px-3 text-[12px] text-text-primary hover:bg-[#F2F2F2]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!nome.trim()}
                  className="h-8 rounded-[4px] bg-interactive px-3 text-[12px] font-medium text-on-interactive hover:bg-interactive-hover disabled:opacity-50"
                >
                  Associar
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCriando(true)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] text-text-primary hover:bg-[#F2F2F2]"
            >
              <Add size={16} />
              Nova conta
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
