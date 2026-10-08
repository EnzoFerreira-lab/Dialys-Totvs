// Serviço único da agenda: a home, a API /api/v1/agenda e o assistente usam só estas funções, com os
// mesmos ids e a mesma fonte (sem cópia de eventos). Toda operação é do usuário autenticado; o cliente
// associado precisa estar na carteira dele, verificado aqui no servidor.
import { randomUUID } from "node:crypto";
import {
  AlteracaoCompromissoSchema,
  MENSAGEM_TERMINO,
  NovoCompromissoSchema,
  terminoDepoisDoInicio,
  type Compromisso,
} from "@/lib/agenda";
import { dataNoFuso, paraInstante, somarDias, type DataCivil } from "@/lib/fuso";
import type { Usuario } from "../auth/usuarios";
import { buscarCliente } from "../clientes/clientes";
import { fusoHorario } from "../config/dados";
import type { CompromissoRegistro } from "../db/banco";
import { repositorioAgenda } from "./repositorio";

const repositorio = () => repositorioAgenda;

export function serializarCompromisso(registro: CompromissoRegistro): Compromisso {
  return {
    id: registro.id,
    titulo: registro.titulo,
    cliente: registro.contaId ? { id: registro.contaId, nome: registro.contaNome ?? registro.contaId } : null,
    inicio: registro.inicio,
    fim: registro.fim,
    status: registro.status,
    local: registro.local,
    observacoes: registro.observacoes,
    origem: registro.origem,
    criadoEm: registro.criadoEm,
    atualizadoEm: registro.atualizadoEm,
  };
}

export class ErroAgenda extends Error {
  constructor(
    readonly codigo: string,
    readonly status: number,
    mensagem: string,
    readonly campos?: Record<string, string>,
  ) {
    super(mensagem);
  }
}

export const ehIdCompromisso = (id: string) => /^cmp_[0-9a-f]{32}$/.test(id);

/** Maior intervalo consultado de uma vez (a semana do calendário cabe com folga). */
export const MAXIMO_DIAS_CONSULTA = 62;

/** Compromissos do usuário que acontecem entre as datas (inclusive), no fuso configurado, por início. */
export async function listarCompromissos(usuario: Usuario, periodo: { de: DataCivil; ate: DataCivil }) {
  const fuso = fusoHorario();
  const de = paraInstante(periodo.de, "00:00", fuso).getTime();
  const ate = paraInstante(somarDias(periodo.ate, 1), "00:00", fuso).getTime();
  return (await repositorio().listar(usuario.id))
    .filter((c) => Date.parse(c.fim) > de && Date.parse(c.inicio) < ate)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map(serializarCompromisso);
}

/** Compromissos de hoje no fuso configurado (home no celular, barra do assistente, briefing). */
export function compromissosDeHoje(usuario: Usuario, agora = new Date()) {
  const hoje = dataNoFuso(agora, fusoHorario());
  return listarCompromissos(usuario, { de: hoje, ate: hoje });
}

export async function buscarCompromisso(usuario: Usuario, id: string): Promise<Compromisso | null> {
  if (!ehIdCompromisso(id)) return null;
  const registro = (await repositorio().listar(usuario.id)).find((c) => c.id === id);
  return registro ? serializarCompromisso(registro) : null;
}

function errosDeCampo(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const campos: Record<string, string> = {};
  for (const issue of issues) {
    const campo = String(issue.path[0] ?? "geral");
    campos[campo] ??= issue.message;
  }
  return new ErroAgenda("DADOS_INVALIDOS", 422, Object.values(campos)[0] ?? "Dados inválidos.", campos);
}

/** Cliente da carteira do usuário; quem não pode ver a conta recebe o mesmo erro de conta inexistente. */
async function clienteDoUsuario(usuario: Usuario, contaId: string | null) {
  if (!contaId) return null;
  const cliente = await buscarCliente(usuario, contaId);
  if (!cliente) throw new ErroAgenda("CLIENTE_INVALIDO", 422, "Cliente não encontrado na sua carteira.", { contaId: "Cliente não encontrado na sua carteira." });
  return cliente;
}

