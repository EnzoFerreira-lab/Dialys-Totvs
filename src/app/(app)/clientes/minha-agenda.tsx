"use client";

import { Add, ChevronLeft, ChevronRight } from "@carbon/icons-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Compromisso } from "@/lib/agenda";
import { api, ErroDaApi } from "@/lib/api-cliente";
import { cn } from "@/lib/cn";
import { dataNoFuso, horaNoFuso, inicioDaSemana, minutosNoFuso, rotuloDia, somarDias, type DataCivil } from "@/lib/fuso";
import { AgendaDia } from "./agenda-dia";
import { AgendaSemana } from "./agenda-semana";
import { DetalheCompromisso, FormularioCompromisso, type FormularioAberto } from "./dialogos-compromisso";

// Relógio em minutos para a linha do "agora": só existe no navegador (no servidor é null).
const assinarMinuto = (avisar: () => void) => {
  const timer = window.setInterval(avisar, 30_000);
  return () => window.clearInterval(timer);
};
const minutoAtual = () => Math.floor(Date.now() / 60_000);
const semRelogio = () => null;

const mes = (data: DataCivil, opcoes: Intl.DateTimeFormatOptions) => {
  const [ano, m, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, m - 1, dia, 12)).toLocaleDateString("pt-BR", { timeZone: "UTC", ...opcoes });
};

/** "5 – 11 de outubro de 2026" ou "28 de set. – 4 de out. de 2026". */
function rotuloSemana(segunda: DataCivil) {
  const domingo = somarDias(segunda, 6);
  if (segunda.slice(0, 7) === domingo.slice(0, 7)) return `${Number(segunda.slice(8))} – ${mes(domingo, { day: "numeric", month: "long", year: "numeric" })}`;
  return `${mes(segunda, { day: "numeric", month: "short" })} – ${mes(domingo, { day: "numeric", month: "short", year: "numeric" })}`;
}

type Carregado = { semana: DataCivil; compromissos: Compromisso[] };

type Props = { hojeInicial: DataCivil; fuso: string };

/**
 * "Minha agenda": semana no computador, lista do dia no celular. Lê e grava pela API /api/v1/agenda (a
 * mesma do assistente). Ações sugeridas pelo Dialys não aparecem aqui: compromisso é só o que o usuário marcou.
 */
