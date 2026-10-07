// Formato público das mensagens do assistente: sem a auditoria interna de consultas (fica no servidor).
import type { MensagemConversa } from "../db/banco";

export const serializarMensagem = ({ id, papel, texto, criadaEm, modo, fontes, tipo, fala }: MensagemConversa) => ({
  id,
  papel,
  texto,
  criadaEm,
  modo: modo ?? null,
  // Fonte de reunião abre a própria reunião na Central; fonte de conta, a reunião mais recente dela.
  fontes: (fontes ?? []).map((f) => ({
    ...f,
    link: f.tipo === "reuniao" ? `/insights?reuniao=${encodeURIComponent(f.id)}` : `/insights?conta=${encodeURIComponent(f.contaId)}`,
  })),
  /** "briefing": a tela lê esta resposta em voz. */
  tipo: tipo ?? null,
  fala: fala ?? null,
});

export type MensagemAssistenteApi = ReturnType<typeof serializarMensagem>;
export type RespostaMensagemApi = { conversaId: string; pergunta: MensagemAssistenteApi; resposta: MensagemAssistenteApi; repetida: boolean };
export type ConversaApi = { conversaId: string; mensagens: MensagemAssistenteApi[]; contasEmFoco: string[] };
