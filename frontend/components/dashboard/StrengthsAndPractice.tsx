"use client";

import useSWR from "swr";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { getMyProgress } from "@/lib/progress-client";
import { useLocale } from "@/lib/locale-context";
import { Skeleton, Surface } from "@/components/design-system";

/**
 * D8 — replaces the old weak-topics-only "Focus next" with both real
 * `strong_topics` and `weak_topics` from the same LearningProfile
 * (`GET /api/progress/me`, unchanged backend, same "progress-me" SWR key
 * already shared with Hero/ContinueLearning/ProgressSnapshot — no extra
 * request). Framing stays constructive on both sides — "going well" next
 * to "worth revisiting", never "you're bad at X" (D8 brief §9).
 */
export default function StrengthsAndPractice() {
  const { t } = useLocale();
  const { data: progress, isLoading } = useSWR("progress-me", getMyProgress);
  const strongTopics = progress?.profile.strong_topics ?? [];
  const weakTopics = progress?.profile.weak_topics ?? [];
  const hasAny = strongTopics.length > 0 || weakTopics.length > 0;

  return (
    <section className="flex h-full flex-col">
      <h2 className="text-ds-title text-text-primary">{t.dashboard.strengths.title}</h2>

      <div className="mt-3 flex-1">
        {isLoading ? (
          <Skeleton className="h-full min-h-[10rem] w-full" />
        ) : hasAny ? (
          <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-2">
            {strongTopics.length > 0 && (
              <Surface elevated className="border-success/30 p-5">
                <p className="mb-2 flex items-center gap-1.5 text-ds-caption font-semibold uppercase tracking-widest text-success">
                  <CheckCircle2 size={14} /> {t.dashboard.strengths.strongLabel}
                </p>
                <p className="text-ds-body text-text-primary">{strongTopics.join(", ")}</p>
              </Surface>
            )}
            {weakTopics.length > 0 && (
              <Surface elevated className="border-warning/30 p-5">
                <p className="mb-2 flex items-center gap-1.5 text-ds-caption font-semibold uppercase tracking-widest text-warning">
                  <RotateCcw size={14} /> {t.dashboard.strengths.weakLabel}
                </p>
                <p className="text-ds-body text-text-primary">{weakTopics.join(", ")}</p>
              </Surface>
            )}
          </div>
        ) : (
          <Surface className="flex h-full min-h-[10rem] items-center justify-center p-6 text-center text-ds-body text-text-muted">
            {t.dashboard.strengths.empty}
          </Surface>
        )}
      </div>
    </section>
  );
}
