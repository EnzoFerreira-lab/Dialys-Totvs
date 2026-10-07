// Rotas do assistente: autenticação pela sessão do servidor e posse da conversa.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as lerConversa } from "@/app/api/v1/assistente/conversas/[id]/route";
import { POST as enviar } from "@/app/api/v1/assistente/mensagens/route";
import { TRANSCRICAO_TESTE } from "../ai/__fixtures__/reuniao-teste";
import { COOKIE_SESSAO, criarTokenSessao } from "../auth/sessao";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";

const URL_MSG = "http://localhost:3000/api/v1/assistente/mensagens";
const OUTRO: Usuario = { id: "usr_teste_outro", nome: "Outra Pessoa", email: "o@t.br", papel: "gerente", escopo: { tipo: "carteira_completa" } };

const cookieDe = (usuarioId: string) => `${COOKIE_SESSAO}=${encodeURIComponent(criarTokenSessao(usuarioId))}`;
const post = (corpo: unknown, cookie?: string) =>
  enviar(new Request(URL_MSG, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(corpo) }));
const get = (id: string, cookie?: string) =>
  lerConversa(new Request(`http://localhost:3000/api/v1/assistente/conversas/${id}`, { headers: cookie ? { cookie } : {} }), { params: Promise.resolve({ id }) });

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-rotas-assistente-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  process.env.DIALYS_MODO_DEMO = "true";
  USUARIOS.push(OUTRO);
  await receberEProcessar(
    { conteudo: { tipo: "texto", texto: TRANSCRICAO_TESTE }, contaId: "conta-grupo-horizonte", contaNome: "Grupo Horizonte" },
    { motor: motorFalso() },
  );
});
afterEach(async () => {
  USUARIOS.splice(USUARIOS.indexOf(OUTRO), 1);
  delete process.env.DIALYS_BANCO_ARQUIVO;
  delete process.env.DIALYS_MODO_DEMO;
  await rm(pasta, { recursive: true, force: true });
});

describe("POST /api/v1/assistente/mensagens", () => {
  it("sem sessão ou com cookie adulterado responde 401", async () => {
    expect((await post({ mensagem: "Oi" })).status).toBe(401);
    const adulterado = cookieDe(USUARIOS[0].id).replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect((await post({ mensagem: "Oi" }, adulterado)).status).toBe(401);
  });

  it("com sessão válida responde e devolve a conversa do usuário", async () => {
    const resposta = await post({ mensagem: "Como está o Grupo Horizonte?", idCliente: "teste-0001" }, cookieDe(USUARIOS[0].id));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.conversaId).toMatch(/^cnv_/);
    expect(corpo.resposta).toMatchObject({ papel: "assistente", modo: "demonstracao" });
    expect(corpo.resposta.fontes[0]).toMatchObject({ link: "/insights?conta=conta-grupo-horizonte" });
    // A auditoria interna das consultas não sai para o navegador.
    expect(corpo.resposta.consultas).toBeUndefined();

    const historico = await get(corpo.conversaId, cookieDe(USUARIOS[0].id));
    expect((await historico.json()).mensagens).toHaveLength(2);
  });

  it("pedido inválido responde 400", async () => {
    const cookie = cookieDe(USUARIOS[0].id);
    expect((await post({ mensagem: "   " }, cookie)).status).toBe(400);
    expect((await post({ mensagem: "Oi", conversaId: "qualquer-coisa" }, cookie)).status).toBe(400);
  });

  it("conversa de outro usuário: 404 para ler e para continuar", async () => {
    const corpo = await (await post({ mensagem: "Como está o Grupo Horizonte?" }, cookieDe(USUARIOS[0].id))).json();
    expect((await get(corpo.conversaId, cookieDe(OUTRO.id))).status).toBe(404);
    expect((await post({ mensagem: "E agora?", conversaId: corpo.conversaId }, cookieDe(OUTRO.id))).status).toBe(404);
    expect((await get(corpo.conversaId)).status).toBe(401);
  });
});
