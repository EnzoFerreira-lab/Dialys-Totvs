// "Remover cliente": sai só da carteira do usuário; cadastro, histórico, compromissos e outros usuários ficam.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inicioDaSemana, paraInstante, somarDias } from "@/lib/fuso";
import { TRANSCRICAO_TESTE } from "../ai/__fixtures__/reuniao-teste";
import { COOKIE_SESSAO, criarTokenSessao } from "../auth/sessao";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { lerBanco } from "../db/banco";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";
import { listarReunioesCentral } from "../insights/contas";
import { buscarClienteNoCadastro, listarClientes } from "./clientes";

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

const { DELETE: remover, PUT: devolver } = await import("@/app/api/v1/carteira/[contaId]/route");
const { POST: criarCompromisso } = await import("@/app/api/v1/agenda/route");
const { PATCH: alterarCompromisso } = await import("@/app/api/v1/agenda/[id]/route");
const { POST: restaurar } = await import("@/app/api/v1/agenda/demonstracao/route");

const BASE = "http://localhost:3000/api/v1";
const FUSO = "America/Sao_Paulo";
const RICARDO = USUARIOS[0];
const OUTRO: Usuario = { id: "usr_teste_outro_carteira", nome: "Outra Pessoa", email: "o@t.br", papel: "gerente", escopo: { tipo: "carteira_completa" } };
const RESTRITO: Usuario = { id: "usr_teste_restrito_carteira", nome: "Vendedor", email: "v@t.br", papel: "vendedor", escopo: { tipo: "contas", contaIds: ["c-003"] } };

const cabecalhos = (usuario?: Usuario): Record<string, string> => ({
  "content-type": "application/json",
  ...(usuario ? { cookie: `${COOKIE_SESSAO}=${encodeURIComponent(criarTokenSessao(usuario.id))}` } : {}),
});
const params = (contaId: string) => ({ params: Promise.resolve({ contaId }) });
const removerDe = (usuario: Usuario | undefined, contaId: string) =>
  remover(new Request(`${BASE}/carteira/${contaId}`, { method: "DELETE", headers: cabecalhos(usuario) }), params(contaId));
const devolverA = (usuario: Usuario, contaId: string) => devolver(new Request(`${BASE}/carteira/${contaId}`, { method: "PUT", headers: cabecalhos(usuario) }), params(contaId));
const ids = async (usuario: Usuario) => (await listarClientes(usuario, { limite: 100 })).clientes.map((c) => c.id);

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
const futuro = (hora: string) => paraInstante(somarDias(inicioDaSemana(hoje()), 16), hora, FUSO).toISOString();

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-carteira-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  USUARIOS.push(OUTRO, RESTRITO);
});
afterEach(async () => {
  USUARIOS.splice(USUARIOS.indexOf(OUTRO), 2);
  delete process.env.DIALYS_BANCO_ARQUIVO;
  delete process.env.DIALYS_DADOS_DEMONSTRACAO;
  await rm(pasta, { recursive: true, force: true });
});

