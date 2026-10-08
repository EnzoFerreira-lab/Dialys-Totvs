// "Remover cliente": sai da carteira e os insights dele somem (remoção lógica); compromissos ficam.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inicioDaSemana, paraInstante, somarDias } from "@/lib/fuso";
import { TRANSCRICAO_TESTE } from "../ai/__fixtures__/reuniao-teste";
import { executarFerramenta } from "../assistente/ferramentas";
import { COOKIE_SESSAO, criarTokenSessao } from "../auth/sessao";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { lerBanco } from "../db/banco";
import { listarInsights } from "../db/repositorio";
import { listarReunioesCentral } from "../insights/contas";
import { montarResumo } from "../insights/resumo";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";
import { listarClientes } from "./clientes";

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

const { DELETE: remover, PUT: devolver } = await import("@/app/api/v1/carteira/[contaId]/route");
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
const devolverA = (usuario: Usuario, contaId: string) => devolver(new Request(`${BASE}/carteira/${contaId}`, { method: "PUT", headers: cabecalhos(usuario) }), params(contaId));
const ids = async (usuario: Usuario) => (await listarClientes(usuario, { limite: 100 })).clientes.map((c) => c.id);

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
const futuro = (hora: string) => paraInstante(somarDias(inicioDaSemana(hoje()), 16), hora, FUSO).toISOString();
const reuniao = (contaId: string, contaNome: string, data: string) =>
  receberEProcessar({ conteudo: { tipo: "texto", texto: TRANSCRICAO_TESTE }, contaId, contaNome, contexto: { data } }, { motor: motorFalso() });

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

describe("remover cliente", () => {
  it("tira da carteira e remove os insights dele da Central, do Dashboard e do assistente, sem apagar nada", async () => {
    expect((await removerDe(undefined, "conta-horizonte")).status).toBe(401);
    const resposta = await removerDe(RICARDO, "conta-horizonte");
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ removido: true, cliente: { id: "conta-horizonte", nome: "Grupo Horizonte" }, reunioesComInsightsRemovidos: 2 });

    expect(await ids(RICARDO)).toEqual(["conta-beta"]);
    // Insights: fora das consultas ativas (Dashboard, Central, indicadores e assistente).
    expect((await listarInsights()).every((i) => i.reuniao.contaId === "conta-beta")).toBe(true);
    expect((await listarReunioesCentral()).map((r) => r.conta.id)).toEqual(["conta-beta"]);
    expect((await montarResumo()).kpis).toMatchObject({ reunioesAnalisadas: 1, contasAnalisadas: 1 });
    const consulta = await executarFerramenta({ usuario: RICARDO, agora: new Date() }, "consultar_empresa", { nome: "Horizonte" });
    expect(consulta.dados.empresas).toEqual([]);

    // Remoção lógica: reuniões, transcrições e análises continuam no banco, marcadas.
    const banco = await lerBanco();
    const doCliente = banco.reuniao.filter((r) => r.contaId === "conta-horizonte");
    expect(doCliente).toHaveLength(2);
    expect(doCliente.every((r) => r.transcricao === TRANSCRICAO_TESTE && r.transcricaoRemovida?.motivo === "cliente_removido")).toBe(true);
    expect(banco.sinal.filter((s) => doCliente.some((r) => r.id === s.reuniaoId)).length).toBeGreaterThan(0);
    expect(banco.carteira_remocao).toEqual([{ usuarioId: RICARDO.id, contaId: "conta-horizonte", removidoEm: expect.any(String) }]);

    // Já removido, fora do escopo ou inexistente: mesma resposta.
    expect((await removerDe(RICARDO, "conta-horizonte")).status).toBe(404);
    expect((await removerDe(RESTRITO, "conta-horizonte")).status).toBe(404);
    expect((await removerDe(RICARDO, "nao-existe")).status).toBe(404);
  });

  it("devolver traz o cliente e os insights de volta", async () => {
    await removerDe(RICARDO, "conta-horizonte");
    const resposta = await devolverA(RICARDO, "conta-horizonte");
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ naCarteira: true, cliente: { nome: "Grupo Horizonte" }, reunioesComInsightsReativados: 2 });
    expect(await ids(RICARDO)).toEqual(["conta-beta", "conta-horizonte"]);
    expect((await listarReunioesCentral()).filter((r) => r.conta.id === "conta-horizonte" && r.detalhe)).toHaveLength(2);
    expect((await devolverA(RESTRITO, "conta-horizonte")).status).toBe(404);
  });

  it("transcrição removida antes continua removida ao devolver o cliente", async () => {
    const { DELETE: removerTranscricao } = await import("@/app/api/v1/reunioes/[id]/transcricao/route");
    const antiga = (await lerBanco()).reuniao.find((r) => r.contexto?.data === "2026-09-01 10:00:00")!.id;
    await removerTranscricao(new Request(`${BASE}/reunioes/${antiga}/transcricao`, { method: "DELETE", headers: cabecalhos(RICARDO) }), {
      params: Promise.resolve({ id: antiga }),
    });
    expect((await (await removerDe(RICARDO, "conta-horizonte")).json()).reunioesComInsightsRemovidos).toBe(1);
    await devolverA(RICARDO, "conta-horizonte");
    const linhas = (await listarReunioesCentral()).filter((r) => r.conta.id === "conta-horizonte");
    expect(linhas.map((r) => [r.id === antiga, r.detalhe === null])).toEqual(expect.arrayContaining([[true, true], [false, false]]));
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
