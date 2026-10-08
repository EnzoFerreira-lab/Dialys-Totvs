// Consultas controladas do assistente Dialys. São as ÚNICAS formas de o assistente ler dados:
// argumentos validados por schema, execução no servidor, filtro de permissão por usuário em toda
// consulta e volume limitado (com aviso quando a lista foi cortada). Nada de SQL livre, nada de
// credenciais, e nunca o banco inteiro. Independem do fornecedor de IA: o motor Claude as expõe como
// tools; o motor por regras as chama direto; um futuro canal de voz reutiliza as mesmas.
import { z } from "zod";
import { chaveConta, codigoReuniao, criticidadeConta, dataDaReuniao, nomeConta, temDataInformada, type ContaInsight } from "@/lib/insights";
import { normalizarBusca } from "@/lib/formatar";
import { dataNoFuso, horaNoFuso, somarDias } from "@/lib/fuso";
import { listarCompromissos } from "../agenda/agenda";
import { fusoHorario } from "../config/dados";
import type { ReuniaoRegistro } from "../db/banco";
import { listarAnalisesConcluidas, type AnaliseConcluida } from "../db/repositorio";
import { listarContasInsight, montarEvidencias } from "../insights/contas";
import { podeAcessarConta, type Usuario } from "../auth/usuarios";

export const LIMITE_PADRAO = 10;
export const LIMITE_MAXIMO = 20;

/* ---------- Contexto e resultado ---------- */

export type ContextoConsulta = {
  usuario: Usuario;
  agora: Date;
  /** Cache por pergunta: o banco é lido uma vez, já filtrado pelo escopo do usuário. */
  dados?: Promise<DadosPermitidos>;
};

type DadosPermitidos = { contas: ContaInsight[]; analises: AnaliseConcluida[] };

export type EntidadeConta = { id: string; nome: string };
export type EntidadeReuniao = { id: string; codigo: string; contaId: string; contaNome: string; data: string; dataInformada: boolean };

export type ResultadoFerramenta = {
  /** O que vai para a IA (ou para o motor por regras): só dados, nunca instruções. */
  dados: Record<string, unknown>;
  /** Uma linha para auditoria da conversa. */
  resumo: string;
  /** Empresas e reuniões que sustentam a resposta (viram "fontes" e o foco da conversa). */
  entidades: { contas: EntidadeConta[]; reunioes: EntidadeReuniao[] };
  erro?: boolean;
};

const semEntidades = () => ({ contas: [], reunioes: [] });

function dadosPermitidos(ctx: ContextoConsulta): Promise<DadosPermitidos> {
  ctx.dados ??= Promise.all([listarContasInsight(), listarAnalisesConcluidas()]).then(([contas, analises]) => ({
    contas: contas.filter((conta) => podeAcessarConta(ctx.usuario, conta.id)),
    analises: analises.filter((a) => podeAcessarConta(ctx.usuario, chaveConta(a.reuniao))),
  }));
  return ctx.dados;
}

/* ---------- Utilidades ---------- */

const cortar = (texto: string, limite: number) => (texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto);

/** Data da reunião (informada pela TOTVS, já local) ou do registro, como AAAA-MM-DD no fuso de Brasília. */
export { dataDaReuniao };

export const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Como a análise foi feita: por regras locais (sem chave do Claude) não deve ser apresentada como IA. */
function procedencia(analise: AnaliseConcluida) {
  return { analisePorRegras: analise.resultado.auditoria.modo === "demonstracao" };
}

const linkConta = (contaId: string) => `/contas/${encodeURIComponent(contaId)}`;
const linkReuniao = (reuniaoId: string) => `/insights?reuniao=${encodeURIComponent(reuniaoId)}`;
const CATEGORIA = { CHURN_RISK: "risco_churn", OPPORTUNITY: "oportunidade", OBJECTION: "objecao" } as const;
const PALAVRAS_GENERICAS = new Set(["grupo", "cliente", "empresa", "ltda", "s/a", "sa", "de", "da", "do", "das", "dos", "e", "the"]);

