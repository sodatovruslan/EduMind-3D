"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";
import { getStudentsOverview } from "@/lib/teacher-client";
import { Skeleton, Surface } from "@/components/design-system";

type Filter = "all" | "attention" | "active" | "inactive";
type Sort = "activity" | "name";

/**
 * D7 spec F — "active"/"inactive" here mirrors the same real definition the
 * backend's ClassStats.active_students already uses (has completed at
 * least one lab ever) — not an invented recency window (e.g. "active in
 * last 7 days"), which the D7 brief explicitly warns against inventing.
 */
export default function StudentDirectory({
  selectedId,
  classId,
  onSelect,
  className = "",
}: {
  selectedId: string | null;
  classId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const { t, locale } = useLocale();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("activity");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const { data: students, isLoading } = useSWR(
    ["teacher-students-overview", classId, debouncedQuery, filter],
    () => getStudentsOverview(classId, debouncedQuery, filter)
  );

  const visible = useMemo(() => {
    if (!students) return [];
    return [...students].sort((a, b) => {
      if (sort === "name") return a.full_name.localeCompare(b.full_name);
      const aTime = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
      const bTime = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [students, sort]);

  return (
    <section className={`flex h-full flex-col ${className}`}>
      <h2 className="text-ds-title text-text-primary">{t.teacher.directory.title}</h2>

      <div className="mt-3 flex flex-col gap-2">
        <label className="relative">
          <span className="sr-only">{t.teacher.directory.searchPlaceholder}</span>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.teacher.directory.searchPlaceholder}
            data-testid="teacher-directory-search"
            className="ds-input ds-focus-ring w-full rounded-full py-2 pl-9 pr-3"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <label>
            <span className="sr-only">{t.teacher.directory.sortLabel}</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              data-testid="teacher-directory-filter"
              className="ds-input ds-focus-ring rounded-full py-1.5 text-ds-caption"
            >
              <option value="all">{t.teacher.directory.filterAll}</option>
              <option value="attention">{t.teacher.directory.filterAttention}</option>
              <option value="active">{t.teacher.directory.filterActive}</option>
              <option value="inactive">{t.teacher.directory.filterInactive}</option>
            </select>
          </label>
          <label>
            <span className="sr-only">{t.teacher.directory.sortLabel}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              data-testid="teacher-directory-sort"
              className="ds-input ds-focus-ring rounded-full py-1.5 text-ds-caption"
            >
              <option value="activity">{t.teacher.directory.sortActivity}</option>
              <option value="name">{t.teacher.directory.sortName}</option>
            </select>
          </label>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="mt-3 h-full min-h-[16rem] w-full" />
      ) : (
        <Surface elevated className="mt-3 flex-1 divide-y divide-border/[0.08] overflow-y-auto" role="listbox" aria-label={t.teacher.directory.title}>
          {visible.length === 0 && (
            <p className="p-4 text-ds-body text-text-muted">
              {students && students.length > 0 ? t.teacher.directory.emptyFiltered : t.teacher.directory.empty}
            </p>
          )}
          {visible.map((student) => (
            <button
              key={student.id}
              type="button"
              role="option"
              aria-selected={selectedId === student.id}
              onClick={() => onSelect(student.id)}
              data-testid={`teacher-student-row-${student.id}`}
              className={`ds-focus-ring flex w-full items-center justify-between gap-3 p-3 text-left transition-colors ${
                selectedId === student.id ? "bg-accent/15" : "hover:bg-text-primary/5"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-ds-body font-medium text-text-primary">{student.full_name}</p>
                <p className="truncate text-ds-caption text-text-muted">{student.email}</p>
              </div>
              <div className="shrink-0 text-right">
                {student.needs_attention && (
                  <span className="mb-0.5 block text-ds-caption font-medium text-warning">
                    {t.teacher.directory.attentionBadge}
                  </span>
                )}
                <span className="block text-ds-caption text-text-muted">
                  {student.last_activity_at
                    ? new Date(student.last_activity_at).toLocaleDateString(INTL_LOCALE_TAG[locale])
                    : t.teacher.directory.neverActive}
                </span>
              </div>
            </button>
          ))}
        </Surface>
      )}
    </section>
  );
}
