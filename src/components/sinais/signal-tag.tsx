import { Chat, Enterprise, Growth, Product, Warning, WarningFilled } from "@carbon/icons-react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SignalVariant =
  | "churn-critico"
  | "churn-atencao"
  | "oportunidade"
  | "objecao"
  | "produto-em-uso"
  | "concorrente";

/** Tags de criticidade (docs/ARQUITETURA.md §5.2): sempre ícone + rótulo, nunca só cor. Contraste ≥ 6,9:1. */
const VARIANTS: Record<SignalVariant, { className: string; icon: ComponentType<{ size?: number; className?: string }> }> = {
  "churn-critico": { className: "bg-[#FFD7D9] text-[#750E13]", icon: WarningFilled },
  "churn-atencao": { className: "bg-[#FFD9BE] text-[#8A3800]", icon: Warning },
  oportunidade: { className: "bg-[#A7F0BA] text-[#044317]", icon: Growth },
  objecao: { className: "bg-[#FCF4D6] text-[#684E00]", icon: Chat },
  "produto-em-uso": { className: "bg-[#D0E2FF] text-[#002D9C]", icon: Product },
  concorrente: { className: "bg-[#E0E0E0] text-[#161616]", icon: Enterprise },
};

type SignalTagProps = {
  variant: SignalVariant;
  children: ReactNode;
  className?: string;
};

export function SignalTag({ variant, children, className }: SignalTagProps) {
  const { className: cores, icon: Icon } = VARIANTS[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold tracking-[0.04em]",
        cores,
        className,
      )}
    >
      <Icon size={12} className="shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
