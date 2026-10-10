// Validação do assistente com a API REAL do Nemotron (gratuito, sujeito ao limite diário). Desligada por padrão:
//   OPENROUTER_API_KEY=... DIALYS_TESTE_IA_REAL=1 npx vitest run src/server/assistente/assistente-nemotron-real.test.ts
// Banco temporário com dados controlados; modo empresa em foco. Confere as consultas feitas e que a resposta
// fala da empresa certa, não o texto exato (a resposta varia).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { temChaveNemotron } from "../ai/analisar-reuniao-nemotron";
import { transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { USUARIOS } from "../auth/usuarios";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";
import { responderPergunta } from "./assistente";
import { criarMotorNemotron } from "./motor-nemotron";

const ligado = temChaveNemotron() && Boolean(process.env.DIALYS_TESTE_IA_REAL);

describe.skipIf(!ligado)("assistente com a API real do Nemotron (empresa em foco)", () => {
  let pasta: string;
  beforeAll(async () => {
    pasta = await mkdtemp(path.join(tmpdir(), "dialys-nemotron-real-"));
    process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
    const motor = motorFalso();
    for (const data of ["2026-09-10 10:00:00", "2026-10-03 10:00:00"]) {
      await receberEProcessar(
        { conteudo: { tipo: "texto", texto: transcricaoTeste() }, contaId: "conta-grupo-horizonte", contaNome: "Grupo Horizonte", contexto: { data } },
        { motor },
      );
    }
  });
  afterAll(async () => {
    delete process.env.DIALYS_BANCO_ARQUIVO;
    await rm(pasta, { recursive: true, force: true });
  });

  const perguntar = (pergunta: string, conversaId?: string) =>
    responderPergunta(
      { usuario: USUARIOS[0], pergunta, conversaId, contaEmFoco: "conta-grupo-horizonte" },
      { motor: criarMotorNemotron(), agora: new Date("2026-10-07T15:00:00-03:00") },
    );

  it("avalia a empresa em foco e depois explica um insight na mesma conversa", { timeout: 240_000 }, async () => {
    const avaliacao = await perguntar("Avalie a empresa em geral.");
    console.info("[nemotron real] avaliação:", avaliacao.resposta.consultas?.map((c) => c.ferramenta), "\n", avaliacao.resposta.texto);
    expect(avaliacao.resposta.modo).toBe("nemotron");
    expect(avaliacao.resposta.consultas?.some((c) => c.ferramenta === "avaliar_empresa")).toBe(true);
    expect(avaliacao.resposta.texto).toMatch(/Horizonte/);

    const explicacao = await perguntar("Explique o insight mais crítico.", avaliacao.conversaId);
    console.info("[nemotron real] explicação:", explicacao.resposta.consultas?.map((c) => c.ferramenta), "\n", explicacao.resposta.texto);
    expect(explicacao.resposta.consultas?.some((c) => c.ferramenta === "explicar_insight")).toBe(true);
    expect(explicacao.resposta.texto).toMatch(/Senior/);
  });
});
