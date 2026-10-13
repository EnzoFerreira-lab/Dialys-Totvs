"use client";

import { Close, Maximize } from "@carbon/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { TotvsLogo } from "@/components/brand/totvs-logo";
import { EVENTO_ABRIR_ASSISTENTE, type PedidoAbrirAssistente } from "@/lib/abrir-assistente";
import { cn } from "@/lib/cn";
import { ChatAssistente, type FocoPedido } from "./chat-assistente";

/**
 * Assistente Dialys em todas as telas (fica no layout do app): um botão pequeno no canto abre o chat num
 * painel. A conversa é a mesma do /assistente (fica na aba). Depois de aberto pela primeira vez, o chat
 * continua montado ao fechar o painel ou trocar de tela: a conversa e o briefing em voz não se perdem.
 * "Perguntar ao Dialys" de um cliente abre o painel com a empresa em foco (abrirAssistente).
 */
export function AssistenteFlutuante() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  const [focoPedido, setFocoPedido] = useState<FocoPedido | null>(null);
  // Trocar de tela fecha o painel; o chat continua montado, então a conversa fica para quando reabrir.
  const [pathnameAnterior, setPathnameAnterior] = useState(pathname);
  if (pathname !== pathnameAnterior) {
    setPathnameAnterior(pathname);
    setAberto(false);
  }

  useEffect(() => {
    const onAbrir = (evento: Event) => {
      const { conta } = (evento as CustomEvent<PedidoAbrirAssistente>).detail ?? {};
      if (conta) setFocoPedido((anterior) => ({ ...conta, pedido: (anterior?.pedido ?? 0) + 1 }));
      setMontado(true);
      setAberto(true);
    };
    window.addEventListener(EVENTO_ABRIR_ASSISTENTE, onAbrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ASSISTENTE, onAbrir);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const onTecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", onTecla);
    return () => window.removeEventListener("keydown", onTecla);
  }, [aberto]);

  function alternar() {
    setMontado(true);
    setAberto((atual) => !atual);
  }

  // Na página do assistente, o chat já ocupa a tela.
  const naPaginaDoAssistente = pathname === "/assistente";

  return (
    <div className="print:hidden" hidden={naPaginaDoAssistente}>
      {montado ? (
        <div
          id="painel-assistente-flutuante"
          role="dialog"
          aria-label="Assistente Dialys"
          hidden={!aberto || naPaginaDoAssistente}
          className="fixed right-4 bottom-20 left-4 z-40 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.35)] sm:left-auto sm:w-[440px]"
        >
          <div className="flex items-center justify-end gap-1 rounded-t-[12px] bg-[#262626] px-2 py-1.5">
            <Link
              href="/assistente"
              onClick={() => setAberto(false)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-[12px] text-[#C6C6C6] hover:bg-white/10 hover:text-white"
            >
              <Maximize size={14} aria-hidden="true" />
              Abrir em tela cheia
            </Link>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar assistente"
              className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#C6C6C6] hover:bg-white/10 hover:text-white"
            >
              <Close size={18} />
            </button>
          </div>
          <Suspense fallback={<div className="h-[420px] animate-pulse rounded-b-[12px] bg-shell" />}>
            <ChatAssistente compacto focoPedido={focoPedido} />
          </Suspense>
        </div>
      ) : null}

      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        aria-controls={montado ? "painel-assistente-flutuante" : undefined}
        aria-label={aberto ? "Fechar Assistente Dialys" : "Abrir Assistente Dialys"}
        title="Assistente Dialys"
        className={cn(
          "fixed right-4 bottom-4 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive",
          aberto ? "bg-[#262626] text-white" : "bg-interactive text-[#161616]",
        )}
      >
        {aberto ? <Close size={20} aria-hidden="true" /> : <TotvsLogo variante="simbolo" className="h-5" />}
      </button>
    </div>
  );
}
