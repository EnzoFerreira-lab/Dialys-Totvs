// Motor do assistente sem IA (reserva quando não há chave do Claude, ou DIALYS_MODO_DEMO=true): entende perguntas comuns por regras
// e responde SÓ com o que as consultas controladas devolvem, nas mesmas regras do motor Claude (fontes,
// ambiguidade, limitações, procedência). A interface marca essas respostas como "sem IA".
import { normalizarBusca } from "@/lib/formatar";
import { podeAcessarConta } from "../auth/usuarios";
import { listarContasInsight } from "../insights/contas";
import { dataBr, type ResultadoFerramenta } from "./ferramentas";
import { TEXTO_NAO_ENTENDIDA, type CompromissoEmFoco, type EntradaMotor, type MotorAssistente } from "./motor";

type Periodo = { de: string; ate: string; descricao: string };

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes, dia));

/** "hoje", "esta semana", "este mês", "mês passado", "últimos 15 dias", "em março", "01/09 a 15/09". */
export function interpretarPeriodo(pergunta: string, agora: Date): Periodo | null {
  const q = normalizarBusca(pergunta);
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora).split("-").map(Number);
  const hoje = utc(ano, mes - 1, dia);
  const dias = (n: number) => new Date(hoje.getTime() + n * 86_400_000);
  const segunda = dias(-((hoje.getUTCDay() + 6) % 7));

  const intervalo = q.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:a|ate|e|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (intervalo) {
    const de = utc(Number(intervalo[3] ?? ano), Number(intervalo[2]) - 1, Number(intervalo[1]));
    const ate = utc(Number(intervalo[6] ?? intervalo[3] ?? ano), Number(intervalo[5]) - 1, Number(intervalo[4]));
    return { de: iso(de), ate: iso(ate), descricao: `de ${dataBr(iso(de))} a ${dataBr(iso(ate))}` };
  }
  if (/\bhoje\b/.test(q)) return { de: iso(hoje), ate: iso(hoje), descricao: "hoje" };
  if (/\bontem\b/.test(q)) return { de: iso(dias(-1)), ate: iso(dias(-1)), descricao: "ontem" };
  if (/\bamanha\b/.test(q)) return { de: iso(dias(1)), ate: iso(dias(1)), descricao: "amanhã" };
  if (/proxima semana|semana que vem/.test(q)) {
    const proxima = new Date(segunda.getTime() + 7 * 86_400_000);
    return { de: iso(proxima), ate: iso(new Date(proxima.getTime() + 6 * 86_400_000)), descricao: "na próxima semana" };
  }
  const ultimos = q.match(/ultimos?\s+(\d{1,3})\s+dias/);
  if (ultimos) return { de: iso(dias(-(Number(ultimos[1]) - 1))), ate: iso(hoje), descricao: `nos últimos ${ultimos[1]} dias` };
  if (/semana passada/.test(q)) {
    const inicio = new Date(segunda.getTime() - 7 * 86_400_000);
    return { de: iso(inicio), ate: iso(new Date(segunda.getTime() - 86_400_000)), descricao: "na semana passada" };
  }
  if (/(esta|nesta|desta|da) semana/.test(q)) return { de: iso(segunda), ate: iso(hoje), descricao: "nesta semana" };
  if (/mes passado/.test(q)) {
    return { de: iso(utc(ano, mes - 2, 1)), ate: iso(utc(ano, mes - 1, 0)), descricao: "no mês passado" };
  }
  if (/(este|neste|deste|do|no) mes|mes atual/.test(q)) return { de: iso(utc(ano, mes - 1, 1)), ate: iso(utc(ano, mes, 0)), descricao: "neste mês" };
  const nomeMes = q.match(new RegExp(`\\b(${MESES.join("|")})\\b(?:\\s+de\\s+(\\d{4}))?`));
  if (nomeMes) {
    const indice = MESES.indexOf(nomeMes[1]);
    const anoMes = Number(nomeMes[2] ?? ano);
    return { de: iso(utc(anoMes, indice, 1)), ate: iso(utc(anoMes, indice + 1, 0)), descricao: `em ${nomeMes[1].replace("marco", "março")} de ${anoMes}` };
  }
  return null;
}

