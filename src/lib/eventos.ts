// Eventos de janela entre blocos independentes da mesma tela (sem estado global).
//   EVENTO_CARTEIRA_ALTERADA            a carteira mudou por fora de "Meus clientes" (ex.: "Restaurar
//                                       demonstração"): a lista busca de novo.
//   EVENTO_CARTEIRA_ALTERADA + ":agenda" um cliente saiu da carteira: o formulário de compromisso
//                                       atualiza a lista de clientes ao abrir.
export const EVENTO_CARTEIRA_ALTERADA = "dialys:carteira-alterada";
