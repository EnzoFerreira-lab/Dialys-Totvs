// Abre o Assistente Dialys flutuante (src/app/(app)/assistente/assistente-flutuante.tsx) de qualquer tela,
// opcionalmente com uma empresa em foco. Um evento da janela basta: o painel vive no layout do app.

export const EVENTO_ABRIR_ASSISTENTE = "dialys:abrir-assistente";

export type PedidoAbrirAssistente = { conta?: { id: string; nome: string } };

export function abrirAssistente(pedido: PedidoAbrirAssistente = {}) {
  window.dispatchEvent(new CustomEvent<PedidoAbrirAssistente>(EVENTO_ABRIR_ASSISTENTE, { detail: pedido }));
}
