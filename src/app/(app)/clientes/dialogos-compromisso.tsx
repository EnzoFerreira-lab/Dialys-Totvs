"use client";

import { ArrowRight, Calendar, Checkmark, Edit, Location, Renew, User } from "@carbon/icons-react";
import Link from "next/link";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { useToast } from "@/components/ui/provedor-toast";
import { LIMITE_LOCAL, LIMITE_OBSERVACOES, LIMITE_TITULO, MENSAGEM_TERMINO, ROTULO_STATUS, type Compromisso, type StatusCompromisso } from "@/lib/agenda";
import { api, ErroDaApi, type ClienteResumo } from "@/lib/api-cliente";
import { cn } from "@/lib/cn";
import { dataNoFuso, horaNoFuso, paraInstante, rotuloDia, type DataCivil } from "@/lib/fuso";
import { EVENTO_CARTEIRA_ALTERADA } from "@/lib/eventos";
import { COR_STATUS, intervalo } from "./estilo-compromisso";

const BOTAO_SECUNDARIO =
  "inline-flex h-10 items-center gap-2 rounded-[4px] border border-[#8D8D8D] px-3 text-[13px] font-medium text-text-primary transition-colors hover:bg-[#F2F2F2] disabled:cursor-not-allowed disabled:opacity-50";
const BOTAO_PRIMARIO = "h-10 gap-2 rounded-[4px] px-4 text-[13px] font-medium";

function Linha({ icone, rotulo, children }: { icone: ReactNode; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <span className="mt-0.5 shrink-0 text-text-secondary" aria-hidden="true">
        {icone}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-text-secondary">{rotulo}</p>
        <div className="text-[14px] text-text-primary">{children}</div>
      </div>
    </div>
  );
}

// ---- Detalhes ---------------------------------------------------------------------------------

type DetalheProps = {
  compromisso: Compromisso | null;
  fuso: string;
  onFechar: () => void;
  onEditar: (compromisso: Compromisso) => void;
  /** Depois de mudar o status (cancelar, concluir, reativar). */
  onAlterado: (compromisso: Compromisso) => void;
};

