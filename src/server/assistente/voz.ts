// Voz do briefing pelo ElevenLabs (text-to-speech com o tempo de cada caractere). Só sintetiza briefings
// gravados na conversa do próprio usuário: o navegador nunca manda texto livre, então a chave não vira um
// TTS aberto. O MP3 e os tempos ficam em cache ao lado do banco (.dialys/voz): ouvir de novo não gasta créditos.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { arquivoBanco } from "../db/banco";
import { buscarConversa } from "../db/repositorio";
import type { Usuario } from "../auth/usuarios";

/** Voz masculina padrão (Brian, voz pronta do ElevenLabs, narração grave). Trocável sem código. */
const VOZ_PADRAO = "nPczCjzI2devNBz1zQrb";
/** Modelo multilíngue: fala português com qualquer voz. */
const MODELO_PADRAO = "eleven_multilingual_v2";

const vozId = () => process.env.ELEVENLABS_VOZ_ID?.trim() || VOZ_PADRAO;
const modeloId = () => process.env.ELEVENLABS_MODELO?.trim() || MODELO_PADRAO;
const chave = () => process.env.ELEVENLABS_API_KEY?.trim() || "";

export const temVozElevenLabs = () => chave().length > 0;

export class ErroVoz extends Error {
  constructor(
    readonly codigo: string,
    readonly httpStatus: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroVoz";
  }
}

/** Tempos (em segundos) em que cada trecho do briefing começa no áudio, e a duração total. */
export type MarcasVoz = { inicios: number[]; duracao: number };

type Alinhamento = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };

/** Texto enviado à voz: os trechos falados, separados por espaço; e o caractere onde cada um começa. */
export function montarTextoFalado(trechos: Array<{ texto: string; fala?: string }>) {
  const falas = trechos.map((t) => (t.fala ?? t.texto).trim());
  const posicoes: number[] = [];
  let texto = "";
  for (const fala of falas) {
    if (texto) texto += " ";
    posicoes.push(texto.length);
    texto += fala;
  }
  return { texto, posicoes };
}

/** Tamanho alvo de cada bloco: blocos curtos gerados em paralelo deixam a primeira escuta bem mais rápida. */
const CARACTERES_POR_BLOCO = 220;
/** Pedidos simultâneos ao ElevenLabs: o plano atual permite 2; um plano maior pode subir via ELEVENLABS_SIMULTANEOS. */
const pedidosSimultaneos = () => Math.max(1, Number(process.env.ELEVENLABS_SIMULTANEOS) || 2);

/** Agrupa trechos seguidos em blocos de até ~CARACTERES_POR_BLOCO (um trecho nunca é partido). */
export function dividirEmBlocos<T extends { texto: string; fala?: string }>(trechos: T[], limite = CARACTERES_POR_BLOCO): T[][] {
  const blocos: T[][] = [];
  let tamanho = 0;
  for (const trecho of trechos) {
    const fala = (trecho.fala ?? trecho.texto).length + 1;
    if (!blocos.length || tamanho + fala > limite) {
      blocos.push([]);
      tamanho = 0;
    }
    blocos[blocos.length - 1].push(trecho);
    tamanho += fala;
  }
  return blocos;
}

/** Duração de um MP3 de taxa constante (o formato pedido: 128 kbps). */
const duracaoMp3 = (bytes: number) => (bytes * 8) / 128_000;

/** Converte as posições (caracteres) em tempos usando o alinhamento devolvido pelo ElevenLabs. */
export function marcasDoAlinhamento(posicoes: number[], textoLength: number, alinhamento: Alinhamento): MarcasVoz {
  const inicios = alinhamento.character_start_times_seconds;
  const duracao = alinhamento.character_end_times_seconds.at(-1) ?? 0;
  // O alinhamento costuma ter um tempo por caractere do texto enviado; se não tiver, distribui proporcionalmente.
  const mesmoTamanho = inicios.length === textoLength;
  return {
    duracao,
    inicios: posicoes.map((p) => (mesmoTamanho ? (inicios[p] ?? 0) : (p / Math.max(1, textoLength)) * duracao)),
  };
}

const pastaVoz = () => path.join(path.dirname(arquivoBanco()), "voz");

