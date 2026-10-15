// Aba Clientes: a visão unificada de cada cliente (todas as reuniões, principais alertas, produtos
// citados, saúde ao longo do tempo e a agenda do usuário com ele). Tudo sai das reuniões analisadas e
// da agenda, sempre filtrado pelo escopo do usuário da sessão; nada é guardado à parte.
import {
  chaveConta,
  codigoReuniao,
  criticidadeConta,
  dataDaReuniao,
  horaDaReuniao,
  momentoDaReuniao,
  nomeConta,
  temDataInformada,
  type ContextoProduto,
  type Criticidade,
  type TipoSinal,
  type Urgencia,
} from "@/lib/insights";
import type { Compromisso } from "@/lib/agenda";
import { dataNoFuso, somarDias } from "@/lib/fuso";
import { calcularSaude, type FaixaSaude, type Saude } from "@/lib/saude";
import { compromissosDoCliente, listarCompromissos } from "../agenda/agenda";
import type { Severidade } from "../ai/schemas";
import { podeAcessarConta, type Usuario } from "../auth/usuarios";
import { fusoHorario } from "../config/dados";
import type { ReuniaoRegistro } from "../db/banco";
import { listarAnalisesConcluidas, listarReunioesSemTranscricao, type AnaliseConcluida } from "../db/repositorio";
import { CONTEXTO_PRODUTO, TIPO_SINAL, listarContasInsight } from "../insights/contas";

export type Tendencia = "melhorou" | "piorou" | "estavel";

export type AlertaCliente = {
  /** Id do insight (sin_…). */
  id: string;
  tipo: TipoSinal;
  urgencia: Urgencia;
  severidade: Severidade;
  subtipo: string;
  citacao: string;
  recomendacao: string;
  confianca: number;
  reuniao: { id: string; codigo: string; data: string | null };
  noCrm: boolean;
};

export type ReuniaoCliente = {
  id: string;
  codigo: string;
  numero: number;
  /** Data e hora informadas pela reunião; null quando ela não trouxe data. */
  data: string | null;
  hora: string | null;
  processadaEm: string;
  nps: number | null;
  duracao: string | null;
  sinais: { churn: number; oportunidade: number; objecao: number };
  /** Saúde calculada só com esta reunião (para ver a evolução). null sem transcrição ativa. */
  saude: { nota: number; faixa: FaixaSaude } | null;
  resumo: string | null;
  transcricaoRemovida: boolean;
};

export type ProdutoCitado = { nome: string; contexto: ContextoProduto; reunioes: number };

export type PerfilCliente = {
  id: string;
  nome: string;
  segmento: string | null;
  codigoTotvs: string | null;
  nps: number | null;
  /** Saúde da reunião mais recente (a mesma da Central e da Home). */
  saude: Saude | null;
  criticidade: Criticidade | null;
  tendencia: Tendencia | null;
  relacao: "forte" | "neutra" | "fragil" | null;
  diagnostico: string | null;
  acao: string | null;
  proximosPassos: string[];
  geradoPorIa: boolean;
  /** Da mais recente para a mais antiga; inclui as com transcrição removida (marcadas). */
  reunioes: ReuniaoCliente[];
  /** Do mais crítico para o menos, de todas as reuniões ativas. */
  alertas: AlertaCliente[];
  produtos: ProdutoCitado[];
  /** Compromissos do usuário com este cliente (agenda da Home), do mais antigo para o mais novo. */
  compromissos: Compromisso[];
};

export type ClienteListagem = {
  id: string;
  nome: string;
  segmento: string | null;
  saude: { nota: number; faixa: FaixaSaude } | null;
  criticidade: Criticidade | null;
  tendencia: Tendencia | null;
  totalReunioes: number;
  ultimaReuniao: { codigo: string; data: string | null; processadaEm: string } | null;
  alertas: { churn: number; oportunidade: number; objecao: number };
  proximoCompromisso: { id: string; titulo: string; inicio: string } | null;
};

const PESO_SEVERIDADE: Record<Severidade, number> = { ALTA: 0, MÉDIA: 1, BAIXA: 2 };
const PESO_TIPO: Record<TipoSinal, number> = { churn: 0, oportunidade: 1, objecao: 2 };
/** Diferença de nota entre as duas últimas reuniões para contar como mudança. */
const LIMIAR_TENDENCIA = 0.5;

const umaCasa = (n: number) => Math.round(n * 10) / 10;

function saudeDaReuniao(analise: AnaliseConcluida) {
  const saude = calcularSaude(analise.resultado.analise.sinais, analise.reuniao.contexto?.nps);
  return { nota: umaCasa(saude.nota), faixa: saude.faixa };
}

function contarSinais(analise: AnaliseConcluida) {
  const contar = (tipo: TipoSinal) => analise.resultado.analise.sinais.filter((s) => TIPO_SINAL[s.tipo] === tipo).length;
  return { churn: contar("churn"), oportunidade: contar("oportunidade"), objecao: contar("objecao") };
}

