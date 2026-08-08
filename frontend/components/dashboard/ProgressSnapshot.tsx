"use client";

import useSWR from "swr";
import { Award, Target, TrendingUp, Zap } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { getMyProgress } from "@/lib/progress-client";
import { Skeleton, Surface } from "@/components/design-system";

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Surface elevated className="p-4">
      <div className="mb-1 flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-ds-caption uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-ds-title text-text-primary">{value}</p>
    </Surface>
  );
}

/**
 * D5 — compact progress snapshot (§6: "a small number of meaningful
 * metrics", not a KPI wall). The fuller breakdown (hints/attempts/topics/
 * achievements) stays on /profile via ProgressDashboard — this is
 * deliberately a 4-metric subset, not a duplicate.
 */
export default function ProgressSnapshot() {
  const { t } = useLocale();
  const { data: progress, isLoading } = useSWR("progress-me", getMyProgress);

  return (
    <section>
      <h2 className="mb-3 text-ds-title text-text-primary">{t.dashboard.progress.title}</h2>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : progress && (progress.profile.completed_labs > 0 || progress.profile.xp > 0) ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Zap size={14} />} label={t.dashboard.progress.xp} value={String(progress.profile.xp)} />
          <StatCard icon={<Award size={14} />} label={t.dashboard.progress.completedLabs} value={String(progress.profile.completed_labs)} />
          <StatCard icon={<Target size={14} />} label={t.dashboard.progress.accuracy} value={`${progress.profile.accuracy}%`} />
          <StatCard icon={<TrendingUp size={14} />} label={t.dashboard.progress.level} value={String(progress.profile.level)} />
        </div>
      ) : (
        <Surface className="p-4 text-ds-body text-text-muted">{t.dashboard.progress.empty}</Surface>
      )}
    </section>
  );
}