/** Áudio (MP3) e marcas de um briefing do usuário; gera no ElevenLabs só na primeira vez. */
export async function vozDoBriefing(usuario: Usuario, conversaId: string, mensagemId: string): Promise<{ mp3: Buffer; marcas: MarcasVoz }> {
  if (!temVozElevenLabs()) throw new ErroVoz("VOZ_NAO_CONFIGURADA", 503, "A voz do ElevenLabs não está configurada (ELEVENLABS_API_KEY).");
  const conversa = await buscarConversa(conversaId, usuario.id);
  const mensagem = conversa?.mensagens.find((m) => m.id === mensagemId);
  if (!mensagem || mensagem.papel !== "assistente" || mensagem.tipo !== "briefing") {
    throw new ErroVoz("BRIEFING_NAO_ENCONTRADO", 404, "Briefing não encontrado nesta conversa.");
  }

  const trechos = mensagem.fala?.length ? mensagem.fala : [{ texto: mensagem.texto }];
  const { texto } = montarTextoFalado(trechos);
  // O nome do cache muda se a voz, o modelo ou o texto mudarem.
  const nome = createHash("sha256").update(`${vozId()}|${modeloId()}|${texto}`).digest("hex").slice(0, 32);
  const arquivoMp3 = path.join(pastaVoz(), `${nome}.mp3`);
  const arquivoMarcas = path.join(pastaVoz(), `${nome}.json`);
  try {
    const [mp3, marcas] = await Promise.all([readFile(arquivoMp3), readFile(arquivoMarcas, "utf8")]);
    return { mp3, marcas: JSON.parse(marcas) as MarcasVoz };
  } catch {
    // Ainda não gerado: segue para o ElevenLabs.
  }

  // Blocos curtos gerados em paralelo; cada um recebe o texto vizinho para manter a entonação contínua.
  const blocos = dividirEmBlocos(trechos).map((bloco) => montarTextoFalado(bloco));
  const partes = await emLotes(blocos, pedidosSimultaneos(), (bloco, i) =>
    sintetizar(bloco.texto, blocos[i - 1]?.texto, blocos[i + 1]?.texto),
  );

  // Junta os MP3s (mesmo formato: tocam em sequência) e desloca os tempos de cada bloco pelo início dele.
  const inicios: number[] = [];
  let deslocamento = 0;
  partes.forEach((parte, i) => {
    const marcasBloco = parte.alinhamento
      ? marcasDoAlinhamento(blocos[i].posicoes, blocos[i].texto.length, parte.alinhamento)
      : { duracao: 0, inicios: blocos[i].posicoes.map(() => 0) };
    inicios.push(...marcasBloco.inicios.map((t) => deslocamento + t));
    // A duração do MP3 inclui o silêncio do fim; o alinhamento garante que o bloco seguinte nunca começa antes da última letra.
    deslocamento += Math.max(duracaoMp3(parte.mp3.length), marcasBloco.duracao);
  });
  const mp3 = Buffer.concat(partes.map((parte) => parte.mp3));
  const marcas: MarcasVoz = { inicios, duracao: deslocamento };

  try {
    await mkdir(pastaVoz(), { recursive: true });
    await Promise.all([writeFile(arquivoMp3, mp3), writeFile(arquivoMarcas, JSON.stringify(marcas), "utf8")]);
  } catch (falha) {
    console.warn("[dialys/voz] não foi possível guardar o áudio em cache; ele será gerado de novo.", falha);
  }
  return { mp3, marcas };
}

/** Executa `tarefa` para cada item, no máximo `limite` ao mesmo tempo, mantendo a ordem dos resultados. */
async function emLotes<T, R>(itens: T[], limite: number, tarefa: (item: T, indice: number) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await tarefa(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}

/** Tentativas quando o plano recusa por excesso de pedidos simultâneos (HTTP 429). */
const TENTATIVAS_429 = 4;

/** Um bloco no ElevenLabs: MP3 e o tempo de cada caractere. */
async function sintetizar(texto: string, anterior?: string, seguinte?: string): Promise<{ mp3: Buffer; alinhamento: Alinhamento | null }> {
  for (let tentativa = 1; ; tentativa++) {
    let resposta: Response;
    try {
      resposta = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vozId())}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": chave(), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: texto,
          model_id: modeloId(),
          language_code: "pt",
          ...(anterior ? { previous_text: anterior } : {}),
          ...(seguinte ? { next_text: seguinte } : {}),
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (falha) {
      console.error("[dialys/voz] ElevenLabs indisponível", falha);
      throw new ErroVoz("VOZ_INDISPONIVEL", 502, "Não foi possível falar com o ElevenLabs agora.");
    }
    if (resposta.status === 429 && tentativa < TENTATIVAS_429) {
      await resposta.body?.cancel();
      await new Promise((r) => setTimeout(r, 700 * tentativa));
      continue;
    }
    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => "");
      console.error(`[dialys/voz] ElevenLabs respondeu ${resposta.status}`, detalhe.slice(0, 500));
      const semCredito = resposta.status === 401 && /quota|credit/i.test(detalhe);
      throw new ErroVoz(
        semCredito ? "VOZ_SEM_CREDITOS" : "VOZ_FALHOU",
        502,
        semCredito ? "Os créditos do ElevenLabs acabaram." : `O ElevenLabs recusou o pedido (HTTP ${resposta.status}).`,
      );
    }
    const corpo = (await resposta.json()) as { audio_base64: string; alignment?: Alinhamento | null; normalized_alignment?: Alinhamento | null };
    return { mp3: Buffer.from(corpo.audio_base64, "base64"), alinhamento: corpo.alignment ?? corpo.normalized_alignment ?? null };
  }
}