/** Compara a saúde das duas reuniões ativas mais recentes. */
function tendenciaDe(ativas: AnaliseConcluida[]): Tendencia | null {
  if (ativas.length < 2) return null;
  const [ultima, anterior] = ativas.map(saudeDaReuniao);
  const diferenca = ultima.nota - anterior.nota;
  if (diferenca >= LIMIAR_TENDENCIA) return "melhorou";
  if (diferenca <= -LIMIAR_TENDENCIA) return "piorou";
  return "estavel";
}

const porMomentoDecrescente = (a: { reuniao: ReuniaoRegistro }, b: { reuniao: ReuniaoRegistro }) =>
  momentoDaReuniao(b.reuniao).localeCompare(momentoDaReuniao(a.reuniao));

function alertasDe(ativas: AnaliseConcluida[]): AlertaCliente[] {
  return ativas
    .flatMap((analise) => {
      const sincronizados = new Set(analise.sincronizacoes.map((s) => s.sinalId));
      const informada = temDataInformada(analise.reuniao);
      return analise.resultado.analise.sinais.map((sinal) => ({
        momento: momentoDaReuniao(analise.reuniao),
        alerta: {
          id: sinal.id,
          tipo: TIPO_SINAL[sinal.tipo],
          urgencia: sinal.severidade === "ALTA" ? ("alta" as const) : ("media" as const),
          severidade: sinal.severidade,
          subtipo: sinal.subtipo,
          citacao: sinal.citacaoExata,
          recomendacao: sinal.recomendacaoAcao,
          confianca: sinal.confianca,
          reuniao: { id: analise.reuniao.id, codigo: codigoReuniao(analise.reuniao), data: informada ? dataDaReuniao(analise.reuniao) : null },
          noCrm: sincronizados.has(sinal.id),
        },
      }));
    })
    .sort(
      (a, b) =>
        PESO_SEVERIDADE[a.alerta.severidade] - PESO_SEVERIDADE[b.alerta.severidade] ||
        PESO_TIPO[a.alerta.tipo] - PESO_TIPO[b.alerta.tipo] ||
        b.momento.localeCompare(a.momento),
    )
    .map(({ alerta }) => alerta);
}