const tokens = (texto: string) =>
  normalizarBusca(texto)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !PALAVRAS_GENERICAS.has(t));

/** Contas cujo nome bate com o texto: igual > contém > palavras em comum. Só o melhor nível volta. */
export function encontrarContas(contas: ContaInsight[], consulta: string): ContaInsight[] {
  const alvo = normalizarBusca(consulta).trim();
  const alvoTokens = tokens(consulta);
  const pontuadas = contas.map((conta) => {
    const nome = normalizarBusca(conta.nome);
    if (nome === alvo || conta.id === consulta) return { conta, nota: 3 };
    if (alvo.length >= 3 && (nome.includes(alvo) || alvo.includes(nome))) return { conta, nota: 2 };
    const nomeTokens = tokens(conta.nome);
    if (alvoTokens.length && alvoTokens.some((t) => nomeTokens.includes(t))) return { conta, nota: 1 };
    return { conta, nota: 0 };
  });
  const melhor = Math.max(0, ...pontuadas.map((p) => p.nota));
  return melhor === 0 ? [] : pontuadas.filter((p) => p.nota === melhor).map((p) => p.conta);
}

function resumoConta(conta: ContaInsight, analises: AnaliseConcluida[]) {
  // A reunião que a conta exibe já é a que aconteceu por último (src/server/insights/contas.ts).
  const ultima = analises.find((a) => a.reuniao.id === conta.reuniaoId);
  const contagem = (tipo: string) => (ultima ? ultima.resultado.analise.sinais.filter((s) => s.tipo === tipo).length : 0);
  return {
    contaId: conta.id,
    nome: conta.nome,
    segmento: conta.segmento ?? null,
    nps: conta.nps ?? null,
    criticidade: { alta: "ALTA", atencao: "ATENÇÃO", baixa: "BAIXA" }[criticidadeConta(conta.sinais)],
    reunioesAnalisadas: conta.totalReunioes,
    ultimaReuniao: ultima ? refReuniao(ultima.reuniao) : null,
    sinaisUltimaReuniao: { risco_churn: contagem("CHURN_RISK"), oportunidade: contagem("OPPORTUNITY"), objecao: contagem("OBJECTION") },
    produtosCitados: conta.produtos.map((p) => `${p.nome} (${p.contexto})`),
    diagnosticoUltimaReuniao: cortar(conta.diagnostico, 500),
    procedencia: ultima ? procedencia(ultima) : null,
    link: linkConta(conta.id),
  };
}

const entidadeConta = (conta: ContaInsight): EntidadeConta => ({ id: conta.id, nome: conta.nome });
const entidadeReuniao = (a: AnaliseConcluida): EntidadeReuniao => ({
  id: a.reuniao.id,
  codigo: codigoReuniao(a.reuniao.numero),
  contaId: chaveConta(a.reuniao),
  contaNome: nomeConta(a.reuniao),
  data: dataDaReuniao(a.reuniao),
  dataInformada: temDataInformada(a.reuniao),
});

/**
 * Como a reunião aparece para o modelo: id (para outras consultas), código estável que o usuário vê na
 * Central ("Reunião 003") e data. dataInformada = false: a reunião não trouxe data e `data` é a do
 * processamento; a resposta precisa dizer isso em vez de apresentá-la como a data da reunião.
 */
const refReuniao = (r: ReuniaoRegistro) => ({ reuniaoId: r.id, codigo: codigoReuniao(r.numero), data: dataDaReuniao(r), dataInformada: temDataInformada(r) });

/** Resolve contaId (vindo da IA ou do motor) para uma conta que o usuário pode ver. */
async function contaPermitida(ctx: ContextoConsulta, contaId: string) {
  return (await dadosPermitidos(ctx)).contas.find((conta) => conta.id === contaId) ?? null;
}

// Mesmo texto para "não existe" e "sem permissão": o usuário não descobre contas fora do escopo.
const naoEncontrada = (o: string, id: string): ResultadoFerramenta => ({
  dados: { erro: `${o} "${id}" não encontrada entre os dados que este usuário pode acessar.` },
  resumo: `${o} ${id} não encontrada ou sem acesso`,
  entidades: semEntidades(),
  erro: true,
});

