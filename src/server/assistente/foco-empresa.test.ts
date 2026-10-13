// Modo empresa em foco: consultas de uma empresa (avaliação, explicação de insight, produtos), o motor por
// regras com a empresa fixada e o motor Nemotron (laço de tools contra um fetch simulado, sem rede).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";
import { responderPergunta } from "./assistente";
import { executarFerramenta } from "./ferramentas";
import { contextoSessao } from "./motor-claude";
import { criarMotorDemonstracao } from "./motor-demonstracao";
import { criarMotorNemotron } from "./motor-nemotron";

const RICARDO = USUARIOS[0];
const RESTRITO: Usuario = { id: "usr_teste_restrito", nome: "Vendedor Teste", email: "v@t.br", papel: "vendedor", escopo: { tipo: "contas", contaIds: ["conta-beta"] } };
const AGORA = new Date("2026-10-07T15:00:00-03:00");
const ctx = (usuario: Usuario = RICARDO) => ({ usuario, agora: AGORA });

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-foco-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  const motor = motorFalso();
  // As mesmas reuniões para o Ricardo e para o restrito: cada usuário só consulta as próprias.
  const reuniao = async (contaId: string, contaNome: string, data: string) => {
    for (const dono of [RICARDO.id, RESTRITO.id]) {
      await receberEProcessar({ conteudo: { tipo: "texto", texto: transcricaoTeste() }, contaId, contaNome, contexto: { data } }, { motor }, dono);
    }
  };
  // Duas reuniões do mesmo cliente: dá para ver evolução e temas recorrentes.
  await reuniao("conta-grupo-horizonte", "Grupo Horizonte", "2026-09-10 10:00:00");
  await reuniao("conta-grupo-horizonte", "Grupo Horizonte", "2026-10-03 10:00:00");
  await reuniao("conta-beta", "Beta Indústria", "2026-08-20 09:00:00");
});
afterEach(async () => {
  delete process.env.DIALYS_BANCO_ARQUIVO;
  await rm(pasta, { recursive: true, force: true });
});

describe("consultas de uma empresa", () => {
  it("avaliar_empresa cobre todas as reuniões, com evolução, temas recorrentes e produtos", async () => {
    const r = await executarFerramenta(ctx(), "avaliar_empresa", { contaId: "conta-grupo-horizonte" });
    expect(r.erro).toBeUndefined();
    expect(r.dados).toMatchObject({
      empresa: { nome: "Grupo Horizonte" },
      reunioesAnalisadas: 2,
      criticidade: "ALTA",
      alertas: { risco_churn: { total: 2, alta: 2 } },
    });
    expect((r.dados.evolucao as unknown[]).length).toBe(2);
    expect(r.dados.temasRecorrentes).toEqual(expect.arrayContaining([expect.objectContaining({ categoria: "risco_churn", reunioes: ["Reunião 002", "Reunião 001"] })]));
    expect(r.dados.produtos).toEqual(expect.arrayContaining([{ produto: "TOTVS Protheus", status: "em_uso", reunioes: 2 }]));
    expect(r.entidades.contas).toEqual([{ id: "conta-grupo-horizonte", nome: "Grupo Horizonte" }]);
  });

  it("explicar_insight traz contexto da conversa e recorrência; sem insightId usa o mais crítico", async () => {
    const r = await executarFerramenta(ctx(), "explicar_insight", { contaId: "conta-grupo-horizonte" });
    const insight = r.dados.insight as Record<string, unknown>;
    expect(insight).toMatchObject({ categoria: "risco_churn", criticidade: "ALTA", enviadoAoCrm: false });
    expect(insight.trechoDaConversa).toMatchObject({ trecho: expect.stringContaining("Senior") });
    expect(r.dados.mesmoTemaEmOutrasReunioes).toHaveLength(1);

    // O mesmo insight pelo id devolve o mesmo resultado.
    const peloId = await executarFerramenta(ctx(), "explicar_insight", { insightId: insight.insightId });
    expect((peloId.dados.insight as Record<string, unknown>).insightId).toBe(insight.insightId);
  });

  it("mapear_produtos_empresa separa uso, concorrência e portfólio não citado", async () => {
    const r = await executarFerramenta(ctx(), "mapear_produtos_empresa", { contaId: "conta-grupo-horizonte" });
    expect(r.dados.emUso).toEqual([{ produto: "TOTVS Protheus", reunioes: 2 }]);
    expect(r.dados.concorrentesCitados).toEqual([{ produto: "Senior Sistemas", reunioes: 2 }]);
    expect(r.dados.portfolioTotvsNaoCitado).toContain("TOTVS Fluig");
    expect(r.dados.portfolioTotvsNaoCitado).not.toContain("TOTVS Protheus");
    // "RM Folha" só aparece numa recomendação: mesmo assim o RM conta como citado.
    expect(r.dados.portfolioTotvsNaoCitado).not.toContain("TOTVS RM");
  });

  it("respeitam o escopo do usuário: conta e insight de fora respondem como inexistentes", async () => {
    const insightId = ((await executarFerramenta(ctx(), "explicar_insight", { contaId: "conta-grupo-horizonte" })).dados.insight as Record<string, string>).insightId;
    for (const [nome, args] of [
      ["avaliar_empresa", { contaId: "conta-grupo-horizonte" }],
      ["mapear_produtos_empresa", { contaId: "conta-grupo-horizonte" }],
      ["explicar_insight", { insightId }],
    ] as const) {
      const r = await executarFerramenta(ctx(RESTRITO), nome, args);
      expect(r.erro).toBe(true);
      expect(String(r.dados.erro)).toContain("não encontrada");
    }
    expect((await executarFerramenta(ctx(RESTRITO), "avaliar_empresa", { contaId: "conta-beta" })).erro).toBeUndefined();
  });
});

