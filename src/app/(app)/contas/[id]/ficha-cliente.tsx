"use client";

import { Add, ArrowUpRight, Calendar, Chat, CheckmarkFilled, DocumentAdd, Growth, OverflowMenuVertical, WarningAlt } from "@carbon/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentType, type ReactNode } from "react";
import { DetalheCompromisso, FormularioCompromisso, type FormularioAberto } from "@/app/(app)/clientes/dialogos-compromisso";
import { BOTAO_ACAO_CABECALHO, BOTAO_SECUNDARIO_CABECALHO, PageHeader } from "@/components/shell/page-header";
import { ItemMenu, MenuSuspenso } from "@/components/ui/menu-suspenso";
import { ROTULO_STATUS, type Compromisso } from "@/lib/agenda";
import { linkReuniao } from "@/lib/alertas";
import { cn } from "@/lib/cn";
import { formatarData } from "@/lib/formatar";
import { dataNoFuso, horaNoFuso, rotuloDia, type DataCivil } from "@/lib/fuso";
import type { ContextoProduto, TipoSinal } from "@/lib/insights";
import type { AlertaCliente, PerfilCliente } from "@/server/clientes/perfil";
import { ConfirmarRemocaoCliente } from "../remover-cliente";
import { ContagemAlertas, COR_FAIXA, CRITICIDADE, SituacaoCliente, TendenciaCliente } from "../visual-cliente";

const ALERTAS_INICIAIS = 5;
const COMPROMISSOS_ANTERIORES = 4;

const TIPO_ALERTA: Record<TipoSinal, { rotulo: string; borda: string; cor: string; Icone: ComponentType<{ size?: number; className?: string }> }> = {
  churn: { rotulo: "Risco de churn", borda: "border-l-[#DA1E28]", cor: "text-[#DA1E28]", Icone: WarningAlt },
  oportunidade: { rotulo: "Oportunidade", borda: "border-l-[#24A148]", cor: "text-[#198038]", Icone: Growth },
  objecao: { rotulo: "Objeção", borda: "border-l-[#D2A106]", cor: "text-[#8E6A00]", Icone: Chat },
};

const SEVERIDADE = { ALTA: "alta", MÉDIA: "média", BAIXA: "baixa" } as const;

const PRODUTO: Record<ContextoProduto, { classe: string; prefixo: string }> = {
  em_uso: { classe: "bg-[#D0E2FF] text-[#002D9C]", prefixo: "Em uso" },
  expansao: { classe: "bg-[#A7F0BA] text-[#044317]", prefixo: "Interesse" },
  insatisfacao: { classe: "bg-[#FFD9BE] text-[#8A3800]", prefixo: "Insatisfação" },
  concorrente: { classe: "bg-[#E0E0E0] text-[#161616]", prefixo: "Concorrente" },
};

const dataReuniao = (data: string | null, hora?: string | null) => (data ? `${formatarData(data)}${hora ? ` ${hora}` : ""}` : "Sem data");

function Secao({ id, titulo, acao, children, rodape }: { id: string; titulo: string; acao?: ReactNode; children: ReactNode; rodape?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[12px] border border-border-subtle bg-layer-01">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-2.5 sm:px-5">
        <h2 id={id} className="text-[15px] leading-5 font-semibold text-text-primary">
          {titulo}
        </h2>
        {acao}
      </div>
      {children}
      {rodape ? <div className="border-t border-border-subtle px-4 py-2.5 text-[11px] leading-4 text-text-helper sm:px-5">{rodape}</div> : null}
    </section>
  );
}

function Indicador({ rotulo, children, detalhe }: { rotulo: string; children: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="rounded-[8px] border border-border-subtle bg-layer-01 p-4">
      <p className="text-[12px] text-text-secondary">{rotulo}</p>
      <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2 text-[22px] leading-7 text-text-primary">{children}</div>
      {detalhe ? <div className="mt-1.5 text-[12px] text-text-secondary">{detalhe}</div> : null}
    </div>
  );
}

