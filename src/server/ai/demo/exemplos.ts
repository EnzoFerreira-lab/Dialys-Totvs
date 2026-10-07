// Transcrições do menu Exemplo: a amostra real da TOTVS e os cenários roteirizados.
// A lista vai para a página só com títulos; o texto é buscado ao escolher (página leve).
import type { ExemploCompleto, ExemploResumo } from "@/lib/transcricao";
import { lerAmostraTotvs } from "./amostra-totvs";
import { lerCenarios } from "./cenarios";

export const GRUPO_AMOSTRA = "Reuniões reais · amostra TOTVS anonimizada";
export const GRUPO_CENARIOS = "Cenários roteirizados";

const ID_AMOSTRA = "totvs-";
const ID_CENARIO = "cenario-";

export function listarExemplos(): ExemploResumo[] {
  return [
    ...lerAmostraTotvs().map((reuniao) => ({
      id: `${ID_AMOSTRA}${reuniao.id}`,
      titulo: reuniao.titulo,
      descricao: reuniao.descricao,
      grupo: GRUPO_AMOSTRA,
    })),
    ...lerCenarios().cenarios.map((cenario) => ({
      id: `${ID_CENARIO}${cenario.id}`,
      titulo: cenario.titulo,
      grupo: GRUPO_CENARIOS,
    })),
  ];
}

export function buscarExemplo(id: string): ExemploCompleto | null {
  if (id.startsWith(ID_AMOSTRA)) {
    const reuniao = lerAmostraTotvs().find((r) => r.id === id.slice(ID_AMOSTRA.length));
    return reuniao ? { transcricao: reuniao.transcricao, contexto: reuniao.contexto } : null;
  }
  if (id.startsWith(ID_CENARIO)) {
    const cenario = lerCenarios().cenarios.find((c) => c.id === id.slice(ID_CENARIO.length));
    return cenario ? { transcricao: cenario.transcricao, contaId: cenario.contaId } : null;
  }
  return null;
}
