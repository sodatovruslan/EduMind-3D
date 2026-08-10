"use client";

import useSWR from "swr";
import { Activity, CheckCircle2, TrendingUp, Users } from "lucide-react";
import { swrFetcher } from "@/lib/swr-fetcher";
import { useLocale } from "@/lib/locale-context";
import type { ClassStats } from "@/lib/types";
import { GlassPanel, Skeleton } from "@/components/design-system";

/**
 * D7 — replaces the old 4 plain `.glass-panel` StatCards with the same 4
 * real metrics (GET /api/results/stats, unchanged backend) on Design V2
 * tokens. Deliberately still just 4 numbers — "a restrained number of
 * metrics" per the D7 brief, not a KPI wall.
 */
function KpiCard({ icon: Icon, accentClass, label, value, isLoading }: {
  icon: typeof Users;
  accentClass: string;
  label: string;
  value: string;
  isLoading: boolean;
}) {
  return (
    <GlassPanel className="p-4">
      <Icon className={accentClass} size={20} />
      {isLoading ? (
        <Skeleton className="mt-3 h-7 w-16" />
      ) : (
        <div className="mt-3 text-ds-title font-bold text-text-primary">{value}</div>
      )}
      <div className="text-ds-caption uppercase tracking-widest text-text-muted">{label}</div>
    </GlassPanel>
  );
}

export default function KpiRow() {
  const { t } = useLocale();
  const { data: stats, isLoading } = useSWR<ClassStats>("/api/results/stats", swrFetcher);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard
        icon={Users}
        accentClass="text-accent"
        label={t.teacher.kpi.totalStudents}
        value={stats ? String(stats.total_students) : "—"}
        isLoading={isLoading}
      />
      <KpiCard
        icon={Activity}
        accentClass="text-accent-geo"
        label={t.teacher.kpi.activeStudents}
        value={stats ? String(stats.active_students) : "—"}
        isLoading={isLoading}
      />
      <KpiCard
        icon={TrendingUp}
        accentClass="text-accent-physics"
        label={t.teacher.kpi.averageScore}
        value={stats?.average_score != null ? stats.average_score.toFixed(1) : "—"}
        isLoading={isLoading}
      />
      <KpiCard
        icon={CheckCircle2}
        accentClass="text-accent-chemistry"
        label={t.teacher.kpi.classProgress}
        value={stats ? `${stats.completion_rate}%` : "—"}
        isLoading={isLoading}
      />
    </div>
  );
}
