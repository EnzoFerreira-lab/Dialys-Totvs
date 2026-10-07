// Onde os compromissos ficam. As duas fontes têm o mesmo contrato (CompromissoRegistro), então o
// serviço, a tela e o assistente não sabem de qual vieram.
//   real          tabela `compromisso` do banco (.dialys/banco.json; Postgres na produção)
//   demonstracao  arquivo separado (.dialys/demonstracao.json), um bloco por usuário, semeado na
//                 primeira leitura. Exemplos nunca entram no banco.
import { dataNoFuso, inicioDaSemana } from "@/lib/fuso";
import { lerBanco, transacao, type CompromissoRegistro } from "../db/banco";
import { demonstracao, doUsuario, type AgendaDemonstracao, type ArquivoDemonstracao } from "../db/demonstracao";
import { semearAgenda } from "./semente";

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

export const repositorioReal: RepositorioAgenda = {
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

// ---- Demonstração ----------------------------------------------------------------------------

const foiAlterada = (agenda: AgendaDemonstracao) =>
  agenda.compromissos.some((c) => c.origem === "usuario" || c.atualizadoEm !== c.criadoEm);

function novaAgenda(usuarioId: string, fuso: string, agora: Date): AgendaDemonstracao {
  const hoje = dataNoFuso(agora, fuso);
  return { semeadoEm: agora.toISOString(), semana: inicioDaSemana(hoje), compromissos: semearAgenda(usuarioId, hoje, fuso, agora) };
}

/**
 * Agenda de demonstração do usuário, semeada na primeira vez. Se a semente ficou numa semana passada e
 * o usuário não mexeu em nada, é refeita para a semana atual (a demonstração não envelhece). Agenda com
 * alterações do usuário é preservada até "Restaurar demonstração".
 */
function agendaAtual(dados: ArquivoDemonstracao, usuarioId: string, fuso: string, agora: Date) {
  const existente = doUsuario(dados.agendas, usuarioId);
  const semanaAtual = inicioDaSemana(dataNoFuso(agora, fuso));
  if (!existente || (existente.semana < semanaAtual && !foiAlterada(existente))) {
    dados.agendas[usuarioId] = novaAgenda(usuarioId, fuso, agora);
  }
  return dados.agendas[usuarioId];
}

export function repositorioDemonstracao(fuso: string, relogio: () => Date = () => new Date()): RepositorioAgenda {
  return {
    async listar(usuarioId) {
      const lidos = await demonstracao.ler();
      const existente = doUsuario(lidos.agendas, usuarioId);
      const semanaAtual = inicioDaSemana(dataNoFuso(relogio(), fuso));
      // Leitura comum não grava; só semeia (com exclusividade) quando precisa.
      if (existente && !(existente.semana < semanaAtual && !foiAlterada(existente))) return existente.compromissos;
      return demonstracao.transacao((dados) => [...agendaAtual(dados, usuarioId, fuso, relogio()).compromissos]);
    },
    async inserir(registro) {
      await demonstracao.transacao((dados) => {
        agendaAtual(dados, registro.usuarioId, fuso, relogio()).compromissos.push(registro);
      });
    },
    atualizar(usuarioId, id, alterar) {
      return demonstracao.transacao((dados) => alterarNaLista(agendaAtual(dados, usuarioId, fuso, relogio()).compromissos, usuarioId, id, alterar));
    },
  };
}

/**
 * Descarta as alterações do usuário na demonstração: gera a agenda da semana atual e devolve à carteira
 * os clientes fictícios que ele tinha removido.
 */
export function restaurarAgendaDemonstracao(usuarioId: string, fuso: string, agora = new Date()) {
  return demonstracao.transacao((dados) => {
    dados.agendas[usuarioId] = novaAgenda(usuarioId, fuso, agora);
    delete dados.carteiras[usuarioId];
    return dados.agendas[usuarioId].compromissos.length;
  });
}