/* ---------- Definição das ferramentas ---------- */

const idConta = z.string().min(1).max(80).describe("Id da conta (campo contaId devolvido por consultar_empresa).");
const limite = z.number().int().min(1).max(LIMITE_MAXIMO).optional().describe(`Máximo de itens (padrão ${LIMITE_PADRAO}, máximo ${LIMITE_MAXIMO}).`);
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");

export type Ferramenta<S extends z.ZodType = z.ZodType> = {
  nome: string;
  descricao: string;
  esquema: S;
  executar: (ctx: ContextoConsulta, args: z.infer<S>) => Promise<ResultadoFerramenta>;
};

const definir = <S extends z.ZodType>(f: Ferramenta<S>) => f;

export const consultarEmpresa = definir({
  nome: "consultar_empresa",
  descricao:
    "Localiza empresas (contas) pelo nome ou id e devolve o resumo de cada uma: criticidade, NPS, reuniões analisadas, sinais da última reunião, produtos citados e diagnóstico. Sem nome nem id, lista as contas do usuário da mais crítica para a menos. Se vários nomes baterem, devolve todos e ambigua=true: peça ao usuário para escolher.",
  esquema: z.object({
    nome: z.string().min(2).max(120).optional().describe("Nome ou parte do nome da empresa, ex.: \"Horizonte\"."),
    contaId: idConta.optional(),
    limite,
  }),
  async executar(ctx, args) {
    const { contas, analises } = await dadosPermitidos(ctx);
    const max = args.limite ?? LIMITE_PADRAO;
    if (args.contaId) {
      const conta = await contaPermitida(ctx, args.contaId);
      if (!conta) return naoEncontrada("Conta", args.contaId);
      return { dados: { empresas: [resumoConta(conta, analises)], ambigua: false }, resumo: `empresa ${conta.nome}`, entidades: { contas: [entidadeConta(conta)], reunioes: [] } };
    }
    const encontradas = args.nome ? encontrarContas(contas, args.nome) : contas;
    if (encontradas.length === 0) {
      return {
        dados: {
          empresas: [],
          mensagem: args.nome
            ? `Nenhuma empresa com nome parecido com "${args.nome}" entre as ${contas.length} contas que o usuário pode acessar.`
            : "O usuário ainda não tem contas com reunião analisada.",
          contasDisponiveis: contas.slice(0, LIMITE_PADRAO).map((c) => c.nome),
        },
        resumo: args.nome ? `nenhuma empresa para "${args.nome}"` : "nenhuma conta analisada",
        entidades: semEntidades(),
      };
    }
    const lista = encontradas.slice(0, max);
    return {
      dados: {
        empresas: lista.map((c) => resumoConta(c, analises)),
        total: encontradas.length,
        truncado: encontradas.length > lista.length,
        ambigua: Boolean(args.nome) && encontradas.length > 1,
      },
      resumo: `${encontradas.length} empresa(s)${args.nome ? ` para "${args.nome}"` : ""}`,
      // Lista geral não muda o foco da conversa; busca por nome com um resultado, sim.
      entidades: { contas: lista.length <= 3 ? lista.map(entidadeConta) : [], reunioes: [] },
    };
  },
});

