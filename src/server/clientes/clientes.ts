// "Meus clientes": a carteira do usuário autenticado, filtrada pelo escopo dele no servidor.
// Dois conceitos:
//   cadastro  clientes que o usuário pode ver: as contas com reunião analisada pelo Dialys, mais a base
//             da empresa quando ela for ligada aqui (cadastroReal).
//   carteira  o cadastro menos os clientes que o próprio usuário removeu ("Remover cliente"). Remover
//             também tira os insights do cliente (remoção lógica nas reuniões dele, ver repositorio.ts);
//             nada é apagado do banco e `devolverACarteira` desfaz.
// A situação vem da saúde calculada nas reuniões analisadas; sem reunião analisada, situacao = null
// ("Sem avaliação"), que é diferente de "Saudável".
import { normalizarBusca } from "@/lib/formatar";
import type { FaixaSaude } from "@/lib/saude";
import { podeAcessarConta, type Usuario } from "../auth/usuarios";
import { desfazerRemocaoCarteira, listarRemocoesCarteira, nomeDoClienteNasReunioes, registrarRemocaoCarteira } from "../db/repositorio";
import { listarContasInsight } from "../insights/contas";

export type ClienteResumo = {
  id: string;
  nome: string;
  segmento: string | null;
  situacao: { faixa: FaixaSaude; nota: number } | null;
};

type ClienteCadastro = { id: string; nome: string; segmento?: string };

/**
 * Ponto de integração com a base da empresa (CRM/ERP): devolver aqui a carteira real (id = chave da
 * conta usada nas reuniões). Enquanto não houver, a carteira são as contas analisadas.
 */
async function cadastroReal(): Promise<ClienteCadastro[]> {
  return [];
}

/** Clientes que o usuário pode ver, com a situação calculada (independe da carteira). */
async function cadastroDoUsuario(usuario: Usuario): Promise<ClienteResumo[]> {
  const analisadas = await listarContasInsight();
  const porId = new Map(analisadas.map((conta) => [conta.id, conta]));
  const cadastro = await cadastroReal();
  const noCadastro = new Set(cadastro.map((c) => c.id));
  // Contas enviadas pelo /envio fora do cadastro também são clientes do usuário (se ele pode vê-las).
  const todos = [...cadastro, ...analisadas.filter((a) => !noCadastro.has(a.id)).map((a) => ({ id: a.id, nome: a.nome, segmento: a.segmento }))];
  return todos
    .filter((cliente) => podeAcessarConta(usuario, cliente.id))
    .map((cliente) => {
      const analise = porId.get(cliente.id);
      return {
        id: cliente.id,
        nome: cliente.nome,
        segmento: cliente.segmento ?? analise?.segmento ?? null,
        situacao: analise ? { faixa: analise.saude.faixa, nota: analise.saude.nota } : null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function carteiraDoUsuario(usuario: Usuario): Promise<ClienteResumo[]> {
  const [cadastro, removidos] = await Promise.all([cadastroDoUsuario(usuario), listarRemocoesCarteira(usuario.id)]);
  return cadastro.filter((c) => !removidos.has(c.id));
}

export const LIMITE_CLIENTES = 10;

export async function listarClientes(usuario: Usuario, opcoes: { busca?: string; limite?: number; offset?: number } = {}) {
  const termo = normalizarBusca((opcoes.busca ?? "").trim());
  const todos = await carteiraDoUsuario(usuario);
  const filtrados = termo ? todos.filter((c) => normalizarBusca(c.nome).includes(termo)) : todos;
  const offset = opcoes.offset ?? 0;
  const limite = opcoes.limite ?? LIMITE_CLIENTES;
  return { clientes: filtrados.slice(offset, offset + limite), total: filtrados.length };
}

/** Cliente da carteira do usuário, ou null (inexistente, fora do escopo ou removido: mesma resposta). */
export async function buscarCliente(usuario: Usuario, id: string): Promise<ClienteResumo | null> {
  return (await carteiraDoUsuario(usuario)).find((c) => c.id === id) ?? null;
}

/**
 * Cliente que o usuário pode ver, esteja ou não na carteira dele. Para exibir o que já existe (Central,
 * compromissos antigos).
 */
export async function buscarClienteNoCadastro(usuario: Usuario, id: string): Promise<ClienteResumo | null> {
  return (await cadastroDoUsuario(usuario)).find((c) => c.id === id) ?? null;
}

/**
 * "Remover cliente": tira o cliente da carteira do usuário autenticado e remove os insights dele
 * (Central, Dashboard, indicadores e assistente). null: cliente fora da carteira (inexistente, sem
 * acesso ou já removido).
 */
export async function removerDaCarteira(usuario: Usuario, contaId: string) {
  const cliente = await buscarCliente(usuario, contaId);
  if (!cliente) return null;
  const { reunioes } = await registrarRemocaoCarteira(usuario.id, contaId);
  return { cliente, reunioesComInsightsRemovidos: reunioes };
}

/** Devolve à carteira um cliente removido e reativa os insights dele. null: cliente desconhecido ou sem acesso. */
export async function devolverACarteira(usuario: Usuario, contaId: string) {
  if (!podeAcessarConta(usuario, contaId)) return null;
  const nome = (await buscarClienteNoCadastro(usuario, contaId))?.nome ?? (await nomeDoClienteNasReunioes(contaId));
  if (!nome) return null;
  const { reunioes } = await desfazerRemocaoCarteira(usuario.id, contaId);
  return { cliente: { id: contaId, nome }, reunioesComInsightsReativados: reunioes };
}
