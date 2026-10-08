"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/provedor-toast";
import { aguardarReuniao, api, ErroDaApi, type ReuniaoApi } from "@/lib/api-cliente";
import type { ExemploResumo } from "@/lib/transcricao";
import type { FalhaAnalise } from "./actions";
import { EnvioComposer, type EnvioTranscricao } from "./envio-composer";
import { AnalisandoView, FalhaAnaliseView } from "./resultado-analise";

type Estado =
  | { fase: "ocioso" }
  | { fase: "processando"; reuniao: ReuniaoApi | null }
  | { fase: "concluida"; reuniao: ReuniaoApi; destino: string }
  | { fase: "falhou"; falha: FalhaAnalise };

/** Tempo mostrando "Análise concluída" com todas as etapas marcadas antes de abrir o resultado. */
const PAUSA_CONCLUSAO_MS = 1200;

/** Concluída de verdade: status, resultado gravado e nenhuma etapa pendente, em andamento ou com falha. */
const analiseCompleta = (reuniao: ReuniaoApi) =>
  reuniao.status === "CONCLUIDA" &&
  reuniao.resultado !== null &&
  reuniao.etapas.every((etapa) => etapa.status === "CONCLUIDA" || etapa.status === "PULADA");

const TITULOS_ERRO: Record<string, string> = {
  TRANSCRICAO_VAZIA: "Transcrição vazia",
  TRANSCRICAO_LONGA: "Transcrição longa demais",
  CONTA_INVALIDA: "Conta inválida",
  SEM_CONEXAO: "Servidor indisponível",
  TEMPO_ESGOTADO: "Análise demorou demais",
};

const falha = (titulo: string, detalhe: string, semChave = false): FalhaAnalise => ({
  ok: false,
  titulo,
  detalhe,
  ...(semChave ? { semChave } : {}),
});

/**
 * Envio pela API pública (UC01/UC02): POST /api/v1/reunioes/processar responde na hora e o pipeline
 * roda no servidor; a tela acompanha as etapas em GET /api/v1/reunioes/{id}. Só quando a análise está
 * completa (todas as etapas concluídas e o resultado gravado), mostra isso, avisa e leva ao Dashboard
 * (onde os alertas novos aparecem destacados) ou, sem sinais, à reunião na Central de Insights.
 */
export function EnvioWorkspace({ exemplos }: { exemplos: ExemploResumo[] }) {
  const router = useRouter();
  const avisar = useToast();
  const [estado, setEstado] = useState<Estado>({ fase: "ocioso" });
  const resultadoRef = useRef<HTMLDivElement>(null);
  const cancelamento = useRef<AbortController | null>(null);

  // Saiu da página no meio da análise: para de acompanhar (e não redireciona depois). O servidor termina sozinho.
  useEffect(() => () => cancelamento.current?.abort(), []);

  async function processar({ texto, conta, contexto }: EnvioTranscricao) {
    cancelamento.current?.abort();
    const controle = new AbortController();
    cancelamento.current = controle;
    try {
      const aceita = await api.processarReuniao({
        texto,
        contexto: contexto ?? undefined,
        contaId: conta?.id,
        contaNome: conta?.nome,
      });
      setEstado({ fase: "processando", reuniao: aceita });
      const final = await aguardarReuniao(aceita.id, (reuniao) => setEstado({ fase: "processando", reuniao }), {
        sinal: controle.signal,
      });
      if (controle.signal.aborted) return;

      if (!analiseCompleta(final) || !final.resultado) {
        setEstado({
          fase: "falhou",
          falha: falha(final.falha?.titulo ?? "Erro inesperado", final.falha?.detalhe ?? "A análise não foi concluída.", final.falha?.semChave),
        });
        return;
      }

      const total = final.resultado.analise.sinais.length;
      const comSinais = total > 0;
      setEstado({ fase: "concluida", reuniao: final, destino: comSinais ? "o Dashboard" : "a reunião na Central de Insights" });
      // A pessoa vê todas as etapas concluídas antes de sair da tela.
      await new Promise((resolver) => setTimeout(resolver, PAUSA_CONCLUSAO_MS));
      if (controle.signal.aborted) return;
      avisar({
        titulo: "Análise concluída com sucesso!",
        descricao: `${total} ${total === 1 ? "sinal identificado" : "sinais identificados"} · ${final.conta.nome}.`,
      });
      router.push(comSinais ? `/dashboard?nova=${final.id}` : `/insights?reuniao=${encodeURIComponent(final.id)}`);
    } catch (erro) {
      if (controle.signal.aborted) return;
      const erroApi = erro instanceof ErroDaApi ? erro : new ErroDaApi(0, "ERRO", "Não foi possível concluir o envio.");
      setEstado({ fase: "falhou", falha: falha(TITULOS_ERRO[erroApi.codigo] ?? "Não foi possível enviar a reunião", erroApi.message) });
    }
  }

  function enviar(envio: EnvioTranscricao) {
    setEstado({ fase: "processando", reuniao: null });
    requestAnimationFrame(() => resultadoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    void processar(envio);
  }

  return (
    <>
      <EnvioComposer analisando={estado.fase === "processando" || estado.fase === "concluida"} onEnviar={enviar} exemplos={exemplos} />

      <div ref={resultadoRef} className="scroll-mt-16">
        {estado.fase === "processando" ? (
          <div className="mt-6">
            <AnalisandoView etapas={estado.reuniao?.etapas} />
          </div>
        ) : estado.fase === "concluida" ? (
          <div className="mt-6">
            <AnalisandoView etapas={estado.reuniao.etapas} concluida destino={estado.destino} />
          </div>
        ) : estado.fase === "falhou" ? (
          <div className="mt-6">
            <FalhaAnaliseView falha={estado.falha} />
          </div>
        ) : null}
      </div>
    </>
  );
}