export const buscarReunioes = definir({
  nome: "buscar_reunioes",
  descricao:
    "Lista reuniões analisadas, da mais recente para a mais antiga, opcionalmente de uma empresa e/ou em um período (datas inclusivas, AAAA-MM-DD, fuso de Brasília). Devolve id, empresa, data, resumo e contagem de sinais. Informa o total e se a lista foi cortada.",
  esquema: z
    .object({
      contaId: idConta.optional(),
      de: data.optional().describe("Data inicial (inclusiva), AAAA-MM-DD."),
      ate: data.optional().describe("Data final (inclusiva), AAAA-MM-DD."),
      limite,
    })
    .refine((a) => !a.de || !a.ate || a.de <= a.ate, { message: "\"de\" deve ser anterior ou igual a \"ate\"." }),
  async executar(ctx, args) {
    const { analises } = await dadosPermitidos(ctx);
    if (args.contaId && !(await contaPermitida(ctx, args.contaId))) return naoEncontrada("Conta", args.contaId);
    const filtradas = analises
      .filter((a) => !args.contaId || chaveConta(a.reuniao) === args.contaId)
      .map((a) => ({ a, data: dataDaReuniao(a.reuniao) }))
      .filter(({ data: d }) => (!args.de || d >= args.de) && (!args.ate || d <= args.ate))
      .sort((x, y) => y.data.localeCompare(x.data));
    const lista = filtradas.slice(0, args.limite ?? LIMITE_PADRAO);
    return {
      dados: {
        periodo: { de: args.de ?? null, ate: args.ate ?? null },
        reunioes: lista.map(({ a }) => ({
          ...refReuniao(a.reuniao),
          empresa: { contaId: chaveConta(a.reuniao), nome: nomeConta(a.reuniao) },
          origem: a.reuniao.origem,
          resumo: cortar(a.resultado.analise.resumoExecutivo, 400),
          sinais: a.resultado.analise.sinais.length,
          procedencia: procedencia(a),
        })),
        total: filtradas.length,
        truncado: filtradas.length > lista.length,
      },
      resumo: `${filtradas.length} reunião(ões)${args.de || args.ate ? ` entre ${args.de ?? "o início"} e ${args.ate ?? "hoje"}` : ""}`,
      entidades: { contas: [], reunioes: lista.slice(0, 5).map(({ a }) => entidadeReuniao(a)) },
    };
  },
});

export const consultarInsights = definir({
  nome: "consultar_insights",
  descricao:
    "Consulta os sinais registrados nas análises (riscos de churn, oportunidades, objeções), com a citação literal do cliente, criticidade, confiança da IA, reunião e data. Filtra por empresa, categoria e criticidade. Com empresa, inclui o diagnóstico da última reunião.",
  esquema: z.object({
    contaId: idConta.optional(),
    categoria: z.enum(["risco_churn", "oportunidade", "objecao"]).optional(),
    criticidade: z.enum(["ALTA", "MÉDIA", "BAIXA"]).optional(),
    limite,
  }),
  async executar(ctx, args) {
    const { analises, contas } = await dadosPermitidos(ctx);
    let conta: ContaInsight | null = null;
    if (args.contaId) {
      conta = await contaPermitida(ctx, args.contaId);
      if (!conta) return naoEncontrada("Conta", args.contaId);
    }
    const sinais = analises
      .filter((a) => !args.contaId || chaveConta(a.reuniao) === args.contaId)
      .flatMap((a) => a.resultado.analise.sinais.map((s) => ({ a, s })))
      .filter(({ s }) => (!args.categoria || CATEGORIA[s.tipo] === args.categoria) && (!args.criticidade || s.severidade === args.criticidade))
      .sort((x, y) => ({ ALTA: 0, MÉDIA: 1, BAIXA: 2 })[x.s.severidade] - ({ ALTA: 0, MÉDIA: 1, BAIXA: 2 })[y.s.severidade]);
    const lista = sinais.slice(0, args.limite ?? LIMITE_PADRAO);
    const contasVistas = [...new Map(lista.map(({ a }) => [chaveConta(a.reuniao), a])).values()];
    return {
      dados: {
        diagnosticoUltimaReuniao: conta ? cortar(conta.diagnostico, 500) : undefined,
        insights: lista.map(({ a, s }) => ({
          insightId: s.id,
          empresa: { contaId: chaveConta(a.reuniao), nome: nomeConta(a.reuniao) },
          reuniao: refReuniao(a.reuniao),
          categoria: CATEGORIA[s.tipo],
          subtipo: s.subtipo,
          criticidade: s.severidade,
          confianca: s.confianca,
          citacaoLiteral: cortar(s.citacaoExata, 300),
          recomendacaoRegistrada: s.recomendacaoAcao,
          procedencia: procedencia(a),
        })),
        total: sinais.length,
        truncado: sinais.length > lista.length,
        contasNoEscopo: contas.length,
      },
      resumo: `${sinais.length} insight(s)${args.categoria ? ` de ${args.categoria}` : ""}${conta ? ` de ${conta.nome}` : ""}`,
      entidades: {
        contas: conta ? [entidadeConta(conta)] : contasVistas.slice(0, 3).map((a) => ({ id: chaveConta(a.reuniao), nome: nomeConta(a.reuniao) })),
        reunioes: contasVistas.slice(0, 3).map(entidadeReuniao),
      },
    };
  },
});

