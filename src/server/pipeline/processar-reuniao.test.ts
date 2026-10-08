import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSCRICAO_TESTE } from "../ai/__fixtures__/reuniao-teste";
import { ErroAnalise } from "../ai/analisar-reuniao";
import { lerBanco } from "../db/banco";
import { listarInsights } from "../db/repositorio";
import { CITACAO_INVENTADA, motorFalso } from "./__fixtures__/motor-falso";
import { lerEntrada } from "../api/entrada-reuniao";
import { ErroEntrada, agendarProcessamento, consultarReuniao, receberEProcessar, receberReuniao, type EntradaReuniao } from "./processar-reuniao";

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-pipeline-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
});
afterEach(async () => {
  delete process.env.DIALYS_BANCO_ARQUIVO;
  await rm(pasta, { recursive: true, force: true });
});

const texto = (t: string, extra: Partial<EntradaReuniao> = {}): EntradaReuniao => ({ conteudo: { tipo: "texto", texto: t }, ...extra });

describe("pipeline processarReuniao", () => {
  it("texto percorre as 4 etapas e grava reunião, análise, sinais e menções", async () => {
    const reuniao = await receberEProcessar(texto(TRANSCRICAO_TESTE, { contaId: "c-001" }), { motor: motorFalso() });

    expect(reuniao.status).toBe("CONCLUIDA");
    expect(reuniao.etapas.map((e) => [e.nome, e.status])).toEqual([
      ["RECEBIMENTO", "CONCLUIDA"],
      ["ANALISE_IA", "CONCLUIDA"],
      ["VALIDACAO_EVIDENCIAS", "CONCLUIDA"],
      ["PERSISTENCIA", "CONCLUIDA"],
    ]);

    const banco = await lerBanco();
    expect(banco.reuniao).toHaveLength(1);
    expect(banco.analise).toHaveLength(1);
    expect(banco.mencao_produto).toHaveLength(2);
    // A citação inventada não passa da validação de evidências.
    expect(banco.sinal.map((s) => s.tipo)).toEqual(["CHURN_RISK", "OPPORTUNITY"]);
    expect(banco.sinal.some((s) => s.citacaoExata === CITACAO_INVENTADA)).toBe(false);
    expect(banco.analise[0].evidencias.metricas).toMatchObject({ total: 3, validos: 2, descartados: 1 });

    // Posições recalculadas apontam para o texto gravado.
    for (const sinal of banco.sinal) {
      expect(reuniao.transcricao!.slice(sinal.posicaoCaracterStart, sinal.posicaoCaracterEnd)).toBe(sinal.citacaoExata);
    }
  });

  it("falha na análise fica registrada na etapa e na reunião", async () => {
    const reuniao = await receberEProcessar(texto(TRANSCRICAO_TESTE), {
      motor: motorFalso(async () => {
        throw new ErroAnalise("recusa", "recusou");
      }),
    });

    expect(reuniao.status).toBe("FALHOU");
    expect(reuniao.falha).toMatchObject({ codigo: "ANALISE_RECUSADA", httpStatus: 422 });
    expect(reuniao.etapas.find((e) => e.nome === "ANALISE_IA")?.status).toBe("FALHOU");
    expect((await lerBanco()).sinal).toHaveLength(0);
    expect(await listarInsights()).toHaveLength(0);
  });

  it("entrada inválida é recusada sem gravar nada", async () => {
    await expect(receberReuniao(texto("curto"))).rejects.toMatchObject({ codigo: "TRANSCRICAO_VAZIA", httpStatus: 400 });
    await expect(receberReuniao(texto(TRANSCRICAO_TESTE, { contaId: "conta inválida!" }))).rejects.toBeInstanceOf(ErroEntrada);
    expect((await lerBanco()).reuniao).toHaveLength(0);
  });

  it("áudio não é aceito pela API", async () => {
    const formulario = new FormData();
    formulario.set("arquivo", new File([new Uint8Array(8)], "reuniao.mp3", { type: "audio/mpeg" }));
    const request = new Request("http://localhost/api/v1/reunioes/processar", { method: "POST", body: formulario });
    await expect(lerEntrada(request)).rejects.toMatchObject({ codigo: "AUDIO_NAO_ACEITO", httpStatus: 415 });
  });
});

describe("reunião parada no meio (servidor reiniciado ou after() que não rodou)", () => {
  it("a consulta retoma a análise a partir do texto gravado, sem esperar o limite", async () => {
    // Recebida, mas nunca processada neste processo (como depois de um reinício).
    const recebida = await receberReuniao(texto(TRANSCRICAO_TESTE));
    const consultada = await consultarReuniao(recebida.id, { motor: motorFalso() });
    expect(consultada).toMatchObject({ status: "EM_PROCESSAMENTO", retomadas: 1 });
    await vi.waitFor(async () => expect((await lerBanco()).reuniao[0].status).toBe("CONCLUIDA"));
    expect((await lerBanco()).sinal).toHaveLength(2);
  });

  it("recém-agendada não é retomada; depois de 2 retomadas sem sucesso, falha", async () => {
    const recebida = await receberReuniao(texto(TRANSCRICAO_TESTE));
    agendarProcessamento(recebida.id);
    expect(await consultarReuniao(recebida.id)).toMatchObject({ status: "EM_PROCESSAMENTO" });
    expect((await lerBanco()).reuniao[0].retomadas).toBeUndefined();

    // Motor que nunca termina: as retomadas se esgotam.
    const travado = motorFalso(() => new Promise(() => {}));
    const outra = await receberReuniao(texto(TRANSCRICAO_TESTE));
    const banco = () => lerBanco().then((b) => b.reuniao.find((r) => r.id === outra.id)!);
    await consultarReuniao(outra.id, { motor: travado });
    // Simula o processo morto: some do registro em execução.
    const execucoes = (globalThis as unknown as Record<symbol, Map<string, unknown>>)[Symbol.for("dialys.pipeline.execucoes")];
    execucoes.delete(outra.id);
    await consultarReuniao(outra.id, { motor: travado });
    execucoes.delete(outra.id);
    expect((await banco()).retomadas).toBe(2);
    const final = await consultarReuniao(outra.id, { motor: travado });
    expect(final).toMatchObject({ status: "FALHOU", falha: { codigo: "PROCESSAMENTO_INTERROMPIDO" } });
  });
});
