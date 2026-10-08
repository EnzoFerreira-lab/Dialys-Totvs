import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CONTAINER_PAGINA, PageHeader } from "@/components/shell/page-header";
import { dataNoFuso } from "@/lib/fuso";
import { usuarioDaSessao } from "@/server/auth/sessao-pagina";
import { montarPerfilCliente } from "@/server/clientes/perfil";
import { fusoHorario } from "@/server/config/dados";
import { FichaCliente } from "./ficha-cliente";

export const metadata: Metadata = { title: "Cliente" };

type Parametros = { params: Promise<{ id: string }> };

function idDaUrl(bruto: string) {
  try {
    return decodeURIComponent(bruto);
  } catch {
    return bruto;
  }
}

/** Ficha montada a cada visita, no escopo do usuário: cliente de fora dele responde como inexistente. */
async function Ficha({ params }: Parametros) {
  await connection();
  const { id } = await params;
  const usuario = await usuarioDaSessao();
  if (!usuario) redirect(`/login?volta=/contas/${encodeURIComponent(idDaUrl(id))}`);
  const perfil = await montarPerfilCliente(usuario, idDaUrl(id));
  if (!perfil) {
    return (
      <>
        <PageHeader pagina="Cliente não encontrado" trilha={[{ rotulo: "Clientes", href: "/contas" }]} titulo="Cliente não encontrado" />
        <section className="mt-6 rounded-[12px] border border-border-subtle bg-layer-01 px-5 py-8 text-[14px] leading-[1.6] text-text-secondary sm:px-8">
          Este cliente não está entre os que você pode acessar, ainda não tem reuniões no Dialys ou foi removido da sua carteira.
          <div className="mt-5">
            <Link href="/contas" className="inline-flex h-10 items-center rounded-[4px] border border-[#8D8D8D] px-4 text-[13px] font-medium text-text-primary hover:bg-[#F2F2F2]">
              Ver todos os clientes
            </Link>
          </div>
        </section>
      </>
    );
  }
  const fuso = fusoHorario();
  const agora = new Date();
  return <FichaCliente perfil={perfil} fuso={fuso} hoje={dataNoFuso(agora, fuso)} agoraIso={agora.toISOString()} />;
}

export default function ClientePage(props: Parametros) {
  return (
    <div className={CONTAINER_PAGINA}>
      <Suspense fallback={<div className="h-[640px] animate-pulse rounded-[12px] border border-border-subtle bg-layer-01" aria-busy="true" />}>
        <Ficha {...props} />
      </Suspense>
    </div>
  );
}
