// Roteiro do briefing do assistente Dialys, montado no servidor a partir do resumo da carteira do usuário
// quando ele pede o briefing no chat. Determinístico e sem IA: frases curtas, escritas para serem ouvidas
// (window.speechSynthesis lê só esta resposta; as demais do chat são só texto).
// Na produção, o roteiro passa a ser escrito pelo Claude sobre os mesmos dados (ARQUITETURA §3.5).
import { paraAlerta, type Alerta } from "./alertas";
import type { ResumoCarteira } from "./api-cliente";

/** `texto` é exibido; `fala` é o que a voz sintetiza, quando precisa ser diferente. */
export type TrechoBriefing = { texto: string; fala?: string; novoParagrafo?: boolean };

/** Compromisso da agenda do usuário (evento com horário marcado por ele), já no fuso configurado. */
export type CompromissoBriefing = { titulo: string; inicio: string; cliente: string | null };

export type Briefing = {
  saudacao: string;
  chamada: string;
  trechos: TrechoBriefing[];
  duracaoSegundos: number;
};

/** Ritmo médio da voz pt-BR do navegador, para estimar a duração exibida no player. */
const CARACTERES_POR_SEGUNDO = 14;
const LIMITE_CITACAO = 160;
const ORDINAIS = ["Primeiro", "Segundo", "Terceiro"];

const plural = (n: number, singular: string, pluralForma: string) => `${n} ${n === 1 ? singular : pluralForma}`;

export function saudacaoPara(hora: number) {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** "crítico", "uma oportunidade de alta probabilidade"... na ordem do assistente. */
function nivelFalado(alerta: Alerta) {
  const nivel = alerta.urgencia === "alta" ? "alta" : "média";
  if (alerta.tipo === "churn") return alerta.urgencia === "alta" ? "crítico" : "atenção";
  if (alerta.tipo === "oportunidade") return `uma oportunidade de ${nivel} probabilidade`;
  return `uma objeção de ${nivel} criticidade`;
}

function citacaoCurta(texto: string) {
  if (texto.length <= LIMITE_CITACAO) return texto;
  const corte = texto.lastIndexOf(" ", LIMITE_CITACAO);
  return `${texto.slice(0, corte > 0 ? corte : LIMITE_CITACAO)}…`;
}

/** Hora no fuso configurado (o servidor pode estar em outro fuso). */
const horaNoFuso = (agora: Date, fuso: string) =>
  Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: fuso }).format(agora));

/** "14:30" → "14 e 30"; "09:00" → "9 horas" (a voz lê melhor do que "09:00"). */
function horaFalada(hora: string) {
  const [h, m] = hora.split(":").map(Number);
  return m === 0 ? `${h} ${h === 1 ? "hora" : "horas"}` : `${h} e ${m}`;
}

