// Pauta sugerida para compromissos: IA (fetch simulado, sem rede), conferência das citações, regras locais
// quando a IA não está disponível, escopo do usuário e a rota POST /api/v1/agenda/pauta.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as rotaPauta } from "@/app/api/v1/agenda/pauta/route";
import { LIMITE_OBSERVACOES } from "@/lib/agenda";
import { FRASE_TESTE, transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { COOKIE_SESSAO, criarTokenSessao } from "../auth/sessao";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar } from "../pipeline/processar-reuniao";
import { pautaComoTexto, sugerirPauta, type PautaSugerida } from "./pauta";

const RICARDO = USUARIOS[0];
const RESTRITO: Usuario = { id: "usr_teste_restrito", nome: "Vendedor Teste", email: "v@t.br", papel: "vendedor", escopo: { tipo: "contas", contaIds: ["conta-beta"] } };
const CONTA = "conta-grupo-horizonte";

/** Resposta da IA: uma citação real (dos alertas) e uma inventada, que precisa sumir. */
const PAUTA_IA = {
  objetivo: "Conter o risco de churn: o cliente avalia a Senior para o RH.",
  assuntos: [
    { categoria: "risco", titulo: "Avaliação da Senior", detalhe: "Entender o que agradou na demo.", citacao: "O pessoal viu uma demo da Senior e gostou", reuniao: "Reunião 002, 03/10/2026" },
    { categoria: "oportunidade", titulo: "RM Folha integrado", detalhe: "Mostrar a integração com o Protheus.", citacao: "Vamos cancelar tudo amanhã", reuniao: "Reunião 001" },
  ],
  direcionamento: { levar: ["Demo do RM Folha"], perguntar: ["O que pesou na demo da Senior?"], evitar: ["Falar mal do concorrente"] },
};

const fetchQueResponde = (conteudo: unknown) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(conteudo) } }] }), { status: 200 }));

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-pauta-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  process.env.OPENROUTER_API_KEY = "k";
  delete process.env.DIALYS_MODO_DEMO;
  const motor = motorFalso();
  for (const data of ["2026-09-10 10:00:00", "2026-10-03 10:00:00"]) {
    await receberEProcessar({ conteudo: { tipo: "texto", texto: transcricaoTeste() }, contaId: CONTA, contaNome: "Grupo Horizonte", contexto: { data } }, { motor });
  }
});
afterEach(async () => {
  delete process.env.DIALYS_BANCO_ARQUIVO;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.DIALYS_MODO_DEMO;
  await rm(pasta, { recursive: true, force: true });
});

describe("sugerirPauta", () => {
  it("com IA: usa a avaliação do cliente e descarta citação que não está nos alertas", async () => {
    const fetchFalso = fetchQueResponde(PAUTA_IA);
    const pauta = (await sugerirPauta(RICARDO, { contaId: CONTA, titulo: "Renovação" }, { opcoesNemotron: { fetch: fetchFalso } }))!;

    expect(pauta).toMatchObject({ origem: "nemotron", aviso: null, semHistorico: false, cliente: { id: CONTA, nome: "Grupo Horizonte" } });
    expect(pauta.assuntos[0].citacao).toBe("O pessoal viu uma demo da Senior e gostou");
    expect(pauta.assuntos[1]).toMatchObject({ citacao: "", reuniao: "" });
    expect(pauta.fontes).toEqual(["Reunião 002, 03/10/2026", "Reunião 001, 10/09/2026"]);

    const corpo = JSON.parse(String(fetchFalso.mock.calls[0][1]?.body));
    expect(corpo.response_format.json_schema.name).toBe("pauta_reuniao");
    // A IA recebe os dados do cliente (alertas com a citação) e o título do compromisso.
    expect(corpo.messages[1].content).toContain("O pessoal viu uma demo da Senior e gostou");
    expect(corpo.messages[1].content).toContain("Renovação");
  });

  it("IA indisponível (limite diário): pauta pelas regras locais, com aviso", async () => {
    const limite = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { code: 429, message: "Rate limit exceeded: free-models-per-day" } }), { status: 429 }));
    const pauta = (await sugerirPauta(RICARDO, { contaId: CONTA }, { opcoesNemotron: { fetch: limite } }))!;
    expect(pauta.origem).toBe("regras");
    expect(pauta.aviso).toMatch(/Limite de uso da IA/);
    expect(pauta.objetivo).toMatch(/^Conter o risco de churn/);
    expect(pauta.assuntos[0]).toMatchObject({ categoria: "risco", citacao: expect.stringContaining("Senior") });
  });

  it("modo demonstração: regras locais, sem chamar a IA e sem aviso", async () => {
    process.env.DIALYS_MODO_DEMO = "true";
    const fetchFalso = fetchQueResponde(PAUTA_IA);
    const pauta = (await sugerirPauta(RICARDO, { contaId: CONTA }, { opcoesNemotron: { fetch: fetchFalso } }))!;
    expect(pauta).toMatchObject({ origem: "regras", aviso: null });
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(pauta.assuntos.some((a) => a.citacao.includes(FRASE_TESTE.slice(0, 30)))).toBe(true);
  });

  it("respeita o escopo: cliente de fora devolve null; no escopo e sem histórico, roteiro de primeira conversa", async () => {
    expect(await sugerirPauta(RESTRITO, { contaId: CONTA })).toBeNull();
    const semHistorico = (await sugerirPauta(RESTRITO, { contaId: "conta-beta" }))!;
    expect(semHistorico).toMatchObject({ semHistorico: true, origem: "regras", fontes: [] });
  });

  it("o texto para Observações cabe no limite do campo", () => {
    const longa: Pick<PautaSugerida, "objetivo" | "assuntos" | "direcionamento"> = {
      objetivo: "x".repeat(400),
      assuntos: Array.from({ length: 5 }, (_, i) => ({ categoria: "risco" as const, titulo: `Assunto ${i}`, detalhe: "", citacao: "y".repeat(200), reuniao: "" })),
      direcionamento: { levar: ["a"], perguntar: ["b"], evitar: ["c"] },
    };
    const texto = pautaComoTexto(longa);
    expect(texto.length).toBeLessThanOrEqual(LIMITE_OBSERVACOES);
    expect(texto.startsWith("Pauta sugerida pelo Dialys")).toBe(true);
  });
});

describe("POST /api/v1/agenda/pauta", () => {
  const post = (corpo: unknown, usuarioId?: string) =>
    rotaPauta(
      new Request("http://localhost:3000/api/v1/agenda/pauta", {
        method: "POST",
        headers: { "content-type": "application/json", ...(usuarioId ? { cookie: `${COOKIE_SESSAO}=${encodeURIComponent(criarTokenSessao(usuarioId))}` } : {}) },
        body: JSON.stringify(corpo),
      }),
    );

  it("exige sessão, valida o corpo e responde 404 para cliente fora do escopo", async () => {
    process.env.DIALYS_MODO_DEMO = "true";
    expect((await post({ contaId: CONTA })).status).toBe(401);
    expect((await post({ data: "ontem" }, RICARDO.id)).status).toBe(400);
    USUARIOS.push(RESTRITO);
    try {
      expect((await post({ contaId: CONTA }, RESTRITO.id)).status).toBe(404);
    } finally {
      USUARIOS.splice(USUARIOS.indexOf(RESTRITO), 1);
    }
    const resposta = await post({ contaId: CONTA, titulo: "Renovação", data: "2026-10-20" }, RICARDO.id);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ cliente: { nome: "Grupo Horizonte" }, origem: "regras", textoObservacoes: expect.stringContaining("Objetivo:") });
  });
});
