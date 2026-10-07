"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type MenuSuspensoProps = {
  /** Nome acessível do botão (ex.: "Ações de Grupo Horizonte"). */
  rotulo: string;
  /** Conteúdo visual do botão (ícone). */
  gatilho: ReactNode;
  /** Itens; recebem `fechar` para fechar o menu depois da ação. */
  children: (fechar: () => void) => ReactNode;
  alinhamento?: "esquerda" | "direita";
  className?: string;
};

/** Overflow menu do Carbon: abre abaixo do botão, fecha com Esc, clique fora ou após escolher. */
export function MenuSuspenso({ rotulo, gatilho, children, alinhamento = "direita", className }: MenuSuspensoProps) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!aberto) return;
    function fora(evento: PointerEvent) {
      if (!ref.current?.contains(evento.target as Node)) setAberto(false);
    }
    function tecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        setAberto(false);
        botaoRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    // Foco no primeiro item ao abrir, como no Carbon.
    ref.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        ref={botaoRef}
        type="button"
        aria-label={rotulo}
        title={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? menuId : undefined}
        onClick={(evento) => {
          evento.stopPropagation();
          setAberto((valor) => !valor);
        }}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[4px] text-text-primary transition-colors hover:bg-[#E8E8E8]",
          aberto && "bg-[#E8E8E8]",
        )}
      >
        {gatilho}
      </button>
      {aberto ? (
        <div
          id={menuId}
          role="menu"
          aria-label={rotulo}
          onClick={(evento) => evento.stopPropagation()}
          className={cn(
            "absolute top-full z-20 mt-1 min-w-[208px] border border-border-subtle bg-layer-01 py-1 shadow-[0_2px_6px_rgba(0,0,0,0.2)]",
            alinhamento === "direita" ? "right-0" : "left-0",
          )}
        >
          {children(() => setAberto(false))}
        </div>
      ) : null}
    </div>
  );
}

type ItemMenuProps = {
  children: ReactNode;
  onSelect: () => void;
  /** Para opções exclusivas (filtro/ordenação): marca a escolhida. */
  marcado?: boolean;
  /** Ação destrutiva (ex.: "Remover"): texto vermelho, como o danger do Carbon. */
  perigo?: boolean;
};

export function ItemMenu({ children, onSelect, marcado, perigo }: ItemMenuProps) {
  return (
    <button
      type="button"
      role={marcado === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={marcado}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[13px] hover:bg-[#F2F2F2] focus-visible:-outline-offset-2",
        perigo ? "text-[#DA1E28]" : "text-text-primary",
        marcado && "font-semibold",
      )}
    >
      {children}
    </button>
  );
}

export function TituloMenu({ children }: { children: ReactNode }) {
  return <p className="px-4 pt-2 pb-1 text-[11px] font-medium tracking-[0.06em] text-text-helper uppercase">{children}</p>;
}
