// Transcrições do menu Exemplo: a amostra real (anonimizada) enviada pela TOTVS.
// A lista vai para a página só com títulos; o texto é buscado ao escolher (página leve).
import type { ExemploCompleto, ExemploResumo } from "@/lib/transcricao";
import { lerAmostraTotvs } from "./amostra-totvs";

export const GRUPO_AMOSTRA = "Reuniões reais · amostra TOTVS anonimizada";

const ID_AMOSTRA = "totvs-";

export function listarExemplos(): ExemploResumo[] {
  return lerAmostraTotvs().map((reuniao) => ({
    id: `${ID_AMOSTRA}${reuniao.id}`,
    titulo: reuniao.titulo,
    descricao: reuniao.descricao,
    grupo: GRUPO_AMOSTRA,
  }));
}

export function buscarExemplo(id: string): ExemploCompleto | null {
  if (!id.startsWith(ID_AMOSTRA)) return null;
  const reuniao = lerAmostraTotvs().find((r) => r.id === id.slice(ID_AMOSTRA.length));
  return reuniao ? { transcricao: reuniao.transcricao, contexto: reuniao.contexto } : null;
}
