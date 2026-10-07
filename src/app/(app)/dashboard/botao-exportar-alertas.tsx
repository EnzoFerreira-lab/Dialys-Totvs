"use client";

import { Download } from "@carbon/icons-react";
import { useState } from "react";
import { useToast } from "@/components/ui/provedor-toast";
import { api } from "@/lib/api-cliente";
import { montarCsvAlertas, nomeArquivoAlertas } from "@/lib/exportar-alertas";

/** Baixa todos os alertas atuais (GET /api/v1/insights) em CSV para o Excel. */
export function BotaoExportarAlertas() {
  const avisar = useToast();
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function exportar() {
    setExportando(true);
    setErro(null);
    try {
      const { dados, paginacao } = await api.listarInsights({ limite: "200" });
      if (dados.length === 0) {
        avisar({ titulo: "Nada para exportar ainda", descricao: "Envie uma transcrição para gerar os primeiros alertas." });
        return;
      }
      const csv = montarCsvAlertas(dados, window.location.origin);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = Object.assign(document.createElement("a"), { href: url, download: nomeArquivoAlertas(new Date()) });
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      avisar({
        titulo: "Alertas exportados",
        descricao: `${dados.length} ${dados.length === 1 ? "alerta" : "alertas"} em CSV${paginacao.total > dados.length ? ` (os ${dados.length} mais prioritários de ${paginacao.total})` : ""}, com evidência e ação recomendada.`,
      });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível exportar.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={exportar}
        disabled={exportando}
        aria-busy={exportando}
        className="inline-flex h-10 items-center gap-2 rounded-[4px] px-3 text-[13px] text-text-primary transition-colors hover:bg-[#E8E8E8] active:bg-[#C6C6C6] disabled:cursor-wait disabled:text-text-helper"
      >
        {exportando ? "Exportando..." : "Exportar alertas"}
        <Download size={16} aria-hidden="true" />
      </button>
      {erro ? (
        <p role="alert" className="mt-1 text-[12px] text-[#A2191F]">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
