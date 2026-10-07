// Valores em reais citados nas reuniões ("R$ 50 mil", "R$ 50.000,00", "1,2 milhão de reais").
// Usado para destacar o valor em risco de um alerta: só aparece quando a própria conversa cita o montante.

const MULTIPLICADOR: Record<string, number> = { mil: 1_000, milhao: 1_000_000, milhoes: 1_000_000, mi: 1_000_000 };

function numero(inteiro: string, decimais?: string) {
  return Number(`${inteiro.replace(/\./g, "")}${decimais ? `.${decimais}` : ""}`);
}

const semAcento = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Maior valor em reais citado no texto, ou null. */
export function extrairValorReais(texto: string): number | null {
  const t = semAcento(texto);
  const valores: number[] = [];
  // "R$ 50.000,00", "R$50 mil", "R$ 1,2 milhao"
  for (const m of t.matchAll(/r\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil|milhoes|milhao|mi)?\b/g)) {
    valores.push(numero(m[1], m[2]) * (m[3] ? MULTIPLICADOR[m[3]] : 1));
  }
  // "50 mil reais", "1,5 milhao de reais"
  for (const m of t.matchAll(/(\d+)(?:,(\d{1,2}))?\s*(mil|milhoes|milhao)\s+(?:de\s+)?reais/g)) {
    valores.push(numero(m[1], m[2]) * MULTIPLICADOR[m[3]]);
  }
  const validos = valores.filter((v) => Number.isFinite(v) && v > 0);
  return validos.length ? Math.max(...validos) : null;
}

export const formatarReais = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
