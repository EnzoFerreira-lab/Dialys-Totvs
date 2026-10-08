// Fuso em que a agenda é exibida.
//   DIALYS_FUSO_HORARIO  fuso IANA da agenda (padrão America/Sao_Paulo)
import { FUSO_PADRAO, fusoValido } from "@/lib/fuso";

export function fusoHorario() {
  const configurado = process.env.DIALYS_FUSO_HORARIO;
  return configurado && fusoValido(configurado) ? configurado : FUSO_PADRAO;
}
