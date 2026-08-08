"use client";

import Link from "next/link";
import { FlaskConical, Globe, TestTube, Zap } from "lucide-react";
import type { Simulation } from "@/lib/types";
import { useLocale } from "@/lib/locale-context";

const MODULE_ICON = {
  simlab: FlaskConical,
  geo3d: Globe,
  electricity_lab: Zap,
  chemistry_world: TestTube,
} as const;

const MODULE_LABEL = {
  simlab: "SimLab 3D",
  geo3d: "GeoWorld",
  electricity_lab: "Electricity Lab",
  chemistry_world: "Chemistry World",
} as const;

// Design V2 module accent system (D2/D5): Electricity → physics
// (violet-indigo), Chemistry → chemistry (emerald), GeoWorld → geo (cyan).
// SimLab isn't a promoted world (see lib/landing-worlds.ts) but the card
// stays generically correct for it (falls back to the base `accent` token)
// in case it's ever rendered outside the D5 world sections.
const MODULE_ACCENT_TEXT = {
  simlab: "text-accent",
  geo3d: "text-accent-geo",
  electricity_lab: "text-accent-physics",
  chemistry_world: "text-accent-chemistry",
} as const;

const MODULE_ACCENT_BORDER = {
  simlab: "border-accent/30 hover:border-accent/50",
  geo3d: "border-accent-geo/30 hover:border-accent-geo/50",
  electricity_lab: "border-accent-physics/30 hover:border-accent-physics/50",
  chemistry_world: "border-accent-chemistry/30 hover:border-accent-chemistry/50",
} as const;

// карточка урока для дашборда — рендерим на каждую симуляцию из списка
export default function LessonCard({ simulation }: { simulation: Simulation }) {
  const { t } = useLocale();
  const Icon = MODULE_ICON[simulation.module];

  return (
    <Link
      href={`/${simulation.module}/${simulation.id}`}
      className={`block rounded-ds-panel border bg-surface-elevated p-6 shadow-ds-sm transition-all duration-300 ease-ds-standard hover:-translate-y-1 ${MODULE_ACCENT_BORDER[simulation.module]}`}
    >
      <div className={`mb-3 flex items-center gap-2 ${MODULE_ACCENT_TEXT[simulation.module]}`}>
        <Icon size={20} />
        <span className="text-ds-caption font-semibold uppercase tracking-widest">{MODULE_LABEL[simulation.module]}</span>
      </div>
      <h3 className="font-headline font-semibold text-text-primary">{simulation.title}</h3>
      <p className="mt-1 text-ds-body text-text-secondary">{simulation.subject}</p>
      <div className="mt-3 text-ds-caption text-text-muted">
        {t.dashboard.worlds.difficultyLabel}: {simulation.difficulty}/5
      </div>
    </Link>
  );
}
