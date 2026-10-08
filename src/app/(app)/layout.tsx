import { AppFooter } from "@/components/shell/app-footer";
import { AppHeader } from "@/components/shell/app-header";
import { ProvedorToast } from "@/components/ui/provedor-toast";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ProvedorToast>
      <div className="flex min-h-dvh flex-col bg-background print:bg-white">
        <AppHeader />
        <main className="flex-1">{children}</main>
        <AppFooter />
      </div>
    </ProvedorToast>
  );
}
