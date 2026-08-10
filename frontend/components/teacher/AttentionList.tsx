"use client";

import useSWR from "swr";
import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { getStudentsOverview } from "@/lib/teacher-client";
import { GlassPanel, Skeleton, Surface } from "@/components/design-system";

/**
 * D7 spec H — "needs attention" is a deterministic, documented rule
 * computed backend-side (see backend/app/routers/teacher.py's
 * _needs_attention): completed >=1 task AND (accuracy < 50% OR has a weak
 * topic). No AI risk score. t.teacher.attentionRuleCaption states the rule
 * in the UI itself so it's never a mystery why a student is flagged.
 */
export default function AttentionList({ onSelect }: { onSelect: (id: string) => void }) {
  const { t } = useLocale();
  const { data: students, isLoading } = useSWR("teacher-students-overview", getStudentsOverview);

  const flagged = students?.filter((s) => s.needs_attention) ?? [];

  return (
    <section>
      <h2 className="text-ds-title text-text-primary">{t.teacher.attention.title}</h2>
      <p className="mt-1 text-ds-caption text-text-muted">{t.teacher.attentionRuleCaption}</p>

      {isLoading ? (
        <Skeleton className="mt-3 h-20 w-full" />
      ) : flagged.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flagged.map((student) => (
            <button
              key={student.id}
              type="button"
              onClick={() => onSelect(student.id)}
              className="ds-focus-ring text-left"
            >
              <GlassPanel className="flex items-start gap-3 p-4 transition-colors hover:bg-surface-elevated/60">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
                <div className="min-w-0">
                  <p className="truncate text-ds-body font-medium text-text-primary">{student.full_name}</p>
                  <p className="truncate text-ds-caption text-text-muted">
                    {student.weak_topics.length > 0
                      ? student.weak_topics.join(", ")
                      : `${t.dashboard.progress.accuracy}: ${student.accuracy}%`}
                  </p>
                </div>
              </GlassPanel>
            </button>
          ))}
        </div>
      ) : (
        <Surface className="mt-3 p-4 text-ds-body text-text-muted">{t.teacher.attention.empty}</Surface>
      )}
    </section>
  );
}
