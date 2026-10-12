// Testes de contrato da API /api/v1: chamam os Route Handlers direto, com Request/Response reais.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { ErroAnalise } from "../ai/analisar-reuniao";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";

// after() e connection() precisam do contexto de requisição do Next: aqui a tarefa é guardada para o teste esperar.
const tarefas: Promise<unknown>[] = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarefa: () => Promise<unknown>) => void tarefas.push(tarefa()),
  // Fora do servidor Next não há requisição em curso: nada a esperar.
  connection: async () => {},
}));

const motor = vi.hoisted(() => ({ atual: undefined as undefined | (() => unknown) }));
vi.mock("../pipeline/motor-analise", async (original) => {
  const modulo = await original<typeof import("../pipeline/motor-analise")>();
  return { ...modulo, escolherMotor: () => (motor.atual ? motor.atual() : modulo.escolherMotor()) };
});

// Sessão: aqui o foco é o contrato das rotas; todas as chamadas são do Ricardo, menos as marcadas com
// x-teste-sem-sessao. A assinatura do cookie e a separação entre usuários têm testes próprios
// (rotas-assistente.test.ts e isolamento-usuarios.test.ts).
vi.mock("../auth/sessao", async (original) => {
  const modulo = await original<typeof import("../auth/sessao")>();
  const { USUARIOS } = await import("../auth/usuarios");
  return { ...modulo, usuarioDaRequisicao: async (request: Request) => (request.headers.get("x-teste-sem-sessao") ? null : USUARIOS[0]) };
});

const { POST: processar } = await import("@/app/api/v1/reunioes/processar/route");
const { GET: consultar } = await import("@/app/api/v1/reunioes/[id]/route");
const { GET: insights } = await import("@/app/api/v1/insights/route");
const { POST: sincronizar } = await import("@/app/api/v1/crm/sincronizar/route");
const { GET: resumo } = await import("@/app/api/v1/resumo/route");

const BASE = "http://localhost:3000/api/v1";
const postJson = (url: string, corpo: unknown) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
const consultarReuniao = (id: string) => consultar(new Request(`${BASE}/reunioes/${id}`), { params: Promise.resolve({ id }) });
const listar = (query = "") => insights(new NextRequest(`${BASE}/insights${query}`));

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-api-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  motor.atual = () => motorFalso();
  tarefas.length = 0;
});
afterEach(async () => {
  delete process.env.DIALYS_BANCO_ARQUIVO;
  await rm(pasta, { recursive: true, force: true });
});

/** Processa uma reunião no modo síncrono e devolve o corpo da resposta. */
async function processarSincrono(corpo: unknown = { texto: transcricaoTeste(), contaId: "c-001" }) {
  const resposta = await processar(postJson(`${BASE}/reunioes/processar?modo=sincrono`, corpo));
  expect(resposta.status).toBe(201);
  return resposta.json();
}

