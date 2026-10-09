// Nome do cliente quando a reunião só traz o código da TOTVS (CODT). A base de transcrições é
// anonimizada e não tem o nome da empresa, então, em ordem:
//   1. nome real, se informado em .dialys/totvs/nomes-clientes.json (local, fora do git: dado de cliente);
//   2. nome descritivo com dados da própria base: atividade pelo CNAE + UF + código ("Hospital · RS (T54451)");
//   3. sem nada disso, nomeConta cai em "Cliente <código>".
// O nome é calculado na leitura (repositorio.ts) e nunca gravado na reunião: preencher o arquivo de nomes
// muda todas as telas na hora, sem reprocessar. Um nome escolhido no envio (contaNome) continua valendo.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { nomeDescritivoCliente } from "@/lib/cnae";
import type { ContextoReuniao } from "@/lib/transcricao";
import { lerAmostraTotvs } from "../ai/demo/amostra-totvs";

/** DIALYS_NOMES_CLIENTES troca o arquivo (os testes usam uma pasta temporária). */
export function arquivoNomesClientes() {
  return process.env.DIALYS_NOMES_CLIENTES ?? path.join(/* turbopackIgnore: true */ process.cwd(), ".dialys", "totvs", "nomes-clientes.json");
}

const limparNome = (valor: unknown) =>
  typeof valor === "string" ? valor.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) : "";

/**
 * Lê { "T34114": "Nome", ... } ou [{ "CODT": "T34114", "NOME": "Nome" }, ...]. Nomes vazios são ignorados
 * (o modelo do arquivo vem com eles vazios). Arquivo ausente ou inválido = nenhum nome real.
 */
export function lerNomesClientes(conteudo: string): Map<string, string> {
  const nomes = new Map<string, string>();
  const dados: unknown = JSON.parse(conteudo.replace(/^﻿/, ""));
  const pares: [unknown, unknown][] = Array.isArray(dados)
    ? dados.map((item) => {
        const registro = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
        return [registro.CODT ?? registro.codigo, registro.NOME ?? registro.nome];
      })
    : typeof dados === "object" && dados !== null
      ? Object.entries(dados).filter(([chave]) => !chave.startsWith("_"))
      : [];
  for (const [codigo, nome] of pares) {
    const chave = limparNome(codigo);
    const valor = limparNome(nome);
    if (chave && valor) nomes.set(chave, valor);
  }
  return nomes;
}

type Cache = { arquivo: string; modificadoEm: number; nomes: Map<string, string> };
const chaveCache = Symbol.for("dialys.clientes.nomes");

/** Nomes reais por código, relidos só quando o arquivo muda. */
function nomesReais(): Map<string, string> {
  const global = globalThis as typeof globalThis & { [chaveCache]?: Cache };
  const arquivo = arquivoNomesClientes();
  let modificadoEm: number;
  try {
    modificadoEm = statSync(arquivo).mtimeMs;
  } catch {
    return new Map();
  }
  const atual = global[chaveCache];
  if (atual && atual.arquivo === arquivo && atual.modificadoEm === modificadoEm) return atual.nomes;
  let nomes = new Map<string, string>();
  try {
    nomes = lerNomesClientes(readFileSync(arquivo, "utf8"));
  } catch (erro) {
    console.warn(`[dialys/clientes] nomes-clientes.json ignorado: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
  global[chaveCache] = { arquivo, modificadoEm, nomes };
  return nomes;
}

let perfisAmostra: Map<string, ContextoReuniao> | undefined;

/** CNAE/UF/segmento por código, da amostra da TOTVS: reuniões gravadas antes do campo CNAE existir. */
function perfilDaAmostra(codigo: string) {
  if (!perfisAmostra) {
    perfisAmostra = new Map();
    for (const reuniao of lerAmostraTotvs()) {
      const chave = reuniao.contexto.codigoCliente?.trim();
      if (chave && !perfisAmostra.has(chave)) perfisAmostra.set(chave, reuniao.contexto);
    }
  }
  return perfisAmostra.get(codigo);
}

let codigosPorReuniao: Map<string, string> | undefined;

/**
 * Migração na leitura do banco (não destrutiva, determinística): reunião da amostra enviada sem o código
 * do cliente (versões antigas não guardavam o CODT) recebe o código da reunião de mesmo ID_MEETING na
 * amostra. Fica gravada, para agrupar e remover o cliente tratar todas as reuniões dele juntas.
 */
export function completarCodigoCliente(reunioes: { contexto?: ContextoReuniao }[]) {
  if (!codigosPorReuniao) {
    codigosPorReuniao = new Map();
    for (const reuniao of lerAmostraTotvs()) {
      const codigo = reuniao.contexto.codigoCliente?.trim();
      if (codigo && reuniao.contexto.idReuniao) codigosPorReuniao.set(reuniao.contexto.idReuniao, codigo);
    }
  }
  for (const reuniao of reunioes) {
    const id = reuniao.contexto?.idReuniao;
    const codigo = id && !reuniao.contexto?.codigoCliente ? codigosPorReuniao.get(id) : undefined;
    if (codigo) reuniao.contexto = { ...reuniao.contexto, codigoCliente: codigo };
  }
}

/** Nome do cliente pelo contexto da reunião (sem o código, não há o que nomear). */
export function nomeDoCliente(contexto: ContextoReuniao | null | undefined): string | undefined {
  const codigo = contexto?.codigoCliente?.trim();
  if (!codigo) return undefined;
  const real = nomesReais().get(codigo);
  if (real) return real;
  const amostra = perfilDaAmostra(codigo);
  return nomeDescritivoCliente({
    codigoCliente: codigo,
    cnae: contexto?.cnae ?? amostra?.cnae,
    segmento: contexto?.segmento ?? amostra?.segmento,
    uf: contexto?.uf ?? amostra?.uf,
  });
}

/** Preenche nomeCliente nas reuniões lidas (só em memória). */
export function identificarClientes<T extends { contexto?: ContextoReuniao; nomeCliente?: string }>(reunioes: T[]): T[] {
  for (const reuniao of reunioes) {
    const nome = nomeDoCliente(reuniao.contexto);
    if (nome) reuniao.nomeCliente = nome;
    else delete reuniao.nomeCliente;
  }
  return reunioes;
}
