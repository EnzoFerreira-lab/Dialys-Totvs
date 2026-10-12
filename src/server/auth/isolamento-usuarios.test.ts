// Contas de usuário e separação dos dados: cadastro, login com senha, recuperação gravando a senha nova,
// cada usuário só enxergando as próprias reuniões e o proxy protegendo as telas.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { autenticar, buscarUsuario, criarUsuario, definirSenha, SENHA_DEMONSTRACAO_PADRAO } from "./cadastro";
import { COOKIE_SESSAO, criarTokenSessao } from "./sessao";
import { ID_USUARIO_DEMONSTRACAO, type Usuario } from "./usuarios";

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarefa: () => Promise<unknown>) => void tarefa(),
  connection: async () => {},
}));
vi.mock("../pipeline/motor-analise", async (original) => {
  const modulo = await original<typeof import("../pipeline/motor-analise")>();
  return { ...modulo, escolherMotor: () => motorFalso() };
});

const { POST: processar } = await import("@/app/api/v1/reunioes/processar/route");
const { GET: consultar } = await import("@/app/api/v1/reunioes/[id]/route");
const { GET: insights } = await import("@/app/api/v1/insights/route");
const { GET: resumo } = await import("@/app/api/v1/resumo/route");
const { GET: clientes } = await import("@/app/api/v1/clientes/route");
const { proxy } = await import("@/proxy");

const BASE = "http://localhost:3000/api/v1";
const cookieDe = (usuarioId: string) => `${COOKIE_SESSAO}=${encodeURIComponent(criarTokenSessao(usuarioId))}`;
const comSessao = (usuarioId: string, extra: Record<string, string> = {}) => ({ headers: { cookie: cookieDe(usuarioId), ...extra } });

const enviar = (usuarioId: string, contaNome = "Grupo Horizonte", texto = transcricaoTeste()) =>
  processar(
    new Request(`${BASE}/reunioes/processar?modo=sincrono`, {
      method: "POST",
      ...comSessao(usuarioId, { "content-type": "application/json" }),
      body: JSON.stringify({ texto, contaNome }),
    }),
  );

const NOVO = { nome: "Ana Souza", email: "Ana.Souza@Empresa.com.br", papel: "gerente", senha: "senhaSegura1", confirmacao: "senhaSegura1" };

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-usuarios-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
});
afterEach(async () => {
  delete process.env.DIALYS_BANCO_ARQUIVO;
  await rm(pasta, { recursive: true, force: true });
});

async function novoUsuario(dados = NOVO): Promise<Usuario> {
  const resposta = await criarUsuario(dados);
  if (!resposta.ok) throw new Error(resposta.erro);
  return resposta.usuario;
}

describe("cadastro e login", () => {
  it("cria a conta, guarda só o hash da senha e entra com e-mail em qualquer caixa", async () => {
    const ana = await novoUsuario();
    expect(ana).toMatchObject({ nome: "Ana Souza", email: "ana.souza@empresa.com.br", papel: "gerente", escopo: { tipo: "carteira_completa" } });
    expect(ana).not.toHaveProperty("senhaHash");
    expect(await buscarUsuario(ana.id)).toEqual(ana);

    expect(await autenticar("ANA.SOUZA@empresa.com.br", "senhaSegura1")).toEqual(ana);
    expect(await autenticar("ana.souza@empresa.com.br", "senhaErrada1")).toBeNull();
    expect(await autenticar("ninguem@empresa.com.br", "senhaSegura1")).toBeNull();
  });

  it("valida os campos e não aceita e-mail repetido (nem o da persona)", async () => {
    expect(await criarUsuario({ ...NOVO, nome: "A" })).toMatchObject({ ok: false, campo: "nome" });
    expect(await criarUsuario({ ...NOVO, email: "sem-arroba" })).toMatchObject({ ok: false, campo: "email" });
    expect(await criarUsuario({ ...NOVO, papel: "admin" })).toMatchObject({ ok: false, campo: "papel" });
    expect(await criarUsuario({ ...NOVO, senha: "curta1", confirmacao: "curta1" })).toMatchObject({ ok: false, campo: "senha" });
    expect(await criarUsuario({ ...NOVO, confirmacao: "outraSenha1" })).toMatchObject({ ok: false, campo: "confirmacao" });

    await novoUsuario();
    expect(await criarUsuario({ ...NOVO, email: "ana.souza@empresa.com.br" })).toMatchObject({ ok: false, campo: "email" });
    expect(await criarUsuario({ ...NOVO, email: "ricardo.alves@totvs.com.br" })).toMatchObject({ ok: false, campo: "email" });
  });

  it("a persona entra com a senha de demonstração até a senha ser redefinida", async () => {
    expect((await autenticar("ricardo.alves@totvs.com.br", SENHA_DEMONSTRACAO_PADRAO))?.id).toBe(ID_USUARIO_DEMONSTRACAO);
    expect(await autenticar("ricardo.alves@totvs.com.br", "qualquerCoisa1")).toBeNull();

    expect(await definirSenha("ricardo.alves@totvs.com.br", "novaSenha123")).toBe(true);
    expect(await autenticar("ricardo.alves@totvs.com.br", SENHA_DEMONSTRACAO_PADRAO)).toBeNull();
    expect((await autenticar("ricardo.alves@totvs.com.br", "novaSenha123"))?.id).toBe(ID_USUARIO_DEMONSTRACAO);

    // E-mail sem conta: nada é criado.
    expect(await definirSenha("ninguem@empresa.com.br", "novaSenha123")).toBe(false);
    expect(await autenticar("ninguem@empresa.com.br", "novaSenha123")).toBeNull();
  });

  it("recuperação grava a senha nova da conta cadastrada", async () => {
    await novoUsuario();
    expect(await definirSenha("ana.souza@empresa.com.br", "trocada2026")).toBe(true);
    expect(await autenticar("ana.souza@empresa.com.br", "senhaSegura1")).toBeNull();
    expect(await autenticar("ana.souza@empresa.com.br", "trocada2026")).not.toBeNull();
  });
});

