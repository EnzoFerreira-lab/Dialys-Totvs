// Validação determinística da "regra de ouro": todo sinal precisa de uma citação que exista na transcrição.
// Não depende do modelo: localiza a citação no texto original e recalcula as posições reais.
import type { SinalNegocio } from "./schemas";

/** Abaixo disso a citação é genérica demais para servir de evidência ("sim", "com certeza"). */
export const TAMANHO_MINIMO_CITACAO = 12;

export type TipoCorrespondencia = "exata" | "normalizada";

export type SinalValidado = SinalNegocio & {
  evidencia: {
    correspondencia: TipoCorrespondencia;
    /** O modelo informou posições diferentes das reais (foram substituídas). */
    posicaoCorrigida: boolean;
  };
};

export type MotivoDescarte = "citacao_nao_encontrada" | "citacao_curta";

export type SinalDescartado = { sinal: SinalNegocio; motivo: MotivoDescarte };

export type MetricasEvidencia = {
  total: number;
  validos: number;
  descartados: number;
  /** validos / total (1 quando não há sinais). */
  taxaValidacao: number;
  exatas: number;
  normalizadas: number;
  posicoesCorrigidas: number;
};

export type ResultadoValidacao = {
  sinaisValidos: SinalValidado[];
  sinaisDescartados: SinalDescartado[];
  metricas: MetricasEvidencia;
};

/**
 * Diferenças tipográficas que não mudam o que foi dito: espaços/quebras de linha, aspas e
 * travessões tipográficos, reticências como caractere único. Caixa e palavras continuam exigidas.
 */
function normalizarCaractere(caractere: string) {
  if (/\s/.test(caractere)) return " ";
  if ("“”„«»\"".includes(caractere)) return '"';
  if ("‘’`´".includes(caractere)) return "'";
  if ("–—".includes(caractere)) return "-";
  if (caractere === "…") return "...";
  return caractere;
}

/** Texto normalizado + mapa de cada posição normalizada para o índice no texto original. */
function normalizarComMapa(texto: string) {
  let normalizado = "";
  const mapa: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const trocado = normalizarCaractere(texto[i]);
    if (trocado === " " && normalizado.endsWith(" ")) continue; // colapsa espaços
    for (const parte of trocado) {
      normalizado += parte;
      mapa.push(i);
    }
  }
  return { normalizado, mapa };
}

const semReticencias = (texto: string) =>
  texto
    .replace(/^(\.\.\.|…)\s*/, "")
    .replace(/\s*(\.\.\.|…)$/, "")
    .trim();
const semAspasEnvolventes = (texto: string) => texto.replace(/^["“'‘«]\s*/, "").replace(/\s*["”'’»]$/, "").trim();

/**
 * Formas da citação a tentar, da mais fiel para a mais limpa. Modelos costumam envolver o trecho em
 * aspas ou reticências; cada remoção só vale se a versão resultante existir na transcrição.
 */
function variantesCitacao(citacao: string) {
  const bruta = citacao.trim();
  const candidatas = [
    bruta,
    semReticencias(bruta),
    semAspasEnvolventes(bruta),
    semReticencias(semAspasEnvolventes(bruta)),
    semAspasEnvolventes(semReticencias(bruta)),
  ];
  return [...new Set(candidatas)].filter(Boolean);
}

function todasOcorrencias(texto: string, trecho: string) {
  const posicoes: number[] = [];
  for (let i = texto.indexOf(trecho); i !== -1; i = texto.indexOf(trecho, i + 1)) posicoes.push(i);
  return posicoes;
}

/** Com várias ocorrências, fica a mais próxima da posição sugerida pelo modelo. */
function maisProxima(posicoes: number[], sugerida: number) {
  return posicoes.reduce((melhor, atual) => (Math.abs(atual - sugerida) < Math.abs(melhor - sugerida) ? atual : melhor));
}

type Localizacao = { inicio: number; fim: number; correspondencia: TipoCorrespondencia };

function localizarExata(transcricao: string, citacao: string, sugerida: number): Localizacao | null {
  const ocorrencias = todasOcorrencias(transcricao, citacao);
  if (ocorrencias.length === 0) return null;
  const inicio = maisProxima(ocorrencias, sugerida);
  return { inicio, fim: inicio + citacao.length, correspondencia: "exata" };
}

function localizarNormalizada(
  indice: ReturnType<typeof normalizarComMapa>,
  citacao: string,
  sugerida: number,
): Localizacao | null {
  const { normalizado } = normalizarComMapa(citacao);
  const ocorrencias = todasOcorrencias(indice.normalizado, normalizado);
  if (ocorrencias.length === 0) return null;

  const candidatas = ocorrencias.map((posicao) => ({
    inicio: indice.mapa[posicao],
    fim: indice.mapa[posicao + normalizado.length - 1] + 1,
  }));
  const inicio = maisProxima(
    candidatas.map((candidata) => candidata.inicio),
    sugerida,
  );
  const escolhida = candidatas.find((candidata) => candidata.inicio === inicio)!;
  return { ...escolhida, correspondencia: "normalizada" };
}

/** Correspondência exata tem prioridade sobre a normalizada, em qualquer variante da citação. */
function localizar(
  transcricao: string,
  indice: ReturnType<typeof normalizarComMapa>,
  sinal: SinalNegocio,
): Localizacao | null {
  const variantes = variantesCitacao(sinal.citacaoExata);
  for (const variante of variantes) {
    const exata = localizarExata(transcricao, variante, sinal.posicaoCaracterStart);
    if (exata) return exata;
  }
  for (const variante of variantes) {
    const normalizada = localizarNormalizada(indice, variante, sinal.posicaoCaracterStart);
    if (normalizada) return normalizada;
  }
  return null;
}

export function validarEvidencias(transcricao: string, sinais: SinalNegocio[]): ResultadoValidacao {
  const indice = normalizarComMapa(transcricao);
  const sinaisValidos: SinalValidado[] = [];
  const sinaisDescartados: SinalDescartado[] = [];

  for (const sinal of sinais) {
    const menorVariante = Math.min(...variantesCitacao(sinal.citacaoExata).map((variante) => variante.length));
    if (menorVariante < TAMANHO_MINIMO_CITACAO) {
      sinaisDescartados.push({ sinal, motivo: "citacao_curta" });
      continue;
    }

    const local = localizar(transcricao, indice, sinal);
    if (!local) {
      sinaisDescartados.push({ sinal, motivo: "citacao_nao_encontrada" });
      continue;
    }

    sinaisValidos.push({
      ...sinal,
      // A evidência guardada é sempre o trecho do texto original, nunca a versão do modelo.
      citacaoExata: transcricao.slice(local.inicio, local.fim),
      posicaoCaracterStart: local.inicio,
      posicaoCaracterEnd: local.fim,
      evidencia: {
        correspondencia: local.correspondencia,
        posicaoCorrigida:
          sinal.posicaoCaracterStart !== local.inicio || sinal.posicaoCaracterEnd !== local.fim,
      },
    });
  }

  const total = sinais.length;
  return {
    sinaisValidos,
    sinaisDescartados,
    metricas: {
      total,
      validos: sinaisValidos.length,
      descartados: sinaisDescartados.length,
      taxaValidacao: total === 0 ? 1 : sinaisValidos.length / total,
      exatas: sinaisValidos.filter((s) => s.evidencia.correspondencia === "exata").length,
      normalizadas: sinaisValidos.filter((s) => s.evidencia.correspondencia === "normalizada").length,
      posicoesCorrigidas: sinaisValidos.filter((s) => s.evidencia.posicaoCorrigida).length,
    },
  };
}
