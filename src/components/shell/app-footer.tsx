import { Help } from "@carbon/icons-react";

export function AppFooter() {
  return (
    <footer className="px-4 sm:px-[38px] print:hidden">
      <div className="flex flex-col gap-2 border-t border-border-subtle py-4 text-[11px] text-text-secondary sm:flex-row sm:items-center sm:justify-between">
        <p>
          Dialys <span className="mx-1.5 text-text-placeholder">/</span> Inteligência Conversacional
        </p>
        <div className="flex items-center gap-6">
          <p>TOTVS S.A. © 2026. Todos os direitos reservados.</p>
          <a href="#" className="flex items-center gap-1.5 text-text-primary hover:text-text-secondary">
            Ajuda
            <Help size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
