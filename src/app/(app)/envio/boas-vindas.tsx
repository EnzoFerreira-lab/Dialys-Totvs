"use client";

import { CheckmarkFilled } from "@carbon/icons-react";
import { useSearchParams } from "next/navigation";

/** Logo depois de "Criar conta" (?boasVindas=1): explica que a carteira começa vazia e qual é o primeiro passo. */
export function BoasVindas() {
  if (useSearchParams().get("boasVindas") !== "1") return null;
  return (
    <p role="status" className="mt-8 flex items-start gap-3 border-l-[3px] border-[#24A148] bg-[#DEFBE6] px-4 py-3 text-[13px] leading-[1.5] text-text-primary">
      <CheckmarkFilled size={16} className="mt-0.5 shrink-0 text-[#198038]" aria-hidden="true" />
      <span>
        <span className="font-medium">Conta criada.</span> Sua carteira começa vazia: envie a primeira reunião (ou escolha uma em
        Exemplo) e os clientes, alertas e o assistente passam a usar os seus dados. Ninguém mais vê o que você enviar.
      </span>
    </p>
  );
}
