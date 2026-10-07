import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRANSCRICAO_TESTE } from "../ai/__fixtures__/reuniao-teste";
import { ErroAnalise } from "../ai/analisar-reuniao";
import { lerBanco } from "../db/banco";
import { listarInsights } from "../db/repositorio";
import { CITACAO_INVENTADA, motorFalso } from "./__fixtures__/motor-falso";
import { ErroEntrada, receberEProcessar, receberReuniao, type EntradaReuniao } from "./processar-reuniao";

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
  it("texto percorre as 5 etapas e grava reunião, análise, sinais e menções", async () => {
    const reuniao = await receberEProcessar(texto(TRANSCRICAO_TESTE, { contaId: "c-001" }), { motor: motorFalso() });

    expect(reuniao.status).toBe("CONCLUIDA");
    expect(reuniao.etapas.map((e) => [e.nome, e.status])).toEqual([
      ["RECEBIMENTO", "CONCLUIDA"],
      ["TRANSCRICAO", "PULADA"],
      ["ANALISE_IA", "CONCLUIDA"],
      ["VALIDACAO_EVIDENCIAS", "CONCLUIDA"],
      ["PERSISTENCIA", "CONCLUIDA"],
    ]);

    const banco = await lerBanco();
    expect(banco.reuniao).toHaveLength(1);
    expect(banco.analise).toHaveLength(1);
    expect(banco.mencao_produto).toHaveLength(2);
    // A citação inventada não passa da etapa 4.
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
    await expect(
      receberReuniao({ conteudo: { tipo: "audio", audio: { nomeArquivo: "a.mp3", tipoMime: "audio/mpeg", bytes: new Uint8Array(4) } } }, { stt: null }),
    ).rejects.toMatchObject({ codigo: "STT_NAO_CONFIGURADO", httpStatus: 422 });
    expect((await lerBanco()).reuniao).toHaveLength(0);
  });

  it("áudio passa pela etapa de STT quando há provedor", async () => {
    const stt = { nome: "stt-teste", transcrever: async () => TRANSCRICAO_TESTE };
    const entrada: EntradaReuniao = {
      conteudo: { tipo: "audio", audio: { nomeArquivo: "reuniao.mp3", tipoMime: "audio/mpeg", bytes: new Uint8Array(8) } },
    };
    const reuniao = await receberEProcessar(entrada, { stt, motor: motorFalso() });

    expect(reuniao.status).toBe("CONCLUIDA");
    expect(reuniao.origem).toBe("audio");
    expect(reuniao.transcricao).toBe(TRANSCRICAO_TESTE);
    expect(reuniao.etapas.find((e) => e.nome === "TRANSCRICAO")).toMatchObject({ status: "CONCLUIDA" });
  });
});
