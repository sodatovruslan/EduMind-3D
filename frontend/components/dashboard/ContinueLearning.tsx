"use client";

import useSWR from "swr";
import { ArrowRight, PlayCircle } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { getMyChemistrySaves } from "@/lib/chemistry-saves-client";
import { getMyProgress } from "@/lib/progress-client";
import type { Simulation } from "@/lib/types";
import { ButtonLink, Skeleton, Surface } from "@/components/design-system";

/**
 * D5.1 — "Continue Learning". Same D5 priority logic (KEPT — see
 * EDUMIND_DESIGN_SYSTEM_V2.md D5 notes for the full audit trail):
 *
 * 1. A real *active* Chemistry World save — the only module with
 *    server-side resumable state. Framed as "unfinished experiment", now
 *    also shows the real `updated_at` as "Saved: {date}" (the only
 *    real progress signal a save actually carries — no fabricated %).
 * 2. Otherwise `LearningProfile.last_completed_lab` — framed as "recent
 *    work", not resumable.
 * 3. Otherwise an honest, visually designed empty state.
 *
 * Visually reworked to be the dominant half of a 2-column row with
 * ProgressSnapshot (see dashboard/page.tsx) instead of a thin full-width
 * strip — larger icon, more padding, real "last saved" context line.
 */
export default function ContinueLearning({ simulations }: { simulations: Simulation[] | undefined }) {
  const { t, locale } = useLocale();
  const { data: saves, isLoading: savesLoading } = useSWR("chemistry-saves-me", getMyChemistrySaves);
  const { data: progress, isLoading: progressLoading } = useSWR("progress-me", getMyProgress);

  const isLoading = savesLoading || progressLoading || simulations === undefined;

  if (isLoading) {
    return (
      <section className="flex h-full flex-col">
        <h2 className="mb-3 text-ds-title text-text-primary">{t.dashboard.continueLearning.title}</h2>
        <Skeleton className="h-full min-h-[12rem] w-full" />
      </section>
    );
  }

  const activeSave = saves?.find((s) => s.status === "active");
  const activeSaveSimulation = activeSave ? simulations?.find((s) => s.id === activeSave.simulation_id) : undefined;

  const recentSimulation =
    !activeSaveSimulation && progress?.profile.last_completed_lab
      ? simulations?.find((s) => s.id === progress.profile.last_completed_lab)
      : undefined;

  const target = activeSaveSimulation ?? recentSimulation;

  return (
    <section className="flex h-full flex-col">
      <h2 className="mb-3 text-ds-title text-text-primary">{t.dashboard.continueLearning.title}</h2>

      {target ? (
        <Surface elevated className="flex flex-1 flex-col justify-between gap-6 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <PlayCircle size={26} />
            </div>
            <div className="min-w-0">
              <p className="text-ds-caption font-semibold uppercase tracking-widest text-text-muted">
                {activeSaveSimulation ? t.dashboard.continueLearning.unfinishedLabel : t.dashboard.continueLearning.recentLabel}
              </p>
              <p className="mt-1 text-ds-title text-text-primary">{target.title}</p>
              {activeSave && activeSaveSimulation && (
                <p className="mt-1 text-ds-caption text-text-muted">
                  {t.dashboard.continueLearning.lastSavedLabel}: {new Date(activeSave.updated_at).toLocaleDateString(locale)}
                </p>
              )}
            </div>
          </div>
          <ButtonLink href={`/${target.module}/${target.id}`} variant="primary" className="w-full sm:w-auto sm:self-start">
            {activeSaveSimulation ? t.dashboard.continueLearning.resumeCta : t.dashboard.continueLearning.recentCta}
            <ArrowRight size={16} />
          </ButtonLink>
        </Surface>
      ) : (
        <Surface className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-ds-title text-text-primary">{t.dashboard.continueLearning.emptyTitle}</p>
          <p className="text-ds-body text-text-secondary">{t.dashboard.continueLearning.emptyBody}</p>
        </Surface>
      )}
    </section>
  );
}
