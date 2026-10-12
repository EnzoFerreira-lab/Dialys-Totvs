import { Suspense } from "react";
import { AppFooter } from "@/components/shell/app-footer";
import { AppHeader } from "@/components/shell/app-header";
import { ProvedorToast } from "@/components/ui/provedor-toast";
import { usuarioDaSessao } from "@/server/auth/sessao-pagina";

/** Cabeçalho com o nome e o cargo de quem está logado (lidos da sessão na requisição). */
async function CabecalhoDaSessao() {
  const usuario = await usuarioDaSessao();
  return <AppHeader usuario={usuario ? { nome: usuario.nome, papel: usuario.papel } : null} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ProvedorToast>
      <div className="flex min-h-dvh flex-col bg-background print:bg-white">
        <Suspense fallback={<AppHeader />}>
          <CabecalhoDaSessao />
        </Suspense>
        <main className="flex-1">{children}</main>
        <AppFooter />
      </div>
    </ProvedorToast>
  );
}