export const consultarAcoesSugeridas = definir({
  nome: "consultar_acoes_sugeridas",
  descricao:
    "Recupera as ações já registradas pela análise de cada empresa (ação principal, recomendação por sinal e próximos passos), da última reunião analisada, com reunião e data. Estas são as recomendações registradas; não indicam que a ação foi executada nem que o risco foi resolvido.",
  esquema: z.object({ contaId: idConta.optional(), limite: z.number().int().min(1).max(10).optional() }),
  async executar(ctx, args) {
    const { contas, analises } = await dadosPermitidos(ctx);
    let alvo = contas.filter((c) => c.totalSinais > 0 || c.proximosPassos.length > 0);
    if (args.contaId) {
      const conta = await contaPermitida(ctx, args.contaId);
      if (!conta) return naoEncontrada("Conta", args.contaId);
      alvo = [conta];
    }
    const lista = alvo.slice(0, args.limite ?? 5);
    return {
      dados: {
        acoes: lista.map((conta) => {
          const ultima = analises.find((a) => a.reuniao.id === conta.reuniaoId);
          return {
            empresa: { contaId: conta.id, nome: conta.nome },
            reuniao: ultima ? refReuniao(ultima.reuniao) : null,
            acaoPrincipalRegistrada: conta.acao,
            recomendacoesPorSinal: (ultima?.resultado.analise.sinais ?? []).map((s) => ({
              categoria: CATEGORIA[s.tipo],
              criticidade: s.severidade,
              subtipo: s.subtipo,
              recomendacao: s.recomendacaoAcao,
            })),
            proximosPassosRegistrados: conta.proximosPassos,
            enviadasAoCrm: `${conta.sincronizadosCrm} de ${conta.insightIds.length} insight(s)`,
            procedencia: ultima ? procedencia(ultima) : null,
            link: linkConta(conta.id),
          };
        }),
        total: alvo.length,
        truncado: alvo.length > lista.length,
        observacao: "Ações registradas na análise. O Dialys não registra se foram executadas.",
      },
      resumo: `ações de ${lista.length} empresa(s)`,
      entidades: {
        contas: lista.slice(0, 3).map(entidadeConta),
        reunioes: lista
          .slice(0, 3)
          .map((c) => analises.find((a) => a.reuniao.id === c.reuniaoId))
          .filter((a): a is AnaliseConcluida => Boolean(a))
          .map(entidadeReuniao),
      },
    };
  },
});

