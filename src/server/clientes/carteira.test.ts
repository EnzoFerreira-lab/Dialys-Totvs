// "Excluir cliente": apaga de vez as reuniões do cliente e o que derivou delas; compromissos ficam.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inicioDaSemana, paraInstante, somarDias } from "@/lib/fuso";
import { transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { executarFerramenta } from "../assistente/ferramentas";
import { COOKIE_SESSAO, criarTokenSessao } from "../auth/sessao";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { lerBanco, transacao } from "../db/banco";
import { listarInsights, removerTranscricao } from "../db/repositorio";
import { listarReunioesCentral } from "../insights/contas";
import { montarResumo } from "../insights/resumo";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar, receberReuniao } from "../pipeline/processar-reuniao";
import { listarClientes } from "./clientes";
import { listarClientesUnificados, montarPerfilCliente } from "./perfil";

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

// Envio sem chave do Claude: o motor de teste, sem a espera das regras locais.
vi.mock("../pipeline/motor-analise", async (original) => {
  const modulo = await original<typeof import("../pipeline/motor-analise")>();
  const { motorFalso: falso } = await import("../pipeline/__fixtures__/motor-falso");
  return { ...modulo, escolherMotor: () => falso() };
});

const { DELETE: remover } = await import("@/app/api/v1/carteira/[contaId]/route");
const { POST: processar } = await import("@/app/api/v1/reunioes/processar/route");
const { POST: criarCompromisso } = await import("@/app/api/v1/agenda/route");
const { PATCH: alterarCompromisso } = await import("@/app/api/v1/agenda/[id]/route");

const BASE = "http://localhost:3000/api/v1";
const FUSO = "America/Sao_Paulo";
const RICARDO = USUARIOS[0];
const RESTRITO: Usuario = { id: "usr_teste_restrito_carteira", nome: "Vendedor", email: "v@t.br", papel: "vendedor", escopo: { tipo: "contas", contaIds: ["conta-beta"] } };

const cabecalhos = (usuario?: Usuario): Record<string, string> => ({
  "content-type": "application/json",
  ...(usuario ? { cookie: `${COOKIE_SESSAO}=${encodeURIComponent(criarTokenSessao(usuario.id))}` } : {}),
});
const params = (contaId: string) => ({ params: Promise.resolve({ contaId }) });
const removerDe = (usuario: Usuario | undefined, contaId: string) =>
  remover(new Request(`${BASE}/carteira/${contaId}`, { method: "DELETE", headers: cabecalhos(usuario) }), params(contaId));
const enviar = (usuario: Usuario | undefined, corpo: unknown) =>
  processar(new Request(`${BASE}/reunioes/processar?modo=sincrono`, { method: "POST", headers: cabecalhos(usuario), body: JSON.stringify(corpo) }));
const ids = async (usuario: Usuario) => (await listarClientes(usuario, { limite: 100 })).clientes.map((c) => c.id);

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
const futuro = (hora: string) => paraInstante(somarDias(inicioDaSemana(hoje()), 16), hora, FUSO).toISOString();
const reuniao = (contaId: string, contaNome: string, data: string) =>
  receberEProcessar({ conteudo: { tipo: "texto", texto: transcricaoTeste() }, contaId, contaNome, contexto: { data } }, { motor: motorFalso() });

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-carteira-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  USUARIOS.push(RESTRITO);
  await reuniao("conta-horizonte", "Grupo Horizonte", "2026-09-01 10:00:00");
  await reuniao("conta-horizonte", "Grupo Horizonte", "2026-10-07 15:30:00");
  await reuniao("conta-beta", "Beta Indústria", "2026-10-01 09:00:00");
});
afterEach(async () => {
  USUARIOS.splice(USUARIOS.indexOf(RESTRITO), 1);
  delete process.env.DIALYS_BANCO_ARQUIVO;
  await rm(pasta, { recursive: true, force: true });
});

const daConta = async (contaId: string) => (await lerBanco()).reuniao.filter((r) => r.contaId === contaId);

