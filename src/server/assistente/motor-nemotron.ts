// Motor do assistente sobre o NVIDIA Nemotron gratuito (OpenRouter), o mesmo modelo da análise de reuniões.
// As consultas controladas viram tools no formato da OpenAI; aqui roda o laço pergunta → consulta →
// resultado → resposta (o que o Tool Runner faz no motor Claude). Os argumentos de cada chamada são
// validados de novo, com checagem de permissão, por `consultar` (executarFerramenta).
import { z } from "zod";
import { chamarChatNemotron, semRaciocinio, type MensagemChat, type OpcoesNemotron } from "../ai/analisar-reuniao-nemotron";
import { FERRAMENTAS } from "./ferramentas";
import { ErroAssistente, type MotorAssistente } from "./motor";
import { montarMensagens } from "./motor-claude";
import { PROMPT_ASSISTENTE } from "./prompt-assistente";

/** Teto de idas e voltas pergunta → consulta numa resposta (o mesmo do motor Claude). */
const MAXIMO_ITERACOES = 8;

/** Schema JSON de cada consulta, gerado uma vez (sem o $schema, que alguns provedores recusam). */
const TOOLS = FERRAMENTAS.map((ferramenta) => {
  const { $schema: _schema, ...parametros } = z.toJSONSchema(ferramenta.esquema) as Record<string, unknown>;
  void _schema;
  return { type: "function" as const, function: { name: ferramenta.nome, description: ferramenta.descricao, parameters: parametros } };
});

/** Agradecimento ou cumprimento curto: não pede dados, então não exige consulta. */
const ehMensagemSocial = (pergunta: string) =>
  pergunta.length <= 40 && /^(obrigad|valeu|vlw|ok\b|beleza|perfeito|otimo|ótimo|show|oi\b|ola|olá|bom dia|boa tarde|boa noite|tchau|ate mais|até mais)/i.test(pergunta.trim());

function lerArgumentos(texto: string): unknown {
  try {
    return texto.trim() ? JSON.parse(texto) : {};
  } catch {
    // Argumento malformado vira erro de validação na consulta, que o modelo lê e corrige.
    return { argumentosInvalidos: texto.slice(0, 200) };
  }
}

export function criarMotorNemotron(opcoes: OpcoesNemotron = {}): MotorAssistente {
  return {
    nome: "nemotron",
    async responder(entrada) {
      const mensagens: MensagemChat[] = [
        { role: "system", content: PROMPT_ASSISTENTE },
        // O histórico e o contexto da sessão são texto puro: o formato serve aos dois motores.
        ...montarMensagens(entrada).map((m): MensagemChat => ({ role: m.role, content: String(m.content) })),
      ];

      const exigirConsulta = !ehMensagemSocial(entrada.pergunta);
      for (let iteracao = 0; iteracao < MAXIMO_ITERACOES; iteracao++) {
        // A primeira rodada exige uma consulta: sem isso o modelo gratuito chega a responder só com o
        // histórico (sem fontes e completando o que falta). Depois ele decide quando já tem o bastante.
        const resposta = await chamarChatNemotron(
          { messages: mensagens, tools: TOOLS, tool_choice: iteracao === 0 && exigirConsulta ? "required" : "auto", max_tokens: 8000 },
          opcoes,
        );
        const escolha = resposta.choices?.[0];
        const mensagem = escolha?.message;
        if (mensagem?.refusal || escolha?.finish_reason === "content_filter") {
          throw new ErroAssistente("ASSISTENTE_RECUSOU", 422, "O modelo não respondeu a esta pergunta. Reformule e tente novamente.");
        }

        const chamadas = mensagem?.tool_calls ?? [];
        if (chamadas.length) {
          mensagens.push({ role: "assistant", content: mensagem?.content ?? null, tool_calls: chamadas });
          for (const chamada of chamadas) {
            // Só o campo `dados` vai para o modelo; a execução valida de novo e checa permissão.
            const resultado = await entrada.consultar(chamada.function.name, lerArgumentos(chamada.function.arguments));
            mensagens.push({ role: "tool", tool_call_id: chamada.id, content: JSON.stringify(resultado.dados) });
          }
          continue;
        }

        const texto = semRaciocinio(mensagem?.content ?? "");
        if (!texto) throw new ErroAssistente("RESPOSTA_VAZIA", 502, "O modelo não devolveu texto. Tente novamente.");
        return { texto: escolha?.finish_reason === "length" ? `${texto}\n\n(Resposta cortada por tamanho.)` : texto };
      }
      return { texto: "Precisei de consultas demais para esta pergunta e parei antes de concluir. Tente uma pergunta mais específica." };
    },
  };
}
