// Armazenamento em arquivo JSON com gravação atômica e uma transação por vez no processo.
// Usado pelo banco do piloto (banco.json) e pelos dados de demonstração (demonstracao.json), que
// ficam em arquivos separados para exemplos nunca se misturarem à base.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type GlobalComFilas = typeof globalThis & { [chave: symbol]: Promise<unknown> | undefined };

export function criarArmazenamentoJson<T extends object>(opcoes: {
  /** Nome da fila (uma por arquivo), compartilhada entre rotas e recargas de módulo. */
  nome: string;
  arquivo: () => string;
  vazio: () => T;
  /** Ajustes de formato aplicados a cada leitura (e gravados na próxima transação). Devem ser determinísticos. */
  migrar?: (dados: T) => void;
}) {
  async function ler(): Promise<T> {
    let conteudo: string;
    try {
      conteudo = await readFile(opcoes.arquivo(), "utf8");
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === "ENOENT") return opcoes.vazio();
      throw erro;
    }
    // Arquivo corrompido não é sobrescrito: o erro sobe e os dados ficam para análise.
    // Tabelas que faltam (arquivo de uma versão anterior) entram vazias: migração não destrutiva.
    const dados = { ...opcoes.vazio(), ...(JSON.parse(conteudo) as Partial<T>) } as T;
    opcoes.migrar?.(dados);
    return dados;
  }

  async function gravar(dados: T) {
    const destino = opcoes.arquivo();
    await mkdir(path.dirname(destino), { recursive: true });
    const temporario = `${destino}.${process.pid}.tmp`;
    await writeFile(temporario, JSON.stringify(dados, null, 1), "utf8");
    // Troca atômica. No Windows o rename falha (EPERM/EBUSY) se outro leitor estiver com o arquivo aberto.
    for (let tentativa = 0; ; tentativa++) {
      try {
        await rename(temporario, destino);
        return;
      } catch (erro) {
        const codigo = (erro as NodeJS.ErrnoException).code;
        if (tentativa >= 5 || (codigo !== "EPERM" && codigo !== "EBUSY")) throw erro;
        await new Promise((resolver) => setTimeout(resolver, 20 * (tentativa + 1)));
      }
    }
  }

  // A fila fica no globalThis: rotas da API são empacotadas separadamente e o HMR recarrega módulos,
  // mas todas precisam da mesma fila para não gravar por cima uma da outra.
  const chaveFila = Symbol.for(`dialys.${opcoes.nome}.fila`);

  /** Lê, altera e grava com exclusividade (uma transação por vez no processo). */
  function transacao<R>(alterar: (dados: T) => R | Promise<R>): Promise<R> {
    const global = globalThis as GlobalComFilas;
    const anterior = global[chaveFila] ?? Promise.resolve();
    const atual = anterior
      .catch(() => undefined)
      .then(async () => {
        const dados = await ler();
        const resultado = await alterar(dados);
        await gravar(dados);
        return resultado;
      });
    global[chaveFila] = atual;
    return atual;
  }

  return { ler, transacao };
}