export function DetalheCompromisso({ compromisso, fuso, onFechar, onEditar, onAlterado }: DetalheProps) {
  const toast = useToast();
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abertoPara, setAbertoPara] = useState<string | null>(null);

  // Outro compromisso aberto: volta ao estado inicial (sem efeito; ajuste durante a renderização).
  if ((compromisso?.id ?? null) !== abertoPara) {
    setAbertoPara(compromisso?.id ?? null);
    setConfirmandoCancelamento(false);
    setErro(null);
  }

  async function mudarStatus(status: StatusCompromisso, aviso: string) {
    if (!compromisso) return;
    setOcupado(true);
    setErro(null);
    try {
      const atualizado = await api.alterarCompromisso(compromisso.id, { status });
      toast({ titulo: aviso, descricao: atualizado.titulo });
      setConfirmandoCancelamento(false);
      onAlterado(atualizado);
    } catch (falha) {
      setErro(falha instanceof ErroDaApi ? falha.message : "Não foi possível salvar.");
    } finally {
      setOcupado(false);
    }
  }

  const c = compromisso;
  const data = c ? dataNoFuso(new Date(c.inicio), fuso) : null;

  const rodape = !c ? null : confirmandoCancelamento ? (
    <>
      <button type="button" className={BOTAO_SECUNDARIO} onClick={() => setConfirmandoCancelamento(false)} disabled={ocupado}>
        Voltar
      </button>
      <button
        type="button"
        onClick={() => mudarStatus("cancelado", "Compromisso cancelado")}
        disabled={ocupado}
        className="inline-flex h-10 items-center rounded-[4px] bg-[#DA1E28] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#B81921] disabled:opacity-60"
      >
        {ocupado ? "Cancelando..." : "Confirmar cancelamento"}
      </button>
    </>
  ) : (
    <>
      {c.status !== "cancelado" ? (
        <button type="button" className={cn(BOTAO_SECUNDARIO, "mr-auto border-transparent text-[#A2191F] hover:bg-[#FFF1F1]")} onClick={() => setConfirmandoCancelamento(true)} disabled={ocupado}>
          Cancelar compromisso
        </button>
      ) : (
        <button type="button" className={cn(BOTAO_SECUNDARIO, "mr-auto")} onClick={() => mudarStatus("agendado", "Compromisso reativado")} disabled={ocupado}>
          <Renew size={16} aria-hidden="true" />
          Reativar
        </button>
      )}
      {c.status === "agendado" ? (
        <button type="button" className={BOTAO_SECUNDARIO} onClick={() => mudarStatus("realizado", "Marcado como realizado")} disabled={ocupado}>
          <Checkmark size={16} aria-hidden="true" />
          Realizado
        </button>
      ) : null}
      <button type="button" className={BOTAO_SECUNDARIO} onClick={() => onEditar(c)} disabled={ocupado}>
        <Edit size={16} aria-hidden="true" />
        Editar
      </button>
      {c.status === "agendado" ? (
        <Link
          href={`/assistente?${new URLSearchParams({ compromisso: c.id })}`}
          className="inline-flex h-10 items-center gap-2 rounded-[4px] bg-interactive px-4 text-[13px] font-medium text-on-interactive transition-colors hover:bg-interactive-hover"
        >
          Preparar com o Dialys
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </>
  );

  return (
    <Dialogo
      aberto={Boolean(c)}
      titulo={c?.titulo ?? ""}
      rotulo={
        c ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2 py-px text-[11px] font-medium", COR_STATUS[c.status])}>{ROTULO_STATUS[c.status]}</span>
            {c.cliente ? "Compromisso com cliente" : "Compromisso interno"}
          </span>
        ) : null
      }
      rodape={rodape}
      ocupado={ocupado}
      onFechar={onFechar}
    >
      {c && data ? (
        <div className="divide-y divide-border-subtle">
          {confirmandoCancelamento ? (
            <p className="mb-2 bg-[#FFF1F1] px-3 py-2 text-[13px] text-[#750E13]">
              O compromisso continua na agenda, marcado como cancelado. Você pode reativá-lo depois.
            </p>
          ) : null}
          <Linha icone={<Calendar size={16} />} rotulo="Quando">
            <span className="first-letter:uppercase">{rotuloDia(data, "longo")}</span> · <span className="tabular-nums">{intervalo(c, fuso)}</span>
          </Linha>
          <Linha icone={<User size={16} />} rotulo="Cliente">
            {c.cliente ? (
              <span className="flex flex-wrap items-center gap-x-3">
                {c.cliente.nome}
                <Link href={`/insights?${new URLSearchParams({ conta: c.cliente.id })}`} className="text-[13px] text-[#0F62FE] hover:underline">
                  Ver cliente
                </Link>
              </span>
            ) : (
              <span className="text-text-secondary">Sem cliente (compromisso interno)</span>
            )}
          </Linha>
          {c.local ? (
            <Linha icone={<Location size={16} />} rotulo="Local">
              {c.local}
            </Linha>
          ) : null}
          <div className="py-2">
            <p className="text-[12px] text-text-secondary">Observações</p>
            <p className="mt-1 text-[14px] whitespace-pre-wrap text-text-primary">{c.observacoes || <span className="text-text-helper">Nenhuma observação.</span>}</p>
          </div>
          {erro ? (
            <p role="alert" className="pt-3 text-[13px] text-support-error">
              {erro}
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialogo>
  );
}

// ---- Cadastro e edição ------------------------------------------------------------------------

export type FormularioAberto = { modo: "novo"; data: DataCivil; hora: string } | { modo: "editar"; compromisso: Compromisso };

type Campos = { titulo: string; contaId: string; data: string; inicio: string; fim: string; local: string; observacoes: string };
type Erros = Partial<Record<keyof Campos | "geral", string>>;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const somarUmaHora = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

function camposIniciais(aberto: FormularioAberto, fuso: string): Campos {
  if (aberto.modo === "novo") {
    return { titulo: "", contaId: "", data: aberto.data, inicio: aberto.hora, fim: somarUmaHora(aberto.hora), local: "", observacoes: "" };
  }
  const c = aberto.compromisso;
  return {
    titulo: c.titulo,
    contaId: c.cliente?.id ?? "",
    data: dataNoFuso(new Date(c.inicio), fuso),
    inicio: horaNoFuso(new Date(c.inicio), fuso),
    fim: horaNoFuso(new Date(c.fim), fuso),
    local: c.local ?? "",
    observacoes: c.observacoes ?? "",
  };
}

/** Mesmas regras do servidor (que valida de novo): obrigatórios, limites e término depois do início. */
function validar(campos: Campos): Erros {
  const erros: Erros = {};
  if (!campos.titulo.trim()) erros.titulo = "Informe o título.";
  else if (campos.titulo.trim().length > LIMITE_TITULO) erros.titulo = `Título: no máximo ${LIMITE_TITULO} caracteres.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(campos.data)) erros.data = "Informe a data.";
  if (!HORA.test(campos.inicio)) erros.inicio = "Informe o início.";
  if (!HORA.test(campos.fim)) erros.fim = "Informe o término.";
  else if (HORA.test(campos.inicio) && campos.fim <= campos.inicio) erros.fim = MENSAGEM_TERMINO;
  return erros;
}

const CAMPO =
  "h-10 w-full border-0 border-b border-border-strong bg-field-01 px-3 text-[14px] text-text-primary placeholder:text-text-placeholder focus:outline-2 focus:-outline-offset-2 focus:outline-focus aria-invalid:outline-2 aria-invalid:-outline-offset-2 aria-invalid:outline-support-error";

function Campo({ id, rotulo, erro, obrigatorio, children, className }: { id: string; rotulo: string; erro?: string; obrigatorio?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[12px] text-text-secondary">
        {rotulo}
        {obrigatorio ? <span className="text-support-error"> *</span> : null}
      </label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="mt-1 text-[12px] text-support-error">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

type FormularioProps = {
  aberto: FormularioAberto | null;
  fuso: string;
  onFechar: () => void;
  onSalvo: (compromisso: Compromisso, novo: boolean) => void;
};

export function FormularioCompromisso({ aberto, fuso, onFechar, onSalvo }: FormularioProps) {
  const toast = useToast();
  const id = useId();
  const [campos, setCampos] = useState<Campos | null>(null);
  const [erros, setErros] = useState<Erros>({});
  const [ocupado, setOcupado] = useState(false);
  const [clientes, setClientes] = useState<ClienteResumo[] | null>(null);
  const [abertoPara, setAbertoPara] = useState<FormularioAberto | null>(null);

  if (aberto !== abertoPara) {
    setAbertoPara(aberto);
    setCampos(aberto ? camposIniciais(aberto, fuso) : null);
    setErros({});
  }

  // Cliente removido da carteira: a lista é buscada de novo ao abrir.
  useEffect(() => {
    const limpar = () => setClientes(null);
    window.addEventListener(EVENTO_CARTEIRA_ALTERADA, limpar);
    return () => window.removeEventListener(EVENTO_CARTEIRA_ALTERADA, limpar);
  }, []);

  // Clientes da carteira do usuário (o servidor valida de novo ao salvar).
  useEffect(() => {
    if (!aberto || clientes) return;
    let valido = true;
    api
      .listarClientes({ limite: 50 })
      .then((lista) => valido && setClientes(lista.dados))
      .catch(() => valido && setClientes([]));
    return () => {
      valido = false;
    };
  }, [aberto, clientes]);

  if (!aberto || !campos) return <Dialogo aberto={false} titulo="" onFechar={onFechar}>{null}</Dialogo>;

  const editando = aberto.modo === "editar" ? aberto.compromisso : null;
  const opcoes = [...(clientes ?? [])];
  if (editando?.cliente && !opcoes.some((c) => c.id === editando.cliente?.id)) {
    opcoes.unshift({ id: editando.cliente.id, nome: editando.cliente.nome, segmento: null, situacao: null });
  }
  const alterar = (campo: keyof Campos) => (evento: { target: { value: string } }) => {
    setCampos({ ...campos, [campo]: evento.target.value });
    if (erros[campo]) setErros({ ...erros, [campo]: undefined });
  };
  const ariaErro = (campo: keyof Campos) => (erros[campo] ? { "aria-invalid": true as const, "aria-describedby": `${id}-${campo}-erro` } : {});

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!campos) return;
    const encontrados = validar(campos);
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    const corpo = {
      titulo: campos.titulo.trim(),
      contaId: campos.contaId || null,
      inicio: paraInstante(campos.data, campos.inicio, fuso).toISOString(),
      fim: paraInstante(campos.data, campos.fim, fuso).toISOString(),
      local: campos.local.trim() || null,
      observacoes: campos.observacoes.trim() || null,
    };
    setOcupado(true);
    try {
      const salvo = editando ? await api.alterarCompromisso(editando.id, corpo) : await api.criarCompromisso(corpo);
      toast({ titulo: editando ? "Compromisso atualizado" : "Compromisso criado", descricao: salvo.titulo });
      onSalvo(salvo, !editando);
    } catch (falha) {
      if (falha instanceof ErroDaApi) {
        const doServidor = (falha.detalhe as { campos?: Record<string, string> } | undefined)?.campos ?? {};
        const { contaId, ...resto } = doServidor;
        setErros({ ...resto, ...(contaId ? { contaId } : {}), geral: Object.keys(doServidor).length ? undefined : falha.message });
      } else {
        setErros({ geral: "Não foi possível salvar o compromisso." });
      }
    } finally {
      setOcupado(false);
    }
  }

  const formId = `${id}-form`;
  return (
    <Dialogo
      aberto
      largura="grande"
      titulo={editando ? "Editar compromisso" : "Novo compromisso"}
      rotulo={`Horários no fuso ${fuso.replace("_", " ")}`}
      ocupado={ocupado}
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className={BOTAO_SECUNDARIO} onClick={onFechar} disabled={ocupado}>
            Descartar
          </button>
          <Button type="submit" form={formId} disabled={ocupado} className={BOTAO_PRIMARIO}>
            {ocupado ? "Salvando..." : editando ? "Salvar alterações" : "Criar compromisso"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={salvar} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo id={`${id}-titulo`} rotulo="Título" erro={erros.titulo} obrigatorio className="sm:col-span-3">
          <input id={`${id}-titulo`} className={CAMPO} value={campos.titulo} onChange={alterar("titulo")} maxLength={LIMITE_TITULO} autoFocus {...ariaErro("titulo")} />
        </Campo>
        <Campo id={`${id}-contaId`} rotulo="Cliente (opcional)" erro={erros.contaId} className="sm:col-span-3">
          <select id={`${id}-contaId`} className={CAMPO} value={campos.contaId} onChange={alterar("contaId")} {...ariaErro("contaId")}>
            <option value="">Sem cliente (compromisso interno)</option>
            {opcoes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id={`${id}-data`} rotulo="Data" erro={erros.data} obrigatorio>
          <input id={`${id}-data`} type="date" className={CAMPO} value={campos.data} onChange={alterar("data")} {...ariaErro("data")} />
        </Campo>
        <Campo id={`${id}-inicio`} rotulo="Início" erro={erros.inicio} obrigatorio>
          <input id={`${id}-inicio`} type="time" step={300} className={CAMPO} value={campos.inicio} onChange={alterar("inicio")} {...ariaErro("inicio")} />
        </Campo>
        <Campo id={`${id}-fim`} rotulo="Término" erro={erros.fim} obrigatorio>
          <input id={`${id}-fim`} type="time" step={300} className={CAMPO} value={campos.fim} onChange={alterar("fim")} {...ariaErro("fim")} />
        </Campo>
        <Campo id={`${id}-local`} rotulo="Local" erro={erros.local} className="sm:col-span-3">
          <input id={`${id}-local`} className={CAMPO} value={campos.local} onChange={alterar("local")} maxLength={LIMITE_LOCAL} placeholder="Ex.: Videochamada, escritório do cliente" {...ariaErro("local")} />
        </Campo>
        <Campo id={`${id}-observacoes`} rotulo="Observações" erro={erros.observacoes} className="sm:col-span-3">
          <textarea
            id={`${id}-observacoes`}
            className={cn(CAMPO, "h-auto min-h-24 py-2 leading-[1.5]")}
            value={campos.observacoes}
            onChange={alterar("observacoes")}
            maxLength={LIMITE_OBSERVACOES}
            rows={4}
            {...ariaErro("observacoes")}
          />
          <p className="mt-1 text-right text-[11px] text-text-helper tabular-nums">
            {campos.observacoes.length}/{LIMITE_OBSERVACOES}
          </p>
        </Campo>
        {erros.geral ? (
          <p role="alert" className="text-[13px] text-support-error sm:col-span-3">
            {erros.geral}
          </p>
        ) : null}
      </form>
    </Dialogo>
  );
}
