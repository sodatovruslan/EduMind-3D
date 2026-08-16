"use client";

import { useLocale } from "@/lib/locale-context";
import { ButtonLink, Surface } from "@/components/design-system";

/**
 * D9 — shared "simulation not found" fallback for all 4 immersive routes
 * (chemistry_world/electricity_lab/geo3d/simlab). Was a bare
 * `<p className="text-sm text-slate-400">` per route (invisible in Light
 * Mode, hardcoded Russian, no way back) — one component now, not four
 * copies to keep in sync.
 */
export default function SimulationNotFound() {
  const { t } = useLocale();
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Surface elevated className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-ds-body text-text-muted">{t.simulation.notFound}</p>
        <ButtonLink href="/dashboard" variant="secondary">
          {t.simulation.backToDashboard}
        </ButtonLink>
      </Surface>
    </div>
  );
}
