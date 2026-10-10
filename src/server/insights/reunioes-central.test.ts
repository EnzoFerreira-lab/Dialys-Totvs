// Central por reunião: código estável ("Reunião 001"), várias reuniões do mesmo cliente, migração de
// bancos antigos, remoção lógica da transcrição (rota, consultas ativas, indicadores e assistente).
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as consultarReuniaoRota } from "@/app/api/v1/reunioes/[id]/route";
import { DELETE as removerTranscricaoRota } from "@/app/api/v1/reunioes/[id]/transcricao/route";
import { TRANSCRICAO_TESTE, transcricaoTeste } from "../ai/__fixtures__/reuniao-teste";
import { executarFerramenta } from "../assistente/ferramentas";
import { COOKIE_SESSAO, criarTokenSessao } from "../auth/sessao";
import { USUARIOS, type Usuario } from "../auth/usuarios";
import { lerBanco } from "../db/banco";
import { buscarInsight, listarAnalisesConcluidas, listarInsights } from "../db/repositorio";
import { motorFalso } from "../pipeline/__fixtures__/motor-falso";
import { receberEProcessar, receberReuniao } from "../pipeline/processar-reuniao";
import { listarReunioesCentral } from "./contas";
import { montarResumo } from "./resumo";

const RICARDO = USUARIOS[0];
const RESTRITO: Usuario = { id: "usr_teste_restrito_central", nome: "Vendedor", email: "v@t.br", papel: "vendedor", escopo: { tipo: "contas", contaIds: ["conta-beta"] } };
const BASE = "http://localhost:3000/api/v1";

const cookieDe = (usuario: Usuario) => `${COOKIE_SESSAO}=${encodeURIComponent(criarTokenSessao(usuario.id))}`;
const removerRota = (id: string, usuario?: Usuario) =>
  removerTranscricaoRota(new Request(`${BASE}/reunioes/${id}/transcricao`, { method: "DELETE", headers: usuario ? { cookie: cookieDe(usuario) } : {} }), {
    params: Promise.resolve({ id }),
  });

const reuniao = (contaId: string, contaNome: string, data?: string) =>
  receberEProcessar(
    { conteudo: { tipo: "texto", texto: transcricaoTeste() }, contaId, contaNome, ...(data ? { contexto: { data } } : {}) },
    { motor: motorFalso() },
  );

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dialys-central-"));
  process.env.DIALYS_BANCO_ARQUIVO = path.join(pasta, "banco.json");
  USUARIOS.push(RESTRITO);
});
afterEach(async () => {
  USUARIOS.splice(USUARIOS.indexOf(RESTRITO), 1);
  delete process.env.DIALYS_BANCO_ARQUIVO;
  await rm(pasta, { recursive: true, force: true });
});

const idDe = async (data: string) => (await lerBanco()).reuniao.find((r) => r.contexto?.data === data)!.id;

