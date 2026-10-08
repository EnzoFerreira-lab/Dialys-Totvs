// Tamanho da operação comercial do usuário (equipe e carteira). Não sai das reuniões: vem da
// configuração (DIALYS_EQUIPE_VENDEDORES e DIALYS_CARTEIRA_CONTAS) e, na produção, do CRM/IdP.
// Sem configuração, null: a tela não mostra números inventados.

function inteiroDoAmbiente(nome: string) {
  const valor = Number(process.env[nome]);
  return Number.isInteger(valor) && valor > 0 ? valor : null;
}

export function lerOperacaoComercial() {
  return {
    vendedores: inteiroDoAmbiente("DIALYS_EQUIPE_VENDEDORES"),
    contasSobGestao: inteiroDoAmbiente("DIALYS_CARTEIRA_CONTAS"),
  };
}
