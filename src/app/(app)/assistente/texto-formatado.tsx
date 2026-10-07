import { Fragment, type ReactNode } from "react";

/** **negrito** e _itálico_ dentro de uma linha, como elementos React (sem HTML injetado). */
function inline(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((parte, i) => {
    if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {parte.slice(2, -2)}
        </strong>
      );
    }
    if (parte.startsWith("_") && parte.endsWith("_") && parte.length > 2) {
      return (
        <em key={i} className="text-shell-text-secondary">
          {parte.slice(1, -1)}
        </em>
      );
    }
    return <Fragment key={i}>{parte}</Fragment>;
  });
}

const ITEM = /^\s*[-•]\s+/;

/** Agrupa as linhas de um bloco em trechos de texto e listas (itens "- " consecutivos). */
function trechos(linhas: string[]) {
  const grupos: Array<{ lista: boolean; linhas: string[] }> = [];
  for (const linha of linhas) {
    const lista = ITEM.test(linha);
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.lista === lista) ultimo.linhas.push(lista ? linha.replace(ITEM, "") : linha);
    else grupos.push({ lista, linhas: [lista ? linha.replace(ITEM, "") : linha] });
  }
  return grupos;
}

/**
 * Markdown mínimo das respostas do assistente: parágrafos, listas com "- " e ênfases.
 * Qualquer outra marcação aparece como texto puro.
 */
export function TextoFormatado({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      {texto
        .trim()
        .split(/\n{2,}/)
        .map((bloco, i) => (
          <div key={i}>
            {trechos(bloco.split("\n").filter((l) => l.trim())).map((grupo, j) =>
              grupo.lista ? (
                <ul key={j} className="my-1 flex list-disc flex-col gap-1 pl-5 marker:text-interactive">
                  {grupo.linhas.map((item, k) => (
                    <li key={k}>{inline(item)}</li>
                  ))}
                </ul>
              ) : (
                <p key={j}>
                  {grupo.linhas.map((linha, k) => (
                    <Fragment key={k}>
                      {k > 0 ? <br /> : null}
                      {inline(linha)}
                    </Fragment>
                  ))}
                </p>
              ),
            )}
          </div>
        ))}
    </div>
  );
}
