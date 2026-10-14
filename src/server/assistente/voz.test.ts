// Voz do briefing (ElevenLabs) com o fetch simulado: sem rede e sem gastar créditos.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";
import { responderPergunta } from "./assistente";
import { dividirEmBlocos, marcasDoAlinhamento, montarTextoFalado, vozDoBriefing } from "./voz";

const RICARDO = USUARIOS[0];
const OUTRO: Usuario = { id: "usr_teste_outro", nome: "Outra Pessoa", email: "o@t.br", papel: "vendedor", escopo: { tipo: "contas", contaIds: [] } };
const AGORA = new Date("2026-10-07T15:00:00-03:00");
const semIa = { nome: "claude" as const, responder: async () => Promise.reject(new Error("a IA não deveria ser chamada")) };

/** Resposta do ElevenLabs: um "MP3" qualquer e um tempo por caractere (0,05 s cada). */
function respostaTts(texto: string) {
  const tempos = [...texto].map((_, i) => i * 0.05);
  return new Response(
    JSON.stringify({
      audio_base64: Buffer.from("mp3-falso").toString("base64"),
      alignment: { characters: [...texto], character_start_times_seconds: tempos, character_end_times_seconds: tempos.map((t) => t + 0.05) },
    }),
    { status: 200 },
  );
}

let pasta: string;
const fetchOriginal = globalThis.fetch;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-voz-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  process.env.ELEVENLABS_API_KEY = "chave-teste";
  // Reuniões analisadas: o briefing fica longo o bastante para ser gerado em vários blocos.
  const motor = motorFalso();
  for (const [contaId, contaNome, data] of [
    ["conta-grupo-horizonte", "Grupo Horizonte", "2026-10-03 10:00:00"],
    ["conta-horizonte-logistica", "Horizonte Logística", "2026-09-15 14:00:00"],
    ["conta-beta", "Beta Indústria", "2026-08-20 09:00:00"],
  ]) {
    await receberEProcessar({ conteudo: { tipo: "texto", texto: transcricaoTeste() }, contaId, contaNome, contexto: { data } }, { motor }, RICARDO.id);
  }
});
afterEach(async () => {
  globalThis.fetch = fetchOriginal;
  delete process.env.DIALYS_BANCO_ARQUIVO;
  delete process.env.ELEVENLABS_API_KEY;
  await rm(pasta, { recursive: true, force: true });
});

describe("texto falado e marcas", () => {
  it("junta os trechos falados e guarda onde cada um começa", () => {
    const { texto, posicoes } = montarTextoFalado([{ texto: "Bom dia." }, { texto: "às 9h30", fala: "às nove e meia" }]);
    expect(texto).toBe("Bom dia. às nove e meia");
    expect(posicoes).toEqual([0, 9]);
  });

  it("agrupa trechos seguidos em blocos curtos, sem partir um trecho", () => {
    const trechos = ["a".repeat(100), "b".repeat(100), "c".repeat(100), "d".repeat(300)].map((texto) => ({ texto }));
    expect(dividirEmBlocos(trechos, 220).map((b) => b.length)).toEqual([2, 1, 1]);
  });

  it("converte as posições em segundos pelo alinhamento (ou proporcionalmente, se ele não bater)", () => {
    const alinhamento = { characters: [..."abcd"], character_start_times_seconds: [0, 0.5, 1, 1.5], character_end_times_seconds: [0.5, 1, 1.5, 2] };
    expect(marcasDoAlinhamento([0, 2], 4, alinhamento)).toEqual({ inicios: [0, 1], duracao: 2 });
    expect(marcasDoAlinhamento([0, 4], 8, alinhamento)).toEqual({ inicios: [0, 1], duracao: 2 });
  });
});

describe("vozDoBriefing", () => {
  it("gera o MP3 do briefing do próprio usuário, com os tempos, e na segunda vez usa o cache", async () => {
    const briefing = await responderPergunta({ usuario: RICARDO, pergunta: "Briefing do dia", acao: "briefing" }, { motor: semIa, agora: AGORA });
    const fetchFalso = vi.fn<typeof fetch>(async (_url, init) => respostaTts(JSON.parse(String(init?.body)).text));
    globalThis.fetch = fetchFalso;

    const primeira = await vozDoBriefing(RICARDO, briefing.conversaId, briefing.resposta.id);
    const blocos = dividirEmBlocos(briefing.resposta.fala ?? []);
    expect(blocos.length).toBeGreaterThan(1);
    expect(fetchFalso).toHaveBeenCalledTimes(blocos.length);
    // Um MP3 por bloco, juntos na ordem; um tempo por trecho, sempre crescendo.
    expect(primeira.mp3.toString()).toBe("mp3-falso".repeat(blocos.length));
    const { inicios } = primeira.marcas;
    expect(inicios).toHaveLength(briefing.resposta.fala?.length ?? 0);
    expect(inicios[0]).toBe(0);
    expect(inicios.every((t, i) => i === 0 || t > inicios[i - 1])).toBe(true);
    const corpos = fetchFalso.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(String(fetchFalso.mock.calls[0][0])).toContain("/with-timestamps");
    expect(corpos[0]).toMatchObject({ model_id: "eleven_multilingual_v2", language_code: "pt", next_text: corpos[1].text });
    expect(corpos[0].previous_text).toBeUndefined();
    expect(corpos[1].previous_text).toBe(corpos[0].text);

    const segunda = await vozDoBriefing(RICARDO, briefing.conversaId, briefing.resposta.id);
    expect(segunda.marcas).toEqual(primeira.marcas);
    expect(fetchFalso).toHaveBeenCalledTimes(blocos.length);
  });

  it("só gera voz de briefing da conversa do próprio usuário", async () => {
    const briefing = await responderPergunta({ usuario: RICARDO, pergunta: "Briefing do dia", acao: "briefing" }, { motor: semIa, agora: AGORA });
    globalThis.fetch = vi.fn<typeof fetch>(async () => respostaTts("x"));
    await expect(vozDoBriefing(OUTRO, briefing.conversaId, briefing.resposta.id)).rejects.toMatchObject({ codigo: "BRIEFING_NAO_ENCONTRADO", httpStatus: 404 });
    // A pergunta do usuário (não é briefing) também não vira voz.
    await expect(vozDoBriefing(RICARDO, briefing.conversaId, briefing.pergunta.id)).rejects.toMatchObject({ codigo: "BRIEFING_NAO_ENCONTRADO" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("sem chave ou sem créditos, devolve um erro legível", async () => {
    const briefing = await responderPergunta({ usuario: RICARDO, pergunta: "Briefing do dia", acao: "briefing" }, { motor: semIa, agora: AGORA });
    globalThis.fetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ detail: { status: "quota_exceeded" } }), { status: 401 }));
    await expect(vozDoBriefing(RICARDO, briefing.conversaId, briefing.resposta.id)).rejects.toMatchObject({ codigo: "VOZ_SEM_CREDITOS" });
    delete process.env.ELEVENLABS_API_KEY;
    await expect(vozDoBriefing(RICARDO, briefing.conversaId, briefing.resposta.id)).rejects.toMatchObject({ codigo: "VOZ_NAO_CONFIGURADA" });
  });
});