describe("excluir cliente", () => {
  it("apaga as reuniões do cliente e tudo o que derivou delas, para todos; repetir dá 404", async () => {
    const reunioes = (await daConta("conta-horizonte")).map((r) => r.id);
    expect((await removerDe(undefined, "conta-horizonte")).status).toBe(401);
    const resposta = await removerDe(RICARDO, "conta-horizonte");
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ excluido: true, cliente: { id: "conta-horizonte", nome: "Grupo Horizonte" }, reunioesExcluidas: 2 });

    expect(await ids(RICARDO)).toEqual(["conta-beta"]);
    expect((await listarInsights()).every((i) => i.reuniao.contaId === "conta-beta")).toBe(true);
    expect((await listarReunioesCentral()).map((r) => r.conta.id)).toEqual(["conta-beta"]);
    expect((await montarResumo()).kpis).toMatchObject({ reunioesAnalisadas: 1, contasAnalisadas: 1 });
    const consulta = await executarFerramenta({ usuario: RICARDO, agora: new Date() }, "consultar_empresa", { nome: "Horizonte" });
    expect(consulta.dados.empresas).toEqual([]);
    expect(await montarPerfilCliente(RICARDO, "conta-horizonte")).toBeNull();

    // Apagado de verdade: nada do cliente fica no banco.
    const banco = await lerBanco();
    expect(banco.reuniao.some((r) => reunioes.includes(r.id))).toBe(false);
    expect([...banco.analise, ...banco.sinal, ...banco.mencao_produto].some((x) => reunioes.includes(x.reuniaoId))).toBe(false);
    expect(banco.carteira_remocao).toEqual([]);

    // Já excluído ou inexistente: mesma resposta.
    expect((await removerDe(RICARDO, "conta-horizonte")).status).toBe(404);
    expect((await removerDe(RICARDO, "nao-existe")).status).toBe(404);
  });

  it("fora do escopo do usuário: 404 e nada é apagado", async () => {
    expect((await removerDe(RESTRITO, "conta-horizonte")).status).toBe(404);
    expect(await daConta("conta-horizonte")).toHaveLength(2);
  });

  it("cliente só com reuniões sem transcrição ativa também pode ser excluído", async () => {
    const [beta] = await daConta("conta-beta");
    await removerTranscricao(beta.id, RICARDO.id);
    expect((await listarReunioesCentral()).some((r) => r.conta.id === "conta-beta" && r.transcricaoRemovidaEm)).toBe(true);

    const resposta = await removerDe(RICARDO, "conta-beta");
    expect(await resposta.json()).toMatchObject({ cliente: { id: "conta-beta", nome: "Beta Indústria" }, reunioesExcluidas: 1 });
    expect((await listarReunioesCentral()).some((r) => r.conta.id === "conta-beta")).toBe(false);
    expect((await listarClientesUnificados(RICARDO)).map((c) => c.id)).not.toContain("conta-beta");
  });

  it("reunião nova de um cliente excluído começa um histórico novo, só com ela", async () => {
    await removerDe(RICARDO, "conta-horizonte");
    expect((await enviar(RICARDO, { texto: transcricaoTeste(), contaId: "conta-horizonte", contaNome: "Grupo Horizonte" })).status).toBe(201);
    expect((await listarClientesUnificados(RICARDO)).find((c) => c.id === "conta-horizonte")?.totalReunioes).toBe(1);
    expect((await listarReunioesCentral()).filter((r) => r.conta.id === "conta-horizonte")).toHaveLength(1);
  });

  it("recusa (409) enquanto uma reunião do cliente está em análise, sem apagar nada", async () => {
    await receberReuniao({ conteudo: { tipo: "texto", texto: transcricaoTeste() }, contaId: "conta-horizonte", contaNome: "Grupo Horizonte" });
    const resposta = await removerDe(RICARDO, "conta-horizonte");
    expect(resposta.status).toBe(409);
    expect((await resposta.json()).erro.codigo).toBe("REUNIAO_EM_PROCESSAMENTO");
    expect(await daConta("conta-horizonte")).toHaveLength(3);
  });

  it("remoção da versão antiga (lógica) é convertida: sai o que existia na remoção, fica o que veio depois", async () => {
    const [primeira, segunda] = await daConta("conta-horizonte");
    const [beta] = await daConta("conta-beta");
    // Estado gravado pela versão antiga: marcas "cliente_removido" e registros em carteira_remocao.
    await transacao((banco) => {
      for (const r of banco.reuniao) {
        if (r.id === primeira.id || r.id === segunda.id) r.transcricaoRemovida = { em: r.criadaEm, usuarioId: RICARDO.id, motivo: "cliente_removido" };
        if (r.id === beta.id) r.criadaEm = "2026-01-01T00:00:00.000Z";
      }
      banco.carteira_remocao.push(
        { usuarioId: RICARDO.id, contaId: "conta-horizonte", removidoEm: "2026-01-02T00:00:00.000Z" },
        { usuarioId: RICARDO.id, contaId: "conta-beta", removidoEm: "2026-01-02T00:00:00.000Z" },
      );
    });
    // Reunião enviada depois da remoção (o cliente voltou com ela).
    await reuniao("conta-beta", "Beta Indústria", "2026-10-02 09:00:00");

    const banco = await lerBanco();
    expect(banco.carteira_remocao).toEqual([]);
    expect(banco.reuniao.filter((r) => r.contaId === "conta-horizonte")).toEqual([]);
    expect(banco.reuniao.filter((r) => r.contaId === "conta-beta").map((r) => r.contexto?.data)).toEqual(["2026-10-02 09:00:00"]);
    expect(banco.analise.some((a) => [primeira.id, segunda.id, beta.id].includes(a.reuniaoId))).toBe(false);
  });

  it("compromissos com o cliente continuam com o nome dele e podem ser editados; novos com ele são recusados", async () => {
    const criado = await (
      await criarCompromisso(
        new Request(`${BASE}/agenda`, { method: "POST", headers: cabecalhos(RICARDO), body: JSON.stringify({ titulo: "Visita", contaId: "conta-horizonte", inicio: futuro("10:00"), fim: futuro("11:00") }) }),
      )
    ).json();
    await removerDe(RICARDO, "conta-horizonte");

    const editado = await alterarCompromisso(
      new Request(`${BASE}/agenda/${criado.id}`, { method: "PATCH", headers: cabecalhos(RICARDO), body: JSON.stringify({ titulo: "Visita remarcada", contaId: "conta-horizonte" }) }),
      { params: Promise.resolve({ id: criado.id }) },
    );
    expect(editado.status).toBe(200);
    expect(await editado.json()).toMatchObject({ titulo: "Visita remarcada", status: "agendado", cliente: { id: "conta-horizonte", nome: "Grupo Horizonte" } });

    const novo = await criarCompromisso(
      new Request(`${BASE}/agenda`, { method: "POST", headers: cabecalhos(RICARDO), body: JSON.stringify({ titulo: "Outra", contaId: "conta-horizonte", inicio: futuro("14:00"), fim: futuro("15:00") }) }),
    );
    expect((await novo.json()).erro.codigo).toBe("CLIENTE_INVALIDO");
  });
});
