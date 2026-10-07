// Dados de demonstração (DIALYS_DADOS_DEMONSTRACAO, padrão ligado): um arquivo separado do banco
// (.dialys/demonstracao.json), um bloco por usuário. Exemplos nunca entram no banco real.
//   agendas    compromissos fictícios de cada usuário (src/server/agenda/repositorio.ts)
//   carteiras  clientes fictícios que cada usuário tirou da própria carteira (src/server/clientes)
import path from "node:path";
import { arquivoBanco, type CompromissoRegistro } from "./banco";
import { criarArmazenamentoJson } from "./arquivo-json";

export type AgendaDemonstracao = {
  /** Quando a semente foi gerada e para qual semana (segunda-feira, no fuso). */
  semeadoEm: string;
  semana: string;
  compromissos: CompromissoRegistro[];
};

export type CarteiraDemonstracao = { removidos: Array<{ contaId: string; removidoEm: string }> };

export type ArquivoDemonstracao = {
  versao: 1;
  agendas: Record<string, AgendaDemonstracao>;
  /** Adicionado com "Remover cliente"; arquivos antigos ganham o campo vazio ao serem lidos. */
  carteiras: Record<string, CarteiraDemonstracao>;
};

/** DIALYS_DEMONSTRACAO_ARQUIVO troca o arquivo; por padrão fica ao lado do banco (testes isolam os dois juntos). */
export function arquivoDemonstracao() {
  return process.env.DIALYS_DEMONSTRACAO_ARQUIVO ?? path.join(path.dirname(arquivoBanco()), "demonstracao.json");
}

export const demonstracao = criarArmazenamentoJson<ArquivoDemonstracao>({
  nome: "demonstracao",
  arquivo: arquivoDemonstracao,
  vazio: () => ({ versao: 1, agendas: {}, carteiras: {} }),
});

/** Bloco do usuário num Record (hasOwn: um id como "constructor" não acerta o protótipo). */
export const doUsuario = <T>(registro: Record<string, T>, usuarioId: string): T | undefined =>
  Object.hasOwn(registro, usuarioId) ? registro[usuarioId] : undefined;
