"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { getWorldByModule, ACCENT_TEXT_CLASS } from "@/lib/landing-worlds";
import { LocaleSwitcher, ThemeToggle } from "@/components/design-system";
import type { Simulation } from "@/lib/types";
import { localizeSimulationTitle } from "@/lib/simulation-title-localization";

export interface SimulationShellProps {
  simulation: Simulation;
  children: React.ReactNode;
}

/**
 * D6 — immersive route chrome. Owns ONLY: back/exit, world identity
 * (icon/accent from lib/landing-worlds.ts + the real simulation title),
 * Locale, Theme. Everything else (fullscreen, AI Teacher, guided labs,
 * safety, measurements, sandbox HUD) stays exactly where each scene
 * already owns it — see EDUMIND_DESIGN_SYSTEM_V2.md D6 notes for the full
 * shell-vs-scene responsibility boundary.
 *
 * Floats OVER the scene (fixed, not in normal flow) rather than pushing it
 * down — the outer wrapper carries no height of its own. `pointer-events-
 * none` on the row + `pointer-events-auto` on each actual control group is
 * required here: without it, this element's full-width bounding box would
 * silently swallow orbit-drag/WASD/wire-drag pointer events that start
 * underneath its (otherwise empty, transparent) left/right margins.
 */
export default function SimulationShell({ simulation, children }: SimulationShellProps) {
  const { t, locale } = useLocale();
  const world = getWorldByModule(simulation.module);
  const Icon = world?.icon;
  const accentClass = world ? ACCENT_TEXT_CLASS[world.accent] : "text-accent";

  return (
    <div className="relative">
      <div className="pointer-events-none fixed inset-x-4 top-4 z-40 flex items-center justify-between gap-3">
        <div className="ds-glass pointer-events-auto flex min-w-0 items-center gap-3 rounded-ds-panel py-2 pl-2 pr-4 shadow-ds-md">
          <Link
            href="/dashboard"
            aria-label={t.simulation.back}
            className="ds-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-ds-control text-text-secondary transition-colors hover:bg-text-primary/5 hover:text-text-primary"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="h-6 w-px shrink-0 bg-border/10" />
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon size={18} className={`shrink-0 ${accentClass}`} />}
            <span className="truncate text-ds-body font-medium text-text-primary">{localizeSimulationTitle(simulation.title, locale)}</span>
          </div>
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>

      {children}
    </div>
  );
}
