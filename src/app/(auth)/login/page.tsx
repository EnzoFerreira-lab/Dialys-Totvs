import { Help } from "@carbon/icons-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { TotvsLogo } from "@/components/brand/totvs-logo";
import { LinkInformativo } from "@/components/ui/link-informativo";
import { LoginForm } from "./login-form";
import { NetworkGraphic } from "./network-graphic";

export const metadata: Metadata = {
  title: "Entrar",
};

function Kicker({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2 text-[11px] leading-none tracking-[0.12em] text-[#C6C6C6] uppercase">
      <span className="h-[3px] w-[3px] bg-interactive" aria-hidden="true" />
      {children}
    </p>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      {/* Painel institucional (grafite) */}
      <section className="on-shell flex flex-col bg-shell px-6 py-8 text-shell-text sm:px-[52px] lg:min-h-dvh lg:w-[45%] lg:max-w-[720px] lg:shrink-0 lg:py-[38px]">
        <div className="flex items-center gap-5">
          <TotvsLogo className="h-7 text-white" />
          <span className="h-9 w-px bg-[#5A5A5A]" aria-hidden="true" />
          <p className="text-[12px] leading-[1.5] text-[#E0E0E0]">
            Tecnologia que move
            <br />
            negócios.
          </p>
        </div>

        <div className="mt-10 lg:mt-[88px]">
          <Kicker>Inteligência para ir além</Kicker>
          <p className="mt-6 text-[40px] leading-none font-light tracking-[-0.01em] text-white">
            Dialys<span className="text-interactive">.</span>
          </p>
          <p className="mt-2.5 text-[16px] leading-6 font-light text-[#C6C6C6]">Inteligência Conversacional</p>
          <span className="mt-6 hidden h-[2px] w-[38px] bg-interactive sm:block" aria-hidden="true" />

          <h2 className="mt-6 hidden max-w-[272px] text-[22px] leading-[1.4] font-normal text-white sm:block">
            Transformando conversas comerciais em{" "}
            <span className="text-interactive">receita preservada</span> e inteligência acionável.
          </h2>
          <p className="mt-4 hidden text-[12px] leading-[1.6] text-[#C6C6C6] sm:block">
            Mais clareza em cada interação.
            <br />
            Mais valor em cada decisão.
          </p>
        </div>

        <div className="hidden flex-1 items-center justify-center py-8 lg:flex">
          <NetworkGraphic />
        </div>

        <div className="hidden lg:block">
          <p className="flex items-center gap-3 text-[11px] text-[#E0E0E0]">
            <span className="h-px w-3.5 bg-interactive" aria-hidden="true" />
            Conversas conectadas. Negócios potencializados.
          </p>
          <p className="mt-4 text-[10px] tracking-[0.14em] text-[#8D8D8D] uppercase">Uma solução TOTVS</p>
        </div>
      </section>

      {/* Formulário */}
      <section className="flex flex-1 flex-col bg-layer-01 px-6 py-8 sm:px-[38px] lg:min-h-dvh lg:py-[30px]">
        <header className="flex items-center justify-between">
          <p className="text-[10px] tracking-[0.14em] text-text-secondary uppercase">Portal corporativo</p>
          <LinkInformativo
            assunto="ajuda-login"
            className="flex items-center gap-2 text-[11px] text-text-primary hover:text-text-secondary"
          >
            Precisa de ajuda?
            <Help size={16} aria-hidden="true" />
          </LinkInformativo>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          {/* LoginForm lê ?volta= no cliente. */}
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <footer className="text-center text-[10px] leading-[1.9] text-text-secondary">
          <p>TOTVS S.A. © 2026. Todos os direitos reservados.</p>
          <LinkInformativo assunto="privacidade" className="text-text-primary hover:underline">
            Privacidade e segurança
          </LinkInformativo>
        </footer>
      </section>
    </main>
  );
}
