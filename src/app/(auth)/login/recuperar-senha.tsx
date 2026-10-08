"use client";

import { CheckmarkFilled, CheckmarkOutline, CircleDash, Email, View, ViewOff } from "@carbon/icons-react";
import { useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { TextInput } from "@/components/ui/text-input";
import { cn } from "@/lib/cn";
import { conferirCodigoRecuperacao, pedirCodigoRecuperacao, trocarSenha } from "./recuperacao-actions";

type Etapa =
  | { nome: "email" }
  | { nome: "codigo"; email: string; emailMascarado: string; codigoSimulado: string; validadeMinutos: number }
  | { nome: "senha"; email: string; token: string }
  | { nome: "concluido"; email: string };

const TITULOS: Record<Etapa["nome"], string> = {
  email: "Recuperar acesso",
  codigo: "Digite o código",
  senha: "Crie uma nova senha",
  concluido: "Senha redefinida",
};
const NUMERO_ETAPA: Record<Etapa["nome"], number> = { email: 1, codigo: 2, senha: 3, concluido: 3 };

const BOTAO_SECUNDARIO =
  "inline-flex h-10 items-center rounded-[3px] border border-[#8D8D8D] px-4 text-[13px] font-medium text-text-primary transition-colors hover:bg-[#F2F2F2] disabled:cursor-not-allowed disabled:opacity-50";

/** Seis caixas para o código: digitar avança, apagar volta, colar preenche tudo. */
function CampoCodigo({ valor, onChange, invalido, desabilitado }: { valor: string; onChange: (v: string) => void; invalido: boolean; desabilitado: boolean }) {
  const caixas = useRef<Array<HTMLInputElement | null>>([]);
  const digitos = Array.from({ length: 6 }, (_, i) => valor[i] ?? "");

  useEffect(() => {
    caixas.current[0]?.focus();
  }, []);

  function definir(indice: number, digito: string) {
    const novo = digitos.slice();
    novo[indice] = digito;
    onChange(novo.join("").slice(0, 6));
  }

  function aoDigitar(indice: number, texto: string) {
    const numeros = texto.replace(/\D/g, "");
    if (!numeros) return;
    if (numeros.length > 1) {
      // Autocompletar do celular ou digitação rápida: preenche a partir desta caixa.
      const novo = (valor.slice(0, indice) + numeros).slice(0, 6);
      onChange(novo);
      caixas.current[Math.min(novo.length, 5)]?.focus();
      return;
    }
    definir(indice, numeros);
    caixas.current[Math.min(indice + 1, 5)]?.focus();
  }

  function aoTeclar(indice: number, evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Backspace" && !digitos[indice] && indice > 0) {
      evento.preventDefault();
      definir(indice - 1, "");
      caixas.current[indice - 1]?.focus();
    } else if (evento.key === "ArrowLeft" && indice > 0) caixas.current[indice - 1]?.focus();
    else if (evento.key === "ArrowRight" && indice < 5) caixas.current[indice + 1]?.focus();
  }

  function aoColar(evento: ClipboardEvent<HTMLInputElement>) {
    const numeros = evento.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!numeros) return;
    evento.preventDefault();
    onChange(numeros);
    caixas.current[Math.min(numeros.length, 5)]?.focus();
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Código de 6 dígitos">
      {digitos.map((digito, i) => (
        <input
          key={i}
          ref={(el) => {
            caixas.current[i] = el;
          }}
          value={digito}
          onChange={(evento) => (evento.target.value ? aoDigitar(i, evento.target.value) : definir(i, ""))}
          onKeyDown={(evento) => aoTeclar(i, evento)}
          onPaste={aoColar}
          onFocus={(evento) => evento.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={6}
          disabled={desabilitado}
          aria-label={`Dígito ${i + 1}`}
          aria-invalid={invalido || undefined}
          className={cn(
            "h-12 w-11 border-0 border-b-2 bg-field-01 text-center font-mono text-[20px] text-text-primary focus:outline-2 focus:-outline-offset-2 focus:outline-focus disabled:opacity-60",
            invalido ? "border-support-error" : "border-border-strong",
          )}
        />
      ))}
    </div>
  );
}

function Requisito({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={cn("flex items-center gap-1.5 text-[12px]", ok ? "text-[#198038]" : "text-text-secondary")}>
      {ok ? <CheckmarkOutline size={14} aria-hidden="true" /> : <CircleDash size={14} aria-hidden="true" />}
      {children}
      <span className="sr-only">{ok ? "(atendido)" : "(pendente)"}</span>
    </li>
  );
}

type Props = {
  aberto: boolean;
  /** O que já estava digitado no campo de e-mail do login. */
  emailInicial: string;
  onFechar: () => void;
  onConcluido: (email: string) => void;
};

/**
 * "Esqueceu a senha?" como nos sistemas reais: e-mail → código de 6 dígitos → nova senha. Tudo é
 * conferido no servidor; o envio do e-mail é simulado (a janela mostra a prévia do e-mail com o código).
 */
