// Nome do cliente pelo código da TOTVS: nome real (arquivo local) > CNAE + UF > "Cliente <código>".
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nomeConta } from "@/lib/insights";
import { TRANSCRICAO_TESTE } from "../ai/__fixtures__/reuniao-teste";
import { listarAnalisesConcluidas } from "../db/repositorio";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";
import { lerNomesClientes, nomeDoCliente } from "./identificacao";

let pasta: string;
let arquivoNomes: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-nomes-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  arquivoNomes = path.join(pasta, "nomes-clientes.json");
  process.env.DIALYS_NOMES_CLIENTES = arquivoNomes;
});
afterEach(async () => {
  delete process.env.DIALYS_BANCO_ARQUIVO;
  delete process.env.DIALYS_NOMES_CLIENTES;
  await rm(pasta, { recursive: true, force: true });
});

/** Grava o arquivo de nomes com um mtime novo (o cache relê quando o arquivo muda). */
async function gravarNomes(conteudo: unknown, segundos: number) {
  await writeFile(arquivoNomes, JSON.stringify(conteudo), "utf8");
  await utimes(arquivoNomes, segundos, segundos);
}

describe("nome do cliente", () => {
  it("lê o arquivo nos dois formatos e ignora nomes vazios e chaves de instrução", () => {
    expect([...lerNomesClientes(JSON.stringify({ _instrucoes: "x", T1: " Empresa  Um ", T2: "" }))]).toEqual([["T1", "Empresa Um"]]);
    expect([...lerNomesClientes(JSON.stringify([{ CODT: "T3", NOME: "Três" }, { codigo: "T4", nome: "Quatro" }]))]).toEqual([
      ["T3", "Três"],
      ["T4", "Quatro"],
    ]);
  });

  it("sem nome real: CNAE + UF da própria reunião ou, se faltar, da amostra da TOTVS", () => {
    expect(nomeDoCliente({ codigoCliente: "TX1", cnae: "4711302", uf: "pa" })).toBe("Supermercado · PA (TX1)");
    // T54451 está na amostra (data/exemplos/totvs) com CNAE 8610101 e UF RS.
    expect(nomeDoCliente({ codigoCliente: "T54451" })).toBe("Hospital · RS (T54451)");
    expect(nomeDoCliente({ segmento: "Saúde" })).toBeUndefined();
    expect(nomeDoCliente({ codigoCliente: "SEMDADO" })).toBeUndefined();
  });

  it("o nome real vence o descritivo e passa a valer assim que o arquivo muda", async () => {
    await gravarNomes({ T54451: "Hospital Exemplo Ltda" }, 1_000);
    expect(nomeDoCliente({ codigoCliente: "T54451" })).toBe("Hospital Exemplo Ltda");
    await gravarNomes({ T54451: "" }, 2_000);
    expect(nomeDoCliente({ codigoCliente: "T54451" })).toBe("Hospital · RS (T54451)");
  });

  it("as consultas trazem o nome, que não é gravado; o nome escolhido no envio continua valendo", async () => {
    await gravarNomes({ T54451: "Hospital Exemplo Ltda" }, 3_000);
    const contexto = { codigoCliente: "T54451", segmento: "Saúde", uf: "RS" };
    await receberEProcessar({ conteudo: { tipo: "texto", texto: TRANSCRICAO_TESTE }, contexto }, { motor: motorFalso() });
    await receberEProcessar(
      { conteudo: { tipo: "texto", texto: TRANSCRICAO_TESTE }, contexto: { codigoCliente: "T00274" }, contaNome: "Escolhido no Envio" },
      { motor: motorFalso() },
    );

    const nomes = (await listarAnalisesConcluidas()).map((a) => nomeConta(a.reuniao)).sort();
    expect(nomes).toEqual(["Escolhido no Envio", "Hospital Exemplo Ltda"]);
    expect(await readFile(process.env.DIALYS_BANCO_ARQUIVO!, "utf8")).not.toContain("nomeCliente");
  });
});
