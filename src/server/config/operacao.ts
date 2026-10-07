// Tamanho da operação comercial do usuário (equipe e carteira). Não sai das reuniões: no piloto é
// configuração (persona Ricardo Alves, 18 vendedores e 400+ contas); na produção vem do CRM/IdP.
// Ajustável sem código por DIALYS_EQUIPE_VENDEDORES e DIALYS_CARTEIRA_CONTAS.

function inteiroDoAmbiente(nome: string, padrao: number) {
  const valor = Number(process.env[nome]);
  return Number.isInteger(valor) && valor > 0 ? valor : padrao;
}

export function lerOperacaoComercial() {
  return {
    vendedores: inteiroDoAmbiente("DIALYS_EQUIPE_VENDEDORES", 18),
    contasSobGestao: inteiroDoAmbiente("DIALYS_CARTEIRA_CONTAS", 400),
    /** "configuracao": números do piloto, não conectados à operação real. */
    origem: "configuracao" as const,
  };
}
