import Link from "next/link";
import type { ReactNode } from "react";

/** Classes do botão de ação principal do cabeçalho (ex.: "Nova análise"), iguais em todas as abas. */
export const BOTAO_ACAO_CABECALHO =
  "inline-flex h-10 shrink-0 items-center gap-6 rounded-[4px] bg-interactive px-4 text-[13px] font-medium text-on-interactive transition-colors hover:bg-interactive-hover active:bg-interactive-active";

/** Container das páginas: mesma largura e o mesmo espaço no topo em todas as abas. */
export const CONTAINER_PAGINA = "mx-auto w-full max-w-[1312px] px-4 pt-6 pb-16 sm:px-8 sm:pt-7";

type PageHeaderProps = {
  /** Nome da página na trilha "Home / página". Ausente: a própria Home. */
  pagina?: string;
  titulo: string;
  descricao?: ReactNode;
  /** Botões à direita do título (no celular, abaixo). */
  acoes?: ReactNode;
};

/**
 * Topo padrão de todas as abas: trilha "Home / página" em cinza (o padrão do Envio), título,
 * descrição e ações. Mesmos tamanhos, cores e espaçamentos em todas as páginas.
 */
export function PageHeader({ pagina, titulo, descricao, acoes }: PageHeaderProps) {
  return (
    <div className="print:hidden">
      <nav aria-label="Trilha de navegação" className="text-[11px] text-text-secondary">
        <ol className="flex items-center gap-2">
          {pagina ? (
            <>
              <li>
                <Link href="/clientes" className="hover:text-text-primary hover:underline">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-text-primary">
                {pagina}
              </li>
            </>
          ) : (
            <li aria-current="page" className="text-text-primary">
              Home
            </li>
          )}
        </ol>
      </nav>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header className="min-w-0">
          <h1 className="text-[28px] leading-9 font-normal text-text-primary sm:text-[32px] sm:leading-10">{titulo}</h1>
          {descricao ? <p className="mt-1 max-w-[680px] text-[14px] leading-[1.6] text-text-secondary">{descricao}</p> : null}
        </header>
        {acoes ? <div className="flex shrink-0 flex-wrap items-start gap-2">{acoes}</div> : null}
      </div>
    </div>
  );
}
