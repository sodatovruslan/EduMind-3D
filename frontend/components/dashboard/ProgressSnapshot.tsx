"use client";

import useSWR from "swr";
import { Award, Target, TrendingUp, Zap } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { getMyProgress } from "@/lib/progress-client";
import { GlassPanel, Skeleton, Surface } from "@/components/design-system";

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2 text-ds-body text-text-secondary">
        {icon}
        {label}
      </span>
      <span className="text-ds-body font-semibold text-text-primary">{value}</span>
    </div>
  );
}

/**
 * D5.1 — compact progress "HUD" (explicitly a glass use case per the
 * D5.1 brief §6 — "compact progress HUD" is listed under GLASS, unlike the
 * denser Recent Results/Focus Next sections, which stay solid). Reworked
 * from a 2x2 grid of cards into a vertical stat list to fit its new
 * narrower column beside ContinueLearning (see dashboard/page.tsx). Same 4
 * real metrics as D5 — still not a KPI wall.
 */
export default function ProgressSnapshot() {
  const { t } = useLocale();
  const { data: progress, isLoading } = useSWR("progress-me", getMyProgress);

  return (
    <section className="flex h-full flex-col">
      <h2 className="mb-3 text-ds-title text-text-primary">{t.dashboard.progress.title}</h2>

      {isLoading ? (
        <Skeleton className="h-full min-h-[12rem] w-full" />
      ) : progress && (progress.profile.completed_labs > 0 || progress.profile.xp > 0) ? (
        <GlassPanel className="flex-1 divide-y divide-border/[0.08] rounded-ds-panel px-5">
          <StatRow icon={<Zap size={15} className="text-accent" />} label={t.dashboard.progress.xp} value={String(progress.profile.xp)} />
          <StatRow
            icon={<Award size={15} className="text-accent-chemistry" />}
            label={t.dashboard.progress.completedLabs}
            value={String(progress.profile.completed_labs)}
          />
          <StatRow
            icon={<Target size={15} className="text-accent-geo" />}
            label={t.dashboard.progress.accuracy}
            value={`${progress.profile.accuracy}%`}
          />
          <StatRow
            icon={<TrendingUp size={15} className="text-accent-physics" />}
            label={t.dashboard.progress.level}
            value={String(progress.profile.level)}
          />
        </GlassPanel>
      ) : (
        <Surface className="flex flex-1 items-center justify-center p-6 text-center text-ds-body text-text-muted">
          {t.dashboard.progress.empty}
        </Surface>
      )}
    </section>
  );
}