describe("uma linha por reunião, com código estável", () => {
  it("várias reuniões do mesmo cliente têm ids e códigos distintos e nenhuma sobrescreve a outra", async () => {
    await reuniao("conta-horizonte", "Grupo Horizonte", "2026-09-01 10:00:00");
    await reuniao("conta-beta", "Beta Indústria", "2026-10-01 09:00:00");
    await reuniao("conta-horizonte", "Grupo Horizonte", "2026-10-07 15:30:00");

    const linhas = await listarReunioesCentral();
    expect(linhas).toHaveLength(3);
    const horizonte = linhas.filter((l) => l.conta.id === "conta-horizonte");
    expect(horizonte.map((l) => l.codigo).sort()).toEqual(["Reunião 001", "Reunião 003"]);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(3);
    // Cada linha mostra a própria reunião, com o histórico do cliente.
    for (const linha of horizonte) {
      expect(linha.detalhe?.reuniaoId).toBe(linha.id);
      expect(linha.detalhe?.reuniaoCodigo).toBe(linha.codigo);
      expect(linha.detalhe?.reunioes).toHaveLength(2);
    }
    expect(linhas.find((l) => l.codigo === "Reunião 001")).toMatchObject({ data: "2026-09-01", hora: "10:00" });
  });

  it("o código não muda depois de remover outra reunião e números nunca são reutilizados", async () => {
    await reuniao("conta-horizonte", "Grupo Horizonte", "2026-09-01 10:00:00");
    await reuniao("conta-beta", "Beta Indústria", "2026-10-01 09:00:00");
    await reuniao("conta-horizonte", "Grupo Horizonte", "2026-10-07 15:30:00");
    const antes = Object.fromEntries((await listarReunioesCentral()).map((l) => [l.id, l.codigo]));

    expect((await removerRota(await idDe("2026-10-01 09:00:00"), RICARDO)).status).toBe(200);
    await reuniao("conta-gama", "Gama Serviços", "2026-10-08 11:00:00");

    const depois = await listarReunioesCentral();
    for (const linha of depois) if (antes[linha.id]) expect(linha.codigo).toBe(antes[linha.id]);
    expect(depois.find((l) => l.conta.id === "conta-gama")?.codigo).toBe("Reunião 004");
    expect((await lerBanco()).sequencias.reuniao).toBe(4);
  });

  it("reunião sem data informada fica sinalizada (não usa a data do processamento como se fosse a da reunião)", async () => {
    await reuniao("conta-horizonte", "Grupo Horizonte");
    const [linha] = await listarReunioesCentral();
    expect(linha).toMatchObject({ data: null, hora: null });
    expect(linha.processadaEm).toMatch(/^\d{4}-/);
    expect(linha.detalhe?.dataInformada).toBe(false);
    const ctx = { usuario: RICARDO, agora: new Date() };
    const empresa = await executarFerramenta(ctx, "consultar_empresa", { contaId: "conta-horizonte" });
    expect((empresa.dados.empresas as Array<{ ultimaReuniao: unknown }>)[0].ultimaReuniao).toMatchObject({ codigo: "Reunião 001", dataInformada: false });
  });
});

describe("migração de bancos antigos (sem número de reunião)", () => {
  it("numera pela ordem de criação na leitura e grava os mesmos números na próxima escrita", async () => {
    const antiga = (id: string, criadaEm: string) => ({ id, criadaEm, atualizadaEm: criadaEm, status: "FALHOU", origem: "texto", transcricao: "x", etapas: [] });
    await writeFile(
      process.env.DIALYS_BANCO_ARQUIVO!,
      JSON.stringify({
        versao: 1,
        reuniao: [antiga("reu_b", "2026-10-02T10:00:00Z"), antiga("reu_a", "2026-10-01T10:00:00Z")],
        analise: [],
        sinal: [],
        mencao_produto: [],
        sincronizacao_crm: [],
      }),
    );
    const lido = await lerBanco();
    expect(lido.reuniao.map((r) => [r.id, r.numero])).toEqual([
      ["reu_b", 2],
      ["reu_a", 1],
    ]);
    // Tabelas novas entram vazias; nada antigo se perde.
    expect(lido.carteira_remocao).toEqual([]);

    await reuniao("conta-nova", "Nova");
    const gravado = JSON.parse(await readFile(process.env.DIALYS_BANCO_ARQUIVO!, "utf8"));
    expect(gravado.reuniao.map((r: { id: string; numero: number }) => r.numero)).toEqual([2, 1, 3]);
    expect(gravado.sequencias).toEqual({ reuniao: 3 });
  });
});

