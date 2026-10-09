import { describe, expect, it } from "vitest";
import { descreverContexto, extrairReunioes, formatarSegmento, normalizarTranscricao } from "./transcricao";

const REGISTRO = {
  ID_MEETING: "920847",
  DT_MEETING: "2026-01-16 11:00:00",
  DURACAO_MEETING: "00:41:36",
  TP_RECURSO: "customer",
  FLG_EXTERNO: true,
  ANON_TRANSCRICAO: "[LOCUTOR 24]: Bom dia.\n[LOCUTOR 6]: Bom dia, tudo bem?",
  UF: "RS",
  NOME_SEGMENTO: "SAUDE",
  NOTA_NPS: "7",
};

describe("extrairReunioes", () => {
  it("lê a lista exportada pela TOTVS, com metadados", () => {
    const [reuniao] = extrairReunioes(JSON.stringify([REGISTRO]))!;
    expect(reuniao).toMatchObject({
      id: "920847",
      titulo: "Reunião #920847 · Saúde",
      transcricao: REGISTRO.ANON_TRANSCRICAO,
      contexto: { segmento: "Saúde", uf: "RS", nps: 7, externa: true, tipoRecurso: "customer" },
    });
    expect(reuniao.descricao).toBe("Saúde · RS · 16/01/2026 · 42 min · NPS 7");
  });

  it("com código do cliente e CNAE, o título é o nome do cliente (atividade · UF (código))", () => {
    const [reuniao] = extrairReunioes(JSON.stringify([{ ...REGISTRO, CODT: "T54451", CNAE: "8610101" }]))!;
    expect(reuniao.titulo).toBe("Hospital · RS (T54451)");
    expect(reuniao.contexto).toMatchObject({ codigoCliente: "T54451", cnae: "8610101" });
    // CNAE fora da lista: a atividade vem do segmento. CNAE inválido é descartado.
    const [outra] = extrairReunioes(JSON.stringify([{ ...REGISTRO, CODT: "T1", CNAE: "0000000" }]))!;
    expect(outra.titulo).toBe("Saúde · RS (T1)");
    expect(extrairReunioes(JSON.stringify([{ ...REGISTRO, CNAE: "86.10-1" }]))![0].contexto.cnae).toBeUndefined();
  });

  it("aceita um registro solto, BOM e envelope { reunioes: [...] }", () => {
    expect(extrairReunioes(`\uFEFF${JSON.stringify(REGISTRO)}`)).toHaveLength(1);
    expect(extrairReunioes(JSON.stringify({ reunioes: [REGISTRO, { ...REGISTRO, ID_MEETING: "2", ANON_TRANSCRICAO: "Outra" }] }))).toHaveLength(2);
  });

  it("remove reuniões repetidas com outro ID", () => {
    expect(extrairReunioes(JSON.stringify([REGISTRO, { ...REGISTRO, ID_MEETING: "920848" }]))).toHaveLength(1);
  });

  it("devolve null para texto que não é JSON e lista vazia para JSON sem transcrição", () => {
    expect(extrairReunioes("[LOCUTOR 1]: oi")).toBeNull();
    expect(extrairReunioes('{"a": 1')).toBeNull();
    expect(extrairReunioes('[{"ID_MEETING": "1"}]')).toEqual([]);
  });

  it("ignora NPS fora da escala", () => {
    const [reuniao] = extrairReunioes(JSON.stringify([{ ...REGISTRO, NOTA_NPS: "N/A" }]))!;
    expect(reuniao.contexto.nps).toBeUndefined();
  });
});

describe("normalizarTranscricao", () => {
  it("converte trecho copiado de dentro do JSON (\\n literal e aspas escapadas)", () => {
    const copiado = String.raw`[LOCUTOR 7]: Ele disse \"ok\".\n[LOCUTOR 45]: Certo.\n[LOCUTOR 7]: Fechado.`;
    expect(normalizarTranscricao(copiado)).toBe('[LOCUTOR 7]: Ele disse "ok".\n[LOCUTOR 45]: Certo.\n[LOCUTOR 7]: Fechado.');
  });

  it("aceita o campo inteiro copiado do JSON", () => {
    const linha = String.raw`"ANON_TRANSCRICAO": "[LOCUTOR 1]: Bom dia.\n[LOCUTOR 2]: Olá.",`;
    expect(normalizarTranscricao(linha)).toBe("[LOCUTOR 1]: Bom dia.\n[LOCUTOR 2]: Olá.");
  });

  it("não mexe em texto comum além de quebras do Windows e espaços nas pontas", () => {
    expect(normalizarTranscricao("  Cliente: O preço\r\nsubiu.  ")).toBe("Cliente: O preço\nsubiu.");
    expect(normalizarTranscricao(String.raw`Caminho C:\novo`)).toBe(String.raw`Caminho C:\novo`);
  });
});

describe("formatação", () => {
  it("segmentos com acento e conectivo", () => {
    expect(formatarSegmento("CONSTRUCAO E PROJETOS")).toBe("Construção e Projetos");
    expect(formatarSegmento("SUPERMERCADOS")).toBe("Supermercados");
  });

  it("descreve reunião interna e prospect", () => {
    expect(descreverContexto({ segmento: "Varejo", externa: false })).toBe("Varejo · reunião interna");
    expect(descreverContexto({ uf: "PA", tipoRecurso: "lead" })).toBe("PA · prospect");
  });
});
