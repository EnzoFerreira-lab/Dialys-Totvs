// Agenda da Home: tabela compromisso do banco, validação, posse e permissões (pelas rotas da API).
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inicioDaSemana, paraInstante, somarDias } from "@/lib/fuso";
import { COOKIE_SESSAO, criarTokenSessao } from "../auth/sessao";
import { TRANSCRICAO_TESTE } from "../ai/__fixtures__/reuniao-teste";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

const { GET: listar, POST: criar } = await import("@/app/api/v1/agenda/route");
const { GET: ler, PATCH: alterar } = await import("@/app/api/v1/agenda/[id]/route");
const { GET: clientes } = await import("@/app/api/v1/clientes/route");

const BASE = "http://localhost:3000/api/v1";
const FUSO = "America/Sao_Paulo";
const RESTRITO: Usuario = { id: "usr_teste_restrito", nome: "Vendedor Teste", email: "v@t.br", papel: "vendedor", escopo: { tipo: "contas", contaIds: ["c-003"] } };
const RICARDO = USUARIOS[0];

const cookieDe = (usuario: Usuario) => `${COOKIE_SESSAO}=${encodeURIComponent(criarTokenSessao(usuario.id))}`;
const cabecalhos = (usuario?: Usuario): Record<string, string> => ({ "content-type": "application/json", ...(usuario ? { cookie: cookieDe(usuario) } : {}) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const getAgenda = (usuario: Usuario | undefined, query = "") => listar(new Request(`${BASE}/agenda${query}`, { headers: cabecalhos(usuario) }));
const postAgenda = (usuario: Usuario | undefined, corpo: unknown) =>
  criar(new Request(`${BASE}/agenda`, { method: "POST", headers: cabecalhos(usuario), body: JSON.stringify(corpo) }));
const patchAgenda = (usuario: Usuario, id: string, corpo: unknown) =>
  alterar(new Request(`${BASE}/agenda/${id}`, { method: "PATCH", headers: cabecalhos(usuario), body: JSON.stringify(corpo) }), params(id));

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
/** Um dia útil daqui a duas semanas, às `hora` de São Paulo. */
const futuro = (hora: string) => paraInstante(somarDias(inicioDaSemana(hoje()), 16), hora, FUSO).toISOString();
const semanaAtual = () => `?de=${inicioDaSemana(hoje())}&ate=${somarDias(inicioDaSemana(hoje()), 6)}`;

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-agenda-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  USUARIOS.push(RESTRITO);
  // Os clientes da carteira são as contas com reunião analisada.
  for (const [contaId, contaNome] of [
    ["c-001", "Metalúrgica Vale Forte"],
    ["c-002", "Rede Bom Preço Supermercados"],
    ["c-003", "Clínica Santa Aurora"],
  ]) {
    await receberEProcessar({ conteudo: { tipo: "texto", texto: TRANSCRICAO_TESTE }, contaId, contaNome }, { motor: motorFalso() });
  }
});
afterEach(async () => {
  USUARIOS.splice(USUARIOS.indexOf(RESTRITO), 1);
  delete process.env.DIALYS_BANCO_ARQUIVO;
  delete process.env.DIALYS_FUSO_HORARIO;
  await rm(pasta, { recursive: true, force: true });
});

