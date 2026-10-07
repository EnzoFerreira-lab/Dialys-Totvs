/** Classificação padrão do NPS por respondente: 9–10 promotor, 7–8 neutro, 0–6 detrator. */
export function classificarNps(nota: number) {
  if (nota >= 9) return { rotulo: "Promotor", className: "bg-[#A7F0BA] text-[#044317]" };
  if (nota >= 7) return { rotulo: "Neutro", className: "bg-[#E0E0E0] text-[#161616]" };
  return { rotulo: "Detrator", className: "bg-[#FFD7D9] text-[#750E13]" };
}
