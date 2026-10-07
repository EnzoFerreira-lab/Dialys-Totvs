import { ArrowUpRight } from "@carbon/icons-react";
import Link from "next/link";
import type { MensagemAssistenteApi } from "@/lib/api-cliente";

/** Empresas e reuniões consultadas para a resposta, com link para a Central de Insights. */
export function FontesMensagem({ fontes }: { fontes: MensagemAssistenteApi["fontes"] }) {
  if (fontes.length === 0) return null;
  return (
    <div className="mt-3 border-t border-white/10 pt-2.5">
      <p className="text-[11px] tracking-[0.06em] text-shell-text-secondary uppercase">Fontes no Dialys</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {fontes.map((fonte) => (
          <li key={`${fonte.tipo}-${fonte.id}`}>
            <Link
              href={fonte.link}
              className="inline-flex items-center gap-1 rounded-full border border-interactive/60 px-2.5 py-0.5 text-[12px] text-white hover:bg-interactive/15"
            >
              {fonte.tipo === "reuniao" ? "Reunião · " : ""}
              {fonte.rotulo}
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