describe("POST /api/v1/reunioes/processar", () => {
  it("modo assíncrono: 202 com EM_PROCESSAMENTO, depois GET mostra o resultado", async () => {
    const resposta = await processar(postJson(`${BASE}/reunioes/processar`, { texto: transcricaoTeste() }));
    expect(resposta.status).toBe(202);
    expect(resposta.headers.get("X-Request-Id")).toMatch(/^req_/);
    const aceita = await resposta.json();
    expect(aceita).toMatchObject({ status: "EM_PROCESSAMENTO", resultado: null });
    expect(resposta.headers.get("Location")).toBe(`/api/v1/reunioes/${aceita.id}`);

    await Promise.all(tarefas);
    const final = await consultarReuniao(aceita.id);
    expect(final.status).toBe(200);
    const corpo = await final.json();
    expect(corpo.status).toBe("CONCLUIDA");
    expect(corpo.resultado.analise.sinais.map((s: { categoria: string }) => s.categoria)).toEqual(["churn", "upsell"]);
    expect(corpo.resultado.evidencias.metricas.descartados).toBe(1);
  });

  it("modo síncrono: 201 com análise, sinais e menções", async () => {
    const corpo = await processarSincrono();
    expect(corpo).toMatchObject({ status: "CONCLUIDA", contaId: "c-001", origem: "texto", conta: { id: "c-001" } });
    expect(corpo.resultado.analise.sinais[0]).toMatchObject({ id: expect.stringMatching(/^sin_/), categoria: "churn", severidade: "ALTA" });
    expect(corpo.resultado.analise.mencoesProdutos).toHaveLength(2);
  });

  it("aceita multipart com arquivo .txt", async () => {
    const form = new FormData();
    form.set("arquivo", new File([transcricaoTeste()], "reuniao.txt", { type: "text/plain" }));
    const resposta = await processar(new Request(`${BASE}/reunioes/processar?modo=sincrono`, { method: "POST", body: form }));
    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toMatchObject({ origem: "arquivo_texto", nomeArquivo: "reuniao.txt" });
  });

  it.each([
    ["JSON quebrado", new Request(`${BASE}/reunioes/processar`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), 400, "JSON_INVALIDO"],
    ["texto curto", postJson(`${BASE}/reunioes/processar`, { texto: "oi" }), 400, "TRANSCRICAO_VAZIA"],
    ["modo desconhecido", postJson(`${BASE}/reunioes/processar?modo=lento`, { texto: transcricaoTeste() }), 400, "MODO_INVALIDO"],
    ["content-type errado", new Request(`${BASE}/reunioes/processar`, { method: "POST", body: "texto" }), 415, "TIPO_NAO_SUPORTADO"],
  ])("%s → %i %s", async (_caso, request, status, codigo) => {
    const resposta = await processar(request);
    expect(resposta.status).toBe(status);
    expect((await resposta.json()).erro).toMatchObject({ codigo, requestId: expect.stringMatching(/^req_/) });
  });

  it("falha do pipeline no modo síncrono devolve o status da falha e o id da reunião", async () => {
    motor.atual = () =>
      motorFalso(async () => {
        throw new ErroAnalise("recusa", "recusou");
      });
    const resposta = await processar(postJson(`${BASE}/reunioes/processar?modo=sincrono`, { texto: transcricaoTeste() }));
    expect(resposta.status).toBe(422);
    const { erro } = await resposta.json();
    expect(erro.codigo).toBe("ANALISE_RECUSADA");
    expect(erro.detalhe.reuniao).toMatchObject({ status: "FALHOU" });
  });

  it("erro inesperado vira 500 no formato padrão", async () => {
    process.env.DIALYS_BANCO_ARQUIVO = pasta; // uma pasta no lugar do arquivo: a leitura do banco quebra
    const resposta = await processar(postJson(`${BASE}/reunioes/processar`, { texto: transcricaoTeste() }));
    expect(resposta.status).toBe(500);
    expect((await resposta.json()).erro.codigo).toBe("ERRO_INTERNO");
  });
});

describe("GET /api/v1/reunioes/{id}", () => {
  it("400 para id malformado e 404 para id inexistente", async () => {
    expect((await consultarReuniao("abc")).status).toBe(400);
    expect((await consultarReuniao(`reu_${"0".repeat(32)}`)).status).toBe(404);
  });
});

describe("GET /api/v1/insights", () => {
  it("lista sinais do mais crítico para o menos, com resumo para o Dashboard", async () => {
    await processarSincrono();
    const resposta = await listar();
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.dados.map((i: { criticidade: string }) => i.criticidade)).toEqual(["ALTA", "MÉDIA"]);
    expect(corpo.resumo).toEqual({ total: 2, porCategoria: { churn: 1, upsell: 1, objection: 0 }, porCriticidade: { ALTA: 1, MÉDIA: 1, BAIXA: 0 } });
    expect(corpo.dados[0]).toMatchObject({ categoria: "churn", reuniao: { contaId: "c-001" }, crm: { sincronizado: false } });
  });

  it("filtra por categoria e criticidade (MEDIA sem acento) e pagina", async () => {
    await processarSincrono();
    expect((await (await listar("?categoria=churn")).json()).dados).toHaveLength(1);
    expect((await (await listar("?criticidade=MEDIA")).json()).dados[0].categoria).toBe("upsell");
    expect((await (await listar("?categoria=objection")).json()).dados).toEqual([]);
    const pagina = await (await listar("?limite=1&offset=1")).json();
    expect(pagina.dados).toHaveLength(1);
    expect(pagina.paginacao).toEqual({ total: 2, limite: 1, offset: 1 });
  });

  it.each([
    ["?categoria=risco", "CATEGORIA_INVALIDA"],
    ["?categoria=constructor", "CATEGORIA_INVALIDA"],
    ["?criticidade=toString", "CRITICIDADE_INVALIDA"],
    ["?criticidade=URGENTE", "CRITICIDADE_INVALIDA"],
    ["?limite=0", "PAGINACAO_INVALIDA"],
  ])("%s → 400 %s", async (query, codigo) => {
    const resposta = await listar(query);
    expect(resposta.status).toBe(400);
    expect((await resposta.json()).erro.codigo).toBe(codigo);
  });
});

