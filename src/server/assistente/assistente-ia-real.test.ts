// Validação com a API REAL do Claude (gasta créditos). Desligada por padrão; para rodar:
//   ANTHROPIC_API_KEY=... DIALYS_TESTE_IA_REAL=1 npx vitest run src/server/assistente/assistente-ia-real.test.ts
// Usa um banco temporário com dados controlados: verifica que o modelo consulta, cita a empresa e
// mantém o contexto na pergunta seguinte. Não confere texto exato (a resposta varia).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { USUARIOS } from "../auth/usuarios";
import { lerBanco } from "../db/banco";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";
import { responderPergunta } from "./assistente";
import { criarMotorClaude } from "./motor-claude";

const ligado = Boolean(process.env.ANTHROPIC_API_KEY && process.env.DIALYS_TESTE_IA_REAL);

describe.skipIf(!ligado)("assistente com a API real do Claude", () => {
  let pasta: string;
  beforeAll(async () => {
    pasta = await mkdtemp(path.join(tmpdir(), "dialys-ia-real-"));
    process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
    await receberEProcessar(
      { conteudo: { tipo: "texto", texto: transcricaoTeste() }, contaId: "conta-grupo-horizonte", contaNome: "Grupo Horizonte", contexto: { data: "2026-10-03 10:00:00" } },
      { motor: motorFalso() },
    );
  });
  afterAll(async () => {
    delete process.env.DIALYS_BANCO_ARQUIVO;
    await rm(pasta, { recursive: true, force: true });
  });

  it("consulta o banco, cita a empresa e mantém o contexto", async () => {
    const motor = criarMotorClaude();
    const primeira = await responderPergunta({ usuario: USUARIOS[0], pergunta: "Como está o Grupo Horizonte?" }, { motor });
    expect(primeira.resposta.modo).toBe("claude");
    expect(primeira.resposta.texto).toMatch(/Horizonte/);
    expect(primeira.resposta.consultas?.length).toBeGreaterThan(0);

    const segunda = await responderPergunta({ usuario: USUARIOS[0], pergunta: "Qual ação devo priorizar?", conversaId: primeira.conversaId }, { motor });
    expect(segunda.resposta.texto.length).toBeGreaterThan(20);
    const conversa = (await lerBanco()).conversa_assistente[0];
    console.info("[ia-real] consultas:", conversa.mensagens.filter((m) => m.consultas).map((m) => m.consultas?.map((x) => x.ferramenta)));
    console.info("[ia-real] respostas:", primeira.resposta.texto, "\n---\n", segunda.resposta.texto);
  }, 180_000);
});
