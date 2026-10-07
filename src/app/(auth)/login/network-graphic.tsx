import { ChartColumn, Chat, Flash } from "@carbon/icons-react";
import type { ComponentType } from "react";

type Node = { x: number; y: number; accent?: "small" | "core" };

// Coordenadas no viewBox 320×200, medidas a partir do protótipo.
const NODES: Node[] = [
  { x: 141, y: 38 },
  { x: 207, y: 37 },
  { x: 278, y: 37 },
  { x: 77, y: 54, accent: "small" },
  { x: 178, y: 78, accent: "core" },
  { x: 122, y: 82 },
  { x: 256, y: 82 },
  { x: 43, y: 98 },
  { x: 154, y: 133, accent: "small" },
  { x: 225, y: 128 },
  { x: 83, y: 144 },
  { x: 272, y: 154 },
  { x: 191, y: 174 },
  { x: 49, y: 182 },
  { x: 108, y: 181 },
];

const EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [0, 3], [0, 5], [0, 4], [1, 4], [1, 6], [2, 6], [3, 5],
  [3, 7], [5, 4], [4, 6], [5, 7], [5, 8], [4, 8], [4, 9], [6, 9], [6, 11],
  [7, 10], [8, 10], [8, 9], [8, 12], [9, 11], [9, 12], [10, 13], [10, 14],
  [13, 14], [14, 12], [11, 12], [2, 11],
];

type Tag = { label: string; icon: ComponentType<{ size?: number; className?: string }>; left: string; top: string };

const TAGS: Tag[] = [
  { label: "Conversas", icon: Chat, left: "9.7%", top: "60%" },
  { label: "Inteligência", icon: Flash, left: "50.6%", top: "47.5%" },
  { label: "Resultados", icon: ChartColumn, left: "63.7%", top: "79.5%" },
];

export function NetworkGraphic() {
  return (
    <div className="relative aspect-[320/200] w-full max-w-[340px]" aria-hidden="true">
      <svg viewBox="0 0 320 200" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <radialGradient id="dialys-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FEAC0E" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#FEAC0E" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="160" cy="112" rx="135" ry="88" fill="url(#dialys-glow)" />

        {/* Órbitas */}
        <g fill="none" stroke="#8D8D8D" strokeOpacity="0.18" strokeWidth="0.6">
          <ellipse cx="162" cy="110" rx="125" ry="78" />
          <ellipse cx="160" cy="108" rx="110" ry="66" transform="rotate(-8 160 108)" />
        </g>

        <g stroke="#8D8D8D" strokeOpacity="0.28" strokeWidth="0.6">
          {EDGES.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
          ))}
        </g>

        {NODES.map((node) => {
          if (node.accent === "core") {
            return (
              <g key={`${node.x}-${node.y}`}>
                <circle cx={node.x} cy={node.y} r="9" fill="#2A2A2A" />
                <circle cx={node.x} cy={node.y} r="3.4" fill="#FEAC0E" className="motion-safe:animate-pulse" />
              </g>
            );
          }
          if (node.accent === "small") {
            return <circle key={`${node.x}-${node.y}`} cx={node.x} cy={node.y} r="2" fill="#FEAC0E" />;
          }
          return (
            <g key={`${node.x}-${node.y}`}>
              <circle cx={node.x} cy={node.y} r="4" fill="#2E2E2E" />
              <circle cx={node.x} cy={node.y} r="1.8" fill="#A8A8A8" />
            </g>
          );
        })}
      </svg>

      {TAGS.map(({ label, icon: Icon, left, top }) => (
        <span
          key={label}
          className="absolute flex items-center gap-1.5 rounded-[2px] border border-[#4A4A4A] bg-[#2E2E2E]/90 px-2 py-1 text-[10px] leading-none text-[#E0E0E0]"
          style={{ left, top }}
        >
          <Icon size={12} className="text-interactive" />
          {label}
        </span>
      ))}
    </div>
  );
}
