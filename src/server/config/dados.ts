// De onde vêm clientes e agenda, e em que fuso a agenda é exibida.
//   DIALYS_DADOS_DEMONSTRACAO  "false": clientes = contas analisadas e agenda = tabela compromisso do banco
//                              (padrão "true": carteira e agenda fictícias, em .dialys/demonstracao.json)
//   DIALYS_FUSO_HORARIO        fuso IANA da agenda (padrão America/Sao_Paulo)
// Independe de DIALYS_MODO_DEMO, que só decide se a análise usa o Claude ou regras locais.
import { FUSO_PADRAO, fusoValido } from "@/lib/fuso";

export const usarDadosDemonstracao = () => process.env.DIALYS_DADOS_DEMONSTRACAO !== "false";

export function fusoHorario() {
  const configurado = process.env.DIALYS_FUSO_HORARIO;
  return configurado && fusoValido(configurado) ? configurado : FUSO_PADRAO;
}
