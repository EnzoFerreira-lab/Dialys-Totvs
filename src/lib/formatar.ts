// Formatação determinística (sem Date/Intl) para o HTML do servidor e do cliente serem idênticos.

/** "2026-09-01T16:45" → "01/09/2026" */
export function formatarData(iso: string) {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** "2026-09-01T16:45" → "01/09/2026, 16:45" */
export function formatarDataHora(iso: string) {
  return `${formatarData(iso)}, ${iso.slice(11, 16)}`;
}

/** Remove acentos e caixa para busca ("João" encontra "joao"). */
export function normalizarBusca(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
