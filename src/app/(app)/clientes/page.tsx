import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CONTAINER_PAGINA, PageHeader } from "@/components/shell/page-header";
import { dataNoFuso, horaNoFuso, rotuloDia } from "@/lib/fuso";
import { usuarioDaSessao } from "@/server/auth/sessao-pagina";
import { fusoHorario } from "@/server/config/dados";
import { MeusClientes } from "./meus-clientes";
import { MinhaAgenda } from "./minha-agenda";

export const metadata: Metadata = { title: "Home" };

function saudacao(hora: number) {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function Carregando() {
  return (
    <div aria-busy="true" aria-label="Carregando o seu dia">
      <div className="h-9 w-48 animate-pulse rounded-[4px] bg-[#E8E8E8]" />
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[560px] animate-pulse rounded-[12px] border border-border-subtle bg-layer-01" />
        <div className="h-[560px] animate-pulse rounded-[12px] border border-border-subtle bg-layer-01" />
      </div>
    </div>
  );
}

/** Depende de quem está logado e da hora: exige a sessão do servidor e roda a cada requisição. */
async function MeuDia() {
  await connection();
  const usuario = await usuarioDaSessao();
  if (!usuario) redirect("/login?volta=/clientes");
  const fuso = fusoHorario();
  const agora = new Date();
  const hoje = dataNoFuso(agora, fuso);
  const primeiroNome = usuario.nome.split(" ")[0];

  return (
    <>
      <PageHeader
        titulo="Home"
        descricao={`${saudacao(Number(horaNoFuso(agora, fuso).slice(0, 2)))}, ${primeiroNome}. Hoje é ${rotuloDia(hoje, "longo")}.`}
      />
      {/* Agenda em destaque; no celular e em telas médias os blocos se empilham (agenda primeiro). */}
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <MinhaAgenda hojeInicial={hoje} fuso={fuso} />
        <MeusClientes />
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <div className={CONTAINER_PAGINA}>
      <Suspense fallback={<Carregando />}>
        <MeuDia />
      </Suspense>
    </div>
  );
}
