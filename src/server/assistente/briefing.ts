// Briefing do dia dentro da conversa: a única resposta do assistente que a tela lê em voz.
// Montado no servidor, sem IA, a partir do resumo das contas que o usuário pode ver; por isso
// funciona igual com o Claude ou no modo demonstração, e os fatos lidos são os dos dados.
import { montarBriefing, type TrechoBriefing } from "@/lib/briefing";
import { normalizarBusca } from "@/lib/formatar";
import { horaNoFuso } from "@/lib/fuso";
import { compromissosDeHoje } from "../agenda/agenda";
import { podeAcessarConta, type Usuario } from "../auth/usuarios";
import { fusoHorario } from "../config/dados";
import { montarResumo } from "../insights/resumo";
import { temDataInformada } from "@/lib/insights";
import { dataDaReuniao, type EntidadeConta, type EntidadeReuniao } from "./ferramentas";

/** Pedido de briefing em texto: "briefing", "resumo do dia", "como está meu dia?", "o que preciso saber hoje?". */
export function ehPedidoDeBriefing(pergunta: string) {
  const q = normalizarBusca(pergunta);
  return /\bbriefing\b|resumo (do|de) (hoje|dia)|(como (esta|ta)|qual (e )?) ?(o )?meu dia|o que (eu )?preciso saber hoje|panorama (do dia|de hoje)/.test(q);
}

/** Trechos em parágrafos (como o roteiro foi escrito), para exibir no chat. */
function emTexto(trechos: TrechoBriefing[]) {
  const paragrafos: string[][] = [];
  trechos.forEach((t, i) => {
    if (i === 0 || t.novoParagrafo) paragrafos.push([]);
    paragrafos[paragrafos.length - 1].push(t.texto);
  });
  return paragrafos.map((p) => p.join(" ")).join("\n\n");
}

export async function gerarBriefingDoUsuario(usuario: Usuario, agora: Date) {
  const resumo = await montarResumo(usuario.id, agora, (contaId) => podeAcessarConta(usuario, contaId));
  // Agenda do usuário (mesma fonte da home): só o que ainda vai acontecer hoje e não foi cancelado.
  const fuso = fusoHorario();
  const compromissos = (await compromissosDeHoje(usuario, agora))
    .filter((c) => c.status === "agendado" && Date.parse(c.fim) > agora.getTime())
    .map((c) => ({ titulo: c.titulo, inicio: horaNoFuso(new Date(c.inicio), fuso), cliente: c.cliente?.nome ?? null }));
  const briefing = montarBriefing(resumo, agora, usuario.nome.split(" ")[0], { compromissos, fuso });

  const contas = new Map<string, EntidadeConta>();
  const reunioes = new Map<string, EntidadeReuniao>();
  for (const u of resumo.urgencias) {
    contas.set(u.conta.id, { id: u.conta.id, nome: u.conta.nome });
    reunioes.set(u.reuniao.id, {
      id: u.reuniao.id,
      contaId: u.conta.id,
      contaNome: u.conta.nome,
      codigo: u.reuniao.codigo,
      data: dataDaReuniao({ contexto: u.reuniao.contexto ?? undefined, criadaEm: u.reuniao.criadaEm }),
      dataInformada: temDataInformada({ contexto: u.reuniao.contexto }),
    });
  }
  for (const item of resumo.agenda) if (!contas.has(item.conta.id)) contas.set(item.conta.id, item.conta);

  return {
    texto: emTexto(briefing.trechos),
    fala: briefing.trechos,
    contas: [...contas.values()],
    reunioes: [...reunioes.values()],
    resumoConsulta: `briefing do dia com ${resumo.urgencias.length} alerta(s), ${compromissos.length} compromisso(s) e ${resumo.agenda.length} ação(ões) sugerida(s)`,
  };
}
