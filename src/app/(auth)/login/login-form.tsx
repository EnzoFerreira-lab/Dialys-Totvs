"use client";

import { ArrowRight, Locked, Security, View, ViewOff } from "@carbon/icons-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { entrar } from "./actions";

export function LoginForm() {
  // ?volta=/assistente: depois de entrar, volta para a página que pediu a sessão.
  const volta = useSearchParams().get("volta") ?? "";
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="w-full max-w-[332px]">
      <span className="inline-flex items-center gap-1.5 rounded-[2px] bg-[#F2F2F2] px-2 py-1 text-[11px] leading-none text-text-secondary">
        <Locked size={12} aria-hidden="true" />
        Acesso Restrito Enterprise
      </span>

      <h1 className="mt-5 text-[22px] leading-7 font-normal text-text-primary">Bem-vindo ao Dialys</h1>
      <p className="mt-2 text-[12px] leading-[1.6] text-text-secondary">
        Insira suas credenciais corporativas TOTVS
        <br />
        para acessar o painel.
      </p>

      {/* Piloto: qualquer credencial entra; a ação cria a sessão assinada no servidor (T02 troca pelo IdP). */}
      <form className="mt-9" action={entrar} onSubmit={() => setSubmitting(true)} noValidate>
        <input type="hidden" name="volta" value={volta} />
        <TextInput
          id="email"
          name="email"
          type="email"
          label="Usuário ou E-mail Corporativo"
          placeholder="Digite seu E-mail"
          autoComplete="username"
        />

        <TextInput
          id="senha"
          name="senha"
          type={showPassword ? "text" : "password"}
          label="Senha"
          placeholder="Digite sua senha"
          autoComplete="current-password"
          className="mt-6"
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="flex h-10 w-10 items-center justify-center text-text-primary hover:bg-[#E8E8E8]"
              aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
              aria-pressed={showPassword}
            >
              {showPassword ? <ViewOff size={16} /> : <View size={16} />}
            </button>
          }
        />

        <div className="mt-3 flex justify-end">
          <a
            href="#"
            className="text-[12px] leading-4 text-text-primary underline underline-offset-[3px] hover:text-text-secondary"
          >
            Esqueceu a senha?
          </a>
        </div>

        <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-[12px] text-text-secondary">
          <input
            type="checkbox"
            name="lembrar"
            className="h-4 w-4 cursor-pointer appearance-none rounded-[1px] border border-text-primary bg-white bg-center bg-no-repeat checked:border-shell checked:bg-shell checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%3E%3Cpath%20fill=%22none%22%20stroke=%22white%22%20stroke-width=%221.8%22%20d=%22M3.5%208.2l3%203%206-6.4%22/%3E%3C/svg%3E')]"
          />
          Lembrar meu acesso neste dispositivo
        </label>

        <Button
          type="submit"
          disabled={submitting}
          className="mt-8 h-10 w-full justify-between rounded-[3px] px-4 text-[13px] font-medium"
        >
          Entrar na Plataforma
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </form>

      <div className="mt-6 border-t border-[#C6C6C6] pt-4">
        <p className="flex items-center justify-center gap-2 text-[11px] text-text-secondary">
          <Security size={14} aria-hidden="true" />
          Ambiente seguro. Acesso exclusivo para autorizados.
        </p>
      </div>
    </div>
  );
}