describe("POST /api/v1/crm/sincronizar", () => {
  it("201 no primeiro envio, 200 com o mesmo protocolo ao repetir", async () => {
    await processarSincrono();
    const [insight] = (await (await listar("?categoria=churn")).json()).dados;
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    const primeira = await sincronizar(postJson(`${BASE}/crm/sincronizar`, { insightId: insight.id }));
    expect(primeira.status).toBe(201);
    const enviado = await primeira.json();
    expect(enviado).toMatchObject({ sincronizado: true, destino: "simulado", jaSincronizado: false });
    expect(enviado.payload).toMatchObject({ evento: "dialys.insight.enriquecimento", insight: { id: insight.id, categoria: "churn" } });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`webhook simulado ${enviado.protocolo}`));

    const segunda = await sincronizar(postJson(`${BASE}/crm/sincronizar`, { insightId: insight.id }));
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toMatchObject({ protocolo: enviado.protocolo, jaSincronizado: true });
    expect(log.mock.calls.filter(([m]) => String(m).includes("webhook simulado"))).toHaveLength(1);

    expect((await (await listar("?categoria=churn")).json()).dados[0].crm).toMatchObject({ sincronizado: true, protocolo: enviado.protocolo });
    log.mockRestore();
  });

  it("400 para corpo inválido e 404 para insight inexistente", async () => {
    expect((await sincronizar(postJson(`${BASE}/crm/sincronizar`, {}))).status).toBe(400);
    expect((await sincronizar(postJson(`${BASE}/crm/sincronizar`, { insightId: "123" }))).status).toBe(400);
    const resposta = await sincronizar(postJson(`${BASE}/crm/sincronizar`, { insightId: `sin_${"a".repeat(32)}` }));
    expect(resposta.status).toBe(404);
    expect((await resposta.json()).erro.codigo).toBe("INSIGHT_NAO_ENCONTRADO");
  });
});

describe("GET /api/v1/resumo", () => {
  it("devolve os KPIs, a matriz de urgência e a agenda a partir do banco", async () => {
    await processarSincrono({ texto: transcricaoTeste(), contaId: "conta-acme", contaNome: "Indústria Acme" });
    const resposta = await resumo(new Request(`${BASE}/resumo`));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.kpis).toMatchObject({ reunioesAnalisadas: 1, contasEmRiscoChurn: 1, sinais: { churn: 1, upsell: 1, objection: 0 } });
    expect(corpo.urgencias[0]).toMatchObject({ categoria: "churn", conta: { id: "conta-acme", nome: "Indústria Acme" } });
    expect(corpo.agenda).toHaveLength(1);
  });
});

describe("sessão", () => {
  it("sem sessão, as rotas de dados respondem 401", async () => {
    const semSessao = { "x-teste-sem-sessao": "1" };
    const id = `reu_${"a".repeat(32)}`;
    const respostas = await Promise.all([
      processar(new Request(`${BASE}/reunioes/processar`, { method: "POST", headers: { ...semSessao, "content-type": "application/json" }, body: "{}" })),
      consultar(new Request(`${BASE}/reunioes/${id}`, { headers: semSessao }), { params: Promise.resolve({ id }) }),
      insights(new NextRequest(`${BASE}/insights`, { headers: semSessao })),
      sincronizar(new Request(`${BASE}/crm/sincronizar`, { method: "POST", headers: { ...semSessao, "content-type": "application/json" }, body: "{}" })),
      resumo(new Request(`${BASE}/resumo`, { headers: semSessao })),
    ]);
    expect(respostas.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
  });
});
