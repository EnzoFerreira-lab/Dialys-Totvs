"use client";

import { Add, ChevronDown, Logout } from "@carbon/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { sair } from "@/app/(auth)/login/actions";
import { TotvsLogo } from "@/components/brand/totvs-logo";
import { cn } from "@/lib/cn";

// Do geral para o detalhe: o dia (Home) → a carteira (Dashboard) → um cliente → uma reunião.
// O Assistente Dialys não é uma aba: abre pelo ícone flutuante, em qualquer tela (AssistenteFlutuante).
// O Envio é uma ação, não um lugar: fica como botão à direita (EnviarReuniao), não entre as abas.
const NAV_ITEMS = [
  { href: "/clientes", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/contas", label: "Clientes" },
  { href: "/insights", label: "Central de Insights" },
] as const;

/** Atalho fixo para o Envio, em destaque. No celular, só o ícone. */
function EnviarReuniao() {
  return (
    <div className="flex items-center pr-2 sm:pr-4">
      <Link
        href="/envio"
        aria-label="Enviar reunião"
        title="Enviar reunião para análise"
        className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-interactive px-2 text-[13px] font-medium whitespace-nowrap text-on-interactive transition-colors hover:bg-interactive-hover active:bg-interactive-active sm:px-3"
      >
        <Add size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Enviar reunião</span>
      </Link>
    </div>
  );
}

/** Quem está logado, como o cabeçalho exibe. null: ainda carregando a sessão. */
export type UsuarioCabecalho = { nome: string; papel: "diretor" | "gerente" | "vendedor" } | null;

const CARGO: Record<NonNullable<UsuarioCabecalho>["papel"], string> = {
  diretor: "Diretor Comercial",
  gerente: "Gerente Comercial",
  vendedor: "Executivo de Contas",
};

const iniciais = (nome: string) => {
  const partes = nome.trim().split(/\s+/);
  return `${partes[0]?.[0] ?? ""}${partes.length > 1 ? partes[partes.length - 1][0] : ""}`.toUpperCase();
};

function UserMenu({ usuario }: { usuario: UsuarioCabecalho }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative h-full">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-full items-center gap-3 pr-1 pl-3 hover:bg-shell-hover sm:gap-2.5"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#6F6F6F] bg-[#545456] text-[10px] font-medium text-white">
          {usuario ? iniciais(usuario.nome) : ""}
        </span>
        <span className="hidden min-w-[96px] text-left sm:block">
          <span className="block max-w-[180px] truncate text-[12px] leading-4 font-medium text-white">{usuario?.nome ?? " "}</span>
          <span className="block text-[10px] leading-[14px] text-shell-text-secondary">{usuario ? CARGO[usuario.papel] : " "}</span>
        </span>
        <ChevronDown
          size={16}
          className={cn("ml-2 text-shell-text-secondary transition-transform sm:ml-12", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 w-48 border border-shell-border bg-shell py-1 shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
        >
          {/* Encerra a sessão no servidor (apaga o cookie) e volta ao login. */}
          <form action={sair}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-white hover:bg-shell-hover"
            >
              <Logout size={16} aria-hidden="true" />
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/** Abas do menu; `pathname` null = ainda sem a rota (fallback do Suspense), nenhuma aba marcada. */
function Abas({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Navegação principal" className="ml-4 flex min-w-0 overflow-x-auto sm:ml-[40px]">
      {NAV_ITEMS.map((item) => {
        const active = pathname !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center border-b-2 px-3 pt-0.5 text-[12px] whitespace-nowrap transition-colors sm:px-[18px] sm:text-[13px]",
              active
                ? "border-interactive bg-shell-hover font-medium text-white"
                : "border-transparent text-shell-text-secondary hover:bg-shell-hover hover:text-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AbasDaRota() {
  return <Abas pathname={usePathname()} />;
}

export function AppHeader({ usuario = null }: { usuario?: UsuarioCabecalho }) {
  return (
    <header className="on-shell sticky top-0 z-10 bg-shell text-shell-text print:hidden">
      <div className="flex h-12 items-stretch pr-3 pl-4 sm:pr-[30px] sm:pl-[34px]">
        <Link href="/clientes" className="flex items-center gap-[18px]" aria-label="Dialys — início">
          <TotvsLogo className="h-[18px] text-white" />
          <span className="hidden h-5 w-px bg-[#5A5A5A] sm:block" aria-hidden="true" />
          <span className="hidden text-[16px] leading-none text-white sm:block">Dialys.</span>
        </Link>

        {/* Rotas com parâmetro dinâmico (ex.: /contas/[id]) só conhecem o caminho na requisição: o menu
            aparece sem aba marcada no pré-render e marca a aba assim que a rota é conhecida. */}
        <Suspense fallback={<Abas pathname={null} />}>
          <AbasDaRota />
        </Suspense>

        <div className="ml-auto flex shrink-0 items-stretch">
          <EnviarReuniao />
          <UserMenu usuario={usuario} />
        </div>
      </div>
    </header>
  );
}