export function RecuperarSenha({ aberto, emailInicial, onFechar, onConcluido }: Props) {
  const id = useId();
  const [etapa, setEtapa] = useState<Etapa>({ nome: "email" });
  const [email, setEmail] = useState(emailInicial);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<{ texto: string; campo?: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [reenvioEm, setReenvioEm] = useState(0);
  const [abertoAntes, setAbertoAntes] = useState(false);

  // Abriu de novo: recomeça do e-mail, com o que estiver digitado no login.
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setEtapa({ nome: "email" });
      setEmail(emailInicial);
      setCodigo("");
      setSenha("");
      setConfirmacao("");
      setErro(null);
    }
  }

  // Contagem regressiva para reenviar o código.
  useEffect(() => {
    if (reenvioEm <= 0) return;
    const timer = window.setTimeout(() => setReenvioEm((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [reenvioEm]);

  async function pedirCodigo(destino: string) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await pedirCodigoRecuperacao(destino);
      if (!r.ok) {
        setErro({ texto: r.erro, campo: "email" });
        if (r.aguardarSegundos) setReenvioEm(r.aguardarSegundos);
        return;
      }
      setCodigo("");
      setReenvioEm(r.reenvioEmSegundos);
      setEtapa({ nome: "codigo", email: destino.trim(), emailMascarado: r.emailMascarado, codigoSimulado: r.codigoSimulado, validadeMinutos: r.validadeMinutos });
    } catch {
      setErro({ texto: "Não foi possível enviar o código agora. Tente de novo." });
    } finally {
      setOcupado(false);
    }
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (ocupado) return;
    if (etapa.nome === "email") {
      if (!email.trim()) return setErro({ texto: "Informe o e-mail da sua conta.", campo: "email" });
      return pedirCodigo(email);
    }
    if (etapa.nome === "codigo") {
      if (codigo.length !== 6) return setErro({ texto: "Digite os 6 números do código.", campo: "codigo" });
      setOcupado(true);
      setErro(null);
      try {
        const r = await conferirCodigoRecuperacao(etapa.email, codigo);
        if (r.ok) setEtapa({ nome: "senha", email: etapa.email, token: r.token });
        else {
          setErro({ texto: r.erro, campo: "codigo" });
          setCodigo("");
          if (r.novoCodigo) setReenvioEm(0);
        }
      } catch {
        setErro({ texto: "Não foi possível conferir o código agora. Tente de novo." });
      } finally {
        setOcupado(false);
      }
      return;
    }
    if (etapa.nome === "senha") {
      setOcupado(true);
      setErro(null);
      try {
        const r = await trocarSenha(etapa.token, senha, confirmacao);
        if (r.ok) setEtapa({ nome: "concluido", email: etapa.email });
        else if (r.reiniciar) {
          setEtapa({ nome: "email" });
          setErro({ texto: r.erro });
        } else setErro({ texto: r.erro, campo: r.campo });
      } catch {
        setErro({ texto: "Não foi possível redefinir a senha agora. Tente de novo." });
      } finally {
        setOcupado(false);
      }
      return;
    }
    onConcluido(etapa.email);
  }

  const formId = `${id}-form`;
  const requisitos = {
    tamanho: senha.length >= 8,
    letrasNumeros: /[A-Za-zÀ-ÿ]/.test(senha) && /\d/.test(senha),
    iguais: senha.length > 0 && senha === confirmacao,
  };

  const rodape =
    etapa.nome === "concluido" ? (
      <Button type="submit" form={formId} className="h-10 rounded-[3px] px-4 text-[13px] font-medium">
        Voltar para o login
      </Button>
    ) : (
      <>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={onFechar} disabled={ocupado}>
          Cancelar
        </button>
        <Button type="submit" form={formId} disabled={ocupado} aria-busy={ocupado} className="h-10 gap-2 rounded-[3px] px-4 text-[13px] font-medium">
          {ocupado ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-interactive border-t-transparent" aria-hidden="true" /> : null}
          {etapa.nome === "email" ? (ocupado ? "Enviando..." : "Enviar código") : etapa.nome === "codigo" ? (ocupado ? "Conferindo..." : "Confirmar código") : ocupado ? "Salvando..." : "Redefinir senha"}
        </Button>
      </>
    );

  return (
    <Dialogo
      aberto={aberto}
      titulo={TITULOS[etapa.nome]}
      rotulo={etapa.nome === "concluido" ? "Acesso recuperado" : `Etapa ${NUMERO_ETAPA[etapa.nome]} de 3`}
      ocupado={ocupado}
      onFechar={onFechar}
      rodape={rodape}
    >
      <form id={formId} onSubmit={enviar} noValidate>
        {etapa.nome === "email" ? (
          <>
            <p className="text-text-secondary">Informe o e-mail corporativo da sua conta. Vamos enviar um código de 6 dígitos para você criar uma nova senha.</p>
            <TextInput
              id={`${id}-email`}
              label="E-mail corporativo"
              type="email"
              autoComplete="username"
              placeholder="nome@totvs.com.br"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              aria-invalid={erro?.campo === "email" || undefined}
              autoFocus
              className="mt-5"
            />
          </>
        ) : null}

        {etapa.nome === "codigo" ? (
          <>
            <p className="text-text-secondary">
              Enviamos um código para <strong className="font-semibold text-text-primary">{etapa.emailMascarado}</strong>. Ele vale por{" "}
              {etapa.validadeMinutos} minutos.
            </p>

            {/* Prévia do e-mail: o piloto não envia e-mails de verdade. */}
            <figure className="mt-4 overflow-hidden rounded-[4px] border border-border-subtle bg-[#F4F4F4]" aria-label="E-mail simulado com o código">
              <figcaption className="flex items-center gap-1.5 border-b border-border-subtle bg-[#E8E8E8] px-3 py-1.5 text-[11px] font-medium tracking-[0.04em] text-text-secondary uppercase">
                <Email size={14} aria-hidden="true" />
                E-mail simulado · nenhum e-mail real foi enviado
              </figcaption>
              <div className="px-3 py-2.5 text-[12px] leading-[1.6] text-text-secondary">
                <p>
                  <span className="text-text-helper">De:</span> Dialys &lt;nao-responda@dialys.totvs.com.br&gt;
                </p>
                <p>
                  <span className="text-text-helper">Para:</span> {etapa.emailMascarado}
                </p>
                <p>
                  <span className="text-text-helper">Assunto:</span> Seu código de recuperação do Dialys
                </p>
                <p className="mt-2 text-[13px] text-text-primary">
                  Use o código{" "}
                  <strong className="font-mono text-[16px] tracking-[0.2em]">
                    {etapa.codigoSimulado.slice(0, 3)} {etapa.codigoSimulado.slice(3)}
                  </strong>{" "}
                  para criar uma nova senha. Ele expira em {etapa.validadeMinutos} minutos. Se não foi você que pediu, ignore este e-mail.
                </p>
              </div>
            </figure>

            <p className="mt-5 mb-2 text-[13px] text-text-primary">Código de verificação</p>
            <CampoCodigo valor={codigo} onChange={setCodigo} invalido={erro?.campo === "codigo"} desabilitado={ocupado} />
            <p className="mt-3 text-[12px] text-text-secondary">
              Não recebeu?{" "}
              {reenvioEm > 0 ? (
                <span className="tabular-nums">Reenviar em {reenvioEm} s</span>
              ) : (
                <button type="button" onClick={() => void pedirCodigo(etapa.email)} disabled={ocupado} className="font-medium text-[#0F62FE] hover:underline disabled:opacity-50">
                  Reenviar código
                </button>
              )}
              {" · "}
              <button type="button" onClick={() => setEtapa({ nome: "email" })} disabled={ocupado} className="font-medium text-[#0F62FE] hover:underline disabled:opacity-50">
                Usar outro e-mail
              </button>
            </p>
          </>
        ) : null}

        {etapa.nome === "senha" ? (
          <>
            <p className="text-text-secondary">Código confirmado. Crie a nova senha da conta {etapa.email}.</p>
            <TextInput
              id={`${id}-senha`}
              label="Nova senha"
              type={verSenha ? "text" : "password"}
              autoComplete="new-password"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              aria-invalid={erro?.campo === "senha" || undefined}
              autoFocus
              className="mt-5"
              trailing={
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  className="flex h-10 w-10 items-center justify-center text-text-primary hover:bg-[#E8E8E8]"
                  aria-label={verSenha ? "Ocultar senha" : "Exibir senha"}
                  aria-pressed={verSenha}
                >
                  {verSenha ? <ViewOff size={16} /> : <View size={16} />}
                </button>
              }
            />
            <TextInput
              id={`${id}-confirmacao`}
              label="Confirme a nova senha"
              type={verSenha ? "text" : "password"}
              autoComplete="new-password"
              value={confirmacao}
              onChange={(evento) => setConfirmacao(evento.target.value)}
              aria-invalid={erro?.campo === "confirmacao" || undefined}
              className="mt-4"
            />
            <ul className="mt-3 space-y-1" aria-label="Requisitos da senha">
              <Requisito ok={requisitos.tamanho}>Pelo menos 8 caracteres</Requisito>
              <Requisito ok={requisitos.letrasNumeros}>Letras e números</Requisito>
              <Requisito ok={requisitos.iguais}>As duas senhas iguais</Requisito>
            </ul>
          </>
        ) : null}

        {etapa.nome === "concluido" ? (
          <div className="flex items-start gap-3">
            <CheckmarkFilled size={24} className="mt-0.5 shrink-0 text-[#198038]" aria-hidden="true" />
            <p className="text-text-primary">
              A senha de <strong className="font-semibold">{etapa.email}</strong> foi redefinida. Entre com a nova senha.
            </p>
          </div>
        ) : null}

        {erro ? (
          <p role="alert" className="mt-4 text-[13px] text-support-error">
            {erro.texto}
          </p>
        ) : null}
      </form>
    </Dialogo>
  );
}
