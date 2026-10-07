"use client";

import { Close } from "@carbon/icons-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

type ModalConfirmacaoProps = {
  aberto: boolean;
  titulo: string;
  /** Linha pequena acima do título (padrão Carbon), ex.: o nome da conta. */
  rotulo?: string;
  children: ReactNode;
  rotuloConfirmar: string;
  /** Enquanto a ação roda: botões desabilitados e Esc ignorado. */
  ocupado?: boolean;
  /** Texto do botão enquanto a ação roda (padrão "Enviando..."). */
  rotuloOcupado?: string;
  /** Ação destrutiva: botão de confirmar vermelho (danger do Carbon). */
  perigo?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
};

/**
 * Modal de confirmação no padrão Carbon sobre o <dialog> nativo: foco preso no modal, Esc fecha e
 * o conteúdo atrás fica inerte, sem biblioteca.
 */
export function ModalConfirmacao({
  aberto,
  titulo,
  rotulo,
  children,
  rotuloConfirmar,
  ocupado = false,
  rotuloOcupado = "Enviando...",
  perigo = false,
  onConfirmar,
  onCancelar,
}: ModalConfirmacaoProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const tituloId = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={tituloId}
      onCancel={(evento) => {
        evento.preventDefault();
        if (!ocupado) onCancelar();
      }}
      onClick={(evento) => {
        // Clique no fundo (fora da caixa) cancela.
        if (evento.target === evento.currentTarget && !ocupado) onCancelar();
      }}
      className="m-auto w-[min(520px,calc(100vw-2rem))] bg-layer-01 p-0 text-text-primary shadow-[0_8px_24px_rgba(0,0,0,0.25)] backdrop:bg-[rgba(22,22,22,0.5)] print:hidden"
    >
      <div className="relative px-5 pt-5 pb-6 sm:px-6">
        {rotulo ? <p className="pr-10 text-[12px] text-text-secondary">{rotulo}</p> : null}
        <h2 id={tituloId} className="mt-1 pr-10 text-[20px] leading-7 font-normal">
          {titulo}
        </h2>
        <button
          type="button"
          onClick={onCancelar}
          disabled={ocupado}
          aria-label="Fechar"
          className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center hover:bg-[#E8E8E8] disabled:opacity-50"
        >
          <Close size={20} />
        </button>
        <div className="mt-4 text-[14px] leading-[1.6] text-text-primary">{children}</div>
      </div>
      <div className="grid grid-cols-2">
        {/* Secundário do Carbon (cinza escuro): botão próprio, porque o cn() do projeto não resolve conflito de bg-*. */}
        <button
          type="button"
          onClick={onCancelar}
          disabled={ocupado}
          className="flex h-16 items-start bg-[#393939] px-4 pt-4 text-left text-[14px] text-white transition-colors hover:bg-[#474747] active:bg-[#6F6F6F] disabled:cursor-not-allowed disabled:text-[#8D8D8D]"
        >
          Cancelar
        </button>
        <Button variant={perigo ? "perigo" : "primary"} onClick={onConfirmar} disabled={ocupado} autoFocus={!perigo} className="h-16 items-start gap-3 px-4 pt-4 text-[14px] font-medium">
          {ocupado ? (
            <span className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-on-interactive border-t-transparent" aria-hidden="true" />
          ) : null}
          {ocupado ? rotuloOcupado : rotuloConfirmar}
        </Button>
      </div>
    </dialog>
  );
}
