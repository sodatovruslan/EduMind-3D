import Link from "next/link";
import { FlaskConical, Dna, Shapes } from "lucide-react";
import type { Simulation } from "@/lib/types";

const MODULE_ICON = {
  simlab: FlaskConical,
  biobody: Dna,
  geo3d: Shapes,
} as const;

const MODULE_LABEL = {
  simlab: "SimLab 3D",
  biobody: "BioBody 3D",
  geo3d: "Geo3D",
} as const;

// карточка урока для дашборда — рендерим на каждую симуляцию из списка
export default function LessonCard({ simulation }: { simulation: Simulation }) {
  const Icon = MODULE_ICON[simulation.module];

  return (
    <Link
      href={`/${simulation.module}/${simulation.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
    >
      <div className="mb-3 flex items-center gap-2 text-brand">
        <Icon size={20} />
        <span className="text-xs font-semibold uppercase tracking-wide">
          {MODULE_LABEL[simulation.module]}
        </span>
      </div>
      <h3 className="font-semibold text-gray-900">{simulation.title}</h3>
      <p className="mt-1 text-sm text-gray-500">{simulation.subject}</p>
      <div className="mt-3 text-xs text-gray-400">Сложность: {simulation.difficulty}/5</div>
    </Link>
  );
}