function ItemAlerta({ alerta }: { alerta: AlertaCliente }) {
  const tipo = TIPO_ALERTA[alerta.tipo];
  return (
    <li className={cn("border-b border-l-[3px] border-b-border-subtle px-4 py-3 last:border-b-0 sm:px-5", tipo.borda)}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <tipo.Icone size={16} className={cn("shrink-0", tipo.cor)} aria-hidden="true" />
        <span className="font-semibold text-text-primary">{tipo.rotulo}</span>
        <span className="text-text-secondary">
          · {alerta.subtipo} · {alerta.tipo === "oportunidade" ? "probabilidade" : "criticidade"} {SEVERIDADE[alerta.severidade]}
        </span>
      </p>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-text-primary">“{alerta.citacao}”</p>
      <p className="mt-1.5 text-[12px] leading-[1.5] text-text-secondary">
        <span className="font-medium text-text-primary">Recomendação:</span> {alerta.recomendacao}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-helper">
        <Link href={linkReuniao(alerta.reuniao.id)} className="inline-flex items-center gap-1 font-medium text-text-primary hover:underline">
          {alerta.reuniao.codigo} · {dataReuniao(alerta.reuniao.data)}
          <ArrowUpRight size={12} aria-hidden="true" />
        </Link>
        <span>Confiança {Math.round(alerta.confianca * 100)}%</span>
        {alerta.noCrm ? (
          <span className="inline-flex items-center gap-1 text-[#198038]">
            <CheckmarkFilled size={12} aria-hidden="true" />
            No CRM
          </span>
        ) : null}
      </p>
    </li>
  );
}