export function MinhaAgenda({ hojeInicial, fuso }: Props) {
  const [hoje, setHoje] = useState(hojeInicial);
  const [data, setData] = useState(hojeInicial);
  const [carregado, setCarregado] = useState<Carregado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [aberto, setAberto] = useState<Compromisso | null>(null);
  const [formulario, setFormulario] = useState<FormularioAberto | null>(null);
  const minuto = useSyncExternalStore(assinarMinuto, minutoAtual, semRelogio);
  const agoraMinutos = minuto === null ? null : minutosNoFuso(new Date(minuto * 60_000), fuso);

  const semana = inicioDaSemana(data);
  const recarregar = () => setVersao((v) => v + 1);

  useEffect(() => {
    let valido = true;
    api
      .listarAgenda(semana, somarDias(semana, 6))
      .then((lista) => {
        if (!valido) return;
        setCarregado({ semana, compromissos: lista.dados });
        setHoje(lista.hoje);
        setErro(null);
      })
      .catch((falha) => valido && setErro(falha instanceof ErroDaApi ? falha.message : "Não foi possível carregar a agenda."));
    return () => {
      valido = false;
    };
  }, [semana, versao]);

  const compromissos = carregado?.semana === semana ? carregado.compromissos : null;

  /** Novo compromisso: na data escolhida, a partir da próxima hora cheia se for hoje. */
  function novo(dia: DataCivil = data, hora?: string) {
    let inicio = hora ?? "09:00";
    if (!hora && dia === hoje && minuto !== null) {
      const proxima = Math.min(22, Number(horaNoFuso(new Date(minuto * 60_000), fuso).slice(0, 2)) + 1);
      inicio = `${String(Math.max(proxima, 7)).padStart(2, "0")}:00`;
    }
    setFormulario({ modo: "novo", data: dia, hora: inicio });
  }

  const botaoNav = "flex h-9 w-9 items-center justify-center rounded-[4px] text-text-primary transition-colors hover:bg-[#E8E8E8]";

  return (
    <section aria-labelledby="titulo-minha-agenda" className="rounded-[12px] border border-border-subtle bg-layer-01">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 sm:px-5">
        <h2 id="titulo-minha-agenda" className="text-[18px] leading-6 font-normal text-text-primary">
          Minha agenda
        </h2>
        <button
          type="button"
          onClick={() => novo()}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-[4px] bg-interactive px-3 text-[13px] font-medium text-on-interactive transition-colors hover:bg-interactive-hover active:bg-interactive-active"
        >
          <Add size={16} aria-hidden="true" />
          Novo compromisso
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 pb-3 sm:px-5">
        <button
          type="button"
          onClick={() => setData(hoje)}
          disabled={data === hoje}
          className="h-9 rounded-[4px] border border-[#8D8D8D] px-3 text-[13px] font-medium text-text-primary transition-colors hover:bg-[#F2F2F2] disabled:cursor-default disabled:border-[#C6C6C6] disabled:text-text-helper disabled:hover:bg-transparent"
        >
          Hoje
        </button>
        {/* Celular: um dia por vez. Computador: uma semana por vez. */}
        <div className="flex md:hidden">
          <button type="button" className={botaoNav} onClick={() => setData(somarDias(data, -1))} aria-label="Dia anterior">
            <ChevronLeft size={20} />
          </button>
          <button type="button" className={botaoNav} onClick={() => setData(somarDias(data, 1))} aria-label="Próximo dia">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="hidden md:flex">
          <button type="button" className={botaoNav} onClick={() => setData(somarDias(data, -7))} aria-label="Semana anterior">
            <ChevronLeft size={20} />
          </button>
          <button type="button" className={botaoNav} onClick={() => setData(somarDias(data, 7))} aria-label="Próxima semana">
            <ChevronRight size={20} />
          </button>
        </div>
        <p className="min-w-0 text-[14px] font-medium text-text-primary" aria-live="polite">
          <span className="first-letter:uppercase md:hidden">{rotuloDia(data, "longo")}</span>
          <span className="hidden md:inline">{rotuloSemana(semana)}</span>
        </p>
        <label className="ml-auto flex items-center gap-2 text-[12px] text-text-secondary">
          <span className="hidden sm:inline">Ir para</span>
          <input
            type="date"
            value={data}
            onChange={(evento) => /^\d{4}-\d{2}-\d{2}$/.test(evento.target.value) && setData(evento.target.value)}
            aria-label="Escolher data"
            className="h-9 border-0 border-b border-border-strong bg-field-01 px-2 text-[13px] text-text-primary focus:outline-2 focus:-outline-offset-2 focus:outline-focus"
          />
        </label>
      </div>

      {erro && !compromissos ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-5 py-12 text-center text-[13px] text-support-error">
          {erro}
          <button type="button" onClick={recarregar} className="h-9 rounded-[4px] border border-[#8D8D8D] px-3 text-[13px] text-text-primary hover:bg-[#F2F2F2]">
            Tentar de novo
          </button>
        </div>
      ) : !compromissos ? (
        <div aria-busy="true" aria-label="Carregando a agenda" className="m-4 h-[420px] animate-pulse rounded-[8px] bg-[#F4F4F4] sm:m-5" />
      ) : (
        <>
          <div className="pt-3 md:hidden">
            <AgendaDia data={data} fuso={fuso} compromissos={compromissos} onAbrir={setAberto} />
          </div>
          <div className="hidden px-2 pt-1 pb-3 md:block">
            <AgendaSemana
              segunda={semana}
              hoje={hoje}
              selecionada={data}
              fuso={fuso}
              compromissos={compromissos}
              agoraMinutos={agoraMinutos}
              onAbrir={setAberto}
              onNovo={(dia, hora) => novo(dia, hora)}
            />
            {compromissos.length === 0 ? <p className="pt-3 text-center text-[13px] text-text-secondary">Nenhum compromisso nesta semana.</p> : null}
          </div>
        </>
      )}
      <p className={cn("border-t border-border-subtle px-4 py-2.5 text-[11px] leading-4 text-text-helper sm:px-5")}>
        Horários em {fuso.replace("_", " ")}. Ações sugeridas pelo Dialys ficam no assistente e não entram na agenda automaticamente.
      </p>

      <DetalheCompromisso
        compromisso={aberto}
        fuso={fuso}
        onFechar={() => setAberto(null)}
        onEditar={(compromisso) => {
          setAberto(null);
          setFormulario({ modo: "editar", compromisso });
        }}
        onAlterado={(compromisso) => {
          setAberto(compromisso);
          recarregar();
        }}
      />
      <FormularioCompromisso
        aberto={formulario}
        fuso={fuso}
        onFechar={() => setFormulario(null)}
        onSalvo={(compromisso, criado) => {
          setFormulario(null);
          setData(dataNoFuso(new Date(compromisso.inicio), fuso));
          if (!criado) setAberto(compromisso);
          recarregar();
        }}
      />
    </section>
  );
}
