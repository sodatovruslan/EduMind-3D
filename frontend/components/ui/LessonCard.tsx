import Link from "next/link";
import { FlaskConical, Globe, Zap } from "lucide-react";
import type { Simulation } from "@/lib/types";

const MODULE_ICON = {
  simlab: FlaskConical,
  geo3d: Globe,
  electricity_lab: Zap,
} as const;

const MODULE_LABEL = {
  simlab: "SimLab 3D",
  geo3d: "GeoWorld",
  electricity_lab: "Electricity Lab",
} as const;

// у каждого модуля свой neon-акцент: SimLab — индиго, GeoWorld — циан,
// Electricity Lab — фиолетовый
const MODULE_ICON_COLOR = {
  simlab: "text-brand",
  geo3d: "text-neon-cyan",
  electricity_lab: "text-neon-violet",
} as const;

const MODULE_BORDER_HOVER = {
  simlab: "border-brand/40 hover:border-brand/60",
  geo3d: "border-neon-cyan/40 hover:border-neon-cyan/60",
  electricity_lab: "border-neon-violet/40 hover:border-neon-violet/60",
} as const;

// карточка урока для дашборда — рендерим на каждую симуляцию из списка
export default function LessonCard({ simulation }: { simulation: Simulation }) {
  const Icon = MODULE_ICON[simulation.module];

  return (
    <Link
      href={`/${simulation.module}/${simulation.id}`}
      className={`glass-panel block rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 ${MODULE_BORDER_HOVER[simulation.module]}`}
    >
      <div className={`mb-3 flex items-center gap-2 ${MODULE_ICON_COLOR[simulation.module]}`}>
        <Icon size={20} />
        <span className="font-mono text-xs font-semibold uppercase tracking-widest">
          {MODULE_LABEL[simulation.module]}
        </span>
      </div>
      <h3 className="font-headline font-semibold text-slate-100">{simulation.title}</h3>
      <p className="mt-1 text-sm text-slate-400">{simulation.subject}</p>
      <div className="mt-3 font-mono text-xs text-slate-500">Сложность: {simulation.difficulty}/5</div>
    </Link>
  );
}
