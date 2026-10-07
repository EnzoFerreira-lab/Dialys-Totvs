// Entrada de transcrições no formato exportado pela TOTVS (amostra_reunioes.json): um registro por
// reunião, com a transcrição anonimizada em ANON_TRANSCRICAO e metadados da conta. Usado no navegador
// (colar/anexar) e no servidor (exemplos e validação).
import { z } from "zod";

/** Metadados da reunião que a análise e a tela usam. Todos opcionais: texto colado não tem nenhum. */
export const ContextoReuniaoSchema = z.object({
  idReuniao: z.string().max(40).optional(),
  /** Código anonimizado do cliente (CODT): agrupa as reuniões da mesma empresa. */
  codigoCliente: z.string().max(40).optional(),
  data: z.string().max(40).optional(),
  duracao: z.string().max(20).optional(),
  segmento: z.string().max(80).optional(),
  uf: z.string().max(4).optional(),
  unidade: z.string().max(120).optional(),
  faixaFaturamento: z.string().max(120).optional(),
  nps: z.number().min(0).max(10).optional(),
  /** false = reunião interna (só gente da TOTVS falando sobre a conta). */
  externa: z.boolean().optional(),
  /** "customer" (cliente da base) ou "lead" (prospect). */
  tipoRecurso: z.string().max(20).optional(),
});

export type ContextoReuniao = z.infer<typeof ContextoReuniaoSchema>;

/** Item do menu Exemplo (sem o texto, que é carregado ao escolher). */
export type ExemploResumo = { id: string; titulo: string; descricao?: string; grupo: string };

export type ExemploCompleto = { transcricao: string; contexto?: ContextoReuniao; contaId?: string };

export type ReuniaoImportada = {
  id: string;
  titulo: string;
  descricao: string;
  transcricao: string;
  contexto: ContextoReuniao;
};

const CAMPOS_TRANSCRICAO = ["ANON_TRANSCRICAO", "TRANSCRICAO", "transcricao", "texto"];

const SEGMENTOS: Record<string, string> = {
  SAUDE: "Saúde",
  LOGISTICA: "Logística",
  DISTRIBUICAO: "Distribuição",
  SERVICOS: "Serviços",
  CONSTRUCAO: "Construção",
  EDUCACIONAL: "Educacional",
  AGRONEGOCIO: "Agronegócio",
  JURIDICO: "Jurídico",
};

/** "CONSTRUCAO E PROJETOS" → "Construção e Projetos". */
export function formatarSegmento(segmento: string) {
  return segmento
    .toUpperCase()
    .split(/\s+/)
    .map((palavra) =>
      palavra === "E" ? "e" : (SEGMENTOS[palavra] ?? palavra.charAt(0) + palavra.slice(1).toLowerCase()),
    )
    .join(" ");
}

const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : undefined);

function contextoDoRegistro(registro: Record<string, unknown>): ContextoReuniao {
  const nps = Number.parseFloat(String(registro.NOTA_NPS ?? ""));
  const externo = registro.FLG_EXTERNO;
  return ContextoReuniaoSchema.parse({
    idReuniao: texto(registro.ID_MEETING)?.slice(0, 40),
    codigoCliente: texto(registro.CODT)?.slice(0, 40),
    data: texto(registro.DT_MEETING)?.slice(0, 40),
    duracao: texto(registro.DURACAO_MEETING)?.slice(0, 20),
    segmento: texto(registro.NOME_SEGMENTO) ? formatarSegmento(String(registro.NOME_SEGMENTO)).slice(0, 80) : undefined,
    uf: texto(registro.UF)?.slice(0, 4),
    unidade: texto(registro.NOME_UNIDADE)?.slice(0, 120),
    faixaFaturamento: texto(registro.FAIXA_FATURAMENTO_CLIENTE_EC)?.slice(0, 120),
    nps: Number.isFinite(nps) && nps >= 0 && nps <= 10 ? nps : undefined,
    externa: typeof externo === "boolean" ? externo : externo === "true" ? true : externo === "false" ? false : undefined,
    tipoRecurso: texto(registro.TP_RECURSO)?.slice(0, 20),
  });
}

