// Agenda FICTÍCIA do modo demonstração: compromissos coerentes com a carteira fictícia
// (src/lib/mock/contas.ts), na semana atual e na seguinte. Determinística: a mesma semana gera os
// mesmos compromissos. As observações são só a pauta: não afirmam nada sobre o cliente, porque não
// há reunião analisada que sustente fatos (o assistente diz isso ao preparar o compromisso).
import { randomUUID } from "node:crypto";
import { CONTAS_MOCK } from "@/lib/mock/contas";
import { inicioDaSemana, paraInstante, somarDias, type DataCivil } from "@/lib/fuso";
import type { CompromissoRegistro } from "../db/banco";

type Modelo = {
  /** Dia a partir da segunda-feira da semana atual (0 = segunda; 7 = segunda seguinte). */
  dia: number;
  inicio: string;
  minutos: number;
  titulo: string;
  /** Id da conta fictícia; null = compromisso interno. */
  conta: string | null;
  local?: string;
  pauta?: string;
  cancelado?: boolean;
};

const MODELOS: Modelo[] = [
  { dia: 0, inicio: "09:00", minutos: 30, titulo: "Planejamento da semana com o time comercial", conta: null, local: "Sala Ipê" },
  { dia: 0, inicio: "10:30", minutos: 60, titulo: "Reunião de renovação de contrato", conta: "c-001", local: "Videochamada", pauta: "Revisar escopo e prazos da renovação." },
  { dia: 0, inicio: "15:00", minutos: 45, titulo: "Apresentação de proposta comercial", conta: "c-002", local: "Escritório do cliente", pauta: "Apresentar a proposta e ouvir dúvidas." },
  { dia: 1, inicio: "09:30", minutos: 60, titulo: "Visita de relacionamento", conta: "c-003", local: "Escritório do cliente" },
  { dia: 1, inicio: "14:00", minutos: 30, titulo: "Acompanhamento de implantação", conta: "c-005", local: "Videochamada", pauta: "Status das etapas combinadas." },
  { dia: 1, inicio: "16:30", minutos: 30, titulo: "Alinhamento com pré-vendas", conta: null, local: "Sala Jacarandá" },
  { dia: 2, inicio: "09:00", minutos: 30, titulo: "Revisão do funil de oportunidades", conta: null, local: "Videochamada" },
  { dia: 2, inicio: "11:00", minutos: 60, titulo: "Reunião de expansão de módulos", conta: "c-004", local: "Videochamada", pauta: "Entender as áreas que pediram novos módulos." },
  { dia: 2, inicio: "14:30", minutos: 45, titulo: "Revisão trimestral de conta", conta: "c-006", local: "Escritório do cliente" },
  { dia: 2, inicio: "17:00", minutos: 30, titulo: "Retorno sobre chamado de suporte", conta: "c-008", local: "Telefone", cancelado: true },
  { dia: 3, inicio: "10:00", minutos: 60, titulo: "Demonstração do módulo de BI", conta: "c-009", local: "Videochamada" },
  { dia: 3, inicio: "11:30", minutos: 30, titulo: "Conversa sobre reajuste de contrato", conta: "c-007", local: "Telefone" },
  { dia: 3, inicio: "15:00", minutos: 60, titulo: "Workshop de requisitos", conta: "c-012", local: "Escritório do cliente", pauta: "Levantar requisitos com as áreas envolvidas." },
  { dia: 4, inicio: "09:30", minutos: 45, titulo: "Reunião de kickoff", conta: "c-010", local: "Videochamada" },
  { dia: 4, inicio: "13:30", minutos: 30, titulo: "Fechamento semanal com a diretoria", conta: null, local: "Sala Ipê" },
  { dia: 4, inicio: "16:00", minutos: 45, titulo: "Visita de relacionamento", conta: "c-013", local: "Escritório do cliente" },
  { dia: 7, inicio: "09:00", minutos: 30, titulo: "Planejamento da semana com o time comercial", conta: null, local: "Sala Ipê" },
  { dia: 7, inicio: "10:00", minutos: 60, titulo: "Negociação de renovação", conta: "c-011", local: "Videochamada", pauta: "Condições comerciais da renovação." },
  { dia: 7, inicio: "14:00", minutos: 45, titulo: "Acompanhamento pós-implantação", conta: "c-014", local: "Videochamada" },
  { dia: 8, inicio: "10:30", minutos: 60, titulo: "Apresentação de roadmap de produto", conta: "c-015", local: "Escritório do cliente" },
  { dia: 8, inicio: "15:30", minutos: 30, titulo: "Revisão de proposta", conta: "c-002", local: "Videochamada" },
  { dia: 9, inicio: "09:30", minutos: 45, titulo: "Visita técnica", conta: "c-016", local: "Escritório do cliente" },
  { dia: 9, inicio: "14:00", minutos: 60, titulo: "Reunião de expansão de módulos", conta: "c-001", local: "Videochamada" },
  { dia: 10, inicio: "11:00", minutos: 30, titulo: "Alinhamento com o time de implantação", conta: null, local: "Sala Jacarandá" },
  { dia: 10, inicio: "16:00", minutos: 45, titulo: "Revisão trimestral de conta", conta: "c-003", local: "Videochamada" },
  { dia: 11, inicio: "10:00", minutos: 60, titulo: "Workshop de adoção", conta: "c-005", local: "Escritório do cliente" },
  { dia: 11, inicio: "14:30", minutos: 30, titulo: "Fechamento semanal com a diretoria", conta: null, local: "Sala Ipê" },
];

/** Compromissos fictícios da semana de `hoje` e da seguinte; os já terminados ficam "realizado". */
export function semearAgenda(usuarioId: string, hoje: DataCivil, fuso: string, agora = new Date()): CompromissoRegistro[] {
  const segunda = inicioDaSemana(hoje);
  const criadoEm = agora.toISOString();
  const nomes = new Map(CONTAS_MOCK.map((conta) => [conta.id, conta.nome]));
  return MODELOS.map((modelo) => {
    const data = somarDias(segunda, modelo.dia);
    const inicio = paraInstante(data, modelo.inicio, fuso);
    const fim = new Date(inicio.getTime() + modelo.minutos * 60_000);
    const status = modelo.cancelado ? "cancelado" : fim <= agora ? "realizado" : "agendado";
    return {
      id: `cmp_${randomUUID().replace(/-/g, "")}`,
      usuarioId,
      titulo: modelo.titulo,
      contaId: modelo.conta,
      contaNome: modelo.conta ? (nomes.get(modelo.conta) ?? null) : null,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      status,
      local: modelo.local ?? null,
      observacoes: modelo.pauta ? `Pauta: ${modelo.pauta}` : null,
      origem: "demonstracao",
      criadoEm,
      atualizadoEm: criadoEm,
    } satisfies CompromissoRegistro;
  });
}
