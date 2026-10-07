import { cn } from "@/lib/cn";

const LARGURA = 600;
const ALTURA = 96;

/** Senoide repetida em 2× a largura, para o loop de translateX(-50%) ser contínuo. */
function caminhoSenoide(periodos: number, amplitude: number, fase = 0) {
  const pontos: string[] = [];
  const total = LARGURA * 2;
  for (let x = 0; x <= total; x += 4) {
    const y = ALTURA / 2 + amplitude * Math.sin((x / LARGURA) * periodos * 2 * Math.PI + fase);
    pontos.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(2)}`);
  }
  return pontos.join(" ");
}

const ONDAS = [
  { d: caminhoSenoide(3, 30), cor: "#FEAC0E", largura: 2.5, opacidade: 1, duracao: "3.2s", reverso: false },
  { d: caminhoSenoide(4, 20, 1.2), cor: "#78A9FF", largura: 2, opacidade: 0.9, duracao: "4.4s", reverso: true },
  { d: caminhoSenoide(2, 38, 2.4), cor: "#FEAC0E", largura: 1.25, opacidade: 0.35, duracao: "6s", reverso: false },
  { d: caminhoSenoide(5, 12, 0.6), cor: "#78A9FF", largura: 1, opacidade: 0.35, duracao: "2.6s", reverso: true },
];

/** Visualizador decorativo: ondas em movimento enquanto o Dialys fala, quase planas em pausa. */
export function OndaAudio({ ativa, className }: { ativa: boolean; className?: string }) {
  return (
    <div className={cn("relative w-full overflow-hidden", className ?? "h-24")} aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
      {ONDAS.map((onda, indice) => (
        <svg
          key={indice}
          viewBox={`0 0 ${LARGURA * 2} ${ALTURA}`}
          preserveAspectRatio="none"
          className={cn(
            "absolute inset-y-0 left-0 h-full w-[200%] origin-center transition-transform duration-500 ease-out",
            "motion-safe:animate-[onda_linear_infinite]",
            ativa ? "scale-y-100" : "scale-y-[0.18]",
          )}
          style={{
            animationDuration: onda.duracao,
            animationDirection: onda.reverso ? "reverse" : "normal",
            animationPlayState: ativa ? "running" : "paused",
          }}
        >
          <path d={onda.d} fill="none" stroke={onda.cor} strokeWidth={onda.largura} strokeOpacity={onda.opacidade} />
        </svg>
      ))}
    </div>
  );
}
