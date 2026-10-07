// Aparência e textos comuns dos compromissos (grade da semana, lista do dia e modais).
import type { Compromisso, StatusCompromisso } from "@/lib/agenda";
import { horaNoFuso, minutosNoFuso } from "@/lib/fuso";

export const COR_STATUS: Record<StatusCompromisso, string> = {
  agendado: "bg-[#D0E2FF] text-[#002D9C]",
  realizado: "bg-[#E0E0E0] text-[#393939]",
  cancelado: "bg-[#FFF1F1] text-[#A2191F]",
};

/** Bloco do compromisso: cliente em azul, interno em roxo; realizado esmaecido; cancelado riscado. */
export function corBloco(compromisso: Compromisso) {
  if (compromisso.status === "cancelado") return "border-l-[#C6C6C6] bg-[#FAFAFA] text-text-helper line-through";
  if (compromisso.status === "realizado") return "border-l-[#8D8D8D] bg-[#F4F4F4] text-text-secondary";
  return compromisso.cliente ? "border-l-[#0F62FE] bg-[#EDF5FF] text-[#001D6C]" : "border-l-[#8A3FFC] bg-[#F6F2FF] text-[#31135E]";
}

export const intervalo = (compromisso: Compromisso, fuso: string) =>
  `${horaNoFuso(new Date(compromisso.inicio), fuso)} – ${horaNoFuso(new Date(compromisso.fim), fuso)}`;

/** Início e fim em minutos do dia (no fuso). Término à meia-noite conta como 24:00. */
export function minutosDoDia(compromisso: Compromisso, fuso: string) {
  const inicio = minutosNoFuso(new Date(compromisso.inicio), fuso);
  const duracao = Math.max(0, (Date.parse(compromisso.fim) - Date.parse(compromisso.inicio)) / 60_000);
  return { inicio, fim: Math.min(24 * 60, inicio + duracao) };
}

export const descricaoAcessivel = (compromisso: Compromisso, fuso: string) =>
  [
    `${intervalo(compromisso, fuso)}, ${compromisso.titulo}`,
    compromisso.cliente ? `cliente ${compromisso.cliente.nome}` : "compromisso interno",
    compromisso.status !== "agendado" ? compromisso.status : null,
  ]
    .filter(Boolean)
    .join(", ");
