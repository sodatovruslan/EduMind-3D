"use client";

import useSWR from "swr";
import { useLocale } from "@/lib/locale-context";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";
import { getClassRecentResults } from "@/lib/teacher-client";
import { Skeleton, Surface } from "@/components/design-system";
import { moduleAccentClass, moduleLabel } from "./module-meta";

/**
 * D7 spec J — real recent class activity (GET /api/teacher/recent-results),
 * ordered by LabResult.completed_at desc, limited server-side. No fake
 * activity feed — an empty class just shows the honest empty state.
 */
export default function RecentClassResults() {
  const { t, locale } = useLocale();
  const { data: results, isLoading } = useSWR("teacher-recent-results", () => getClassRecentResults(20));

  return (
    <section data-testid="teacher-recent-results">
      <h2 className="text-ds-title text-text-primary">{t.teacher.recentResults.title}</h2>

      {isLoading ? (
        <Skeleton className="mt-3 h-48 w-full" />
      ) : results && results.length > 0 ? (
        <Surface elevated className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-ds-body">
            <thead>
              <tr className="border-b border-border/[0.08] text-ds-caption uppercase tracking-widest text-text-muted">
                <th className="p-3 font-medium">{t.teacher.recentResults.columnStudent}</th>
                <th className="p-3 font-medium">{t.teacher.recentResults.columnExperiment}</th>
                <th className="p-3 font-medium">{t.teacher.recentResults.columnWorld}</th>
                <th className="p-3 font-medium">{t.teacher.recentResults.columnScore}</th>
                <th className="p-3 font-medium">{t.teacher.recentResults.columnDate}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id} className="border-b border-border/[0.06] last:border-0">
                  <td className="p-3 text-text-primary">{result.student_name}</td>
                  <td className="p-3 text-text-secondary">{result.simulation_title}</td>
                  <td className={`p-3 ${moduleAccentClass(result.module)}`}>{moduleLabel(t, result.module)}</td>
                  <td className="p-3 font-medium text-text-primary">{result.score ?? "—"}</td>
                  <td className="p-3 text-text-muted">
                    {new Date(result.completed_at).toLocaleDateString(INTL_LOCALE_TAG[locale])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      ) : (
        <Surface className="mt-3 p-6 text-center text-ds-body text-text-muted">{t.teacher.recentResults.empty}</Surface>
      )}
    </section>
  );
}