describe("modo empresa em foco", () => {
  const perguntar = (pergunta: string) =>
    responderPergunta({ usuario: RICARDO, pergunta, contaEmFoco: "conta-grupo-horizonte" }, { motor: criarMotorDemonstracao(), agora: AGORA });

  it("o contexto da sessão avisa o modelo da empresa fixada", () => {
    const texto = contextoSessao({ ctx: ctx(), foco: { contas: [], reunioes: [] }, empresaSelecionada: { id: "conta-x", nome: "Empresa X" } });
    expect(texto).toContain("Modo empresa em foco: o usuário fixou Empresa X (contaId: conta-x)");
  });

  it("perguntas sem nome de empresa são respondidas sobre a empresa em foco", async () => {
    const avaliacao = await perguntar("Avalie a empresa em geral.");
    expect(avaliacao.resposta.texto).toContain("**Grupo Horizonte**: saúde");
    expect(avaliacao.resposta.texto).toContain("Temas que se repetem");
    expect(avaliacao.resposta.consultas?.map((c) => c.ferramenta)).toEqual(["avaliar_empresa"]);

    const lista = await perguntar("Liste os insights.");
    expect(lista.resposta.texto).toMatch(/insight\(s\) de \*\*Grupo Horizonte\*\*/);
    expect(lista.resposta.texto).toContain("1. Risco de churn");

    const explicacao = await perguntar("Explique o insight mais crítico.");
    expect(explicacao.resposta.texto).toContain("O cliente disse:");
    expect(explicacao.resposta.texto).toContain("O mesmo tema aparece em 1 outra(s) reunião(ões)");

    const produtos = await perguntar("Quais produtos TOTVS ela usa e onde há upsell?");
    expect(produtos.resposta.texto).toContain("Em uso: TOTVS Protheus");
  });

  it("pergunta da carteira continua respondendo sobre a carteira", async () => {
    const r = await perguntar("Quais clientes precisam de atenção?");
    expect(r.resposta.consultas?.map((c) => c.ferramenta)).toEqual(["consultar_empresa"]);
  });

  it("mensagem não entendida orienta o que perguntar, sem consultar nem repetir a resposta anterior", async () => {
    const r = await perguntar("asdkjh qwe");
    expect(r.resposta.tipo).toBe("nao_entendida");
    expect(r.resposta.texto).toContain("Não entendi o que você pediu");
    expect(r.resposta.consultas).toEqual([]);
  });
});