export const obterDetalhesReuniao = definir({
  nome: "obter_detalhes_reuniao",
  descricao:
    "Detalha uma reunião analisada: empresa, data, resumo, próximos passos, produtos citados, sinais e trechos literais da transcrição em volta de cada citação (não a transcrição inteira). Informe o reuniaoId devolvido por buscar_reunioes ou consultar_insights, ou o número do código que o usuário vê na Central (\"Reunião 003\" → numero 3).",
  esquema: z
    .object({
      reuniaoId: z.string().regex(/^reu_[0-9a-f]{32}$/, "use o id da reunião (formato reu_<32 hex>)").optional(),
      numero: z.number().int().min(1).max(999_999).optional().describe("Número do código da reunião: \"Reunião 003\" → 3."),
      incluirTrechos: z.boolean().optional().describe("Incluir trechos literais da transcrição (padrão: sim)."),
    })
    .refine((a) => Boolean(a.reuniaoId) !== (a.numero !== undefined), { message: "informe reuniaoId ou numero (um dos dois)." }),
  async executar(ctx, args) {
    const { analises } = await dadosPermitidos(ctx);
    // Só reuniões ativas e no escopo do usuário: transcrição removida ou conta sem acesso = "não encontrada".
    const analise = analises.find((a) => (args.reuniaoId ? a.reuniao.id === args.reuniaoId : a.reuniao.numero === args.numero));
    if (!analise && args.numero !== undefined) {
      const codigo = codigoReuniao(args.numero);
      // Mesmo texto para inexistente, sem acesso ou com a transcrição removida: não revela qual é o caso.
      return {
        dados: { erro: `A ${codigo} não está entre as reuniões com análise ativa que este usuário pode acessar.` },
        resumo: `${codigo} não encontrada ou sem análise ativa`,
        entidades: { contas: [], reunioes: [] },
        erro: true,
      };
    }
    if (!analise) return naoEncontrada("Reunião", args.reuniaoId ?? "");
    const { reuniao, resultado } = analise;
    const trechos =
      args.incluirTrechos === false || !reuniao.transcricao
        ? []
        : montarEvidencias(reuniao.transcricao, resultado.analise.sinais).slice(0, 6).map((e) => ({ falante: e.falante, trecho: cortar(e.texto, 400) }));
    return {
      dados: {
        reuniao: {
          ...refReuniao(reuniao),
          empresa: { contaId: chaveConta(reuniao), nome: nomeConta(reuniao) },
          duracao: reuniao.contexto?.duracao ?? null,
          segmento: reuniao.contexto?.segmento ?? null,
          origem: reuniao.origem,
          arquivo: reuniao.nomeArquivo ?? null,
        },
        resumo: resultado.analise.resumoExecutivo,
        proximosPassosRegistrados: resultado.analise.proximosPassosSugeridos,
        produtosCitados: resultado.analise.mencoesProdutos.map((m) => `${m.produto} (${m.status})`),
        sinais: resultado.analise.sinais.map((s) => ({
          categoria: CATEGORIA[s.tipo],
          subtipo: s.subtipo,
          criticidade: s.severidade,
          citacaoLiteral: cortar(s.citacaoExata, 300),
          recomendacaoRegistrada: s.recomendacaoAcao,
        })),
        trechosDaTranscricao: trechos,
        procedencia: procedencia(analise),
        link: linkReuniao(reuniao.id),
      },
      resumo: `${codigoReuniao(reuniao.numero)} ${reuniao.id} (${nomeConta(reuniao)}, ${dataBr(dataDaReuniao(reuniao))})`,
      entidades: { contas: [{ id: chaveConta(reuniao), nome: nomeConta(reuniao) }], reunioes: [entidadeReuniao(analise)] },
    };
  },
});

/** Mais dias por consulta à agenda (um mês cobre "este mês" e "próximas semanas"). */
const MAXIMO_DIAS_AGENDA = 31;
const MAXIMO_COMPROMISSOS = 30;