describe("/api/v1/agenda", () => {
  it("sem sessão responde 401", async () => {
    expect((await getAgenda(undefined)).status).toBe(401);
    expect((await postAgenda(undefined, { titulo: "x" })).status).toBe(401);
  });

  it("começa vazia, grava na tabela compromisso do banco e isola por usuário", async () => {
    const vazia = await (await getAgenda(RICARDO, semanaAtual())).json();
    expect(vazia).toMatchObject({ fuso: FUSO, hoje: hoje(), dados: [] });
    expect(vazia).not.toHaveProperty("modo");

    const { id } = await (await postAgenda(RICARDO, { titulo: "Interno", inicio: futuro("10:00"), fim: futuro("11:00") })).json();
    const banco = JSON.parse(await readFile(path.join(pasta, "banco.json"), "utf8"));
    expect(banco.compromisso).toEqual([expect.objectContaining({ id, usuarioId: RICARDO.id, titulo: "Interno", origem: "usuario" })]);

    // Outro usuário não vê nem altera os compromissos de Ricardo.
    expect((await ler(new Request(`${BASE}/agenda/${id}`, { headers: cabecalhos(RESTRITO) }), params(id))).status).toBe(404);
    expect((await patchAgenda(RESTRITO, id, { status: "cancelado" })).status).toBe(404);
  });

  it("cria, edita, cancela e persiste (o mesmo id em todas as leituras)", async () => {
    const criado = await postAgenda(RICARDO, { titulo: "  Visita de teste ", contaId: "c-002", inicio: futuro("10:00"), fim: futuro("11:00"), observacoes: "Levar proposta" });
    expect(criado.status).toBe(201);
    const compromisso = await criado.json();
    expect(compromisso).toMatchObject({
      id: expect.stringMatching(/^cmp_[0-9a-f]{32}$/),
      titulo: "Visita de teste",
      cliente: { id: "c-002", nome: "Rede Bom Preço Supermercados" },
      status: "agendado",
      origem: "usuario",
    });

    const editado = await (await patchAgenda(RICARDO, compromisso.id, { titulo: "Visita remarcada", inicio: futuro("14:00"), fim: futuro("15:30"), contaId: null })).json();
    expect(editado).toMatchObject({ titulo: "Visita remarcada", cliente: null, inicio: futuro("14:00"), observacoes: "Levar proposta" });
    expect((await (await patchAgenda(RICARDO, compromisso.id, { status: "cancelado" })).json()).status).toBe("cancelado");

    const dia = futuro("00:00").slice(0, 10);
    const relido = await (await getAgenda(RICARDO, `?de=${somarDias(dia, -1)}&ate=${somarDias(dia, 1)}`)).json();
    expect(relido.dados).toEqual([expect.objectContaining({ id: compromisso.id, titulo: "Visita remarcada", status: "cancelado" })]);
  });

  it("valida obrigatórios, término depois do início e mesmo dia", async () => {
    const semTitulo = await postAgenda(RICARDO, { titulo: " ", inicio: futuro("10:00"), fim: futuro("11:00") });
    expect(semTitulo.status).toBe(422);
    expect((await semTitulo.json()).erro.detalhe.campos.titulo).toBe("Informe o título.");

    const invertido = await postAgenda(RICARDO, { titulo: "x", inicio: futuro("11:00"), fim: futuro("10:00") });
    expect((await invertido.json()).erro.detalhe.campos.fim).toBe("O término deve ser depois do início.");
    expect((await postAgenda(RICARDO, { titulo: "x", inicio: futuro("10:00"), fim: futuro("10:00") })).status).toBe(422);
    expect((await postAgenda(RICARDO, { titulo: "x", inicio: futuro("10:00") })).status).toBe(422);
    expect((await postAgenda(RICARDO, { titulo: "x", inicio: "amanhã", fim: futuro("10:00") })).status).toBe(422);

    const atravessa = await postAgenda(RICARDO, { titulo: "x", inicio: futuro("23:00"), fim: paraInstante(somarDias(futuro("12:00").slice(0, 10), 1), "01:00", FUSO).toISOString() });
    expect(atravessa.status).toBe(422);

    // Edição que deixa o término antes do início também é recusada.
    const { id } = await (await postAgenda(RICARDO, { titulo: "x", inicio: futuro("10:00"), fim: futuro("11:00") })).json();
    expect((await patchAgenda(RICARDO, id, { fim: futuro("09:00") })).status).toBe(422);
    expect((await patchAgenda(RICARDO, id, { usuarioId: "outro" })).status).toBe(422);
  });

  it("cliente fora da carteira do usuário é recusado no servidor", async () => {
    const recusado = await postAgenda(RESTRITO, { titulo: "x", contaId: "c-001", inicio: futuro("10:00"), fim: futuro("11:00") });
    expect(recusado.status).toBe(422);
    expect((await recusado.json()).erro.codigo).toBe("CLIENTE_INVALIDO");
    expect((await postAgenda(RESTRITO, { titulo: "x", contaId: "c-003", inicio: futuro("10:00"), fim: futuro("11:00") })).status).toBe(201);
  });

  it("período inválido responde 400", async () => {
    expect((await getAgenda(RICARDO, "?de=2026-13-01")).status).toBe(400);
    expect((await getAgenda(RICARDO, "?de=2026-10-10&ate=2026-10-01")).status).toBe(400);
    expect((await getAgenda(RICARDO, "?de=2026-01-01&ate=2026-12-31")).status).toBe(400);
  });
});

describe("GET /api/v1/clientes", () => {
  const getClientes = (usuario: Usuario | undefined, query = "") => clientes(new Request(`${BASE}/clientes${query}`, { headers: cabecalhos(usuario) }));

  it("lista a carteira (contas analisadas) com paginação, busca sem acento e a situação calculada", async () => {
    expect((await getClientes(undefined)).status).toBe(401);
    const primeira = await (await getClientes(RICARDO, "?limite=2")).json();
    expect(primeira).toMatchObject({ paginacao: { total: 3, limite: 2, offset: 0 } });
    expect(primeira).not.toHaveProperty("modo");
    expect(primeira.dados).toHaveLength(2);
    expect(primeira.dados[0]).toMatchObject({ nome: "Clínica Santa Aurora", situacao: { faixa: expect.any(String) } });

    const busca = await (await getClientes(RICARDO, "?busca=clinica")).json();
    expect(busca.dados.map((c: { nome: string }) => c.nome)).toEqual(["Clínica Santa Aurora"]);
    expect((await getClientes(RICARDO, "?limite=0")).status).toBe(400);
  });

  it("usuário com escopo restrito só vê as contas dele", async () => {
    const corpo = await (await getClientes(RESTRITO)).json();
    expect(corpo.dados.map((c: { id: string }) => c.id)).toEqual(["c-003"]);
  });
});
