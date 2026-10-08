import { ArrowRight } from "@carbon/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BOTAO_ACAO_CABECALHO, CONTAINER_PAGINA, PageHeader } from "@/components/shell/page-header";
import { usuarioDaSessao } from "@/server/auth/sessao-pagina";
import { listarClientesUnificados } from "@/server/clientes/perfil";
import { fusoHorario } from "@/server/config/dados";
import { ListaClientes } from "./lista-clientes";

export const metadata: Metadata = { title: "Clientes" };

/** Lista lida a cada visita, já no escopo do usuário da sessão. */
async function ClientesDoUsuario() {
  await connection();
  const usuario = await usuarioDaSessao();
  if (!usuario) redirect("/login?volta=/contas");
  return <ListaClientes clientes={await listarClientesUnificados(usuario)} fuso={fusoHorario()} />;
}

export default function ClientesPage() {
  return (
    <div className={CONTAINER_PAGINA}>
      <PageHeader
        pagina="Clientes"
        titulo="Clientes"
        descricao="Todos os seus clientes num só lugar: reuniões, alertas, saúde e os próximos compromissos de cada um."
        acoes={
          <Link href="/envio" className={BOTAO_ACAO_CABECALHO}>
            Enviar nova reunião
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />
      <Suspense fallback={<div className="mt-6 h-[520px] animate-pulse rounded-[12px] border border-border-subtle bg-layer-01" aria-busy="true" />}>
        <ClientesDoUsuario />
      </Suspense>
    </div>
  );
}
