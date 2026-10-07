"use client";

import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { Toast } from "./toast";

type Aviso = { titulo: string; descricao?: string };

const ContextoToast = createContext<(aviso: Aviso) => void>(() => {});

/**
 * Toast no layout das telas: sobrevive à navegação, então uma tela pode avisar e redirecionar
 * na sequência (ex.: "Análise concluída" no /envio → /dashboard).
 */
export function ProvedorToast({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<(Aviso & { id: number }) | null>(null);
  const mostrar = useCallback((novo: Aviso) => setAviso({ ...novo, id: Date.now() }), []);
  const fechar = useCallback(() => setAviso(null), []);

  return (
    <ContextoToast value={mostrar}>
      {children}
      {aviso ? <Toast key={aviso.id} titulo={aviso.titulo} descricao={aviso.descricao} onClose={fechar} duracao={6000} /> : null}
    </ContextoToast>
  );
}

export const useToast = () => use(ContextoToast);
