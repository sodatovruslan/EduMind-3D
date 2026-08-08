"use client";

import { useLocale } from "@/lib/locale-context";
import { ACCENT_TEXT_CLASS, LANDING_WORLDS, worldCopy } from "@/lib/landing-worlds";
import type { Simulation } from "@/lib/types";
import { Skeleton, Surface } from "@/components/design-system";
import LessonCard from "@/components/ui/LessonCard";

/**
 * D5 — "Explore the worlds". Reuses lib/landing-worlds.ts (same 3 real,
 * promoted worlds and accent mapping as the D2 Landing — SimLab
 * intentionally excluded, same reasoning as the Landing page) instead of a
 * generic launcher: each world groups the REAL simulations that exist for
 * it (`Simulation.module`), so there's no separate "world overview" route
 * to invent — the world tiles ARE the real catalog, just organized and
 * accented instead of a flat grid.
 */
export default function WorldSection({ simulations, isLoading }: { simulations: Simulation[] | undefined; isLoading: boolean }) {
  const { t } = useLocale();

  return (
    <section id="worlds">
      <h2 className="text-ds-title text-text-primary">{t.dashboard.worlds.title}</h2>
      <p className="mt-1 text-ds-body text-text-secondary">{t.dashboard.worlds.subtitle}</p>

      <div className="mt-6 space-y-8">
        {LANDING_WORLDS.map((world) => {
          const copy = worldCopy(t, world.key);
          const moduleKey = world.routeBase.slice(1) as Simulation["module"];
          const worldSimulations = simulations?.filter((s) => s.module === moduleKey);

          return (
            <div key={world.key}>
              <div className="mb-3 flex items-center gap-2">
                <world.icon size={18} className={ACCENT_TEXT_CLASS[world.accent]} />
                <h3 className={`text-ds-body font-semibold uppercase tracking-widest ${ACCENT_TEXT_CLASS[world.accent]}`}>{copy.name}</h3>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : worldSimulations && worldSimulations.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {worldSimulations.map((simulation) => (
                    <LessonCard key={simulation.id} simulation={simulation} />
                  ))}
                </div>
              ) : (
                <Surface className="p-4 text-ds-body text-text-muted">{t.dashboard.worlds.empty}</Surface>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
