// Transcrições do menu Exemplo: a amostra real (anonimizada) enviada pela TOTVS.
// A lista vai para a página só com títulos; o texto é buscado ao escolher (página leve).
// Agrupada por empresa (mesmo nome da Central, do Dashboard e de Clientes), em ordem alfabética, com as
// empresas sem nome no fim; dentro de cada empresa, da reunião mais recente para a mais antiga.
import { descreverContexto, type ExemploCompleto, type ExemploResumo } from "@/lib/transcricao";
import { nomeDoCliente } from "../../clientes/identificacao";
import { lerAmostraTotvs } from "./amostra-totvs";

const ID_AMOSTRA = "totvs-";
const SEM_EMPRESA = "Sem cliente identificado";

export function listarExemplos(): ExemploResumo[] {
  const itens = lerAmostraTotvs().map((reuniao) => {
    const codigo = reuniao.contexto.codigoCliente;
    const nome = nomeDoCliente(reuniao.contexto);
    return { reuniao, empresa: nome ?? (codigo ? `Cliente ${codigo}` : SEM_EMPRESA), semNome: !nome };
  });
  const porEmpresa = new Map<string, number>();
  for (const { empresa } of itens) porEmpresa.set(empresa, (porEmpresa.get(empresa) ?? 0) + 1);
  const grupo = (empresa: string) => {
    const total = porEmpresa.get(empresa) ?? 0;
    return `${empresa} · ${total} ${total === 1 ? "reunião" : "reuniões"}`;
  };

  return itens
    .sort(
      (a, b) =>
        // Sem nome (só o código ou nem isso) vai para o fim.
        Number(a.semNome) - Number(b.semNome) ||
        Number(a.empresa === SEM_EMPRESA) - Number(b.empresa === SEM_EMPRESA) ||
        a.empresa.localeCompare(b.empresa, "pt-BR") ||
        (b.reuniao.contexto.data ?? "").localeCompare(a.reuniao.contexto.data ?? ""),
    )
    .map(({ reuniao, empresa }) => ({
      id: `${ID_AMOSTRA}${reuniao.id}`,
      titulo: `Reunião #${reuniao.id}`,
      descricao: descreverContexto(reuniao.contexto) || "Sem metadados",
      grupo: grupo(empresa),
    }));
}

export function buscarExemplo(id: string): ExemploCompleto | null {
  if (!id.startsWith(ID_AMOSTRA)) return null;
  const reuniao = lerAmostraTotvs().find((r) => r.id === id.slice(ID_AMOSTRA.length));
  return reuniao ? { transcricao: reuniao.transcricao, contexto: reuniao.contexto } : null;
}
