"use client";

import { ArrowLeft, ArrowRight, View, ViewOff } from "@carbon/icons-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { criarConta } from "./actions";

const CARGOS = [
  { valor: "diretor", rotulo: "Diretor(a) Comercial" },
  { valor: "gerente", rotulo: "Gerente Comercial" },
  { valor: "vendedor", rotulo: "Executivo(a) de Contas" },
] as const;

/** "Criar conta": cada conta tem os próprios clientes e reuniões, gravados no servidor. */
export function CriarConta({ onVoltar }: { onVoltar: () => void }) {
  const [estado, enviar, enviando] = useActionState(criarConta, null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const invalido = (campo: string) => (estado?.campo === campo ? true : undefined);
  const valores = estado?.valores;

  return (
    <div className="w-full max-w-[332px]">
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-1.5 text-[12px] text-text-primary underline-offset-[3px] hover:underline"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar para o login
      </button>

      <h1 className="mt-5 text-[22px] leading-7 font-normal text-text-primary">Criar conta</h1>
      <p className="mt-2 text-[12px] leading-[1.6] text-text-secondary">
        Sua conta começa vazia: os clientes e insights são os das reuniões que você enviar. Ninguém mais os vê.
      </p>

      {/* key: depois de um erro, os campos voltam preenchidos com o que foi enviado (as senhas não). */}
      <form key={JSON.stringify(valores ?? {})} className="mt-7 space-y-5" action={enviar} noValidate>
        <TextInput
          id="cadastro-nome"
          name="nome"
          label="Nome completo"
          placeholder="Como você quer ser chamado"
          autoComplete="name"
          defaultValue={valores?.nome}
          aria-invalid={invalido("nome")}
          autoFocus
          required
        />
        <TextInput
          id="cadastro-email"
          name="email"
          type="email"
          label="E-mail corporativo"
          placeholder="nome@empresa.com.br"
          autoComplete="email"
          defaultValue={valores?.email}
          aria-invalid={invalido("email")}
          required
        />
        <div>
          <label htmlFor="cadastro-papel" className="mb-2 block text-[13px] leading-4 text-text-primary">
            Cargo
          </label>
          <select
            id="cadastro-papel"
            name="papel"
            defaultValue={valores?.papel || "vendedor"}
            aria-invalid={invalido("papel")}
            className="h-10 w-full border-0 border-b border-border-strong bg-field-01 px-4 text-[13px] text-text-primary focus:outline-2 focus:-outline-offset-2 focus:outline-focus"
          >
            {CARGOS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
        <TextInput
          id="cadastro-senha"
          name="senha"
          type={mostrarSenha ? "text" : "password"}
          label="Senha"
          placeholder="Letras e números, 8 ou mais"
          autoComplete="new-password"
          aria-invalid={invalido("senha")}
          aria-describedby="cadastro-regra-senha"
          required
          trailing={
            <button
              type="button"
              onClick={() => setMostrarSenha((v) => !v)}
              className="flex h-10 w-10 items-center justify-center text-text-primary hover:bg-[#E8E8E8]"
              aria-label={mostrarSenha ? "Ocultar senha" : "Exibir senha"}
              aria-pressed={mostrarSenha}
            >
              {mostrarSenha ? <ViewOff size={16} /> : <View size={16} />}
            </button>
          }
        />
        <p id="cadastro-regra-senha" className="-mt-3 text-[11px] text-text-secondary">
          Pelo menos 8 caracteres, com letras e números.
        </p>
        <TextInput
          id="cadastro-confirmacao"
          name="confirmacao"
          type={mostrarSenha ? "text" : "password"}
          label="Confirme a senha"
          placeholder="Digite a senha de novo"
          autoComplete="new-password"
          aria-invalid={invalido("confirmacao")}
          required
        />

        {estado?.erro ? (
          <p role="alert" className="text-[13px] text-support-error">
            {estado.erro}
          </p>
        ) : null}

        <Button type="submit" disabled={enviando} className="mt-3 h-10 w-full justify-between rounded-[3px] px-4 text-[13px] font-medium">
          {enviando ? "Criando conta…" : "Criar conta e entrar"}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
