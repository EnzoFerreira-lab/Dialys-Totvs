import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "ghost" | "perigo";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-interactive text-on-interactive hover:bg-interactive-hover active:bg-interactive-active disabled:bg-[#E0E0E0] disabled:text-[#8D8D8D]",
  perigo: "bg-[#DA1E28] text-white hover:bg-[#B81921] active:bg-[#750E13] disabled:bg-[#E0E0E0] disabled:text-[#8D8D8D]",
  ghost:
    "bg-transparent text-text-primary hover:bg-[#E8E8E8] active:bg-[#C6C6C6] disabled:text-text-placeholder disabled:hover:bg-transparent",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center transition-colors duration-100 disabled:cursor-not-allowed",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