describe("remover cliente da carteira (demonstração)", () => {
  it("sai só da carteira deste usuário, gravado no arquivo de demonstração; o cadastro continua", async () => {
    expect((await removerDe(undefined, "c-001")).status).toBe(401);
    const resposta = await removerDe(RICARDO, "c-001");
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ removido: true, cliente: { id: "c-001", nome: "Metalúrgica Vale Forte" } });

    expect(await ids(RICARDO)).not.toContain("c-001");
    expect(await ids(OUTRO)).toContain("c-001");
    expect(await buscarClienteNoCadastro(RICARDO, "c-001")).toMatchObject({ nome: "Metalúrgica Vale Forte" });

    const demo = JSON.parse(await readFile(path.join(pasta, "demonstracao.json"), "utf8"));
    expect(demo.carteiras[RICARDO.id].removidos).toEqual([{ contaId: "c-001", removidoEm: expect.any(String) }]);
    // Nada de demonstração no banco real.
    await expect(readFile(path.join(pasta, "banco.json"), "utf8")).rejects.toThrow();

    // De novo: já não está na carteira. Fora do escopo: mesma resposta.
    expect((await removerDe(RICARDO, "c-001")).status).toBe(404);
    expect((await removerDe(RESTRITO, "c-001")).status).toBe(404);
    expect((await removerDe(RICARDO, "nao-existe")).status).toBe(404);

    // Devolver e "Restaurar demonstração" trazem o cliente de volta.
    expect((await devolverA(RICARDO, "c-001")).status).toBe(200);
    expect(await ids(RICARDO)).toContain("c-001");
    await removerDe(RICARDO, "c-002");
    await restaurar(new Request(`${BASE}/agenda/demonstracao`, { method: "POST", headers: cabecalhos(RICARDO) }));
    expect(await ids(RICARDO)).toContain("c-002");
  });

  it("compromissos com o cliente continuam identificando-o e podem ser editados; novos com ele são recusados", async () => {
    const criado = await (
      await criarCompromisso(new Request(`${BASE}/agenda`, { method: "POST", headers: cabecalhos(RICARDO), body: JSON.stringify({ titulo: "Visita", contaId: "c-001", inicio: futuro("10:00"), fim: futuro("11:00") }) }))
    ).json();
    await removerDe(RICARDO, "c-001");

    const editar = (corpo: unknown) =>
      alterarCompromisso(new Request(`${BASE}/agenda/${criado.id}`, { method: "PATCH", headers: cabecalhos(RICARDO), body: JSON.stringify(corpo) }), {
        params: Promise.resolve({ id: criado.id }),
      });
    // O formulário reenvia o cliente atual: não pode falhar só porque ele saiu da carteira.
    const editado = await editar({ titulo: "Visita remarcada", contaId: "c-001" });
    expect(editado.status).toBe(200);
    expect(await editado.json()).toMatchObject({ titulo: "Visita remarcada", status: "agendado", cliente: { id: "c-001", nome: "Metalúrgica Vale Forte" } });

    const novo = await criarCompromisso(
      new Request(`${BASE}/agenda`, { method: "POST", headers: cabecalhos(RICARDO), body: JSON.stringify({ titulo: "Outra", contaId: "c-001", inicio: futuro("14:00"), fim: futuro("15:00") }) }),
    );
    expect((await novo.json()).erro.codigo).toBe("CLIENTE_INVALIDO");
  });
});

describe("remover cliente da carteira (dados reais)", () => {
  it("grava na tabela carteira_remocao e preserva reuniões, transcrições e a Central", async () => {
    process.env.DIALYS_DADOS_DEMONSTRACAO = "false";
    await receberEProcessar(
      { conteudo: { tipo: "texto", texto: TRANSCRICAO_TESTE }, contaId: "conta-horizonte", contaNome: "Grupo Horizonte", contexto: { data: "2026-10-07 10:00:00" } },
      { motor: motorFalso() },
    );
    expect(await ids(RICARDO)).toEqual(["conta-horizonte"]);
    expect((await removerDe(RICARDO, "conta-horizonte")).status).toBe(200);

    expect(await ids(RICARDO)).toEqual([]);
    expect(await ids(OUTRO)).toEqual(["conta-horizonte"]);
    const banco = await lerBanco();
    expect(banco.carteira_remocao).toEqual([{ usuarioId: RICARDO.id, contaId: "conta-horizonte", removidoEm: expect.any(String) }]);
    expect(banco.reuniao[0]).toMatchObject({ contaId: "conta-horizonte", transcricao: TRANSCRICAO_TESTE });
    expect(banco.reuniao[0].transcricaoRemovida).toBeUndefined();
    expect((await listarReunioesCentral()).map((r) => r.conta.id)).toEqual(["conta-horizonte"]);
  });
});