describe("motor Nemotron (tools no formato OpenAI, fetch simulado)", () => {
  it("executa as consultas pedidas pelo modelo e devolve a resposta final", async () => {
    const recebidas: Array<Record<string, unknown>> = [];
    const respostas = [
      {
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: null,
              tool_calls: [{ id: "c1", type: "function", function: { name: "avaliar_empresa", arguments: '{"contaId":"conta-grupo-horizonte"}' } }],
            },
          },
        ],
      },
      { choices: [{ finish_reason: "stop", message: { content: "<think>ok</think>**Grupo Horizonte** está em risco." } }] },
    ];
    const fetchFalso = vi.fn<typeof fetch>(async (_url, init) => {
      recebidas.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(respostas[recebidas.length - 1]), { status: 200 });
    });

    const r = await responderPergunta(
      { usuario: RICARDO, pergunta: "Avalie a empresa.", contaEmFoco: "conta-grupo-horizonte" },
      { motor: criarMotorNemotron({ fetch: fetchFalso, chave: "k" }), agora: AGORA },
    );

    expect(r.resposta).toMatchObject({ modo: "nemotron", texto: "**Grupo Horizonte** está em risco." });
    expect(r.resposta.consultas?.map((c) => c.ferramenta)).toEqual(["avaliar_empresa"]);
    expect(r.resposta.fontes?.[0]).toMatchObject({ contaId: "conta-grupo-horizonte" });

    const tools = (recebidas[0].tools as Array<{ function: { name: string; parameters: Record<string, unknown> } }>).map((t) => t.function);
    expect(tools.map((t) => t.name)).toContain("explicar_insight");
    expect(tools.every((t) => !("$schema" in t.parameters))).toBe(true);
    const mensagens = recebidas[0].messages as Array<{ role: string; content: string }>;
    expect(mensagens[0].role).toBe("system");
    expect(mensagens.at(-1)?.content).toContain("Modo empresa em foco");
    // O resultado da consulta volta ao modelo como mensagem "tool" ligada à chamada.
    expect((recebidas[1].messages as Array<Record<string, unknown>>).at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
  });

  it("exige consulta na primeira rodada, menos em agradecimentos e cumprimentos", async () => {
    const escolhas: unknown[] = [];
    const fetchFalso = vi.fn<typeof fetch>(async (_url, init) => {
      escolhas.push(JSON.parse(String(init?.body)).tool_choice);
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "De nada!" } }] }), { status: 200 });
    });
    const motor = criarMotorNemotron({ fetch: fetchFalso, chave: "k" });
    await responderPergunta({ usuario: RICARDO, pergunta: "Obrigado!" }, { motor, agora: AGORA });
    await responderPergunta({ usuario: RICARDO, pergunta: "Quais clientes precisam de atenção?" }, { motor, agora: AGORA });
    expect(escolhas).toEqual(["auto", "required"]);
  });

  it("quando o modelo sinaliza que não entendeu, para sem consultar e devolve a orientação", async () => {
    const fetchFalso = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "tool_calls",
                message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "pedido_nao_compreendido", arguments: "{}" } }] },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const r = await responderPergunta(
      { usuario: RICARDO, pergunta: "xpto blablabla", contaEmFoco: "conta-grupo-horizonte" },
      { motor: criarMotorNemotron({ fetch: fetchFalso, chave: "k" }), agora: AGORA },
    );
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(r.resposta).toMatchObject({ modo: "nemotron", tipo: "nao_entendida" });
    expect(r.resposta.texto).toContain("Não entendi o que você pediu");
    expect(r.resposta.consultas).toEqual([]);
  });
});
