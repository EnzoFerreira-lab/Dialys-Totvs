"use client";

import {
  Add,
  Close,
  Document,
  DocumentImport,
  Launch,
  Locked,
  Microphone,
  MicrophoneFilled,
  Tag,
  WarningFilled,
} from "@carbon/icons-react";
import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CONTAS_MOCK, type ContaResumo } from "@/lib/mock/contas";
import {
  descreverContexto,
  extrairReunioes,
  normalizarTranscricao,
  type ContextoReuniao,
  type ExemploResumo,
  type ReuniaoImportada,
} from "@/lib/transcricao";
import { carregarExemplo } from "./actions";
import { SeletorConta } from "./seletor-conta";

const EXTENSOES_ACEITAS = [".txt", ".json", ".pdf", ".docx", ".mp3", ".wav"];
const TAMANHO_MAXIMO = 20 * 1024 * 1024;

const extensaoDe = (nome: string) => nome.slice(nome.lastIndexOf(".")).toLowerCase();

function formatarTamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function validarArquivo(arquivo: File): string | null {
  if (!EXTENSOES_ACEITAS.includes(extensaoDe(arquivo.name))) return "Formato não suportado. Use TXT, JSON, PDF, DOCX, MP3 ou WAV.";
  if (arquivo.size > TAMANHO_MAXIMO) return "Arquivo acima de 20 MB.";
  return null;
}

/* ---------- Ditado por voz (Web Speech API) ---------- */

type ReconhecimentoVoz = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type JanelaComVoz = Window & {
  SpeechRecognition?: new () => ReconhecimentoVoz;
  webkitSpeechRecognition?: new () => ReconhecimentoVoz;
};

function useDitado(onTexto: (texto: string) => void) {
  const [suportado, setSuportado] = useState(false);
  const [gravando, setGravando] = useState(false);
  const reconhecimento = useRef<ReconhecimentoVoz | null>(null);
  const onTextoRef = useRef(onTexto);

  useEffect(() => {
    onTextoRef.current = onTexto;
  }, [onTexto]);

  useEffect(() => {
    const janela = window as JanelaComVoz;
    const Construtor = janela.SpeechRecognition ?? janela.webkitSpeechRecognition;
    if (!Construtor) return;
    const instancia = new Construtor();
    instancia.lang = "pt-BR";
    instancia.continuous = true;
    instancia.interimResults = false;
    instancia.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) onTextoRef.current(event.results[i][0].transcript.trim());
      }
    };
    instancia.onend = () => setGravando(false);
    instancia.onerror = () => setGravando(false);
    reconhecimento.current = instancia;
    // Detecção de recurso do navegador: só é conhecida após a montagem no cliente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSuportado(true);
    return () => instancia.stop();
  }, []);

  function alternar() {
    const instancia = reconhecimento.current;
    if (!instancia) return;
    if (gravando) {
      instancia.stop();
    } else {
      instancia.start();
      setGravando(true);
    }
  }

  return { suportado, gravando, alternar };
}

/* ---------- Compositor ---------- */

export type EnvioTranscricao = {
  texto: string;
  conta: ContaResumo | null;
  /** Metadados da reunião quando ela veio de um JSON da TOTVS ou da amostra. */
  contexto: ContextoReuniao | null;
};

type EnvioComposerProps = {
  analisando: boolean;
  onEnviar: (envio: EnvioTranscricao) => void;
  exemplos?: ExemploResumo[];
};

/* ---------- Menu de exemplos ---------- */

