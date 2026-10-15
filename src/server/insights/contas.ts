// Central de Insights a partir das reuniões analisadas: agrupa por empresa e monta o que a tela exibe
// (sinais, produtos, evidências literais, diagnóstico). Uma empresa entra na Central assim que a
// primeira reunião dela é concluída pelo pipeline.
import {
  PRIORIDADE_SINAL,
  chaveConta,
  codigoReuniao,
  dataDaReuniao,
  horaDaReuniao,
  momentoDaReuniao,
  nomeConta,
  temDataInformada,
  type ContaInsight,
  type ContextoProduto,
  type Evidencia,
  type MencaoProduto,
  type ReuniaoCentral,
  type ReuniaoHistorico,
  type Sinal,
  type TipoSinal,
} from "@/lib/insights";
import { calcularSaude, confiancaRelacional } from "@/lib/saude";
import type { StatusProduto, TipoSinal as TipoSinalIA } from "../ai/schemas";
import type { ReuniaoRegistro, SinalRegistro } from "../db/banco";
import { listarAnalisesConcluidas, listarReunioesSemTranscricao, type AnaliseConcluida } from "../db/repositorio";

export { chaveConta, nomeConta };

export const TIPO_SINAL: Record<TipoSinalIA, TipoSinal> = { CHURN_RISK: "churn", OPPORTUNITY: "oportunidade", OBJECTION: "objecao" };
export const CONTEXTO_PRODUTO: Record<StatusProduto, ContextoProduto> = {
  EM_USO: "em_uso",
  INTERESSE: "expansao",
  INSATISFAÇÃO: "insatisfacao",
  CONCORRENTE: "concorrente",
};
const PESO_SEVERIDADE = { ALTA: 0, MÉDIA: 1, BAIXA: 2 } as const;

/** Trecho de evidência: a fala inteira se for curta; senão, a janela em volta das citações. */
const LIMITE_TRECHO = 360;
const MARGEM_TRECHO = 140;

const ordenarSinais = (a: SinalRegistro, b: SinalRegistro) =>
  PRIORIDADE_SINAL[TIPO_SINAL[a.tipo]] - PRIORIDADE_SINAL[TIPO_SINAL[b.tipo]] || PESO_SEVERIDADE[a.severidade] - PESO_SEVERIDADE[b.severidade];

const paraSinal = (sinal: SinalRegistro): Sinal => ({ tipo: TIPO_SINAL[sinal.tipo], urgencia: sinal.severidade === "ALTA" ? "alta" : "media" });

/** "[LOCUTOR 2]" → "Locutor 2"; "Cliente (Diretor)" fica como está. */
function formatarFalante(bruto: string) {
  const semColchetes = bruto.replace(/^\[|\]$/g, "").trim();
  return semColchetes === semColchetes.toUpperCase()
    ? semColchetes.charAt(0) + semColchetes.slice(1).toLowerCase()
    : semColchetes;
}

/** Uma evidência por fala que contém citações, com as citações destacadas. */
export function montarEvidencias(transcricao: string, sinais: SinalRegistro[]): Evidencia[] {
  const falas = new Map<number, { fim: number; sinais: SinalRegistro[] }>();
  for (const sinal of sinais) {
    const inicio = transcricao.lastIndexOf("\n", sinal.posicaoCaracterStart - 1) + 1;
    const quebra = transcricao.indexOf("\n", sinal.posicaoCaracterEnd);
    const fala = falas.get(inicio) ?? { fim: quebra === -1 ? transcricao.length : quebra, sinais: [] };
    fala.sinais.push(sinal);
    falas.set(inicio, fala);
  }

  return [...falas.entries()]
    .map(([inicio, { fim, sinais: daFala }]) => {
      const linha = transcricao.slice(inicio, fim);
      const prefixo = linha.match(/^\s*(\[[^\]\n]{1,40}\]|[^:\n[]{1,60}?):\s+/);
      const inicioFala = inicio + (prefixo?.[0].length ?? 0);

      let de = inicioFala;
      let ate = fim;
      if (fim - inicioFala > LIMITE_TRECHO) {
        const primeira = Math.min(...daFala.map((s) => s.posicaoCaracterStart));
        const ultima = Math.max(...daFala.map((s) => s.posicaoCaracterEnd));
        de = Math.max(inicioFala, primeira - MARGEM_TRECHO);
        ate = Math.min(fim, ultima + MARGEM_TRECHO);
        // Não corta palavra ao meio (sem invadir as citações).
        const espacoInicial = transcricao.indexOf(" ", de);
        if (de > inicioFala && espacoInicial !== -1 && espacoInicial < primeira) de = espacoInicial + 1;
        const espacoFinal = transcricao.lastIndexOf(" ", ate);
        if (ate < fim && espacoFinal > ultima) ate = espacoFinal;
      }

      const evidencia: Evidencia = {
        texto: `${de > inicioFala ? "…" : ""}${transcricao.slice(de, ate).trim()}${ate < fim ? "…" : ""}`,
        falante: prefixo ? formatarFalante(prefixo[1]) : "Trecho da reunião",
        // O trecho real da transcrição (não a citação do modelo, que pode diferir em espaços ou acentos).
        destaques: daFala.map((s) => ({
          trecho: transcricao.slice(s.posicaoCaracterStart, s.posicaoCaracterEnd),
          tipo: TIPO_SINAL[s.tipo],
          urgencia: paraSinal(s).urgencia,
        })),
      };
      return { evidencia, principal: [...daFala].sort(ordenarSinais)[0] };
    })
    .sort((a, b) => ordenarSinais(a.principal, b.principal))
    .map(({ evidencia }) => evidencia);
}

