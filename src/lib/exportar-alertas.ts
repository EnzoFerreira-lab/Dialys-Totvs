// "Exportar alertas" do Dashboard: CSV pronto para o Excel em português (separador ";" e BOM UTF-8).
import type { InsightApi } from "./api-cliente";
import { extrairValorReais } from "./valores";

const CATEGORIA: Record<InsightApi["categoria"], string> = {
  churn: "Risco de churn",
  upsell: "Upsell / cross-sell",
  objection: "Objeção de jornada",
};

const COLUNAS = [
  "Reunião",
  "Empresa",
  "Categoria",
  "Criticidade",
  "Sinal",
  "Confiança da IA (%)",
  "Valor citado (R$)",
  "Evidência literal",
  "Ação recomendada",
  "Data da reunião",
  "Data da análise",
  "Enviado ao CRM",
  "Protocolo CRM",
  "Link",
];

/** Aspas duplas em volta e aspas internas dobradas: vírgulas, ";" e quebras de linha ficam seguros. */
const celula = (valor: string | number) => `"${String(valor).replace(/"/g, '""')}"`;

export function montarCsvAlertas(insights: InsightApi[], origem: string) {
  const linhas = insights.map((i) => {
    const valor = extrairValorReais(`${i.citacaoExata} ${i.recomendacaoAcao}`);
    const dataReuniao = i.reuniao.dataInformada && i.reuniao.contexto?.data ? i.reuniao.contexto.data.slice(0, 10).split("-").reverse().join("/") : "Não informada";
    return [
      i.reuniao.codigo,
      i.conta.nome,
      CATEGORIA[i.categoria],
      i.criticidade,
      i.subtipo,
      Math.round(i.confianca * 100),
      valor === null ? "" : valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      i.citacaoExata,
      i.recomendacaoAcao,
      dataReuniao,
      new Date(i.reuniao.criadaEm).toLocaleString("pt-BR"),
      i.crm.sincronizado ? "Sim" : "Não",
      i.crm.protocolo ?? "",
      `${origem}/insights?reuniao=${encodeURIComponent(i.reuniao.id)}`,
    ]
      .map(celula)
      .join(";");
  });
  return `\ufeff${[COLUNAS.map(celula).join(";"), ...linhas].join("\r\n")}\r\n`;
}

export function nomeArquivoAlertas(agora: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `dialys-alertas-${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}.csv`;
}