/** "2026-02-20 15:30:00" → "20/02/2026"; "00:48:37" → "49 min". */
function dataCurta(data?: string) {
  const partes = data?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : undefined;
}

function minutos(duracao?: string) {
  const partes = duracao?.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!partes) return undefined;
  const total = Number(partes[1]) * 60 + Number(partes[2]) + (Number(partes[3]) >= 30 ? 1 : 0);
  return `${total} min`;
}

/** Linha curta com os metadados, para listas e para o cabeçalho do resultado. */
export function descreverContexto(contexto: ContextoReuniao) {
  return [
    contexto.segmento,
    contexto.uf,
    dataCurta(contexto.data),
    minutos(contexto.duracao),
    contexto.nps !== undefined ? `NPS ${contexto.nps}` : undefined,
    contexto.externa === false ? "reunião interna" : contexto.tipoRecurso === "lead" ? "prospect" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function registrosDe(dados: unknown): Record<string, unknown>[] {
  if (Array.isArray(dados)) return dados.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  if (typeof dados !== "object" || dados === null) return [];
  const objeto = dados as Record<string, unknown>;
  if (CAMPOS_TRANSCRICAO.some((campo) => texto(objeto[campo]))) return [objeto];
  // Envelope do tipo { "reunioes": [...] } ou { "data": [...] }.
  const lista = Object.values(objeto).find(Array.isArray);
  return lista ? registrosDe(lista) : [];
}

/**
 * Lê o conteúdo de um .json (ou texto colado) no formato da TOTVS. Devolve null se não for JSON;
 * lista vazia se for JSON sem nenhum campo de transcrição. Reuniões repetidas aparecem uma vez.
 */
export function extrairReunioes(conteudo: string): ReuniaoImportada[] | null {
  const limpo = conteudo.replace(/^﻿/, "").trim();
  if (!/^[[{]/.test(limpo)) return null;
  let dados: unknown;
  try {
    dados = JSON.parse(limpo);
  } catch {
    return null;
  }

  const vistas = new Set<string>();
  const reunioes: ReuniaoImportada[] = [];
  registrosDe(dados).forEach((registro, indice) => {
    const campo = CAMPOS_TRANSCRICAO.find((nome) => texto(registro[nome]));
    if (!campo) return;
    const transcricao = normalizarTranscricao(String(registro[campo]));
    if (vistas.has(transcricao)) return;
    vistas.add(transcricao);

    const contexto = contextoDoRegistro(registro);
    const id = contexto.idReuniao ?? String(indice + 1);
    reunioes.push({
      id,
      titulo: `Reunião #${id}${contexto.segmento ? ` · ${contexto.segmento}` : ""}`,
      descricao: descreverContexto(contexto) || "Sem metadados",
      transcricao,
      contexto,
    });
  });
  return reunioes;
}

/**
 * Ajusta texto colado: quebras de linha do Windows e trechos copiados de dentro de um JSON
 * (com "\n" literal, aspas escapadas ou o nome do campo na frente).
 */
export function normalizarTranscricao(entrada: string): string {
  let resultado = entrada.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  const campoJson = resultado.trim().match(/^"?(?:ANON_TRANSCRICAO|TRANSCRICAO|transcricao)"?\s*:\s*("[\s\S]*")\s*,?$/);
  const literalJson = campoJson?.[1] ?? (/^"[\s\S]*"\s*,?$/.test(resultado.trim()) ? resultado.trim().replace(/,$/, "") : null);
  if (literalJson) {
    try {
      const valor: unknown = JSON.parse(literalJson);
      if (typeof valor === "string") return valor.replace(/\r\n?/g, "\n").trim();
    } catch {
      // Não era uma string JSON completa: segue para o ajuste abaixo.
    }
  }

  const escapadas = (resultado.match(/\\n/g) ?? []).length;
  const reais = (resultado.match(/\n/g) ?? []).length;
  if (escapadas >= 2 && escapadas > reais) {
    resultado = resultado.replace(/\\r\\n|\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');
  }
  return resultado.trim();
}