function montarConta(chave: string, analisesRecebidas: AnaliseConcluida[], reuniaoId?: string | null): ContaInsight {
  // Da reunião que aconteceu por último para a mais antiga (uma reunião antiga pode ser enviada depois).
  const analises = [...analisesRecebidas].sort((a, b) => momentoDaReuniao(b.reuniao).localeCompare(momentoDaReuniao(a.reuniao)));
  const exibida = (reuniaoId && analises.find((a) => a.reuniao.id === reuniaoId)) || analises[0];
  const { reuniao, resultado, sincronizacoes } = exibida;
  const sinais = [...resultado.analise.sinais].sort(ordenarSinais);

  const porTipo = new Map<TipoSinal, Sinal>();
  for (const sinal of sinais) if (!porTipo.has(TIPO_SINAL[sinal.tipo])) porTipo.set(TIPO_SINAL[sinal.tipo], paraSinal(sinal));

  const produtos = new Map<string, MencaoProduto>();
  for (const mencao of resultado.analise.mencoesProdutos) {
    const contexto = CONTEXTO_PRODUTO[mencao.status];
    produtos.set(`${contexto}-${mencao.produto}`, { contexto, nome: mencao.produto, descricao: mencao.contexto });
  }

  const deAlguma = <T,>(ler: (r: ReuniaoRegistro) => T | undefined) =>
    analises.map((a) => ler(a.reuniao)).find((valor) => valor !== undefined);

  const nps = reuniao.contexto?.nps ?? deAlguma((r) => r.contexto?.nps);
  const saude = calcularSaude(sinais, nps);
  const temChurn = sinais.some((s) => s.tipo === "CHURN_RISK");
  const temChurnCritico = sinais.some((s) => s.tipo === "CHURN_RISK" && s.severidade === "ALTA");

  return {
    id: chave,
    nome: analises.map((a) => a.reuniao.contaNome).find(Boolean) ?? nomeConta(reuniao),
    segmento: deAlguma((r) => r.contexto?.segmento),
    nps: deAlguma((r) => r.contexto?.nps),
    reuniao: reuniao.contexto?.data ?? reuniao.criadaEm,
    reuniaoId: reuniao.id,
    reuniaoCodigo: codigoReuniao(reuniao),
    dataInformada: temDataInformada(reuniao),
    arquivo: reuniao.nomeArquivo ?? `reuniao_${reuniao.contexto?.idReuniao ?? reuniao.id}.txt`,
    totalReunioes: analises.length,
    sinais: [...porTipo.values()],
    totalSinais: sinais.length,
    insightIds: sinais.map((s) => s.id),
    sincronizadosCrm: sincronizacoes.length,
    produtos: [...produtos.values()],
    evidencias: reuniao.transcricao ? montarEvidencias(reuniao.transcricao, sinais) : [],
    diagnostico: resultado.analise.resumoExecutivo,
    geradoPorIa: resultado.auditoria.modo !== "demonstracao",
    acao: sinais[0]?.recomendacaoAcao ?? resultado.analise.proximosPassosSugeridos[0] ?? "Nenhuma ação sugerida para esta reunião.",
    proximosPassos: resultado.analise.proximosPassosSugeridos,
    saude,
    relacao: confiancaRelacional(saude, temChurn, temChurnCritico, nps),
    reunioes: analises.map(paraHistorico).sort((a, b) => `${b.data} ${b.hora}`.localeCompare(`${a.data} ${a.hora}`)),
    reuniaoMaisRecente: exibida === analises[0],
  };
}

function paraHistorico({ reuniao, resultado }: AnaliseConcluida): ReuniaoHistorico {
  const sinais = [...resultado.analise.sinais].sort(ordenarSinais);
  const contar = (tipo: SinalRegistro["tipo"]) => sinais.filter((s) => s.tipo === tipo).length;
  const principal = sinais[0];
  return {
    id: reuniao.id,
    codigo: codigoReuniao(reuniao),
    data: dataDaReuniao(reuniao),
    hora: horaDaReuniao(reuniao),
    dataInformada: temDataInformada(reuniao),
    nps: reuniao.contexto?.nps,
    duracao: reuniao.contexto?.duracao,
    sinais: { churn: contar("CHURN_RISK"), oportunidade: contar("OPPORTUNITY"), objecao: contar("OBJECTION") },
    principal: principal ? { ...paraSinal(principal), subtipo: principal.subtipo } : undefined,
  };
}

