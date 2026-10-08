// Amostra de reuniões reais enviada pela TOTVS (data/exemplos/totvs/*.json, formato amostra_reunioes.json).
// Aparece no menu Exemplo da tela de envio; a análise segue o motor configurado (Claude ou regras locais).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { extrairReunioes, type ReuniaoImportada } from "@/lib/transcricao";

export function lerAmostraTotvs(): ReuniaoImportada[] {
  let arquivos: string[];
  try {
    arquivos = readdirSync(path.join(process.cwd(), "data", "exemplos", "totvs"))
      .filter((nome) => nome.toLowerCase().endsWith(".json"))
      .sort();
  } catch {
    return [];
  }

  const vistas = new Set<string>();
  const reunioes: ReuniaoImportada[] = [];
  for (const arquivo of arquivos) {
    try {
      // Caminho escrito de forma estática para o build rastrear só data/exemplos/totvs.
      const conteudo = readFileSync(path.join(process.cwd(), "data", "exemplos", "totvs", arquivo), "utf8");
      const lidas = extrairReunioes(conteudo);
      if (!lidas) throw new Error("não é um JSON válido");
      for (const reuniao of lidas) {
        // A amostra tem reuniões repetidas com outro ID (ex.: 1070370 e 1070373).
        if (vistas.has(reuniao.transcricao)) continue;
        vistas.add(reuniao.transcricao);
        reunioes.push(reuniao);
      }
    } catch (erro) {
      console.warn(`[dialys/exemplos] amostra ignorada (${arquivo}): ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
  // Mais recentes primeiro.
  return reunioes.sort((a, b) => (b.contexto.data ?? "").localeCompare(a.contexto.data ?? ""));
}
