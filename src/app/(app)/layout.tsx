import { AppFooter } from "@/components/shell/app-footer";
import { AppHeader } from "@/components/shell/app-header";
import { ProvedorToast } from "@/components/ui/provedor-toast";
import { usarModoDemonstracao } from "@/server/pipeline/motor-analise";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ProvedorToast>
      <div className="flex min-h-dvh flex-col bg-background print:bg-white">
        <AppHeader modoDemonstracao={usarModoDemonstracao()} />
        <main className="flex-1">{children}</main>
        <AppFooter />
      </div>
    </ProvedorToast>
  );
}