describe("cada usuário só vê os próprios dados", () => {
  it("conta nova começa vazia e não enxerga as reuniões de outro usuário", async () => {
    const ana = await novoUsuario();
    const doRicardo = await (await enviar(ID_USUARIO_DEMONSTRACAO)).json();
    expect(doRicardo).toMatchObject({ status: "CONCLUIDA", codigo: "Reunião 001" });

    const resumoAna = await (await resumo(new Request(`${BASE}/resumo`, comSessao(ana.id)))).json();
    expect(resumoAna.kpis).toMatchObject({ reunioesAnalisadas: 0, contasAnalisadas: 0 });
    expect((await (await insights(new NextRequest(`${BASE}/insights`, comSessao(ana.id)))).json()).paginacao.total).toBe(0);
    expect((await (await clientes(new Request(`${BASE}/clientes`, comSessao(ana.id)))).json()).paginacao.total).toBe(0);
    const id = doRicardo.id as string;
    expect((await consultar(new Request(`${BASE}/reunioes/${id}`, comSessao(ana.id)), { params: Promise.resolve({ id }) })).status).toBe(404);

    // O Ricardo continua vendo tudo o que é dele.
    const resumoRicardo = await (await resumo(new Request(`${BASE}/resumo`, comSessao(ID_USUARIO_DEMONSTRACAO)))).json();
    expect(resumoRicardo.kpis).toMatchObject({ reunioesAnalisadas: 1, contasAnalisadas: 1 });
  });

  it("a mesma reunião pode ser enviada por usuários diferentes, cada um com a própria numeração", async () => {
    const ana = await novoUsuario();
    const texto = transcricaoTeste();
    await enviar(ID_USUARIO_DEMONSTRACAO, "Grupo Horizonte", texto);
    // Para o mesmo usuário, a mesma reunião é duplicada.
    expect((await enviar(ID_USUARIO_DEMONSTRACAO, "Beta Indústria", texto)).status).toBe(409);

    const daAna = await enviar(ana.id, "Grupo Horizonte", texto);
    expect(daAna.status).toBe(201);
    expect(await daAna.json()).toMatchObject({ codigo: "Reunião 001" });
    const clientesAna = await (await clientes(new Request(`${BASE}/clientes`, comSessao(ana.id)))).json();
    expect(clientesAna.dados.map((c: { nome: string }) => c.nome)).toEqual(["Grupo Horizonte"]);
  });
});

describe("proxy", () => {
  const pedir = (caminho: string, usuarioId?: string) =>
    proxy(new NextRequest(`http://localhost:3000${caminho}`, usuarioId ? { headers: { cookie: cookieDe(usuarioId) } } : {}));

  it("sem sessão, as telas vão para o login guardando o destino", () => {
    const resposta = pedir("/dashboard?filtro=churn");
    expect(resposta.status).toBe(307);
    const destino = new URL(resposta.headers.get("location")!);
    expect(destino.pathname).toBe("/login");
    expect(destino.searchParams.get("volta")).toBe("/dashboard?filtro=churn");
    expect(new URL(pedir("/").headers.get("location")!).pathname).toBe("/login");
  });

  it("com sessão, a tela abre e a raiz leva à Home; cookie adulterado conta como sem sessão", () => {
    expect(pedir("/envio", ID_USUARIO_DEMONSTRACAO).headers.get("location")).toBeNull();
    expect(new URL(pedir("/", ID_USUARIO_DEMONSTRACAO).headers.get("location")!).pathname).toBe("/clientes");

    const adulterado = new NextRequest("http://localhost:3000/envio", {
      headers: { cookie: cookieDe(ID_USUARIO_DEMONSTRACAO).replace(/.$/, (c) => (c === "A" ? "B" : "A")) },
    });
    expect(new URL(proxy(adulterado).headers.get("location")!).pathname).toBe("/login");
  });
});
