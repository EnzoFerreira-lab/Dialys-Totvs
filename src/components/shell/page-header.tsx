type PageHeaderProps = {
  kicker: string;
  titulo: string;
  descricao: string;
};

/** Cabeçalho padrão das páginas: kicker (ponto laranja + texto âmbar AA), título heading-05 e texto de apoio. */
export function PageHeader({ kicker, titulo, descricao }: PageHeaderProps) {
  return (
    <header className="print:hidden">
      <p className="flex items-center gap-2 text-[11px] leading-none font-medium tracking-[0.12em] text-[#8A5A00] uppercase">
        <span className="h-[5px] w-[5px] rounded-full bg-interactive" aria-hidden="true" />
        {kicker}
      </p>
      <h1 className="mt-4 text-[28px] leading-9 font-normal text-text-primary sm:text-[32px] sm:leading-10">{titulo}</h1>
      <p className="mt-2 max-w-[680px] text-[14px] leading-[1.6] text-text-secondary">{descricao}</p>
    </header>
  );
}
