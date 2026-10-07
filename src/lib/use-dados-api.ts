"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { ErroDaApi } from "./api-cliente";

type Estado<T> = { dados: T | null; erro: ErroDaApi | null; atualizadoEm: Date | null };

/**
 * Busca dados da API e mantém atualizados: repete a cada `intervaloMs` com a aba visível e logo que
 * a aba volta ao foco. Em erro, mantém os últimos dados (a tela não pisca) e expõe o erro.
 */
export function useDadosApi<T>(carregar: () => Promise<T>, intervaloMs = 10_000) {
  const [estado, setEstado] = useState<Estado<T>>({ dados: null, erro: null, atualizadoEm: null });
  /** Incrementado por recarregar(): refaz a busca na hora e reinicia o intervalo. */
  const [versao, setVersao] = useState(0);

  const buscar = useEffectEvent(async () => {
    try {
      const dados = await carregar();
      setEstado({ dados, erro: null, atualizadoEm: new Date() });
    } catch (erro) {
      const erroApi = erro instanceof ErroDaApi ? erro : new ErroDaApi(0, "ERRO", "Falha ao carregar os dados.");
      setEstado((anterior) => ({ ...anterior, erro: erroApi }));
    }
  });

  useEffect(() => {
    const inicial = window.setTimeout(() => void buscar(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void buscar();
    }, intervaloMs);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      window.clearTimeout(inicial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [intervaloMs, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  return { ...estado, carregando: estado.dados === null && estado.erro === null, recarregar };
}
