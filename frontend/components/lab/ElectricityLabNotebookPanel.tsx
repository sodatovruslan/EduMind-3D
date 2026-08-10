"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useElectricityLabExperience } from "@/components/core/ElectricityLabExperienceProvider";
import { useLocale } from "@/lib/locale-context";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";

/**
 * Electricity Lab — Measurement Notebook UI (Stage E-2, Task 3). Только
 * отображает уже сохранённые записи (ElectricityNotebookEntry,
 * electricity-notebook.ts) — ничего не считает и не придумывает.
 *
 * D6.2 — moved from `.glass-panel`/`slate-*` onto D1 tokens and
 * `useLocale()`/t.electricity.notebook.*; the hardcoded `"ru-RU"` date
 * format now follows the active locale via INTL_LOCALE_TAG. Recorded field
 * VALUES (objective/observations/conclusion/teacherNote) stay
 * untranslated — real per-session data, not static chrome.
 */
export default function ElectricityLabNotebookPanel() {
  const { t, locale } = useLocale();
  const n = t.electricity.notebook;
  const { notebookEntries } = useElectricityLabExperience();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="rounded-ds-panel border border-border/[0.08] bg-surface p-4" data-testid="electricity-lab-notebook-panel">
      <h3 className="mb-3 flex items-center gap-2 font-headline text-lg font-semibold text-text-primary">
        <BookOpen size={18} /> {n.heading}
      </h3>

      {notebookEntries.length === 0 && <p className="text-sm text-text-muted">{n.empty}</p>}

      <ul className="space-y-2">
        {notebookEntries.map((entry) => {
          const expanded = expandedId === entry.id;
          return (
            <li key={entry.id} className="rounded-ds-control border border-border/[0.08]">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : entry.id)}
                data-testid={`electricity-notebook-entry-${entry.id}`}
                aria-expanded={expanded}
                aria-controls={`electricity-notebook-entry-${entry.id}-details`}
                className="ds-focus-ring flex w-full items-center justify-between gap-2 p-3 text-left"
              >
                <div>
                  <div className="text-sm font-medium text-text-primary">{entry.experimentTitle}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
                    {new Date(entry.dateIso).toLocaleString(INTL_LOCALE_TAG[locale])} · {entry.score}/100
                  </div>
                </div>
                {expanded ? <ChevronUp size={16} className="shrink-0 text-text-secondary" /> : <ChevronDown size={16} className="shrink-0 text-text-secondary" />}
              </button>
              {expanded && (
                <div id={`electricity-notebook-entry-${entry.id}-details`} className="space-y-2 border-t border-border/[0.08] p-3 text-sm text-text-secondary">
                  <div>
                    <span className="text-text-muted">{n.goalLabel}</span> {entry.objective}
                  </div>
                  <div>
                    <span className="text-text-muted">{n.measurementsCountLabel}</span> {entry.measurements.length}
                  </div>
                  {entry.questionResults.length > 0 && (
                    <div>
                      <span className="text-text-muted">{n.correctAnsweredLabel}</span>{" "}
                      {entry.questionResults.filter((q) => q.correct).length} / {entry.questionResults.length}
                    </div>
                  )}
                  {entry.observations && (
                    <div>
                      <span className="text-text-muted">{n.observationsLabel}</span> {entry.observations}
                    </div>
                  )}
                  {entry.conclusion && (
                    <div>
                      <span className="text-text-muted">{n.conclusionLabel}</span> {entry.conclusion}
                    </div>
                  )}
                  {/* Stage S9.6 — Teacher Analytics: реальные счётчики попытки,
                      те же данные, что и в детальном отчёте (ElectricityLabReportPanel) */}
                  <div className="font-mono text-xs text-text-muted" data-testid={`electricity-notebook-entry-${entry.id}-evidence`}>
                    {n.hintsLabel} {entry.hintsUsed} · {n.mistakesLabel} {entry.mistakesCount} · {n.safetyIncidentsLabel} {entry.safetyIncidentsCount}
                    {entry.durationMs !== null && ` · ${n.durationLabel.replace("{seconds}", String(Math.round(entry.durationMs / 1000)))}`}
                  </div>
                  <div>
                    <span className="text-text-muted">{n.teacherNoteLabel}</span> {entry.teacherNote}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