export const consultarAgenda = definir({
  nome: "consultar_agenda",
  descricao:
    "Lista os COMPROMISSOS da agenda do usuário: eventos com horário que ele mesmo marcou (título, cliente, data, início, término, status, local e observações), entre duas datas inclusivas (AAAA-MM-DD, no fuso configurado; padrão: hoje; até 31 dias). Compromissos NÃO são ações sugeridas: as ações sugeridas vêm de consultar_acoes_sugeridas e não têm horário. Informa se o cliente de cada compromisso tem reuniões analisadas.",
  esquema: z
    .object({
      de: data.optional().describe("Data inicial (inclusiva), AAAA-MM-DD."),
      ate: data.optional().describe("Data final (inclusiva), AAAA-MM-DD."),
    })
    .refine((a) => !a.de || !a.ate || a.de <= a.ate, { message: "\"de\" deve ser anterior ou igual a \"ate\"." }),
  async executar(ctx, args) {
    const fuso = fusoHorario();
    const de = args.de ?? (args.ate && args.ate < dataNoFuso(ctx.agora, fuso) ? args.ate : dataNoFuso(ctx.agora, fuso));
    const ate = args.ate ?? de;
    if (somarDias(de, MAXIMO_DIAS_AGENDA) <= ate) {
      return { dados: { erro: `Consulte no máximo ${MAXIMO_DIAS_AGENDA} dias da agenda por vez.` }, resumo: "período da agenda longo demais", entidades: semEntidades(), erro: true };
    }
    // O serviço da agenda já filtra pelo usuário autenticado (dono dos compromissos).
    const compromissos = await listarCompromissos(ctx.usuario, { de, ate });
    const { contas } = await dadosPermitidos(ctx);
    const analisadas = new Set(contas.map((c) => c.id));
    const lista = compromissos.slice(0, MAXIMO_COMPROMISSOS);
    return {
      dados: {
        periodo: { de, ate },
        fuso,
        compromissos: lista.map((c) => ({
          compromissoId: c.id,
          titulo: c.titulo,
          cliente: c.cliente ? { contaId: c.cliente.id, nome: c.cliente.nome, temReunioesAnalisadas: analisadas.has(c.cliente.id) } : null,
          data: dataNoFuso(new Date(c.inicio), fuso),
          inicio: horaNoFuso(new Date(c.inicio), fuso),
          fim: horaNoFuso(new Date(c.fim), fuso),
          status: c.status,
          local: c.local,
          observacoesDoUsuario: c.observacoes ? cortar(c.observacoes, 300) : null,
        })),
        total: compromissos.length,
        truncado: compromissos.length > lista.length,
        observacao: "Compromissos marcados pelo usuário. Compromissos não são ações sugeridas.",
      },
      resumo: `${compromissos.length} compromisso(s) entre ${de} e ${ate}`,
      // Agenda não é evidência sobre clientes: não vira fonte nem muda o foco da conversa.
      entidades: semEntidades(),
    };
  },
});

export const FERRAMENTAS = [consultarEmpresa, buscarReunioes, consultarInsights, consultarAcoesSugeridas, obterDetalhesReuniao, consultarAgenda] as const;

/**
 * Executa uma ferramenta pelo nome com argumentos não confiáveis (vindos da IA): valida pelo schema
 * e nunca lança; erro de validação ou de execução vira um resultado com erro=true.
 */
export async function executarFerramenta(ctx: ContextoConsulta, nome: string, argumentos: unknown): Promise<ResultadoFerramenta> {
  const ferramenta = FERRAMENTAS.find((f) => f.nome === nome);
  if (!ferramenta) return { dados: { erro: `Consulta "${nome}" não existe.` }, resumo: `consulta inexistente ${nome}`, entidades: semEntidades(), erro: true };
  const lido = (ferramenta.esquema as z.ZodType).safeParse(argumentos ?? {});
  if (!lido.success) {
    const problema = lido.error.issues[0];
    return {
      dados: { erro: `Argumentos inválidos para ${nome}: ${problema?.path.join(".") || "entrada"} ${problema?.message}.` },
      resumo: `argumentos inválidos em ${nome}`,
      entidades: semEntidades(),
      erro: true,
    };
  }
  try {
    return await (ferramenta.executar as Ferramenta["executar"])(ctx, lido.data);
  } catch (falha) {
    console.error(`[dialys/assistente] consulta ${nome} falhou`, falha);
    return { dados: { erro: "A consulta falhou no servidor. Informe ao usuário que os dados não puderam ser lidos agora." }, resumo: `falha em ${nome}`, entidades: semEntidades(), erro: true };
  }
}

/**
 * Resolve ids de foco (guardados na conversa ou enviados como filtro) para entidades que o usuário
 * ainda pode ver. Id sem permissão ou que deixou de existir simplesmente some do foco.
 */
export async function resolverFoco(ctx: ContextoConsulta, contaIds: string[], reuniaoIds: string[]) {
  const { contas, analises } = await dadosPermitidos(ctx);
  return {
    contas: contaIds.map((id) => contas.find((c) => c.id === id)).filter((c): c is ContaInsight => Boolean(c)).map(entidadeConta),
    reunioes: reuniaoIds.map((id) => analises.find((a) => a.reuniao.id === id)).filter((a): a is AnaliseConcluida => Boolean(a)).map(entidadeReuniao),
  };
}