function produtosDe(ativas: AnaliseConcluida[]): ProdutoCitado[] {
  const contagem = new Map<string, ProdutoCitado>();
  for (const analise of ativas) {
    const vistos = new Set<string>();
    for (const mencao of analise.resultado.analise.mencoesProdutos) {
      const contexto = CONTEXTO_PRODUTO[mencao.status];
      const chave = `${contexto}|${mencao.produto}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const atual = contagem.get(chave) ?? { nome: mencao.produto, contexto, reunioes: 0 };
      atual.reunioes++;
      contagem.set(chave, atual);
    }
  }
  const ordemContexto: Record<ContextoProduto, number> = { em_uso: 0, expansao: 1, insatisfacao: 2, concorrente: 3 };
  return [...contagem.values()].sort((a, b) => ordemContexto[a.contexto] - ordemContexto[b.contexto] || b.reunioes - a.reunioes || a.nome.localeCompare(b.nome, "pt-BR"));
}

function reuniaoDaLista(reuniao: ReuniaoRegistro, analise: AnaliseConcluida | null): ReuniaoCliente {
  const informada = temDataInformada(reuniao);
  return {
    id: reuniao.id,
    codigo: codigoReuniao(reuniao),
    numero: reuniao.numero,
    data: informada ? dataDaReuniao(reuniao) : null,
    hora: informada ? horaDaReuniao(reuniao) : null,
    processadaEm: reuniao.criadaEm,
    nps: reuniao.contexto?.nps ?? null,
    duracao: reuniao.contexto?.duracao ?? null,
    sinais: analise ? contarSinais(analise) : { churn: 0, oportunidade: 0, objecao: 0 },
    saude: analise ? saudeDaReuniao(analise) : null,
    resumo: analise?.resultado.analise.resumoExecutivo ?? null,
    transcricaoRemovida: !analise,
  };
}

/** Reuniões ativas e com transcrição removida, agrupadas pela chave do cliente, já no escopo do usuário. */
async function reunioesPorCliente(usuario: Usuario) {
  const [ativas, removidas] = await Promise.all([listarAnalisesConcluidas(usuario.id), listarReunioesSemTranscricao(usuario.id)]);
  const visivel = (id: string) => podeAcessarConta(usuario, id);
  const grupos = new Map<string, { ativas: AnaliseConcluida[]; removidas: ReuniaoRegistro[] }>();
  const grupo = (id: string) => {
    let atual = grupos.get(id);
    if (!atual) grupos.set(id, (atual = { ativas: [], removidas: [] }));
    return atual;
  };
  for (const analise of ativas) {
    const id = chaveConta(analise.reuniao);
    if (visivel(id)) grupo(id).ativas.push(analise);
  }
  for (const reuniao of removidas) {
    const id = chaveConta(reuniao);
    if (visivel(id)) grupo(id).removidas.push(reuniao);
  }
  for (const g of grupos.values()) g.ativas.sort(porMomentoDecrescente);
  return grupos;
}

/** Lista unificada: um cliente por linha, com tudo o que a tabela da aba Clientes mostra. */
export async function listarClientesUnificados(usuario: Usuario, agora = new Date()): Promise<ClienteListagem[]> {
  const [grupos, contas, proximos] = await Promise.all([
    reunioesPorCliente(usuario),
    listarContasInsight(usuario.id),
    // Próximos 60 dias da agenda do usuário: o próximo compromisso agendado com cada cliente.
    listarCompromissos(usuario, { de: dataNoFuso(agora, fusoHorario()), ate: somarDias(dataNoFuso(agora, fusoHorario()), 60) }),
  ]);
  const contaPorId = new Map(contas.map((c) => [c.id, c]));
  const proximoPorCliente = new Map<string, Compromisso>();
  for (const c of proximos) {
    if (!c.cliente || c.status !== "agendado" || Date.parse(c.fim) <= agora.getTime()) continue;
    if (!proximoPorCliente.has(c.cliente.id)) proximoPorCliente.set(c.cliente.id, c);
  }

  return [...grupos.entries()]
    .map(([id, { ativas, removidas }]): ClienteListagem => {
      const conta = contaPorId.get(id);
      const ultimaQualquer = [...ativas.map((a) => a.reuniao), ...removidas].sort((a, b) => momentoDaReuniao(b).localeCompare(momentoDaReuniao(a)))[0];
      const alertas = ativas.reduce(
        (soma, a) => {
          const s = contarSinais(a);
          return { churn: soma.churn + s.churn, oportunidade: soma.oportunidade + s.oportunidade, objecao: soma.objecao + s.objecao };
        },
        { churn: 0, oportunidade: 0, objecao: 0 },
      );
      const proximo = proximoPorCliente.get(id);
      return {
        id,
        nome: conta?.nome ?? nomeConta(ultimaQualquer),
        segmento: conta?.segmento ?? ultimaQualquer.contexto?.segmento ?? null,
        saude: conta ? { nota: umaCasa(conta.saude.nota), faixa: conta.saude.faixa } : null,
        criticidade: conta ? criticidadeConta(conta.sinais) : null,
        tendencia: tendenciaDe(ativas),
        totalReunioes: ativas.length + removidas.length,
        ultimaReuniao: ultimaQualquer
          ? {
              codigo: codigoReuniao(ultimaQualquer),
              data: temDataInformada(ultimaQualquer) ? dataDaReuniao(ultimaQualquer) : null,
              processadaEm: ultimaQualquer.criadaEm,
            }
          : null,
        alertas,
        proximoCompromisso: proximo ? { id: proximo.id, titulo: proximo.titulo, inicio: proximo.inicio } : null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Ficha do cliente; null se não existir ou estiver fora do escopo do usuário (mesma resposta). */
export async function montarPerfilCliente(usuario: Usuario, contaId: string): Promise<PerfilCliente | null> {
  if (!podeAcessarConta(usuario, contaId)) return null;
  const grupos = await reunioesPorCliente(usuario);
  const grupo = grupos.get(contaId);
  if (!grupo) return null;
  const { ativas, removidas } = grupo;
  const conta = (await listarContasInsight(usuario.id)).find((c) => c.id === contaId) ?? null;
  const qualquer = ativas[0]?.reuniao ?? removidas[0];

  const reunioes = [...ativas.map((a) => reuniaoDaLista(a.reuniao, a)), ...removidas.map((r) => reuniaoDaLista(r, null))].sort((a, b) =>
    `${b.data ?? b.processadaEm.slice(0, 10)} ${b.hora ?? ""}`.localeCompare(`${a.data ?? a.processadaEm.slice(0, 10)} ${a.hora ?? ""}`),
  );

  return {
    id: contaId,
    nome: conta?.nome ?? nomeConta(qualquer),
    segmento: conta?.segmento ?? qualquer.contexto?.segmento ?? null,
    codigoTotvs: qualquer.contexto?.codigoCliente ?? null,
    nps: conta?.nps ?? null,
    saude: conta?.saude ?? null,
    criticidade: conta ? criticidadeConta(conta.sinais) : null,
    tendencia: tendenciaDe(ativas),
    relacao: conta?.relacao ?? null,
    diagnostico: conta?.diagnostico ?? null,
    acao: conta?.acao ?? null,
    proximosPassos: conta?.proximosPassos ?? [],
    geradoPorIa: conta?.geradoPorIa ?? false,
    reunioes,
    alertas: alertasDe(ativas),
    produtos: produtosDe(ativas),
    compromissos: await compromissosDoCliente(usuario, contaId),
  };
}
