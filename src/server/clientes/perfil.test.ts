// Aba Clientes: lista unificada e ficha do cliente (reuniões, alertas, produtos, tendência e agenda).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dataNoFuso, paraInstante, somarDias } from "@/lib/fuso";
import { transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { criarCompromisso } from "../agenda/agenda";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { lerBanco } from "../db/banco";
import { removerTranscricao } from "../db/repositorio";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";
import { listarClientesUnificados, montarPerfilCliente } from "./perfil";

const FUSO = "America/Sao_Paulo";
const RICARDO = USUARIOS[0];
const RESTRITO: Usuario = { id: "usr_teste_restrito_perfil", nome: "Vendedor", email: "v@t.br", papel: "vendedor", escopo: { tipo: "contas", contaIds: ["conta-beta"] } };

const reuniao = (contaId: string, contaNome: string, data: string | null, nps?: number) =>
  receberEProcessar(
    {
      conteudo: { tipo: "texto", texto: transcricaoTeste() },
      contaId,
      contaNome,
      ...(data ? { contexto: { data, ...(nps !== undefined ? { nps } : {}) } } : {}),
    },
    { motor: motorFalso() },
  );
const amanha = (hora: string) => paraInstante(somarDias(dataNoFuso(new Date(), FUSO), 1), hora, FUSO).toISOString();

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-perfil-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  USUARIOS.push(RESTRITO);
  await reuniao("conta-horizonte", "Grupo Horizonte", "2026-09-01 10:00:00", 3);
  await reuniao("conta-horizonte", "Grupo Horizonte", "2026-10-07 15:30:00", 10);
  await reuniao("conta-horizonte", "Grupo Horizonte", null);
  await reuniao("conta-beta", "Beta Indústria", "2026-10-01 09:00:00");
});
afterEach(async () => {
  USUARIOS.splice(USUARIOS.indexOf(RESTRITO), 1);
  delete process.env.DIALYS_BANCO_ARQUIVO;
  await rm(pasta, { recursive: true, force: true });
});

describe("lista unificada de clientes", () => {
  it("um cliente por linha, com reuniões, alertas somados, tendência e o próximo compromisso", async () => {
    await criarCompromisso(RICARDO, { titulo: "Renovação", contaId: "conta-horizonte", inicio: amanha("10:00"), fim: amanha("11:00") });
    const lista = await listarClientesUnificados(RICARDO);
    expect(lista.map((c) => c.nome)).toEqual(["Beta Indústria", "Grupo Horizonte"]);
    const horizonte = lista.find((c) => c.id === "conta-horizonte")!;
    expect(horizonte).toMatchObject({
      totalReunioes: 3,
      // Cada reunião de teste tem 1 churn e 1 oportunidade válidos.
      alertas: { churn: 3, oportunidade: 3, objecao: 0 },
      proximoCompromisso: { titulo: "Renovação" },
      saude: { faixa: expect.any(String) },
    });
    expect(lista.find((c) => c.id === "conta-beta")?.proximoCompromisso).toBeNull();
  });

  it("respeita o escopo do usuário", async () => {
    expect((await listarClientesUnificados(RESTRITO)).map((c) => c.id)).toEqual(["conta-beta"]);
  });
});

describe("ficha do cliente", () => {
  it("reúne reuniões (inclusive sem data e com transcrição removida), alertas, produtos e tendência", async () => {
    const semData = (await lerBanco()).reuniao.find((r) => r.contaId === "conta-horizonte" && !r.contexto)!;
    await removerTranscricao(semData.id, RICARDO.id);

    const perfil = (await montarPerfilCliente(RICARDO, "conta-horizonte"))!;
    expect(perfil).toMatchObject({ nome: "Grupo Horizonte", criticidade: "alta" });
    // A mais recente com data primeiro; a sem data aparece marcada, sem saúde.
    expect(perfil.reunioes.map((r) => [r.data, r.transcricaoRemovida])).toEqual(
      expect.arrayContaining([
        ["2026-10-07", false],
        ["2026-09-01", false],
        [null, true],
      ]),
    );
    expect(perfil.reunioes.find((r) => r.transcricaoRemovida)?.saude).toBeNull();
    // NPS 3 → 10 entre as duas reuniões ativas: a saúde melhorou.
    expect(perfil.tendencia).toBe("melhorou");
    // Alertas das reuniões ativas, churn de criticidade alta primeiro, cada um com a reunião de origem.
    expect(perfil.alertas).toHaveLength(4);
    expect(perfil.alertas[0]).toMatchObject({ tipo: "churn", severidade: "ALTA", reuniao: { codigo: expect.stringMatching(/^Reunião \d{3}$/) } });
    expect(perfil.produtos).toEqual(
      expect.arrayContaining([
        { nome: "TOTVS Protheus", contexto: "em_uso", reunioes: 2 },
        { nome: "Senior Sistemas", contexto: "concorrente", reunioes: 2 },
      ]),
    );
  });

  it("traz a agenda do usuário com o cliente; cliente fora do escopo ou inexistente não abre", async () => {
    await criarCompromisso(RICARDO, { titulo: "Visita", contaId: "conta-horizonte", inicio: amanha("14:00"), fim: amanha("15:00") });
    expect((await montarPerfilCliente(RICARDO, "conta-horizonte"))!.compromissos.map((c) => c.titulo)).toEqual(["Visita"]);
    expect(await montarPerfilCliente(RESTRITO, "conta-horizonte")).toBeNull();
    expect(await montarPerfilCliente(RICARDO, "nao-existe")).toBeNull();
    // O compromisso de Ricardo não aparece para outro usuário, mesmo na ficha de um cliente que ele vê.
    expect((await montarPerfilCliente(RESTRITO, "conta-beta"))!.compromissos).toEqual([]);
  });
});
