// Saúde da conta (0–10), calculada por código a partir da última reunião analisada: explicável e
// determinística, como pede a arquitetura (§3.4: "o score da conta é calculado por código").
// Não é previsão de churn: é um resumo dos sinais registrados, para ordenar e filtrar a carteira.

export type FaixaSaude = "risco" | "estavel" | "saudavel";
export type Severidade = "ALTA" | "MÉDIA" | "BAIXA";
export type SinalParaSaude = { tipo: "CHURN_RISK" | "OPPORTUNITY" | "OBJECTION"; severidade: Severidade };

export type Saude = {
  nota: number;
  faixa: FaixaSaude;
  /** Cada parcela do cálculo, para mostrar "por que esta nota". */
  fatores: string[];
};

const PESO_CHURN: Record<Severidade, number> = { ALTA: 4, MÉDIA: 2.5, BAIXA: 1 };
const PESO_OBJECAO: Record<Severidade, number> = { ALTA: 1.5, MÉDIA: 1, BAIXA: 0.5 };
const BONUS_OPORTUNIDADE = 0.5;
const BONUS_MAXIMO = 1;
const PESO_NPS = 0.3;

const umaCasa = (n: number) => Math.round(n * 10) / 10;
const virgula = (n: number) => umaCasa(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const ROTULO_FAIXA: Record<FaixaSaude, string> = { risco: "Em risco", estavel: "Estável", saudavel: "Saudável" };

export function faixaDaNota(nota: number): FaixaSaude {
  if (nota < 5) return "risco";
  if (nota < 7.5) return "estavel";
  return "saudavel";
}

export function calcularSaude(sinais: SinalParaSaude[], nps?: number | null): Saude {
  const fatores: string[] = [];
  let nota = 10;
  for (const s of sinais) {
    if (s.tipo === "CHURN_RISK") {
      nota -= PESO_CHURN[s.severidade];
      fatores.push(`Risco de churn (${s.severidade.toLowerCase()}): −${virgula(PESO_CHURN[s.severidade])}`);
    } else if (s.tipo === "OBJECTION") {
      nota -= PESO_OBJECAO[s.severidade];
      fatores.push(`Objeção (${s.severidade.toLowerCase()}): −${virgula(PESO_OBJECAO[s.severidade])}`);
    }
  }
  const oportunidades = sinais.filter((s) => s.tipo === "OPPORTUNITY").length;
  if (oportunidades > 0) {
    const bonus = Math.min(BONUS_MAXIMO, oportunidades * BONUS_OPORTUNIDADE);
    nota += bonus;
    fatores.push(`${oportunidades} oportunidade(s): +${virgula(bonus)}`);
  }
  nota = Math.min(10, Math.max(0, nota));
  if (sinais.length === 0) fatores.push("Nenhum sinal de risco ou objeção na última reunião");

  if (typeof nps === "number") {
    const combinada = nota * (1 - PESO_NPS) + nps * PESO_NPS;
    fatores.push(`Sinais ${virgula(nota)} (70%) + NPS ${nps} (30%)`);
    nota = combinada;
  } else {
    fatores.push("Sem NPS informado: só os sinais contam");
  }

  const final = umaCasa(Math.min(10, Math.max(0, nota)));
  return { nota: final, faixa: faixaDaNota(final), fatores };
}

/** Força da relação pela última conversa: frágil com churn crítico ou NPS de detrator; forte quando saudável e sem churn. */
export function confiancaRelacional(saude: Saude, temChurn: boolean, temChurnCritico: boolean, nps?: number | null): "forte" | "neutra" | "fragil" {
  if (temChurnCritico || (typeof nps === "number" && nps <= 6)) return "fragil";
  if (saude.faixa === "saudavel" && !temChurn) return "forte";
  return "neutra";
}