function ItemCompromisso({ compromisso, fuso, onAbrir }: { compromisso: Compromisso; fuso: string; onAbrir: () => void }) {
  const dia = dataNoFuso(new Date(compromisso.inicio), fuso);
  return (
    <li>
      <button type="button" onClick={onAbrir} className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#F7F7F7] sm:px-5">
        <Calendar size={16} className="mt-0.5 shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[13px] font-medium text-text-primary", compromisso.status === "cancelado" && "text-text-helper line-through")}>
            {compromisso.titulo}
          </span>
          <span className="block text-[12px] text-text-secondary first-letter:uppercase">
            {rotuloDia(dia)} · {horaNoFuso(new Date(compromisso.inicio), fuso)}–{horaNoFuso(new Date(compromisso.fim), fuso)}
            {compromisso.status !== "agendado" ? ` · ${ROTULO_STATUS[compromisso.status]}` : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Ficha do cliente: tudo sobre ele num lugar, com atalhos para as outras abas. */
export function FichaCliente({ perfil, fuso, hoje, agoraIso }: { perfil: PerfilCliente; fuso: string; hoje: DataCivil; agoraIso: string }) {
  const router = useRouter();
  const [todosAlertas, setTodosAlertas] = useState(false);
  const [aberto, setAberto] = useState<Compromisso | null>(null);
  const [formulario, setFormulario] = useState<FormularioAberto | null>(null);
  const [removendo, setRemovendo] = useState(false);

  // Instante da renderização no servidor: separa próximas de anteriores sem depender do relógio do navegador.
  const agora = Date.parse(agoraIso);
  const proximos = perfil.compromissos.filter((c) => c.status === "agendado" && Date.parse(c.fim) > agora);
  const anteriores = perfil.compromissos
    .filter((c) => !proximos.includes(c))
    .reverse()
    .slice(0, COMPROMISSOS_ANTERIORES);
  const ultima = perfil.reunioes[0] ?? null;
  const totais = perfil.alertas.reduce(
    (soma, a) => ({ ...soma, [a.tipo]: soma[a.tipo] + 1 }),
    { churn: 0, oportunidade: 0, objecao: 0 } as Record<TipoSinal, number>,
  );
  const alertasVisiveis = todosAlertas ? perfil.alertas : perfil.alertas.slice(0, ALERTAS_INICIAIS);

  function marcarReuniao() {
    // Hoje, na próxima hora cheia (entre 8h e 18h); senão, amanhã às 10h.
    const horaAtual = Number(horaNoFuso(new Date(), fuso).slice(0, 2));
    const hojeCabe = horaAtual + 1 >= 8 && horaAtual + 1 <= 18;
    const proximoDia = new Date(Date.parse(`${hoje}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    setFormulario({
      modo: "novo",
      data: hojeCabe ? hoje : proximoDia,
      hora: hojeCabe ? `${String(Math.max(horaAtual + 1, 8)).padStart(2, "0")}:00` : "10:00",
      cliente: { id: perfil.id, nome: perfil.nome },
      titulo: `Reunião com ${perfil.nome}`,
    });
  }

  const descricao = [perfil.segmento, perfil.codigoTotvs ? `Código TOTVS ${perfil.codigoTotvs}` : null, `${perfil.reunioes.length} ${perfil.reunioes.length === 1 ? "reunião" : "reuniões"}`]
    .filter(Boolean)
    .join(" · ");
  const linkAssistente = `/assistente?${new URLSearchParams({ conta: perfil.id, nome: perfil.nome })}`;
  const linkEnvio = `/envio?${new URLSearchParams({ conta: perfil.id, nome: perfil.nome })}`;

  return (
    <>
      <PageHeader
        pagina={perfil.nome}
        trilha={[{ rotulo: "Clientes", href: "/contas" }]}
        titulo={perfil.nome}
        descricao={descricao}
        acoes={
          <>
            <Link href={linkAssistente} className={BOTAO_SECUNDARIO_CABECALHO}>
              <Chat size={16} aria-hidden="true" />
              Perguntar ao Dialys
            </Link>
            <Link href={linkEnvio} className={BOTAO_SECUNDARIO_CABECALHO}>
              <DocumentAdd size={16} aria-hidden="true" />
              Enviar reunião
            </Link>
            <button type="button" onClick={marcarReuniao} className={BOTAO_ACAO_CABECALHO}>
              Marcar reunião
              <Add size={16} aria-hidden="true" />
            </button>
            <MenuSuspenso rotulo={`Mais ações de ${perfil.nome}`} gatilho={<OverflowMenuVertical size={16} />} className="self-center">
              {(fechar) => (
                <ItemMenu
                  perigo
                  onSelect={() => {
                    fechar();
                    setRemovendo(true);
                  }}
                >
                  Excluir cliente
                </ItemMenu>
              )}
            </MenuSuspenso>
          </>
        }
      />

      {/* Resumo */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo="Saúde do cliente"
          detalhe={
            perfil.saude ? (
              <span className="flex flex-wrap items-center gap-2">
                <TendenciaCliente tendencia={perfil.tendencia} comRotulo />
                <span title={`Como a nota foi calculada:\n${perfil.saude.fatores.join("\n")}`} className="underline decoration-dotted underline-offset-2">
                  como foi calculada
                </span>
              </span>
            ) : (
              "Nenhuma reunião com transcrição ativa"
            )
          }
        >
          {perfil.saude ? (
            <>
              <span className="tabular-nums">{perfil.saude.nota.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
              <span className="text-[13px] text-text-secondary">/ 10</span>
              <SituacaoCliente saude={{ nota: perfil.saude.nota, faixa: perfil.saude.faixa }} />
            </>
          ) : (
            <SituacaoCliente saude={null} />
          )}
        </Indicador>
        <Indicador
          rotulo="Criticidade e alertas"
          detalhe={<ContagemAlertas alertas={totais} />}
        >
          {perfil.criticidade ? (
            <span className={cn("rounded-full px-2.5 py-0.5 text-[13px] font-medium", CRITICIDADE[perfil.criticidade].classe)}>
              {CRITICIDADE[perfil.criticidade].rotulo}
            </span>
          ) : (
            <span className="text-[15px] text-text-helper">—</span>
          )}
          <span className="text-[13px] text-text-secondary">
            {perfil.alertas.length} {perfil.alertas.length === 1 ? "alerta" : "alertas"}
          </span>
        </Indicador>
        <Indicador rotulo="Última reunião" detalhe={perfil.nps !== null ? `NPS ${perfil.nps}` : "NPS não informado"}>
          {ultima ? (
            <span className="text-[17px]">
              {ultima.codigo} · <span className={ultima.data ? "" : "text-text-helper italic"}>{dataReuniao(ultima.data)}</span>
            </span>
          ) : (
            <span className="text-[15px] text-text-helper">—</span>
          )}
        </Indicador>
        <Indicador
          rotulo="Próxima reunião marcada"
          detalhe={
            proximos[0] ? (
              <span className="block truncate">{proximos[0].titulo}</span>
            ) : (
              <button type="button" onClick={marcarReuniao} className="font-medium text-[#0F62FE] hover:underline">
                Marcar agora
              </button>
            )
          }
        >
          {proximos[0] ? (
            <span className="text-[17px] first-letter:uppercase">
              {rotuloDia(dataNoFuso(new Date(proximos[0].inicio), fuso))} · {horaNoFuso(new Date(proximos[0].inicio), fuso)}
            </span>
          ) : (
            <span className="text-[15px] text-text-helper">Nenhuma</span>
          )}
        </Indicador>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Principais alertas */}
          <Secao
            id="titulo-alertas-cliente"
            titulo="Principais alertas"
            acao={<span className="text-[12px] text-text-secondary">Do mais crítico para o menos, de todas as reuniões</span>}
            rodape={
              perfil.alertas.length > ALERTAS_INICIAIS ? (
                <button type="button" onClick={() => setTodosAlertas((v) => !v)} className="text-[12px] font-medium text-[#0F62FE] hover:underline">
                  {todosAlertas ? "Mostrar só os principais" : `Mostrar todos (${perfil.alertas.length})`}
                </button>
              ) : undefined
            }
          >
            {perfil.alertas.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-text-secondary">Nenhum alerta nas reuniões analisadas deste cliente.</p>
            ) : (
              <ul>
                {alertasVisiveis.map((alerta) => (
                  <ItemAlerta key={alerta.id} alerta={alerta} />
                ))}
              </ul>
            )}
          </Secao>

          {/* Reuniões */}
          <Secao
            id="titulo-reunioes-cliente"
            titulo="Reuniões"
            acao={
              <Link href={linkEnvio} className="inline-flex items-center gap-1 text-[12px] font-medium text-text-primary hover:underline">
                <Add size={14} aria-hidden="true" />
                Enviar reunião
              </Link>
            }
            rodape="Saúde de cada reunião calculada só com os sinais e o NPS dela, para ver a evolução do cliente."
          >
            <table className="w-full border-collapse text-left text-[13px]">
              <caption className="sr-only">Reuniões de {perfil.nome}, da mais recente para a mais antiga</caption>
              <thead className="hidden bg-[#F4F4F4] text-[11px] font-semibold text-text-primary sm:table-header-group">
                <tr>
                  <th scope="col" className="py-2 pl-5">
                    Reunião
                  </th>
                  <th scope="col" className="py-2">
                    Data
                  </th>
                  <th scope="col" className="py-2">
                    Saúde
                  </th>
                  <th scope="col" className="py-2">
                    Sinais
                  </th>
                  <th scope="col" className="hidden py-2 pr-5 md:table-cell">
                    NPS
                  </th>
                </tr>
              </thead>
              <tbody>
                {perfil.reunioes.map((reuniao) => (
                  <tr key={reuniao.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle px-4 py-2.5 sm:table-row sm:px-0 sm:py-0">
                    <td className="w-full sm:w-auto sm:py-2.5 sm:pr-4 sm:pl-5">
                      <Link href={linkReuniao(reuniao.id)} className="font-mono text-[12px] font-medium text-text-primary hover:underline">
                        {reuniao.codigo}
                      </Link>
                      {reuniao.resumo ? (
                        <p className="mt-0.5 line-clamp-1 max-w-[420px] text-[12px] text-text-helper" title={reuniao.resumo}>
                          {reuniao.resumo}
                        </p>
                      ) : null}
                    </td>
                    <td className={cn("text-[12px] whitespace-nowrap sm:py-2.5 sm:pr-4", reuniao.data ? "text-text-secondary" : "text-text-helper italic")}>
                      {dataReuniao(reuniao.data, reuniao.hora)}
                    </td>
                    <td className="sm:py-2.5 sm:pr-4">
                      {reuniao.saude ? (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E0E0E0]" aria-hidden="true">
                            <span
                              className={cn("block h-full", reuniao.saude.faixa === "risco" ? "bg-[#DA1E28]" : reuniao.saude.faixa === "estavel" ? "bg-[#F1C21B]" : "bg-[#24A148]")}
                              style={{ width: `${reuniao.saude.nota * 10}%` }}
                            />
                          </span>
                          <span className={cn("rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums", COR_FAIXA[reuniao.saude.faixa])}>
                            {reuniao.saude.nota.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </span>
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#F4F4F4] px-2 py-0.5 text-[11px] text-text-helper">Transcrição removida</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap sm:py-2.5 sm:pr-4">{reuniao.transcricaoRemovida ? <span className="text-[12px] text-text-helper">—</span> : <ContagemAlertas alertas={reuniao.sinais} />}</td>
                    <td className="hidden text-text-secondary tabular-nums md:table-cell md:py-2.5 md:pr-5">{reuniao.nps ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* Agenda com o cliente */}
          <Secao
            id="titulo-agenda-cliente"
            titulo="Agenda com o cliente"
            acao={
              <button type="button" onClick={marcarReuniao} className="inline-flex items-center gap-1 text-[12px] font-medium text-text-primary hover:underline">
                <Add size={14} aria-hidden="true" />
                Marcar reunião
              </button>
            }
            rodape={
              <>
                Mesma agenda da{" "}
                <Link href="/clientes" className="underline underline-offset-2 hover:text-text-primary">
                  Home
                </Link>
                .
              </>
            }
          >
            <p className="px-4 pt-3 text-[11px] font-semibold tracking-[0.06em] text-text-helper uppercase sm:px-5">Próximas</p>
            {proximos.length === 0 ? (
              <p className="px-4 pt-1 pb-3 text-[13px] text-text-secondary sm:px-5">Nenhuma reunião marcada com este cliente.</p>
            ) : (
              <ul className="pb-1">
                {proximos.map((c) => (
                  <ItemCompromisso key={c.id} compromisso={c} fuso={fuso} onAbrir={() => setAberto(c)} />
                ))}
              </ul>
            )}
            {anteriores.length > 0 ? (
              <>
                <p className="border-t border-border-subtle px-4 pt-3 text-[11px] font-semibold tracking-[0.06em] text-text-helper uppercase sm:px-5">
                  Anteriores e canceladas
                </p>
                <ul className="pb-1">
                  {anteriores.map((c) => (
                    <ItemCompromisso key={c.id} compromisso={c} fuso={fuso} onAbrir={() => setAberto(c)} />
                  ))}
                </ul>
              </>
            ) : null}
          </Secao>

          {/* Diagnóstico e próximos passos */}
          <Secao
            id="titulo-diagnostico-cliente"
            titulo={perfil.geradoPorIa ? "Diagnóstico da IA" : "Diagnóstico"}
            rodape={ultima && !ultima.transcricaoRemovida ? `Da ${ultima.codigo}, a reunião mais recente. Revise antes de agir.` : undefined}
          >
            {perfil.diagnostico ? (
              <div className="px-4 py-3 sm:px-5">
                <p className="text-[13px] leading-[1.6] text-text-primary">{perfil.diagnostico}</p>
                {perfil.acao ? (
                  <p className="mt-3 border-l-2 border-interactive bg-[#FFF8E6] px-3 py-2 text-[13px] leading-[1.5] text-text-primary">
                    <span className="font-semibold">Ação sugerida:</span> {perfil.acao}
                  </p>
                ) : null}
                {perfil.proximosPassos.length > 0 ? (
                  <>
                    <p className="mt-3 text-[12px] font-semibold text-text-secondary">Próximos passos registrados</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13px] leading-[1.5] text-text-primary">
                      {perfil.proximosPassos.map((passo) => (
                        <li key={passo}>{passo}</li>
                      ))}
                    </ol>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="px-5 py-6 text-[13px] text-text-secondary">Sem reunião com transcrição ativa para diagnosticar.</p>
            )}
          </Secao>

          {/* Produtos e concorrentes */}
          <Secao id="titulo-produtos-cliente" titulo="Produtos e concorrentes citados">
            {perfil.produtos.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-secondary">Nenhum produto citado nas reuniões.</p>
            ) : (
              <ul className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
                {perfil.produtos.map((produto) => (
                  <li
                    key={`${produto.contexto}-${produto.nome}`}
                    className={cn("rounded-full px-2.5 py-1 text-[12px] leading-4", PRODUTO[produto.contexto].classe)}
                    title={`Citado em ${produto.reunioes} ${produto.reunioes === 1 ? "reunião" : "reuniões"}`}
                  >
                    {PRODUTO[produto.contexto].prefixo}: {produto.nome}
                    {produto.reunioes > 1 ? <span className="ml-1 opacity-75">×{produto.reunioes}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>
      </div>

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
          router.refresh();
        }}
      />
      <ConfirmarRemocaoCliente
        cliente={removendo ? { id: perfil.id, nome: perfil.nome, totalReunioes: perfil.reunioes.length } : null}
        onFechar={() => setRemovendo(false)}
        // Excluído, o cliente deixa de existir: a ficha volta para Clientes (a lista é lida de novo no servidor).
        onRemovido={() => router.push("/contas")}
      />
      <FormularioCompromisso
        aberto={formulario}
        fuso={fuso}
        onFechar={() => setFormulario(null)}
        onSalvo={(compromisso, criado) => {
          setFormulario(null);
          if (!criado) setAberto(compromisso);
          router.refresh();
        }}
      />
    </>
  );
}
