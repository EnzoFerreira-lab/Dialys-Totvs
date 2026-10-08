import Link from "next/link";
import type { ReactNode } from "react";

/** Classes do botão de ação principal do cabeçalho (ex.: "Nova análise"), iguais em todas as abas. */
export const BOTAO_ACAO_CABECALHO =
  "inline-flex h-10 shrink-0 items-center gap-6 rounded-[4px] bg-interactive px-4 text-[13px] font-medium text-on-interactive transition-colors hover:bg-interactive-hover active:bg-interactive-active";

/** Ação secundária do cabeçalho (contorno cinza), ao lado da principal. */
export const BOTAO_SECUNDARIO_CABECALHO =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-[4px] border border-[#8D8D8D] bg-layer-01 px-4 text-[13px] font-medium text-text-primary transition-colors hover:bg-[#F2F2F2]";

/** Container das páginas: mesma largura e o mesmo espaço no topo em todas as abas. */
export const CONTAINER_PAGINA = "mx-auto w-full max-w-[1312px] px-4 pt-6 pb-16 sm:px-8 sm:pt-7";

type PageHeaderProps = {
  /** Nome da página na trilha "Home / página". Ausente: a própria Home. */
  pagina?: string;
  /** Níveis entre Home e a página (ex.: Clientes na ficha de um cliente). */
  trilha?: Array<{ rotulo: string; href: string }>;
  titulo: string;
  descricao?: ReactNode;
  /** Botões à direita do título (no celular, abaixo). */
  acoes?: ReactNode;
};

/**
 * Topo padrão de todas as abas: trilha "Home / página" em cinza (o padrão do Envio), título,
 * descrição e ações. Mesmos tamanhos, cores e espaçamentos em todas as páginas.
 */
export function PageHeader({ pagina, trilha = [], titulo, descricao, acoes }: PageHeaderProps) {
  return (
    <div className="print:hidden">
      <nav aria-label="Trilha de navegação" className="text-[11px] text-text-secondary">
        <ol className="flex min-w-0 items-center gap-2">
          {pagina ? (
            <>
              <li>
                <Link href="/clientes" className="hover:text-text-primary hover:underline">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              {trilha.map((nivel) => (
                <li key={nivel.href} className="flex items-center gap-2">
                  <Link href={nivel.href} className="hover:text-text-primary hover:underline">
                    {nivel.rotulo}
                  </Link>
                  <span aria-hidden="true">/</span>
                </li>
              ))}
              <li aria-current="page" className="min-w-0 truncate text-text-primary">
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
