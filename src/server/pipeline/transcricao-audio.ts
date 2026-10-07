// Etapa de STT (fala para texto, pt-BR, com diarização). No piloto não há provedor ligado: as opções
// (AssemblyAI, Whisper via API, Deepgram) são pagas por minuto de áudio e a demonstração usa
// transcrições prontas. Para ligar, implemente ServicoTranscricao e devolva-o em servicoTranscricao().

export type AudioRecebido = { nomeArquivo: string; tipoMime: string; bytes: Uint8Array };

export type ServicoTranscricao = {
  nome: string;
  /** Devolve o texto no formato "[LOCUTOR N]: fala", uma fala por linha. */
  transcrever: (audio: AudioRecebido) => Promise<string>;
};

export const EXTENSOES_AUDIO = [".mp3", ".wav", ".m4a", ".ogg", ".webm"];

export function ehAudio(nomeArquivo: string, tipoMime: string) {
  const extensao = nomeArquivo.slice(nomeArquivo.lastIndexOf(".")).toLowerCase();
  return tipoMime.startsWith("audio/") || EXTENSOES_AUDIO.includes(extensao);
}

/** Provedor configurado, ou null quando o piloto roda sem STT (padrão). */
export function servicoTranscricao(): ServicoTranscricao | null {
  return null;
}
