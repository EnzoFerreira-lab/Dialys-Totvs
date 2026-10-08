// Onde os compromissos ficam: tabela `compromisso` do banco (.dialys/banco.json; Postgres na produção).
// O serviço, a tela e o assistente só usam este contrato.
import { lerBanco, transacao, type CompromissoRegistro } from "../db/banco";

export interface RepositorioAgenda {
  listar(usuarioId: string): Promise<CompromissoRegistro[]>;
  inserir(registro: CompromissoRegistro): Promise<void>;
  /** Altera um compromisso do usuário; null se não existir (ou for de outra pessoa). */
  atualizar(usuarioId: string, id: string, alterar: (registro: CompromissoRegistro) => void): Promise<CompromissoRegistro | null>;
}

function alterarNaLista(lista: CompromissoRegistro[], usuarioId: string, id: string, alterar: (registro: CompromissoRegistro) => void) {
  const registro = lista.find((c) => c.id === id && c.usuarioId === usuarioId);
  if (!registro) return null;
  alterar(registro);
  return { ...registro };
}

export const repositorioAgenda: RepositorioAgenda = {
  async listar(usuarioId) {
    return (await lerBanco()).compromisso.filter((c) => c.usuarioId === usuarioId);
  },
  async inserir(registro) {
    await transacao((banco) => {
      banco.compromisso.push(registro);
    });
  },
  atualizar(usuarioId, id, alterar) {
    return transacao((banco) => alterarNaLista(banco.compromisso, usuarioId, id, alterar));
  },
};