type Dados = Record<string, unknown>;
const lista = (itens: string[]) => itens.map((i) => `- ${i}`).join("\n");
/** Reunião como o usuário a vê na Central: código e data (ou o aviso de data não informada). */
const reuniaoTexto = (r: Dados | null | undefined) =>
  r ? `${r.codigo ? `${String(r.codigo)}, ` : ""}${r.dataInformada === false ? "data não informada" : dataBr(String(r.data))}` : "";

const parcial = (d: Dados, mostrados: number) => (d.truncado ? `\n\nMostrando ${mostrados} de ${d.total}.` : "");

/** Nome citado depois de "empresa", "cliente", "sobre a"...: "a empresa Acme Industrial". */
function nomeExplicito(pergunta: string) {
  const m = pergunta.match(/(?:empresa|cliente|conta|sobre(?: a| o)?|da|do)\s+((?:[A-ZÀ-Ú][\wÀ-ú&.-]*\s?){1,4})/);
  return m?.[1].trim() || null;
}

const PALAVRAS_DE_PERGUNTA = new Set(["como", "qual", "quais", "quem", "mostre", "explique", "fale", "me", "o", "a", "os", "as", "e", "liste", "diga", "resumo"]);

/** Sequência de palavras com inicial maiúscula fora do início da frase: "Como está o Grupo Horizonte?". */
function nomeCapitalizado(pergunta: string) {
  const palavras = pergunta.replace(/[?!.,;:]/g, " ").split(/\s+/).filter(Boolean);
  const sequencias: string[][] = [];
  let atual: string[] = [];
  palavras.forEach((palavra, i) => {
    if (i > 0 && /^[A-ZÀ-Ú]/.test(palavra)) {
      atual.push(palavra);
    } else if (atual.length) {
      sequencias.push(atual);
      atual = [];
    }
  });
  if (atual.length) sequencias.push(atual);
  return sequencias.find((s) => !(s.length === 1 && PALAVRAS_DE_PERGUNTA.has(s[0].toLowerCase())))?.join(" ") ?? null;
}