describe("remover transcrição (remoção lógica)", () => {
  beforeEach(async () => {
    await reuniao("conta-horizonte", "Grupo Horizonte", "2026-09-01 10:00:00");
    await reuniao("conta-horizonte", "Grupo Horizonte", "2026-10-07 15:30:00");
    await reuniao("conta-beta", "Beta Indústria", "2026-10-01 09:00:00");
  });

  it("só a transcrição escolhida sai das consultas ativas, dos indicadores e do assistente", async () => {
    const alvo = await idDe("2026-10-07 15:30:00");
    const outra = await idDe("2026-09-01 10:00:00");
    const sinalAlvo = (await lerBanco()).sinal.find((s) => s.reuniaoId === alvo)!.id;
    const kpisAntes = (await montarResumo()).kpis;

    const resposta = await removerRota(alvo, RICARDO);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ reuniaoId: alvo, codigo: "Reunião 002", conta: { nome: "Grupo Horizonte" }, jaRemovida: false });

    // Nada apagado do banco: registro, número, texto e análise continuam lá.
    const banco = await lerBanco();
    const registro = banco.reuniao.find((r) => r.id === alvo)!;
    expect(registro).toMatchObject({ numero: 2, transcricao: expect.stringContaining(TRANSCRICAO_TESTE), transcricaoRemovida: { usuarioId: RICARDO.id } });
    expect(banco.sinal.some((s) => s.reuniaoId === alvo)).toBe(true);

    // Consultas ativas: a reunião some; a outra do mesmo cliente fica.
    expect((await listarAnalisesConcluidas()).map((a) => a.reuniao.id).sort()).toEqual([outra, await idDe("2026-10-01 09:00:00")].sort());
    expect((await listarInsights()).some((i) => i.reuniao.id === alvo)).toBe(false);
    expect(await buscarInsight(sinalAlvo)).toBeNull();
    const kpis = (await montarResumo()).kpis;
    expect(kpis.reunioesAnalisadas).toBe(kpisAntes.reunioesAnalisadas - 1);
    expect(kpis.contasAnalisadas).toBe(kpisAntes.contasAnalisadas);

    // Central: a linha continua, com o mesmo código e sem análise; a outra reunião vira a mais recente do cliente.
    const linhas = await listarReunioesCentral();
    expect(linhas.find((l) => l.id === alvo)).toMatchObject({ codigo: "Reunião 002", detalhe: null, transcricaoRemovidaEm: expect.any(String) });
    expect(linhas.find((l) => l.id === outra)?.detalhe).toMatchObject({ reuniaoMaisRecente: true, totalReunioes: 1 });

    // Assistente: a reunião removida não é encontrada nem pelo código.
    const ctx = { usuario: RICARDO, agora: new Date() };
    expect((await executarFerramenta(ctx, "obter_detalhes_reuniao", { numero: 2 })).erro).toBe(true);
    expect((await executarFerramenta(ctx, "obter_detalhes_reuniao", { numero: 1 })).dados.reuniao).toMatchObject({ codigo: "Reunião 001" });
    const buscadas = await executarFerramenta(ctx, "buscar_reunioes", { contaId: "conta-horizonte" });
    expect((buscadas.dados.reunioes as Array<{ reuniaoId: string }>).map((r) => r.reuniaoId)).toEqual([outra]);

    // API da reunião: registro e código ficam; transcrição e análise, não.
    const api = await (await consultarReuniaoRota(new Request(`${BASE}/reunioes/${alvo}?incluirTranscricao=true`), { params: Promise.resolve({ id: alvo }) })).json();
    expect(api).toMatchObject({ codigo: "Reunião 002", resultado: null, transcricao: null, transcricaoRemovidaEm: expect.any(String) });
  });

  it("repetir não duplica; exige sessão e acesso à conta; recusa reunião em processamento", async () => {
    const alvo = await idDe("2026-10-07 15:30:00");
    expect((await removerRota(alvo)).status).toBe(401);
    expect((await removerRota(alvo, RESTRITO)).status).toBe(404);
    expect((await removerRota("reu_inexistente", RICARDO)).status).toBe(400);
    expect((await removerRota(`reu_${"0".repeat(32)}`, RICARDO)).status).toBe(404);

    expect((await (await removerRota(alvo, RICARDO)).json()).jaRemovida).toBe(false);
    const repetida = await removerRota(alvo, RICARDO);
    expect(repetida.status).toBe(200);
    expect((await repetida.json()).jaRemovida).toBe(true);

    // O restrito vê a conta-beta e pode remover a dela.
    expect((await removerRota(await idDe("2026-10-01 09:00:00"), RESTRITO)).status).toBe(200);

    const emProcessamento = await receberReuniao({ conteudo: { tipo: "texto", texto: transcricaoTeste() }, contaId: "conta-horizonte" });
    const conflito = await removerRota(emProcessamento.id, RICARDO);
    expect(conflito.status).toBe(409);
    expect((await lerBanco()).reuniao.find((r) => r.id === emProcessamento.id)?.transcricaoRemovida).toBeUndefined();
  });
});