/** Término no mesmo dia do início (no fuso): a agenda é diária, sem eventos que atravessam a meia-noite. */
function validarMesmoDia(inicio: string, fim: string) {
  const fuso = fusoHorario();
  const ultimoMinuto = new Date(Date.parse(fim) - 60_000);
  if (dataNoFuso(new Date(inicio), fuso) !== dataNoFuso(ultimoMinuto, fuso)) {
    throw new ErroAgenda("DADOS_INVALIDOS", 422, "O término deve ser no mesmo dia do início.", { fim: "O término deve ser no mesmo dia do início." });
  }
}

export async function criarCompromisso(usuario: Usuario, entrada: unknown): Promise<Compromisso> {
  const lido = NovoCompromissoSchema.safeParse(entrada);
  if (!lido.success) throw errosDeCampo(lido.error.issues);
  const dados = lido.data;
  const inicio = new Date(dados.inicio).toISOString();
  const fim = new Date(dados.fim).toISOString();
  validarMesmoDia(inicio, fim);
  const cliente = await clienteDoUsuario(usuario, dados.contaId);
  const agora = new Date().toISOString();
  const registro: CompromissoRegistro = {
    id: `cmp_${randomUUID().replace(/-/g, "")}`,
    usuarioId: usuario.id,
    titulo: dados.titulo,
    contaId: cliente?.id ?? null,
    contaNome: cliente?.nome ?? null,
    inicio,
    fim,
    status: dados.status,
    local: dados.local,
    observacoes: dados.observacoes,
    origem: "usuario",
    criadoEm: agora,
    atualizadoEm: agora,
  };
  await repositorio().inserir(registro);
  return serializarCompromisso(registro);
}

/** Edita, cancela (status "cancelado") ou marca como realizado. Só o dono altera; outro usuário recebe 404. */
export async function atualizarCompromisso(usuario: Usuario, id: string, entrada: unknown): Promise<Compromisso> {
  if (!ehIdCompromisso(id)) throw new ErroAgenda("COMPROMISSO_NAO_ENCONTRADO", 404, "Compromisso não encontrado.");
  const lido = AlteracaoCompromissoSchema.safeParse(entrada);
  if (!lido.success) throw errosDeCampo(lido.error.issues);
  const alteracao = lido.data;
  // Cliente só é validado quando muda: um cliente que o usuário tirou da carteira continua identificado
  // nos compromissos já existentes (editar o título não obriga a trocar o cliente).
  const atual = await buscarCompromisso(usuario, id);
  const novoContaId = alteracao.contaId === undefined ? undefined : alteracao.contaId || null;
  const cliente = novoContaId === undefined || novoContaId === (atual?.cliente?.id ?? null) ? undefined : await clienteDoUsuario(usuario, novoContaId);

  const atualizado = await repositorio().atualizar(usuario.id, id, (registro) => {
    const inicio = alteracao.inicio ? new Date(alteracao.inicio).toISOString() : registro.inicio;
    const fim = alteracao.fim ? new Date(alteracao.fim).toISOString() : registro.fim;
    if (!terminoDepoisDoInicio({ inicio, fim })) throw new ErroAgenda("DADOS_INVALIDOS", 422, MENSAGEM_TERMINO, { fim: MENSAGEM_TERMINO });
    validarMesmoDia(inicio, fim);
    if (alteracao.titulo !== undefined) registro.titulo = alteracao.titulo;
    if (cliente !== undefined) {
      registro.contaId = cliente?.id ?? null;
      registro.contaNome = cliente?.nome ?? null;
    }
    if (alteracao.local !== undefined) registro.local = alteracao.local || null;
    if (alteracao.observacoes !== undefined) registro.observacoes = alteracao.observacoes || null;
    if (alteracao.status !== undefined) registro.status = alteracao.status;
    registro.inicio = inicio;
    registro.fim = fim;
    registro.atualizadoEm = new Date().toISOString();
  });
  if (!atualizado) throw new ErroAgenda("COMPROMISSO_NAO_ENCONTRADO", 404, "Compromisso não encontrado.");
  return serializarCompromisso(atualizado);
}

/** Compromissos do usuário com um cliente (passados e futuros), do mais próximo de hoje para trás e para frente. */
export async function compromissosDoCliente(usuario: Usuario, contaId: string): Promise<Compromisso[]> {
  return (await repositorio().listar(usuario.id))
    .filter((c) => c.contaId === contaId)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map(serializarCompromisso);
}
