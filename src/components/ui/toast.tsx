"use client";

import { CheckmarkFilled, Close } from "@carbon/icons-react";
import { useEffect } from "react";

type ToastProps = {
  titulo: string;
  descricao?: string;
  onClose: () => void;
  /** Fecha sozinho após este tempo (ms). */
  duracao?: number;
};

/** Toast de sucesso no padrão Carbon (low contrast), ancorado abaixo do header. */
export function Toast({ titulo, descricao, onClose, duracao = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duracao);
    return () => window.clearTimeout(timer);
  }, [onClose, duracao]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 right-4 z-30 flex w-[min(360px,calc(100vw-2rem))] items-start gap-3 border-l-[3px] border-[#24A148] bg-[#DEFBE6] py-3 pr-2 pl-4 shadow-[0_2px_6px_rgba(0,0,0,0.2)] motion-safe:animate-[toast-in_160ms_ease-out] print:hidden"
    >
      <CheckmarkFilled size={20} className="mt-px shrink-0 text-[#198038]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-5 font-semibold text-text-primary">{titulo}</p>
        {descricao ? <p className="mt-0.5 text-[13px] leading-[1.45] text-text-primary">{descricao}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center hover:bg-[#A7F0BA]"
        aria-label="Fechar notificação"
      >
        <Close size={16} />
      </button>
    </div>
  );
}