/**
 * Empresas com reunião analisada, da mais crítica para a menos; empatadas, a de análise mais recente primeiro.
 * `reuniaoEmFoco` (Central com ?reuniao=): a conta dessa reunião é exibida a partir dela, não da mais recente.
 */
export async function listarContasInsight(usuarioId: string, opcoes: { reuniaoEmFoco?: string | null } = {}): Promise<ContaInsight[]> {
  const grupos = new Map<string, AnaliseConcluida[]>();
  for (const analise of await listarAnalisesConcluidas(usuarioId)) {
    const chave = chaveConta(analise.reuniao);
    grupos.set(chave, [...(grupos.get(chave) ?? []), analise]);
  }
  const peso = (conta: ContaInsight) => {
    const [principal] = conta.sinais;
    return principal ? PRIORIDADE_SINAL[principal.tipo] * 2 + (principal.urgencia === "alta" ? 0 : 1) : 99;
  };
  // A ordem de inserção dos grupos já é a da análise mais recente: o sort estável a preserva nos empates.
  // A ordem usa sempre a reunião mais recente; a conta em foco só troca o conteúdo exibido.
  return [...grupos.entries()]
    .map(([chave, analises]) => ({ ordem: montarConta(chave, analises), exibida: montarConta(chave, analises, opcoes.reuniaoEmFoco) }))
    .sort((a, b) => peso(a.ordem) - peso(b.ordem))
    .map(({ exibida }) => exibida);
}

/** Empresas que o /envio oferece para associar uma nova reunião (só as que têm identidade própria). */
export async function listarContasParaEnvio(usuarioId: string): Promise<Array<{ id: string; nome: string; segmento?: string }>> {
  return (await listarContasInsight(usuarioId))
    .filter((conta) => !conta.id.startsWith("reuniao-"))
    .map(({ id, nome, segmento }) => ({ id, nome, segmento }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Central de Insights por reunião: uma linha por reunião concluída, identificada pelo id e pelo número
 * gravados nela (não pela posição nem pelo cliente). O detalhe de cada linha é a conta vista a partir
 * daquela reunião. Reuniões com a transcrição removida continuam na lista (mesmo código), sem análise.
 * `podeVer`: escopo do usuário da sessão.
 */
export async function listarReunioesCentral(usuarioId: string, podeVer: (contaId: string) => boolean = () => true): Promise<ReuniaoCentral[]> {
  const grupos = new Map<string, AnaliseConcluida[]>();
  for (const analise of await listarAnalisesConcluidas(usuarioId)) {
    const chave = chaveConta(analise.reuniao);
    if (podeVer(chave)) grupos.set(chave, [...(grupos.get(chave) ?? []), analise]);
  }
  const linha = (reuniao: AnaliseConcluida["reuniao"], detalhe: ContaInsight | null): ReuniaoCentral => {
    const informada = temDataInformada(reuniao);
    return {
      id: reuniao.id,
      numero: reuniao.numero,
      codigo: codigoReuniao(reuniao),
      idTotvs: reuniao.contexto?.idReuniao ?? null,
      conta: { id: chaveConta(reuniao), nome: detalhe?.nome ?? nomeConta(reuniao), segmento: reuniao.contexto?.segmento },
      data: informada ? dataDaReuniao(reuniao) : null,
      hora: informada ? horaDaReuniao(reuniao) : null,
      processadaEm: reuniao.criadaEm,
      momento: momentoDaReuniao(reuniao),
      detalhe,
      transcricaoRemovidaEm: reuniao.transcricaoRemovida?.em ?? null,
    };
  };
  const ativas = [...grupos.entries()].flatMap(([chave, analises]) => analises.map((a) => linha(a.reuniao, montarConta(chave, analises, a.reuniao.id))));
  const removidas = (await listarReunioesSemTranscricao(usuarioId)).filter((r) => podeVer(chaveConta(r))).map((r) => linha(r, null));
  const peso = (r: ReuniaoCentral) => {
    const principal = r.detalhe?.sinais[0];
    return principal ? PRIORIDADE_SINAL[principal.tipo] * 2 + (principal.urgencia === "alta" ? 0 : 1) : 99;
  };
  // Prioridade comercial (sinal mais crítico da reunião), depois a mais recente; sem transcrição, no fim.
  return [...ativas.sort((a, b) => peso(a) - peso(b) || b.momento.localeCompare(a.momento)), ...removidas.sort((a, b) => b.momento.localeCompare(a.momento))];
}