export function criarMotorDemonstracao(): MotorAssistente {
  return {
    nome: "demonstracao",
    async responder({ pergunta, foco, consultar, ctx, compromisso, empresaSelecionada }: EntradaMotor) {
      const q = normalizarBusca(pergunta);
      const agora = ctx.agora;

      // 0. Agenda e preparação de compromisso (antes das empresas: "compromisso" não é nome de empresa).
      const sobreCompromisso = /prepar|pauta|esse compromisso|este compromisso|o que (levar|abordar|falar)/.test(q);
      if (compromisso && sobreCompromisso) return { texto: await textoPreparacao(compromisso, consultar) };
      if (/\bagenda\b|compromisso|o que tenho (hoje|amanha|esta semana|na semana)/.test(q) && !/acoes? sugerid/.test(q)) {
        const p = interpretarPeriodo(pergunta, agora);
        const semanaInteira = /(esta|nesta|desta|da) semana/.test(q) && !/passada/.test(q);
        const periodo = semanaInteira && p ? { ...p, ate: iso(new Date(Date.parse(`${p.de}T12:00:00Z`) + 6 * 86_400_000)) } : p;
        return { texto: textoAgenda(await consultar("consultar_agenda", periodo ? { de: periodo.de, ate: periodo.ate } : {}), periodo) };
      }

      // 0b. Reunião citada pelo código da Central ("Reunião 003").
      const codigo = q.match(/\breuniao\s*#?\s*0*(\d{1,6})\b(?![/.-]\d)/);
      if (codigo) return { texto: textoDetalhes(await consultar("obter_detalhes_reuniao", { numero: Number(codigo[1]) })) };

      // 1. Empresa citada: pelo nome (no escopo do usuário) ou pelo foco da conversa.
      const listaContas = await nomesDasContasDoUsuario(ctx);
      const citadas = mencoes(pergunta, listaContas);
      if (citadas.ambiguas.length > 1) {
        const r = await consultar("consultar_empresa", { nome: citadas.termo });
        const empresas = ((r.dados.empresas as Dados[]) ?? []).map((e) => `**${e.nome}**${e.segmento ? ` (${e.segmento})` : ""}`);
        return { texto: `Encontrei mais de uma empresa para "${citadas.termo}":\n${lista(empresas)}\n\nDe qual delas você está falando?` };
      }
      const referenciaFoco = /\b(essa|esta|dessa|desta|nessa|nesta)\s+(empresa|conta|cliente)\b|\bdela\b|\bdeles\b/.test(q);
      // Modo empresa em foco: sem outra empresa citada, a pergunta é sobre a empresa fixada na tela.
      const carteira = /carteira|clientes|contas|todas as empresas|quais empresas/.test(q);
      let contaId = citadas.conta?.id ?? (empresaSelecionada && !carteira ? empresaSelecionada.id : null);
      /** Empresa nomeada na própria pergunta (não só herdada do foco): "Como está a Acme?" pede o resumo dela. */
      let empresaCitada = Boolean(citadas.conta);

      // Perguntas próprias de uma empresa: avaliação geral, explicação de insight, produtos e lista de insights.
      const alvoEmpresa = contaId ?? (referenciaFoco ? (foco.contas[0]?.id ?? null) : null);
      if (alvoEmpresa && /avali|visao geral|panorama|saude|evolu|vale (a pena )?investir/.test(q)) {
        return { texto: textoAvaliacao(await consultar("avaliar_empresa", { contaId: alvoEmpresa })) };
      }
      if (alvoEmpresa && /expli[cq]|entender|por que|porque/.test(q) && /insight|sinal|alerta|risco|oportunidad|objec|mais critico/.test(q)) {
        return { texto: textoExplicacao(await consultar("explicar_insight", { contaId: alvoEmpresa })) };
      }
      if (alvoEmpresa && /produto|ecossistema|upsell|cross|concorren|portfolio/.test(q)) {
        return { texto: textoProdutos(await consultar("mapear_produtos_empresa", { contaId: alvoEmpresa })) };
      }
      if (alvoEmpresa && /\b(liste|listar|todos os|quais (sao )?os)\b.*\b(insights?|sinais|alertas)\b/.test(q)) {
        return { texto: textoInsightsEmpresa(await consultar("consultar_insights", { contaId: alvoEmpresa, limite: 20 })) };
      }

      const intencao = {
        novaSugestao: /(nova|outra)s?\s+(sugest|recomend|ideia)|\bsugira\b|me de uma sugest/.test(q),
        reunioes: /reuni/.test(q),
        evidencia: /evidenc|trecho|citac|o que (o cliente|eles|ele|ela) (disse|falou)|detalh/.test(q),
        acao: /\bac(ao|oes)\b|prioriz|o que (devo|eu devo|fazer)|proximos? passos?|recomend|explique/.test(q),
        atencao: /atencao|risco|churn|critic|preocup|perder/.test(q),
        oportunidade: /oportunidad|upsell|cross|expans/.test(q),
        objecao: /objec/.test(q),
      };

      // Empresa citada que não está no escopo: "a empresa X" sempre; nome próprio solto só se a pergunta
      // não tem outra intenção (evita tratar "clientes que usam TOTVS Protheus" como nome de empresa).
      if (!contaId && !referenciaFoco) {
        const semIntencao = !Object.values(intencao).some(Boolean);
        const citado = nomeExplicito(pergunta) ?? (semIntencao ? nomeCapitalizado(pergunta) : null);
        if (citado) {
          const r = await consultar("consultar_empresa", { nome: citado });
          const empresas = (r.dados.empresas as Dados[]) ?? [];
          if (empresas.length === 0) {
            const disponiveis = (r.dados.contasDisponiveis as string[]) ?? [];
            return {
              texto: `Não encontrei nenhuma empresa chamada "${citado}" entre as contas que você pode acessar no Dialys.${
                disponiveis.length ? `\n\nAlgumas contas disponíveis:\n${lista(disponiveis.slice(0, 6).map((n) => `**${n}**`))}` : ""
              }`,
            };
          }
          if (empresas.length === 1) {
            contaId = String(empresas[0].contaId);
            empresaCitada = true;
          }
        }
      }

      const precisaDeConta = intencao.evidencia || intencao.acao || intencao.novaSugestao || referenciaFoco;
      if (!contaId && precisaDeConta && foco.contas[0]) contaId = foco.contas[0].id;

      // 2. Respostas por intenção, cada uma a partir de uma consulta.
      if (intencao.reunioes) {
        const p = interpretarPeriodo(pergunta, agora);
        const r = await consultar("buscar_reunioes", { ...(contaId ? { contaId } : {}), ...(p ? { de: p.de, ate: p.ate } : {}) });
        return { texto: textoReunioes(r, p, contaId ? nomeDe(listaContas, contaId) : null) };
      }
      if (precisaDeConta && !contaId) {
        return { texto: "De qual empresa você está falando? Diga o nome (por exemplo, como aparece na Central de Insights) e eu consulto." };
      }
      if (intencao.evidencia && contaId) {
        const empresa = await consultar("consultar_empresa", { contaId });
        const reuniaoId = ((empresa.dados.empresas as Dados[])?.[0]?.ultimaReuniao as Dados | null)?.reuniaoId;
        if (!reuniaoId) return { texto: "Não há reunião analisada para essa empresa." };
        return { texto: textoDetalhes(await consultar("obter_detalhes_reuniao", { reuniaoId })) };
      }
      if ((intencao.acao || intencao.novaSugestao) && contaId) {
        const r = await consultar("consultar_acoes_sugeridas", { contaId });
        const base = textoAcoes(r);
        return {
          texto: intencao.novaSugestao
            ? `${base}\n\n**Sugestão adicional do Dialys:** sem a IA ligada eu não crio sugestões novas; mostro só as ações registradas na análise. Com a IA ligada, eu proporia uma sugestão separada destas.`
            : base,
        };
      }
      if (intencao.acao) return { texto: textoAcoes(await consultar("consultar_acoes_sugeridas", {})) };
      if (intencao.atencao && !contaId) return { texto: textoAtencao(await consultar("consultar_empresa", { limite: 20 })) };
      if (intencao.oportunidade || intencao.objecao || intencao.atencao) {
        const categoria = intencao.oportunidade ? "oportunidade" : intencao.objecao ? "objecao" : "risco_churn";
        return { texto: textoInsights(await consultar("consultar_insights", { categoria, ...(contaId ? { contaId } : {}) }), categoria) };
      }
      // Só o foco (empresa fixada ou da conversa), sem nenhuma intenção reconhecida, não é pedido de resumo:
      // é uma mensagem que o Dialys não entendeu, e ele não repete o que já respondeu.
      if (contaId && (empresaCitada || referenciaFoco)) return { texto: textoEmpresa(await consultar("consultar_empresa", { contaId })) };

      return { texto: TEXTO_NAO_ENTENDIDA, naoEntendida: true };
    },
  };
}

/* ---------- Reconhecimento de empresa ---------- */

type ContaNome = { id: string; nome: string };

/** Só nomes e ids das contas do escopo do usuário, para reconhecer citações; os dados vêm das consultas. */
async function nomesDasContasDoUsuario(ctx: EntradaMotor["ctx"]): Promise<ContaNome[]> {
  return (await listarContasInsight(ctx.usuario.id)).filter((c) => podeAcessarConta(ctx.usuario, c.id)).map((c) => ({ id: c.id, nome: c.nome }));
}

function mencoes(pergunta: string, contas: ContaNome[]): { conta: ContaNome | null; ambiguas: ContaNome[]; termo: string } {
  const q = ` ${normalizarBusca(pergunta).replace(/[^a-z0-9\s]/g, " ")} `;
  const inteiras = contas.filter((c) => q.includes(` ${normalizarBusca(c.nome).replace(/[^a-z0-9\s]/g, " ").trim()} `));
  if (inteiras.length === 1) return { conta: inteiras[0], ambiguas: [], termo: inteiras[0].nome };
  // Palavras distintivas (>= 4 letras) do nome citadas na pergunta: "Horizonte", "TB5392".
  const porPalavra = new Map<string, ContaNome[]>();
  for (const conta of contas) {
    for (const palavra of normalizarBusca(conta.nome).replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
      if (palavra.length < 4 || ["grupo", "cliente", "empresa", "ltda", "reuniao"].includes(palavra)) continue;
      if (q.includes(` ${palavra} `)) porPalavra.set(palavra, [...(porPalavra.get(palavra) ?? []), conta]);
    }
  }
  const candidatas = [...new Map([...porPalavra.values()].flat().map((c) => [c.id, c])).values()];
  if (candidatas.length === 1) return { conta: candidatas[0], ambiguas: [], termo: candidatas[0].nome };
  if (candidatas.length > 1) {
    const termo = [...porPalavra.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
    return { conta: null, ambiguas: candidatas, termo };
  }
  return { conta: null, ambiguas: [], termo: "" };
}

const nomeDe = (contas: ContaNome[], id: string) => contas.find((c) => c.id === id)?.nome ?? id;

/* ---------- Textos ---------- */

function erroOu(r: ResultadoFerramenta): string | null {
  return r.erro ? String(r.dados.erro ?? "Não consegui consultar os dados agora.") : null;
}

function textoReunioes(r: ResultadoFerramenta, p: Periodo | null, empresa: string | null) {
  const erro = erroOu(r);
  if (erro) return erro;
  const reunioes = (r.dados.reunioes as Dados[]) ?? [];
  const alvo = `${empresa ? ` de **${empresa}**` : ""}${p ? ` ${p.descricao}` : ""}`;
  if (reunioes.length === 0) return `Não há reuniões analisadas${alvo}.`;
  const itens = reunioes.map((x) => {
    const e = x.empresa as Dados;
    return `**${e.nome}**, ${reuniaoTexto(x)}: ${String(x.resumo)} (${x.sinais} sinal(is))`;
  });
  return `Encontrei ${r.dados.total} reunião(ões) analisada(s)${alvo}:\n${lista(itens)}${parcial(r.dados, reunioes.length)}`;
}

function textoEmpresa(r: ResultadoFerramenta) {
  const erro = erroOu(r);
  if (erro) return erro;
  const e = ((r.dados.empresas as Dados[]) ?? [])[0];
  if (!e) return "Não encontrei essa empresa.";
  const ultima = e.ultimaReuniao as Dados | null;
  const s = e.sinaisUltimaReuniao as Record<string, number>;
  return `**${e.nome}**${e.segmento ? ` (${e.segmento})` : ""}: criticidade **${e.criticidade}**, ${e.reunioesAnalisadas} reunião(ões) analisada(s)${
    ultima ? `, a última (${reuniaoTexto(ultima)})` : ""
  }${e.nps !== null ? `, NPS ${e.nps}` : ""}.\n\nNa última reunião: ${s.risco_churn} risco(s) de churn, ${s.oportunidade} oportunidade(s) e ${s.objecao} objeção(ões).\n\n**Diagnóstico registrado:** ${e.diagnosticoUltimaReuniao}`;
}

function textoAtencao(r: ResultadoFerramenta) {
  const erro = erroOu(r);
  if (erro) return erro;
  const empresas = ((r.dados.empresas as Dados[]) ?? []).filter((e) => e.criticidade === "ALTA" || e.criticidade === "ATENÇÃO");
  if (empresas.length === 0) return "Nenhuma conta está com criticidade alta ou de atenção nas reuniões analisadas.";
  const itens = empresas.map((e) => {
    const ultima = e.ultimaReuniao as Dados | null;
    return `**${e.nome}**: criticidade ${e.criticidade}${ultima ? ` (${reuniaoTexto(ultima)})` : ""}. ${String(e.diagnosticoUltimaReuniao).split(". ")[0]}.`;
  });
  return `${empresas.length} conta(s) precisam de atenção, da mais crítica para a menos:\n${lista(itens)}`;
}

function textoInsights(r: ResultadoFerramenta, categoria: string) {
  const erro = erroOu(r);
  if (erro) return erro;
  const insights = (r.dados.insights as Dados[]) ?? [];
  const nome = { risco_churn: "riscos de churn", oportunidade: "oportunidades", objecao: "objeções" }[categoria];
  const registrados = categoria === "risco_churn" ? "registrados" : "registradas";
  if (insights.length === 0) return `Não há ${nome} ${registrados} nas reuniões analisadas.`;
  const itens = insights.map((i) => {
    const e = i.empresa as Dados;
    const reu = i.reuniao as Dados;
    return `**${e.nome}** (${reuniaoTexto(reu)}), ${i.subtipo}, criticidade ${i.criticidade}: “${i.citacaoLiteral}”`;
  });
  return `${r.dados.total} ${nome} ${registrados}:\n${lista(itens)}${parcial(r.dados, insights.length)}`;
}

function textoAcoes(r: ResultadoFerramenta) {
  const erro = erroOu(r);
  if (erro) return erro;
  const acoes = (r.dados.acoes as Dados[]) ?? [];
  if (acoes.length === 0) return "Não há ações registradas nas análises das suas contas.";
  const blocos = acoes.map((a) => {
    const e = a.empresa as Dados;
    const reu = a.reuniao as Dados | null;
    const passos = (a.proximosPassosRegistrados as string[]) ?? [];
    return `**${e.nome}**${reu ? ` (${reuniaoTexto(reu)})` : ""}\nAção registrada: ${a.acaoPrincipalRegistrada}${
      passos.length ? `\nPróximos passos registrados:\n${lista(passos)}` : ""
    }\nEnviadas ao CRM: ${a.enviadasAoCrm}.`;
  });
  return `${blocos.join("\n\n")}${parcial(r.dados, acoes.length)}\n\nEssas são as recomendações registradas na análise; o Dialys não registra se já foram executadas.`;
}

function textoDetalhes(r: ResultadoFerramenta) {
  const erro = erroOu(r);
  if (erro) return erro;
  const reu = r.dados.reuniao as Dados;
  const e = reu.empresa as Dados;
  const trechos = ((r.dados.trechosDaTranscricao as Dados[]) ?? []).map((t) => `${t.falante}: “${t.trecho}”`);
  return `**${e.nome}**, ${reuniaoTexto(reu)}.\n\n${r.dados.resumo}${
    trechos.length ? `\n\nO que o cliente disse (trechos literais):\n${lista(trechos)}` : "\n\nEssa reunião não tem trechos destacados."
  }`;
}

/* ---------- Empresa em foco ---------- */

const NOME_CATEGORIA: Record<string, string> = { risco_churn: "Risco de churn", oportunidade: "Oportunidade", objecao: "Objeção" };
const blocos = (partes: Array<string | null>) => partes.filter(Boolean).join("\n\n");

function textoAvaliacao(r: ResultadoFerramenta) {
  const erro = erroOu(r);
  if (erro) return erro;
  const d = r.dados;
  const e = d.empresa as Dados;
  const saude = d.saude as Dados | null;
  const alertas = d.alertas as Record<string, { total: number; alta: number }>;
  const evolucao = ((d.evolucao as Dados[]) ?? []).map(
    (x) => `${x.codigo} (${x.data === "data não informada" ? x.data : dataBr(String(x.data))}): saúde ${x.saude ?? "—"}`,
  );
  const temas = ((d.temasRecorrentes as Dados[]) ?? []).map((t) => `${t.subtipo} (${(t.reunioes as string[]).join(", ")})`);
  const produtos = ((d.produtos as Dados[]) ?? []).map((p) => `${p.produto}: ${String(p.status).replace("_", " ")}`);
  const criticos = ((d.alertasMaisCriticos as Dados[]) ?? [])
    .slice(0, 3)
    .map((a) => `${a.subtipo} (${a.criticidade}, ${a.reuniao}): “${a.citacaoLiteral}”`);
  return blocos([
    `**${e.nome}**: saúde ${saude ? `${saude.nota}/10 (${saude.faixa})` : "não calculada"}, criticidade ${d.criticidade ?? "—"}, tendência ${d.tendencia}${
      d.nps !== null ? `, NPS ${d.nps}` : ""
    }. ${d.reunioesAnalisadas} reunião(ões) analisada(s).`,
    `Alertas: ${alertas.risco_churn.total} risco(s) de churn (${alertas.risco_churn.alta} de criticidade alta), ${alertas.oportunidade.total} oportunidade(s) e ${alertas.objecao.total} objeção(ões).`,
    criticos.length ? `Mais críticos:\n${lista(criticos)}` : null,
    evolucao.length > 1 ? `Evolução:\n${lista(evolucao)}` : null,
    temas.length ? `Temas que se repetem:\n${lista(temas)}` : null,
    produtos.length ? `Produtos:\n${lista(produtos)}` : null,
    d.acaoPrincipalRegistrada ? `**Ação registrada:** ${d.acaoPrincipalRegistrada}` : null,
  ]);
}

function textoExplicacao(r: ResultadoFerramenta) {
  const erro = erroOu(r);
  if (erro) return erro;
  const i = r.dados.insight as Dados | null;
  if (!i) return String(r.dados.mensagem ?? "Não há insights para explicar.");
  const e = r.dados.empresa as Dados;
  const trecho = i.trechoDaConversa as Dados | null;
  const repeticoes = (r.dados.mesmoTemaEmOutrasReunioes as Dados[]) ?? [];
  return blocos([
    `**${e.nome}**, ${reuniaoTexto(r.dados.reuniao as Dados)}: ${NOME_CATEGORIA[String(i.categoria)]} · ${i.subtipo}, criticidade ${i.criticidade} (confiança ${Math.round(
      Number(i.confianca) * 100,
    )}%).`,
    `O cliente disse: “${i.citacaoLiteral}”`,
    trecho ? `Contexto da conversa (${trecho.falante}): “${trecho.trecho}”` : null,
    repeticoes.length
      ? `O mesmo tema aparece em ${repeticoes.length} outra(s) reunião(ões): ${repeticoes.map((x) => reuniaoTexto(x.reuniao as Dados)).join("; ")}.`
      : "O tema não aparece em outras reuniões desta empresa.",
    `**Recomendação registrada:** ${i.recomendacaoRegistrada}${i.enviadoAoCrm ? " (já enviada ao CRM)" : ""}`,
  ]);
}

function textoProdutos(r: ResultadoFerramenta) {
  const erro = erroOu(r);
  if (erro) return erro;
  const d = r.dados;
  const nomes = (itens: unknown) => ((itens as Dados[]) ?? []).map((p) => String(p.produto));
  const grupos: Array<[string, string[]]> = [
    ["Em uso", nomes(d.emUso)],
    ["Interesse", nomes(d.interesse)],
    ["Insatisfação", nomes(d.insatisfacao)],
    ["Concorrentes citados", nomes(d.concorrentesCitados)],
  ];
  const oportunidades = ((d.oportunidadesRegistradas as Dados[]) ?? []).map((o) => `${o.subtipo} (${o.reuniao}): “${o.citacaoLiteral}”`);
  return blocos([
    `**${(d.empresa as Dados).nome}**: produtos citados nas reuniões analisadas.`,
    lista(grupos.map(([rotulo, itens]) => `${rotulo}: ${itens.length ? itens.join(", ") : "nenhum"}`)),
    oportunidades.length ? `Oportunidades registradas:\n${lista(oportunidades)}` : null,
    `Portfólio TOTVS que não apareceu nas conversas: ${(d.portfolioTotvsNaoCitado as string[]).join(", ")}. Isso não indica necessidade do cliente.`,
  ]);
}

function textoInsightsEmpresa(r: ResultadoFerramenta) {
  const erro = erroOu(r);
  if (erro) return erro;
  const insights = (r.dados.insights as Dados[]) ?? [];
  if (insights.length === 0) return "Não há insights registrados para esta empresa nas reuniões analisadas.";
  const itens = insights.map(
    (i, n) => `${n + 1}. ${NOME_CATEGORIA[String(i.categoria)]} · ${i.subtipo}, ${i.criticidade} (${reuniaoTexto(i.reuniao as Dados)}): “${i.citacaoLiteral}”`,
  );
  return `${r.dados.total} insight(s) de **${(insights[0].empresa as Dados).nome}**, do mais crítico para o menos:\n${itens.join("\n")}${parcial(r.dados, insights.length)}`;
}

/* ---------- Agenda ---------- */

const paragrafo = (texto: string | null | undefined) => (texto ? `\n\n${texto}` : "");

function textoAgenda(r: ResultadoFerramenta, p: Periodo | null) {
  const erro = erroOu(r);
  if (erro) return erro;
  const compromissos = (r.dados.compromissos as Dados[]) ?? [];
  const quando = p?.descricao ?? "hoje";
  if (compromissos.length === 0) return `Você não tem compromissos na agenda ${quando}.`;
  const variosDias = new Set(compromissos.map((c) => c.data)).size > 1;
  const itens = compromissos.map((c) => {
    const cliente = c.cliente as Dados | null;
    const status = c.status === "agendado" ? "" : ` (${c.status})`;
    return `${variosDias ? `${dataBr(String(c.data))}, ` : ""}${c.inicio}–${c.fim}: ${c.titulo}${cliente ? ` com **${cliente.nome}**` : " (interno)"}${status}`;
  });
  return `**Compromissos** ${quando} (${r.dados.total}):\n${lista(itens)}${parcial(r.dados, compromissos.length)}${paragrafo(
    'Ações sugeridas pelo Dialys não aparecem aqui: elas não têm horário e não entram na agenda. Peça "quais ações devo priorizar?" para vê-las.',
  )}`;
}

/** Preparação de um compromisso: só com o que as consultas devolvem; sem reunião analisada, diz isso. */
async function textoPreparacao(c: CompromissoEmFoco, consultar: EntradaMotor["consultar"]) {
  const cabecalho = `**Preparação: ${c.titulo}**, ${dataBr(c.data)} das ${c.inicio} às ${c.fim}${c.cliente ? ` com **${c.cliente.nome}**` : ""}.`;
  const fim = `${paragrafo(c.observacoes ? `**Suas observações:** ${c.observacoes}` : null)}`;
  if (c.status === "cancelado") return `${cabecalho}${paragrafo("Este compromisso está cancelado.")}${fim}`;
  if (!c.cliente) {
    return `${cabecalho}${paragrafo("É um compromisso interno, sem cliente associado, então não há reuniões analisadas para consultar.")}${fim}`;
  }
  if (!c.cliente.temReunioesAnalisadas) {
    return `${cabecalho}${paragrafo(
      `O Dialys ainda não tem reuniões analisadas de **${c.cliente.nome}**, então não tenho histórico, riscos, oportunidades nem falas do cliente para trazer. Para uma preparação baseada em evidências, envie a transcrição de uma reunião com esse cliente.`,
    )}${fim}`;
  }
  const empresa = await consultar("consultar_empresa", { contaId: c.cliente.id });
  const acoes = await consultar("consultar_acoes_sugeridas", { contaId: c.cliente.id });
  return `${cabecalho}${paragrafo(textoEmpresa(empresa))}${paragrafo("**Ações sugeridas registradas na análise** (não são compromissos):")}${paragrafo(textoAcoes(acoes))}${fim}`;
}
