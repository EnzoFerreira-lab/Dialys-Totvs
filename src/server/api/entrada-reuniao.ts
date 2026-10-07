// Lê o corpo de POST /api/v1/reunioes/processar. Aceita:
//   application/json     { texto, contexto?, contaId?, contaNome? } ou o registro da TOTVS ({ ANON_TRANSCRICAO, ... })
//   multipart/form-data  arquivo (.txt, .json da TOTVS ou áudio) ou texto; contexto (JSON), contaId, contaNome, idReuniao
import { extrairReunioes, type ReuniaoImportada } from "@/lib/transcricao";
import { ErroEntrada, type EntradaReuniao } from "../pipeline/processar-reuniao";
import { ehAudio } from "../pipeline/transcricao-audio";

export const TAMANHO_MAXIMO_ARQUIVO = 20 * 1024 * 1024;

const extensao = (nome: string) => nome.slice(nome.lastIndexOf(".")).toLowerCase();

/** Arquivo/registro no formato da TOTVS: uma reunião, ou a escolhida por idReuniao. */
function escolherReuniaoTotvs(reunioes: ReuniaoImportada[], idReuniao: unknown): ReuniaoImportada {
  if (reunioes.length === 0) {
    throw new ErroEntrada("JSON_SEM_TRANSCRICAO", 400, "O JSON não tem campo de transcrição (texto ou ANON_TRANSCRICAO).");
  }
  if (typeof idReuniao === "string" && idReuniao) {
    const escolhida = reunioes.find((r) => r.id === idReuniao);
    if (!escolhida) throw new ErroEntrada("REUNIAO_NAO_ENCONTRADA_NO_ARQUIVO", 400, `ID_MEETING ${idReuniao} não está no arquivo.`);
    return escolhida;
  }
  if (reunioes.length > 1) {
    throw new ErroEntrada(
      "VARIAS_REUNIOES",
      400,
      `O arquivo tem ${reunioes.length} reuniões. Envie uma por requisição ou informe "idReuniao" (ID_MEETING).`,
    );
  }
  return reunioes[0];
}

async function lerJson(request: Request): Promise<EntradaReuniao> {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    throw new ErroEntrada("JSON_INVALIDO", 400, "O corpo não é um JSON válido.");
  }
  if (typeof corpo !== "object" || corpo === null) throw new ErroEntrada("JSON_INVALIDO", 400, "O corpo deve ser um objeto JSON.");
  const dados = corpo as Record<string, unknown>;

  if (typeof dados.texto === "string") {
    return { conteudo: { tipo: "texto", texto: dados.texto }, contexto: dados.contexto, contaId: dados.contaId, contaNome: dados.contaNome };
  }
  const reuniao = escolherReuniaoTotvs(extrairReunioes(JSON.stringify(corpo)) ?? [], dados.idReuniao);
  return { conteudo: { tipo: "texto", texto: reuniao.transcricao }, contexto: dados.contexto ?? reuniao.contexto, contaId: dados.contaId, contaNome: dados.contaNome };
}

async function lerFormulario(request: Request): Promise<EntradaReuniao> {
  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    throw new ErroEntrada("FORMULARIO_INVALIDO", 400, "Não foi possível ler o multipart/form-data.");
  }
  const campoTexto = (nome: string) => {
    const valor = formulario.get(nome);
    return typeof valor === "string" ? valor : undefined;
  };

  let contexto: unknown;
  const contextoBruto = campoTexto("contexto");
  if (contextoBruto) {
    try {
      contexto = JSON.parse(contextoBruto);
    } catch {
      throw new ErroEntrada("CONTEXTO_INVALIDO", 400, 'Campo "contexto" deve ser um JSON.');
    }
  }
  const contaId = campoTexto("contaId");
  const contaNome = campoTexto("contaNome");

  const arquivo = formulario.get("arquivo");
  if (arquivo instanceof File) {
    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) throw new ErroEntrada("ARQUIVO_GRANDE", 413, "Arquivo acima de 20 MB.");
    const ext = extensao(arquivo.name);
    if (ehAudio(arquivo.name, arquivo.type)) {
      return {
        conteudo: {
          tipo: "audio",
          audio: { nomeArquivo: arquivo.name, tipoMime: arquivo.type, bytes: new Uint8Array(await arquivo.arrayBuffer()) },
        },
        contexto,
        contaId,
        contaNome,
      };
    }
    if (ext === ".json" || arquivo.type === "application/json") {
      const reunioes = extrairReunioes(await arquivo.text());
      if (!reunioes) throw new ErroEntrada("JSON_INVALIDO", 400, `${arquivo.name} não é um JSON válido.`);
      const reuniao = escolherReuniaoTotvs(reunioes, campoTexto("idReuniao"));
      return {
        conteudo: { tipo: "texto", texto: reuniao.transcricao, nomeArquivo: arquivo.name },
        contexto: contexto ?? reuniao.contexto,
        contaId,
        contaNome,
      };
    }
    if (ext === ".txt" || arquivo.type.startsWith("text/plain")) {
      return { conteudo: { tipo: "texto", texto: await arquivo.text(), nomeArquivo: arquivo.name }, contexto, contaId, contaNome };
    }
    throw new ErroEntrada(
      "FORMATO_NAO_SUPORTADO",
      415,
      `Formato ${ext || arquivo.type || "desconhecido"} não suportado. Use .txt, .json (formato TOTVS) ou áudio. PDF e DOCX ainda não são lidos.`,
    );
  }

  const texto = campoTexto("texto");
  if (texto !== undefined) return { conteudo: { tipo: "texto", texto }, contexto, contaId, contaNome };
  throw new ErroEntrada("SEM_CONTEUDO", 400, 'Envie o campo "arquivo" ou o campo "texto".');
}

export async function lerEntrada(request: Request): Promise<EntradaReuniao> {
  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > TAMANHO_MAXIMO_ARQUIVO + 1024 * 1024) throw new ErroEntrada("CORPO_GRANDE", 413, "Requisição acima de 20 MB.");

  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) return lerJson(request);
  if (tipo.includes("multipart/form-data")) return lerFormulario(request);
  throw new ErroEntrada("TIPO_NAO_SUPORTADO", 415, "Use Content-Type application/json ou multipart/form-data.");
}
