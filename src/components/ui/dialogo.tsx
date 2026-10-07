"use client";

import { Close } from "@carbon/icons-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type DialogoProps = {
  aberto: boolean;
  titulo: string;
  /** Linha pequena acima do título (padrão Carbon). */
  rotulo?: ReactNode;
  children: ReactNode;
  /** Botões no rodapé, alinhados à direita. */
  rodape?: ReactNode;
  /** Enquanto uma ação roda, Esc, fundo e X não fecham. */
  ocupado?: boolean;
  largura?: "media" | "grande";
  onFechar: () => void;
};

/**
 * Modal genérico sobre o <dialog> nativo (foco preso, Esc fecha, fundo inerte), no mesmo visual do
 * ModalConfirmacao. No celular ocupa quase a tela toda e o conteúdo rola.
 */
export function Dialogo({ aberto, titulo, rotulo, children, rodape, ocupado = false, largura = "media", onFechar }: DialogoProps) {
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
        if (!ocupado) onFechar();
      }}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget && !ocupado) onFechar();
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] bg-layer-01 p-0 text-text-primary shadow-[0_8px_24px_rgba(0,0,0,0.25)] backdrop:bg-[rgba(22,22,22,0.5)] print:hidden",
        largura === "grande" ? "w-[min(640px,calc(100vw-2rem))]" : "w-[min(520px,calc(100vw-2rem))]",
      )}
    >
      {aberto ? (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="relative shrink-0 px-5 pt-5 sm:px-6">
            {rotulo ? <div className="pr-10 text-[12px] text-text-secondary">{rotulo}</div> : null}
            <h2 id={tituloId} className="mt-1 pr-10 text-[20px] leading-7 font-normal">
              {titulo}
            </h2>
            <button
              type="button"
              onClick={onFechar}
              disabled={ocupado}
              aria-label="Fechar"
              className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center hover:bg-[#E8E8E8] disabled:opacity-50"
            >
              <Close size={20} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6 text-[14px] leading-[1.6] sm:px-6">{children}</div>
          {rodape ? <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border-subtle px-5 py-3 sm:px-6">{rodape}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
