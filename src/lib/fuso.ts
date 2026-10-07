// Datas e horas num fuso explícito (o configurado no servidor, padrão America/Sao_Paulo), sem depender
// do fuso do navegador nem de biblioteca externa. Compromissos são gravados como instantes UTC (ISO);
// a tela mostra e recebe "AAAA-MM-DD" + "hh:mm" no fuso configurado.

export const FUSO_PADRAO = "America/Sao_Paulo";

/** "AAAA-MM-DD" (data de calendário, sem fuso). */
export type DataCivil = string;

type Partes = { ano: number; mes: number; dia: number; hora: number; minuto: number };

function partes(instante: Date, fuso: string): Partes {
  const valores = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  return { ano: Number(valores.year), mes: Number(valores.month), dia: Number(valores.day), hora: Number(valores.hour), minuto: Number(valores.minute) };
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

export function dataNoFuso(instante: Date, fuso: string): DataCivil {
  const p = partes(instante, fuso);
  return `${p.ano}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`;
}

export function horaNoFuso(instante: Date, fuso: string) {
  const p = partes(instante, fuso);
  return `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`;
}

/** Minutos desde a meia-noite, no fuso. */
export function minutosNoFuso(instante: Date, fuso: string) {
  const p = partes(instante, fuso);
  return p.hora * 60 + p.minuto;
}

/** Diferença (ms) entre o relógio do fuso e o UTC naquele instante. */
function deslocamento(instante: Date, fuso: string) {
  const p = partes(instante, fuso);
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto) - Math.floor(instante.getTime() / 60_000) * 60_000;
}

/** "2026-10-08" + "14:30" no fuso → instante UTC. Ajusta duas vezes para atravessar mudança de horário. */
export function paraInstante(data: DataCivil, hora: string, fuso: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  const relogio = Date.UTC(ano, mes - 1, dia, h, m);
  let instante = relogio - deslocamento(new Date(relogio), fuso);
  instante = relogio - deslocamento(new Date(instante), fuso);
  return new Date(instante);
}

export function somarDias(data: DataCivil, dias: number): DataCivil {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** 0 = segunda ... 6 = domingo. */
export function diaDaSemana(data: DataCivil) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return (new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() + 6) % 7;
}

/** Segunda-feira da semana da data. */
export const inicioDaSemana = (data: DataCivil) => somarDias(data, -diaDaSemana(data));

export function fusoValido(fuso: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

/** "qua., 08/10" e "quarta-feira, 8 de outubro" para cabeçalhos. */
export function rotuloDia(data: DataCivil, formato: "curto" | "longo" = "curto") {
  const [ano, mes, dia] = data.split("-").map(Number);
  const meioDia = new Date(Date.UTC(ano, mes - 1, dia, 12));
  return formato === "curto"
    ? meioDia.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" })
    : meioDia.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
}
