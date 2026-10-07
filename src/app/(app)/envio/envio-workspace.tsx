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
  | { fase: "falhou"; falha: FalhaAnalise };

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
 * roda no servidor; a tela acompanha as etapas em GET /api/v1/reunioes/{id}. No fim, avisa e leva ao
 * Painel (onde os alertas novos aparecem destacados) ou, sem sinais, à conta na Central de Insights.
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

      if (final.status === "FALHOU" || !final.resultado) {
        setEstado({
          fase: "falhou",
          falha: falha(final.falha?.titulo ?? "Erro inesperado", final.falha?.detalhe ?? "A análise não foi concluída.", final.falha?.semChave),
        });
        return;
      }

      const total = final.resultado.analise.sinais.length;
      avisar({
        titulo: "Análise concluída com sucesso!",
        descricao: `${total} ${total === 1 ? "sinal identificado" : "sinais identificados"} · ${final.conta.nome}.`,
      });
      router.push(total > 0 ? `/dashboard?nova=${final.id}` : `/insights?reuniao=${encodeURIComponent(final.id)}`);
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
      <EnvioComposer analisando={estado.fase === "processando"} onEnviar={enviar} exemplos={exemplos} />

      <div ref={resultadoRef} className="scroll-mt-16">
        {estado.fase === "processando" ? (
          <div className="mt-6">
            <AnalisandoView etapas={estado.reuniao?.etapas} />
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
