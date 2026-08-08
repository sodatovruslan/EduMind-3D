"use client";

import useSWR from "swr";
import { getMyProgress } from "@/lib/progress-client";
import { useLocale } from "@/lib/locale-context";
import { Skeleton, Surface } from "@/components/design-system";

/**
 * D5 — "Focus next", constructive framing of real `weak_topics` (§8: not
 * "your failures"). Same data source as ProgressDashboard's "Стоит
 * повторить" card, already using this exact tone — kept consistent, just
 * promoted to its own compact Home section.
 */
export default function FocusNext() {
  const { t } = useLocale();
  const { data: progress, isLoading } = useSWR("progress-me", getMyProgress);
  const weakTopics = progress?.profile.weak_topics ?? [];

  return (
    <section className="flex h-full flex-col">
      <h2 className="text-ds-title text-text-primary">{t.dashboard.focusNext.title}</h2>
      <p className="mt-1 text-ds-body text-text-secondary">{t.dashboard.focusNext.subtitle}</p>

      <div className="mt-3 flex-1">
        {isLoading ? (
          <Skeleton className="h-full min-h-[10rem] w-full" />
        ) : weakTopics.length > 0 ? (
          <Surface elevated className="h-full border-warning/30 p-6 text-ds-body text-text-primary">
            {weakTopics.join(", ")}
          </Surface>
        ) : (
          <Surface className="flex h-full min-h-[10rem] items-center justify-center p-6 text-center text-ds-body text-text-muted">
            {t.dashboard.focusNext.empty}
          </Surface>
        )}
      </div>
    </section>
  );
}