function MenuExemplos({
  exemplos,
  carregando,
  onEscolher,
}: {
  exemplos: ExemploResumo[];
  carregando: boolean;
  onEscolher: (exemplo: ExemploResumo) => void;
}) {
  const grupos = [...new Set(exemplos.map((exemplo) => exemplo.grupo))];
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!aberto) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setAberto(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={menuId}
        title="Carregar uma transcrição de exemplo"
        disabled={carregando}
        aria-busy={carregando}
        className="flex h-8 items-center gap-1.5 rounded-[4px] px-2 text-[13px] text-text-secondary hover:bg-[#F2F2F2] hover:text-text-primary disabled:cursor-wait"
      >
        {carregando ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
        ) : (
          <DocumentImport size={16} aria-hidden="true" />
        )}
        <span className="hidden sm:inline">Exemplo</span>
      </button>

      {aberto ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Transcrições de exemplo"
          className="absolute bottom-full left-0 z-20 mb-2 max-h-[min(420px,60vh)] w-[min(360px,calc(100vw-48px))] overflow-y-auto rounded-[4px] border border-border-subtle bg-layer-01 py-1 shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
        >
          {grupos.map((grupo) => (
            <div key={grupo} role="group" aria-label={grupo}>
              <p className="sticky top-0 bg-layer-01 px-4 pt-2 pb-1.5 text-[11px] tracking-[0.08em] text-text-helper uppercase">
                {grupo}
              </p>
              {exemplos
                .filter((exemplo) => exemplo.grupo === grupo)
                .map((exemplo) => (
                  <button
                    key={exemplo.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onEscolher(exemplo);
                      setAberto(false);
                    }}
                    className="block w-full px-4 py-2 text-left hover:bg-[#F2F2F2]"
                  >
                    <span className="block text-[13px] text-text-primary">{exemplo.titulo}</span>
                    {exemplo.descricao ? (
                      <span className="block text-[11px] text-text-helper">{exemplo.descricao}</span>
                    ) : null}
                  </button>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Escolha de reunião em JSON com várias ---------- */

function SeletorReunioes({
  origem,
  reunioes,
  onEscolher,
  onFechar,
}: {
  origem: string;
  reunioes: ReuniaoImportada[];
  onEscolher: (reuniao: ReuniaoImportada) => void;
  onFechar: () => void;
}) {
  return (
    <section
      aria-label="Reuniões encontradas no arquivo"
      className="mt-3 rounded-[8px] border border-border-subtle bg-layer-01"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div>
          <p className="text-[13px] font-medium text-text-primary">
            {reunioes.length} reuniões em {origem}
          </p>
          <p className="mt-0.5 text-[12px] text-text-helper">Escolha qual analisar. A transcrição vai para o campo acima.</p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] hover:bg-[#F2F2F2]"
          aria-label="Fechar lista de reuniões"
        >
          <Close size={16} />
        </button>
      </div>
      <ul className="max-h-[300px] overflow-y-auto py-1">
        {reunioes.map((reuniao) => (
          <li key={reuniao.id}>
            <button
              type="button"
              onClick={() => onEscolher(reuniao)}
              className="block w-full px-4 py-2 text-left hover:bg-[#F2F2F2]"
            >
              <span className="block text-[13px] text-text-primary">{reuniao.titulo}</span>
              <span className="block text-[11px] text-text-helper">{reuniao.descricao}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Por enquanto só texto é analisado; PDF, DOCX e áudio dependem do pipeline de transcrição (T05/T06). */
const EXTENSOES_ANALISAVEIS = [".txt"];

export function EnvioComposer({ analisando, onEnviar, exemplos = [] }: EnvioComposerProps) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [conta, setConta] = useState<ContaResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [contexto, setContexto] = useState<ContextoReuniao | null>(null);
  const [importadas, setImportadas] = useState<{ origem: string; reunioes: ReuniaoImportada[] } | null>(null);
  const [carregandoExemplo, setCarregandoExemplo] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const textareaId = useId();
  const ajudaId = useId();

  const ditado = useDitado((trecho) =>
    setTexto((atual) => (atual.trim() ? `${atual.trimEnd()} ${trecho}` : trecho)),
  );

  const textarea = useRef<HTMLTextAreaElement>(null);
  const temConteudo = texto.trim().length > 0 || arquivo !== null;

  function carregarReuniao(reuniao: { transcricao: string; contexto?: ContextoReuniao }, contaId?: string) {
    setTexto(reuniao.transcricao);
    setContexto(reuniao.contexto ?? null);
    setConta(CONTAS_MOCK.find((item) => item.id === contaId) ?? null);
    setArquivo(null);
    setImportadas(null);
    setErro(null);
    textarea.current?.focus();
  }

  /** JSON no formato da TOTVS: uma reunião vai direto para o campo; várias abrem a lista para escolher. */
  function receberReunioes(reunioes: ReuniaoImportada[], origem: string) {
    if (reunioes.length === 0) {
      setErro("O JSON não tem nenhum campo de transcrição (ANON_TRANSCRICAO).");
      return;
    }
    if (reunioes.length === 1) {
      carregarReuniao(reunioes[0]);
      return;
    }
    setErro(null);
    setImportadas({ origem, reunioes });
  }

  async function selecionarArquivo(candidato: File | undefined) {
    if (!candidato) return;
    const problema = validarArquivo(candidato);
    if (problema) {
      setErro(problema);
      return;
    }
    if (extensaoDe(candidato.name) === ".json") {
      const reunioes = extrairReunioes(await candidato.text());
      if (!reunioes) {
        setErro("Não foi possível ler o JSON. Confira se o arquivo está completo.");
        return;
      }
      receberReunioes(reunioes, candidato.name);
      return;
    }
    setErro(null);
    setArquivo(candidato);
  }

  async function escolherExemplo(exemplo: ExemploResumo) {
    setCarregandoExemplo(true);
    try {
      const completo = await carregarExemplo(exemplo.id);
      if (completo) carregarReuniao(completo, completo.contaId);
      else setErro("Não foi possível carregar este exemplo.");
    } catch {
      setErro("Não foi possível carregar este exemplo.");
    } finally {
      setCarregandoExemplo(false);
    }
  }

  /** Colar um registro JSON ou um trecho copiado de dentro do JSON (com "\n" literal) também funciona. */
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const colado = event.clipboardData.getData("text");
    if (!colado) return;
    const reunioes = extrairReunioes(colado);
    if (reunioes && reunioes.length > 0) {
      event.preventDefault();
      receberReunioes(reunioes, "o texto colado");
      return;
    }
    const ajustado = normalizarTranscricao(colado);
    if (ajustado === colado.replace(/\r\n?/g, "\n").trim()) return; // texto comum: o navegador cola
    event.preventDefault();
    const campo = event.currentTarget;
    setTexto(texto.slice(0, campo.selectionStart) + ajustado + texto.slice(campo.selectionEnd));
    setErro(null);
  }

  async function enviar() {
    if (analisando) return;
    if (!temConteudo) {
      setErro("Cole a transcrição ou anexe um arquivo para enviar.");
      textarea.current?.focus();
      return;
    }

    let conteudoArquivo = "";
    if (arquivo) {
      if (!EXTENSOES_ANALISAVEIS.includes(extensaoDe(arquivo.name))) {
        setErro(
          "Por enquanto a análise lê texto colado e arquivos .txt. PDF, DOCX e áudio entram com o pipeline de transcrição.",
        );
        return;
      }
      conteudoArquivo = await arquivo.text();
    }

    const transcricao = normalizarTranscricao([texto.trim(), conteudoArquivo.trim()].filter(Boolean).join("\n\n"));
    if (!transcricao) {
      setErro("O arquivo está vazio.");
      return;
    }
    setErro(null);
    onEnviar({ texto: transcricao, conta, contexto });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      enviar();
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setArrastando(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setArrastando(false);
    void selecionarArquivo(event.dataTransfer.files[0]);
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <label
          htmlFor={textareaId}
          className="text-[11px] leading-4 font-semibold tracking-[0.08em] text-[#393939] uppercase"
        >
          Transcrição da reunião
        </label>
        <p className="hidden text-[11px] text-text-helper sm:block">Uma conversa. Novas possibilidades.</p>
      </div>

      <div
        onDragOver={onDragOver}
        onDragLeave={() => setArrastando(false)}
        onDrop={onDrop}
        className={cn(
          "relative mt-2.5 rounded-[8px] border bg-layer-01 transition-colors",
          arrastando ? "border-dashed border-interactive bg-[#FFFBF2]" : "border-border-subtle",
          "focus-within:border-[#C6C6C6]",
        )}
      >
        <textarea
          ref={textarea}
          id={textareaId}
          value={texto}
          onChange={(event) => {
            setTexto(event.target.value);
            if (!event.target.value.trim()) setContexto(null);
            setErro(null);
          }}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          aria-describedby={ajudaId}
          placeholder="Cole a transcrição bruta da reunião ou digite as anotações do cliente aqui..."
          className="block max-h-[480px] min-h-[160px] w-full resize-y rounded-t-[8px] bg-transparent px-6 pt-6 pb-2 text-[14px] leading-[1.6] text-text-primary [field-sizing:content] placeholder:text-[13px] placeholder:text-text-placeholder focus:outline-none"
        />

        {contexto ? (
          <div className="mx-6 mb-2 flex w-fit max-w-[calc(100%-3rem)] items-center gap-2 rounded-[4px] border border-border-subtle bg-[#F7F7F7] py-1.5 pr-1 pl-2.5">
            <Tag size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
            <span className="truncate text-[12px] text-text-primary">
              {contexto.idReuniao ? `Reunião #${contexto.idReuniao} · ` : ""}
              {descreverContexto(contexto) || "Metadados da reunião"}
            </span>
            <button
              type="button"
              onClick={() => setContexto(null)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] hover:bg-[#E8E8E8]"
              aria-label="Remover metadados da reunião"
              title="A análise usa segmento e NPS no resumo. Remova para analisar só o texto."
            >
              <Close size={16} />
            </button>
          </div>
        ) : null}

        {arquivo ? (
          <div className="mx-6 mb-2 flex w-fit max-w-[calc(100%-3rem)] items-center gap-2 rounded-[4px] border border-border-subtle bg-[#F7F7F7] py-1.5 pr-1 pl-2.5">
            <Document size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
            <span className="truncate text-[12px] text-text-primary">{arquivo.name}</span>
            <span className="shrink-0 font-mono text-[11px] text-text-helper">{formatarTamanho(arquivo.size)}</span>
            <button
              type="button"
              onClick={() => setArquivo(null)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] hover:bg-[#E8E8E8]"
              aria-label={`Remover ${arquivo.name}`}
            >
              <Close size={16} />
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-1 px-5 pt-1 pb-3">
          <input
            ref={inputArquivo}
            type="file"
            accept={EXTENSOES_ACEITAS.join(",")}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              void selecionarArquivo(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputArquivo.current?.click()}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] text-text-primary hover:bg-[#F2F2F2]"
            aria-label="Anexar arquivo"
            title="Anexar arquivo (TXT, JSON da TOTVS, PDF, DOCX, MP3, WAV)"
          >
            <Add size={20} />
          </button>

          <SeletorConta conta={conta} onChange={setConta} />

          <span className="mx-2 h-4 w-px bg-[#C6C6C6]" aria-hidden="true" />

          <button
            type="button"
            onClick={ditado.alternar}
            disabled={!ditado.suportado}
            aria-pressed={ditado.gravando}
            aria-label={ditado.gravando ? "Parar nota de voz" : "Gravar nota de voz"}
            title={ditado.suportado ? "Nota de voz" : "Nota de voz indisponível neste navegador"}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-[4px] hover:bg-[#F2F2F2] disabled:cursor-not-allowed disabled:text-text-placeholder disabled:hover:bg-transparent",
              ditado.gravando ? "text-support-error" : "text-text-primary",
            )}
          >
            {ditado.gravando ? <MicrophoneFilled size={16} className="motion-safe:animate-pulse" /> : <Microphone size={16} />}
          </button>

          {exemplos.length > 0 ? (
            <MenuExemplos exemplos={exemplos} carregando={carregandoExemplo} onEscolher={escolherExemplo} />
          ) : null}

          <div className="ml-auto flex items-center gap-4">
            <kbd className="hidden font-sans text-[11px] text-text-placeholder sm:block">Ctrl + Enter</kbd>
            <Button
              onClick={enviar}
              aria-busy={analisando}
              aria-label="Enviar para análise"
              title="Enviar para análise"
              className="h-8 w-8 justify-center rounded-[6px]"
            >
              {analisando ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-interactive border-t-transparent" />
              ) : (
                <Launch size={16} />
              )}
            </Button>
          </div>
        </div>
      </div>

      {importadas ? (
        <SeletorReunioes
          origem={importadas.origem}
          reunioes={importadas.reunioes}
          onEscolher={(reuniao) => carregarReuniao(reuniao)}
          onFechar={() => setImportadas(null)}
        />
      ) : null}

      <div id={ajudaId} className="mt-2.5 flex flex-col gap-1 text-[11px] text-text-helper sm:flex-row sm:justify-between">
        <p>Arraste um arquivo ou clique em + · TXT, JSON da TOTVS, PDF, DOCX, MP3, WAV · Até 20 MB</p>
        <p className="flex items-center gap-1.5">
          <Locked size={12} aria-hidden="true" />
          Arquivos mantidos apenas nesta sessão
        </p>
      </div>

      <div role="status" aria-live="polite">
        {erro ? (
          <p className="mt-3 flex items-center gap-2 text-[12px] text-support-error">
            <WarningFilled size={16} aria-hidden="true" />
            {erro}
          </p>
        ) : null}
      </div>
    </div>
  );
}
