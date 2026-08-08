"use client";

import useSWR from "swr";
import { ArrowRight, PlayCircle } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { getMyChemistrySaves } from "@/lib/chemistry-saves-client";
import { getMyProgress } from "@/lib/progress-client";
import type { Simulation } from "@/lib/types";
import { ButtonLink, Skeleton, Surface } from "@/components/design-system";

/**
 * D5 — "Continue Learning". Honest, in priority order (see
 * EDUMIND_DESIGN_SYSTEM_V2.md D5 notes for the full audit trail):
 *
 * 1. A real *active* Chemistry World save (`GET /api/chemistry/saves`,
 *    status === "active") — the only module with server-side resumable
 *    state. Framed as "unfinished experiment", links straight back in.
 * 2. Otherwise `LearningProfile.last_completed_lab` (a real simulation_id)
 *    — framed as "recent work", NOT as an unfinished/resumable state,
 *    since it's a completed lab.
 * 3. Otherwise an honest empty state. No fabricated "last lesson".
 *
 * Electricity Lab/GeoWorld/SimLab have no cross-session resume source
 * reachable from the dashboard (confirmed — no equivalent backend route),
 * so they can only ever appear here via the (2) fallback, never as a true
 * "resume".
 */
export default function ContinueLearning({ simulations }: { simulations: Simulation[] | undefined }) {
  const { t } = useLocale();
  const { data: saves, isLoading: savesLoading } = useSWR("chemistry-saves-me", getMyChemistrySaves);
  const { data: progress, isLoading: progressLoading } = useSWR("progress-me", getMyProgress);

  const isLoading = savesLoading || progressLoading || simulations === undefined;

  if (isLoading) {
    return (
      <section>
        <h2 className="mb-3 text-ds-title text-text-primary">{t.dashboard.continueLearning.title}</h2>
        <Skeleton className="h-24 w-full" />
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
    <section>
      <h2 className="mb-3 text-ds-title text-text-primary">{t.dashboard.continueLearning.title}</h2>

      {target ? (
        <Surface elevated className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <PlayCircle size={28} className="shrink-0 text-accent" />
            <div>
              <p className="text-ds-caption font-semibold uppercase tracking-widest text-text-muted">
                {activeSaveSimulation ? t.dashboard.continueLearning.unfinishedLabel : t.dashboard.continueLearning.recentLabel}
              </p>
              <p className="text-ds-body font-medium text-text-primary">{target.title}</p>
            </div>
          </div>
          <ButtonLink href={`/${target.module}/${target.id}`} variant="primary" className="w-full sm:w-auto">
            {activeSaveSimulation ? t.dashboard.continueLearning.resumeCta : t.dashboard.continueLearning.recentCta}
            <ArrowRight size={16} />
          </ButtonLink>
        </Surface>
      ) : (
        <Surface className="p-6 text-center">
          <p className="text-ds-body font-medium text-text-primary">{t.dashboard.continueLearning.emptyTitle}</p>
          <p className="mt-1 text-ds-body text-text-secondary">{t.dashboard.continueLearning.emptyBody}</p>
        </Surface>
      )}
    </section>
  );
}
