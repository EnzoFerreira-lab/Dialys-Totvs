"use client";

import type { Compromisso } from "@/lib/agenda";
import { cn } from "@/lib/cn";
import { dataNoFuso, rotuloDia, somarDias, type DataCivil } from "@/lib/fuso";
import { corBloco, descricaoAcessivel, intervalo, minutosDoDia } from "./estilo-compromisso";

const ALTURA_HORA = 44;
const HORA_INICIAL = 7;
const HORA_FINAL = 20;
const ALTURA_MINIMA = 22;

type Posicionado = { compromisso: Compromisso; inicio: number; fim: number; coluna: number; colunas: number };

/** Compromissos que se sobrepõem dividem a largura do dia em colunas (como nos calendários comuns). */
function posicionar(compromissos: Compromisso[], fuso: string): Posicionado[] {
  const itens = compromissos
    .map((compromisso) => ({ compromisso, ...minutosDoDia(compromisso, fuso), coluna: 0, colunas: 1 }))
    .sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
  let grupo: Posicionado[] = [];
  let fimDoGrupo = -1;
  let finsPorColuna: number[] = [];
  const fecharGrupo = () => grupo.forEach((item) => (item.colunas = finsPorColuna.length));
  for (const item of itens) {
    if (item.inicio >= fimDoGrupo && grupo.length) {
      fecharGrupo();
      grupo = [];
      finsPorColuna = [];
    }
    const livre = finsPorColuna.findIndex((fim) => fim <= item.inicio);
    item.coluna = livre === -1 ? finsPorColuna.length : livre;
    finsPorColuna[item.coluna] = Math.max(item.fim, item.inicio + 15);
    grupo.push(item);
    fimDoGrupo = Math.max(fimDoGrupo, item.fim, item.inicio + 15);
  }
  fecharGrupo();
  return itens;
}

type Props = {
  segunda: DataCivil;
  hoje: DataCivil;
  selecionada: DataCivil;
  fuso: string;
  compromissos: Compromisso[];
  /** Minutos desde a meia-noite agora (no fuso), ou null antes de montar no navegador. */
  agoraMinutos: number | null;
  onAbrir: (compromisso: Compromisso) => void;
  onNovo: (data: DataCivil, hora: string) => void;
};

/** Visão semanal (computador): segunda a domingo, grade de horas e compromissos posicionados. */
export function AgendaSemana({ segunda, hoje, selecionada, fuso, compromissos, agoraMinutos, onAbrir, onNovo }: Props) {
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
  const porDia = new Map(dias.map((dia) => [dia, [] as Compromisso[]]));
  for (const compromisso of compromissos) porDia.get(dataNoFuso(new Date(compromisso.inicio), fuso))?.push(compromisso);

  // A grade vai das 7h às 20h e se estende se houver compromisso fora disso.
  const minutos = compromissos.map((c) => minutosDoDia(c, fuso));
  const horaInicial = Math.min(HORA_INICIAL, ...minutos.map((m) => Math.floor(m.inicio / 60)));
  const horaFinal = Math.max(HORA_FINAL, ...minutos.map((m) => Math.ceil(m.fim / 60)));
  const horas = Array.from({ length: horaFinal - horaInicial }, (_, i) => horaInicial + i);
  const altura = horas.length * ALTURA_HORA;
  const topo = (minuto: number) => ((minuto - horaInicial * 60) / 60) * ALTURA_HORA;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-border-subtle">
          <span aria-hidden="true" />
          {dias.map((dia) => {
            const ehHoje = dia === hoje;
            const [, , numero] = dia.split("-");
            return (
              <div key={dia} className={cn("border-l border-border-subtle px-2 py-2 text-center", dia === selecionada && !ehHoje && "bg-[#F7F7F7]")}>
                <span className="block text-[11px] tracking-wide text-text-secondary uppercase">{rotuloDia(dia).split(",")[0].replace(".", "")}</span>
                <span
                  className={cn(
                    "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[15px] tabular-nums",
                    ehHoje ? "bg-interactive font-semibold text-on-interactive" : "text-text-primary",
                  )}
                  aria-label={ehHoje ? `Hoje, ${rotuloDia(dia, "longo")}` : rotuloDia(dia, "longo")}
                >
                  {Number(numero)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="relative grid grid-cols-[52px_repeat(7,minmax(0,1fr))]" style={{ height: altura }}>
          <div className="relative" aria-hidden="true">
            {horas.map((hora) => (
              <span key={hora} className="absolute right-2 -translate-y-1/2 text-[11px] text-text-helper tabular-nums" style={{ top: topo(hora * 60) }}>
                {hora > horaInicial ? `${String(hora).padStart(2, "0")}:00` : null}
              </span>
            ))}
          </div>

          {dias.map((dia) => (
            <div
              key={dia}
              className={cn("relative border-l border-border-subtle", dia === hoje && "bg-[#FFFBF2]")}
              role="list"
              aria-label={`Compromissos de ${rotuloDia(dia, "longo")}`}
            >
              {/* Linhas das horas; clicar num horário vazio abre "Novo compromisso" nele. */}
              {horas.map((hora) => (
                <button
                  key={hora}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => onNovo(dia, `${String(hora).padStart(2, "0")}:00`)}
                  className="absolute inset-x-0 border-t border-[#EDEDED] hover:bg-[#F4F4F4]"
                  style={{ top: topo(hora * 60), height: ALTURA_HORA }}
                />
              ))}

              {posicionar(porDia.get(dia) ?? [], fuso).map(({ compromisso, inicio, fim, coluna, colunas }) => {
                const alto = Math.max(ALTURA_MINIMA, topo(fim) - topo(inicio) - 2);
                return (
                  <div key={compromisso.id} role="listitem" className="absolute" style={{ top: topo(inicio) + 1, height: alto, left: `calc(${(coluna / colunas) * 100}% + 2px)`, width: `calc(${100 / colunas}% - 4px)` }}>
                    <button
                      type="button"
                      onClick={() => onAbrir(compromisso)}
                      aria-label={descricaoAcessivel(compromisso, fuso)}
                      className={cn(
                        "flex h-full w-full flex-col overflow-hidden rounded-[4px] border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
                        corBloco(compromisso),
                      )}
                    >
                      <span className="truncate font-semibold">{compromisso.titulo}</span>
                      {alto >= 40 ? <span className="truncate opacity-80">{intervalo(compromisso, fuso)}</span> : null}
                      {alto >= 54 && compromisso.cliente ? <span className="truncate opacity-80">{compromisso.cliente.nome}</span> : null}
                    </button>
                  </div>
                );
              })}

              {dia === hoje && agoraMinutos !== null && agoraMinutos >= horaInicial * 60 && agoraMinutos <= horaFinal * 60 ? (
                <div className="pointer-events-none absolute inset-x-0 z-[1] border-t-2 border-[#DA1E28]" style={{ top: topo(agoraMinutos) }} aria-hidden="true">
                  <span className="absolute -top-[5px] -left-[5px] h-2 w-2 rounded-full bg-[#DA1E28]" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
