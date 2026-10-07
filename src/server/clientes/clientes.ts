// "Meus clientes": a carteira do usuário autenticado, filtrada pelo escopo dele no servidor.
// Dois conceitos:
//   cadastro  clientes que o usuário pode ver (escopo de acesso). Fonte:
//               demonstração  carteira fictícia (src/lib/mock/contas.ts) + contas já analisadas pelo Dialys;
//               real          contas analisadas, até a empresa ligar a base dela aqui (cadastroReal).
//   carteira  o cadastro menos os clientes que o próprio usuário removeu ("Remover cliente"). Remover
//             não apaga o cliente, as reuniões, as transcrições nem o histórico, e não mexe na carteira
//             de outros usuários: só grava a remoção (demonstração: .dialys/demonstracao.json; real:
//             tabela carteira_remocao do banco).
// A situação vem da saúde calculada nas reuniões analisadas; sem reunião analisada, situacao = null
// ("Sem avaliação"), que é diferente de "Saudável".
import { CONTAS_MOCK } from "@/lib/mock/contas";
import { normalizarBusca } from "@/lib/formatar";
import type { FaixaSaude } from "@/lib/saude";
import { podeAcessarConta, type Usuario } from "../auth/usuarios";
import { usarDadosDemonstracao } from "../config/dados";
import { demonstracao, doUsuario } from "../db/demonstracao";
import { desfazerRemocaoCarteira, listarRemocoesCarteira, registrarRemocaoCarteira } from "../db/repositorio";
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
 * conta usada nas reuniões). Enquanto não houver, a carteira real são as contas analisadas.
 */
async function cadastroReal(): Promise<ClienteCadastro[]> {
  return [];
}

/** Clientes que o usuário pode ver, com a situação calculada (independe da carteira). */
async function cadastroDoUsuario(usuario: Usuario): Promise<ClienteResumo[]> {
  const analisadas = await listarContasInsight();
  const porId = new Map(analisadas.map((conta) => [conta.id, conta]));
  const cadastro: ClienteCadastro[] = usarDadosDemonstracao() ? CONTAS_MOCK : await cadastroReal();
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

/** Ids que o usuário tirou da própria carteira, na fonte de dados ativa. */
async function removidosDoUsuario(usuario: Usuario): Promise<Set<string>> {
  if (!usarDadosDemonstracao()) return listarRemocoesCarteira(usuario.id);
  const carteira = doUsuario((await demonstracao.ler()).carteiras, usuario.id);
  return new Set(carteira?.removidos.map((r) => r.contaId) ?? []);
}

async function carteiraDoUsuario(usuario: Usuario): Promise<ClienteResumo[]> {
  const [cadastro, removidos] = await Promise.all([cadastroDoUsuario(usuario), removidosDoUsuario(usuario)]);
  return cadastro.filter((c) => !removidos.has(c.id));
}

export const LIMITE_CLIENTES = 10;

export async function listarClientes(usuario: Usuario, opcoes: { busca?: string; limite?: number; offset?: number } = {}) {
  const termo = normalizarBusca((opcoes.busca ?? "").trim());
  const todos = await carteiraDoUsuario(usuario);
  const filtrados = termo ? todos.filter((c) => normalizarBusca(c.nome).includes(termo)) : todos;
  const offset = opcoes.offset ?? 0;
  const limite = opcoes.limite ?? LIMITE_CLIENTES;
  return {
    modo: usarDadosDemonstracao() ? ("demonstracao" as const) : ("real" as const),
    clientes: filtrados.slice(offset, offset + limite),
    total: filtrados.length,
  };
}

/** Cliente da carteira do usuário, ou null (inexistente, fora do escopo ou removido: mesma resposta). */
export async function buscarCliente(usuario: Usuario, id: string): Promise<ClienteResumo | null> {
  return (await carteiraDoUsuario(usuario)).find((c) => c.id === id) ?? null;
}

/**
 * Cliente que o usuário pode ver, esteja ou não na carteira dele. Para exibir o que já existe (Central,
 * compromissos antigos): tirar da carteira não esconde o histórico.
 */
export async function buscarClienteNoCadastro(usuario: Usuario, id: string): Promise<ClienteResumo | null> {
  return (await cadastroDoUsuario(usuario)).find((c) => c.id === id) ?? null;
}

/**
 * "Remover cliente": tira o cliente da carteira do usuário autenticado, na fonte de dados ativa. Não
 * apaga nada nem afeta outros usuários. null: cliente fora da carteira (inexistente, sem acesso ou já removido).
 */
export async function removerDaCarteira(usuario: Usuario, contaId: string): Promise<ClienteResumo | null> {
  const cliente = await buscarCliente(usuario, contaId);
  if (!cliente) return null;
  if (usarDadosDemonstracao()) {
    await demonstracao.transacao((dados) => {
      const carteira = (dados.carteiras[usuario.id] ??= { removidos: [] });
      if (!carteira.removidos.some((r) => r.contaId === contaId)) carteira.removidos.push({ contaId, removidoEm: new Date().toISOString() });
    });
  } else {
    await registrarRemocaoCarteira(usuario.id, contaId);
  }
  return cliente;
}

/** Devolve à carteira um cliente removido. null: cliente fora do cadastro do usuário. */
export async function devolverACarteira(usuario: Usuario, contaId: string): Promise<ClienteResumo | null> {
  const cliente = await buscarClienteNoCadastro(usuario, contaId);
  if (!cliente) return null;
  if (usarDadosDemonstracao()) {
    await demonstracao.transacao((dados) => {
      const carteira = doUsuario(dados.carteiras, usuario.id);
      if (carteira) carteira.removidos = carteira.removidos.filter((r) => r.contaId !== contaId);
    });
  } else {
    await desfazerRemocaoCarteira(usuario.id, contaId);
  }
  return cliente;
}