const listaFalada = (itens: string[]) => (itens.length === 1 ? itens[0] : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`);

/**
 * Compromissos e ações sugeridas ficam separados: compromisso é o que o usuário marcou na agenda, com
 * horário; ação sugerida é recomendação da análise, sem horário, e nunca é apresentada como agendada.
 */
function trechosDaAgenda(compromissos: CompromissoBriefing[]): TrechoBriefing[] {
  if (compromissos.length === 0) return [{ texto: "Você não tem mais compromissos agendados para hoje.", novoParagrafo: true }];
  const MAXIMO = 4;
  const itens = compromissos.slice(0, MAXIMO).map((c) => {
    const descricao = `${c.titulo}${c.cliente ? ` com ${c.cliente}` : ""}`;
    return { texto: `às ${c.inicio}, ${descricao}`, fala: `às ${horaFalada(c.inicio)}, ${descricao}` };
  });
  const resto = compromissos.length > MAXIMO ? `, e mais ${plural(compromissos.length - MAXIMO, "compromisso", "compromissos")}` : "";
  const abertura = `Ainda hoje na sua agenda, ${plural(compromissos.length, "compromisso", "compromissos")}: `;
  return [
    {
      texto: `${abertura}${listaFalada(itens.map((i) => i.texto))}${resto}.`,
      fala: `${abertura}${listaFalada(itens.map((i) => i.fala))}${resto}.`,
      novoParagrafo: true,
    },
  ];
}

export function montarBriefing(
  resumo: ResumoCarteira,
  agora: Date,
  nome = "Ricardo",
  opcoes: { compromissos?: CompromissoBriefing[]; fuso?: string } = {},
): Briefing {
  const saudacao = `${saudacaoPara(horaNoFuso(agora, opcoes.fuso ?? "America/Sao_Paulo"))}, ${nome}`;
  const compromissos = opcoes.compromissos ?? [];
  const { kpis } = resumo;
  const alertas = resumo.urgencias.map(paraAlerta);
  const trechos: TrechoBriefing[] = [{ texto: `${saudacao}.` }];

  if (kpis.reunioesAnalisadas === 0) {
    trechos.push({ texto: "Ainda não há reuniões analisadas na sua carteira." });
    trechos.push({ texto: "Envie a primeira transcrição e eu preparo o seu briefing com os riscos e as oportunidades." });
    if (opcoes.compromissos) trechos.push(...trechosDaAgenda(compromissos));
    return finalizar(saudacao, `Nenhuma reunião analisada ainda; ${plural(compromissos.length, "compromisso", "compromissos")} na agenda.`, trechos);
  }

  const recentes =
    kpis.reunioesUltimos7Dias === 0
      ? ""
      : kpis.reunioesUltimos7Dias === kpis.reunioesAnalisadas
        ? kpis.reunioesAnalisadas === 1
          ? ", feita nos últimos sete dias"
          : ", todas nos últimos sete dias"
        : `, ${kpis.reunioesUltimos7Dias} delas nos últimos sete dias`;
  trechos.push({
    texto: `Analisei ${plural(kpis.reunioesAnalisadas, "reunião", "reuniões")} de ${plural(kpis.contasAnalisadas, "conta", "contas")}${recentes}.`,
  });
  if (kpis.contasEmRiscoChurn > 0) {
    trechos.push({
      texto: `${plural(kpis.contasEmRiscoChurn, "conta está", "contas estão")} em risco de churn${
        kpis.contasEmRiscoCritico > 0 ? `, ${kpis.contasEmRiscoCritico} em atenção crítica` : ""
      }.`,
    });
  } else {
    trechos.push({ texto: "Nenhuma conta apresenta risco de churn nas últimas reuniões." });
  }

  if (alertas.length === 0) {
    trechos.push({ texto: "Não encontrei alertas que exijam ação hoje." });
  } else {
    trechos.push({
      texto: `Separei ${plural(alertas.length, "alerta prioritário", "alertas prioritários")}, em ordem de urgência.`,
    });
    alertas.forEach((alerta, indice) => {
      trechos.push({
        texto: `${ORDINAIS[indice]}, ${nivelFalado(alerta)}: ${alerta.empresa}. ${alerta.subtipo}.`,
        novoParagrafo: true,
      });
      trechos.push({ texto: `O cliente disse: “${citacaoCurta(alerta.evidencia)}”` });
      trechos.push({ texto: `Recomendo: ${alerta.acao}` });
    });
  }

  if (opcoes.compromissos) trechos.push(...trechosDaAgenda(compromissos));
  const sugeridas = resumo.agenda.map((item) => item.conta.nome);
  if (sugeridas.length > 0) {
    trechos.push({ texto: `Nas ações sugeridas pelo Dialys, sem horário marcado, priorize ${listaFalada(sugeridas)}.`, novoParagrafo: !opcoes.compromissos });
  }
  trechos.push({ texto: "Bom trabalho." });

  const chamada = `Seu briefing de hoje: ${plural(alertas.length, "alerta", "alertas")} por urgência${
    opcoes.compromissos ? `, ${plural(compromissos.length, "compromisso", "compromissos")} na agenda` : ""
  } e ${plural(sugeridas.length, "ação sugerida", "ações sugeridas")}.`;
  return finalizar(saudacao, chamada, trechos);
}

function finalizar(saudacao: string, chamada: string, trechos: TrechoBriefing[]): Briefing {
  const caracteres = trechos.reduce((soma, t) => soma + (t.fala ?? t.texto).length + 1, 0);
  return { saudacao, chamada, trechos, duracaoSegundos: Math.max(5, Math.round(caracteres / CARACTERES_POR_SEGUNDO)) };
}
