import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** React 19: ref é uma prop comum e vai direto para o <input>. */
  ref?: Ref<HTMLInputElement>;
  id: string;
  label: string;
  /** Elemento à direita dentro do campo (ex.: botão de exibir senha). */
  trailing?: ReactNode;
};

/** Campo no padrão Carbon: fundo field-01, borda inferior e foco com contorno de 2px. */
export function TextInput({ id, label, trailing, className, ...props }: TextInputProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-[13px] leading-4 text-text-primary">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={cn(
            "h-10 w-full border-0 border-b border-border-strong bg-field-01 px-4 text-[13px] text-text-primary",
            "placeholder:text-text-placeholder focus:outline-2 focus:-outline-offset-2 focus:outline-focus",
            trailing ? "pr-11" : undefined,
          )}
          {...props}
        />
        {trailing ? <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div> : null}
      </div>
    </div>
  );
}
