"use client";

import useSWR from "swr";
import { getMyResults } from "@/lib/results-client";
import { useLocale } from "@/lib/locale-context";
import { ACCENT_TEXT_CLASS, getWorldByModule, worldCopy } from "@/lib/landing-worlds";
import { Skeleton, Surface } from "@/components/design-system";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";

const MAX_VISIBLE = 5;

/**
 * D5 — "Recent results", backed by `GET /api/results/me` (see
 * lib/results-client.ts). D8 — `LabResult.module` is now real data (added
 * to the backend schema in D7 for the teacher analytics endpoints, same
 * field, just not previously exposed in the frontend type) — each row now
 * shows which world it belongs to, using the same accent/name every other
 * page already uses (`getWorldByModule`), instead of staying neutral.
 */
export default function RecentResults() {
  const { t, locale } = useLocale();
  const { data: results, isLoading } = useSWR("results-me", getMyResults);

  const sorted = results ? [...results].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()) : undefined;
  const visible = sorted?.slice(0, MAX_VISIBLE);

  return (
    <section className="flex h-full flex-col">
      <h2 className="mb-3 text-ds-title text-text-primary">{t.dashboard.recentResults.title}</h2>

      {isLoading ? (
        <Skeleton className="h-full min-h-[10rem] w-full" />
      ) : visible && visible.length > 0 ? (
        <Surface elevated className="flex-1 divide-y divide-border/[0.08]">
          {visible.map((result) => {
            const world = getWorldByModule(result.module);
            const worldName = world ? worldCopy(t, world.key).name : null;
            return (
            <div key={result.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                {worldName && (
                  <p className={`text-ds-caption font-semibold uppercase tracking-widest ${world ? ACCENT_TEXT_CLASS[world.accent] : ""}`}>
                    {worldName}
                  </p>
                )}
                <p className="truncate text-ds-body font-medium text-text-primary">{result.simulation_title}</p>
                <p className="text-ds-caption text-text-muted">
                  {new Date(result.completed_at).toLocaleDateString(INTL_LOCALE_TAG[locale])} · {Math.round(result.duration_seconds / 60)}{" "}
                  {t.dashboard.recentResults.durationLabel}
                </p>
              </div>
              {result.score !== null && (
                <div className="shrink-0 text-right">
                  <p className="text-ds-caption uppercase tracking-widest text-text-muted">{t.dashboard.recentResults.scoreLabel}</p>
                  <p className="text-ds-body font-semibold text-accent">{result.score}</p>
                </div>
              )}
            </div>
            );
          })}
        </Surface>
      ) : (
        <Surface className="flex flex-1 items-center justify-center p-6 text-center text-ds-body text-text-muted">
          {t.dashboard.recentResults.empty}
        </Surface>
      )}
    </section>
  );
}
