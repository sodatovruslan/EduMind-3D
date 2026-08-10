"use client";

import useSWR from "swr";
import { useLocale } from "@/lib/locale-context";
import { getClassModuleBreakdown } from "@/lib/teacher-client";
import { Skeleton, Surface } from "@/components/design-system";
import { moduleAccentClass, moduleLabel } from "./module-meta";

/**
 * D7 spec I — class-level performance grouped by world/module (GET
 * /api/teacher/module-breakdown). The backend query only returns modules
 * that actually have LabResults, so a world with zero results (e.g.
 * GeoWorld, which has no learning-result data model yet) is simply absent
 * from the response — never rendered with a fabricated 0/—.
 */
export default function ModuleBreakdown() {
  const { t } = useLocale();
  const { data: breakdown, isLoading } = useSWR("teacher-module-breakdown", getClassModuleBreakdown);

  return (
    <section>
      <h2 className="text-ds-title text-text-primary">{t.teacher.detail.moduleBreakdownTitle}</h2>

      {isLoading ? (
        <Skeleton className="mt-3 h-24 w-full" />
      ) : breakdown && breakdown.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {breakdown.map((row) => (
            <Surface key={row.module} elevated className="p-4">
              <p className={`text-ds-body font-medium ${moduleAccentClass(row.module)}`}>{moduleLabel(t, row.module)}</p>
              <p className="mt-2 text-ds-title font-bold text-text-primary">
                {row.average_score != null ? row.average_score.toFixed(1) : "—"}
              </p>
              <p className="text-ds-caption text-text-muted">
                {row.completed_count} · {row.active_students}
              </p>
            </Surface>
          ))}
        </div>
      ) : (
        <Surface className="mt-3 p-6 text-center text-ds-body text-text-muted">{t.teacher.detail.moduleBreakdownEmpty}</Surface>
      )}
    </section>
  );
}
