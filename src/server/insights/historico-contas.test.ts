// Histórico de reuniões por conta (Central com ?reuniao=) e situação dos clientes da home.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { listarClientes } from "../clientes/clientes";
import { lerBanco } from "../db/banco";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";
import { listarContasInsight } from "./contas";

const RICARDO = USUARIOS[0];
const RESTRITO: Usuario = { id: "usr_restrito", nome: "Vendedor", email: "v@t.br", papel: "vendedor", escopo: { tipo: "contas", contaIds: ["conta-beta"] } };

const reuniao = (contaId: string, contaNome: string, data: string, nps?: number) =>
  receberEProcessar(
    { conteudo: { tipo: "texto", texto: transcricaoTeste() }, contaId, contaNome, contexto: { data, ...(nps !== undefined ? { nps } : {}), duracao: "00:44:40" } },
    { motor: motorFalso() },
  );

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-historico-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  await reuniao("conta-horizonte", "Grupo Horizonte", "2026-09-01 10:00:00", 8);
  await reuniao("conta-beta", "Beta Indústria", "2026-10-07 09:00:00");
  await reuniao("conta-horizonte", "Grupo Horizonte", "2026-10-07 15:30:00", 9);
});
afterEach(async () => {
  delete process.env.DIALYS_BANCO_ARQUIVO;
  await rm(pasta, { recursive: true, force: true });
});

describe("Central com ?reuniao= (link a partir de uma reunião específica)", () => {
  it("abre a conta na reunião pedida, sem mudar a ordem das contas", async () => {
    const antiga = (await lerBanco()).reuniao.find((r) => r.contexto?.data === "2026-09-01 10:00:00")!.id;
    const normal = await listarContasInsight();
    const focada = await listarContasInsight({ reuniaoEmFoco: antiga });
    expect(focada.map((c) => c.id)).toEqual(normal.map((c) => c.id));
    const horizonte = focada.find((c) => c.id === "conta-horizonte")!;
    expect(horizonte).toMatchObject({ reuniaoId: antiga, reuniaoMaisRecente: false });
    expect(normal.find((c) => c.id === "conta-horizonte")).toMatchObject({ reuniaoMaisRecente: true });
    // Id de reunião de outra conta não muda nada nesta.
    expect(focada.find((c) => c.id === "conta-beta")).toMatchObject({ reuniaoMaisRecente: true });
  });
});

describe("ordem das reuniões", () => {
  it("reunião antiga enviada por último não vira a 'mais recente'", async () => {
    await reuniao("conta-horizonte", "Grupo Horizonte", "2026-07-10 08:00:00");
    const horizonte = (await listarContasInsight()).find((c) => c.id === "conta-horizonte")!;
    expect(horizonte.reunioes.map((r) => r.data)).toEqual(["2026-10-07", "2026-09-01", "2026-07-10"]);
    expect(horizonte.reuniaoId).toBe(horizonte.reunioes[0].id);
    expect(horizonte.reuniaoMaisRecente).toBe(true);
  });
});

describe("Meus clientes com reuniões analisadas", () => {
  it("só as contas analisadas, com a situação calculada, respeitando o escopo", async () => {
    const { clientes, total } = await listarClientes(RICARDO, { limite: 50 });
    expect(total).toBe(2);
    expect(clientes.find((c) => c.id === "conta-horizonte")).toMatchObject({ nome: "Grupo Horizonte", situacao: { faixa: "estavel" } });
    expect((await listarClientes(RICARDO)).clientes.map((c) => c.nome)).toEqual(["Beta Indústria", "Grupo Horizonte"]);
    expect((await listarClientes(RESTRITO)).clientes.map((c) => c.id)).toEqual(["conta-beta"]);
  });
});
