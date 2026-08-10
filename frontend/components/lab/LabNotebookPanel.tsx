"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";
import { useLocale } from "@/lib/locale-context";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";

/**
 * Chemistry World — Laboratory Notebook UI (Stage 5.6). Только отображает
 * уже сохранённые записи (NotebookEntry, chemistry-notebook.ts) — ничего
 * не считает и не придумывает.
 *
 * D6.2 — moved from `.glass-panel`/`slate-*` onto D1 tokens and
 * `useLocale()`/t.chemistry.notebook.*; the hardcoded `"ru-RU"` date format
 * now follows the active locale via INTL_LOCALE_TAG. Recorded field VALUES
 * (reaction titles, hazards, safety warnings, student actions/conclusion)
 * stay untranslated — real per-session data, not static chrome.
 */
export default function LabNotebookPanel() {
  const { t, locale } = useLocale();
  const n = t.chemistry.notebook;
  const { notebookEntries } = useChemistryLabExperience();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="rounded-ds-panel border border-border/[0.08] bg-surface p-4" data-testid="lab-notebook-panel">
      <h3 className="mb-3 flex items-center gap-2 font-headline text-lg font-semibold text-text-primary">
        <BookOpen size={18} /> {n.heading}
      </h3>

      {notebookEntries.length === 0 && <p className="text-sm text-text-muted">{n.empty}</p>}

      <ul className="space-y-2">
        {notebookEntries.map((entry) => {
          const expanded = expandedId === entry.id;
          const hazards = entry.hazardsEncountered.filter((h) => h !== "none");
          return (
            <li key={entry.id} className="rounded-ds-control border border-border/[0.08]">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : entry.id)}
                data-testid={`notebook-entry-${entry.id}`}
                aria-expanded={expanded}
                className="ds-focus-ring flex w-full items-center justify-between gap-2 p-3 text-left"
              >
                <div>
                  <div className="text-sm font-medium text-text-primary">{entry.experimentTitle}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
                    {new Date(entry.dateIso).toLocaleString(INTL_LOCALE_TAG[locale])} · {entry.assessment.overallScore}/100
                  </div>
                </div>
                {expanded ? <ChevronUp size={16} className="shrink-0 text-text-secondary" /> : <ChevronDown size={16} className="shrink-0 text-text-secondary" />}
              </button>
              {expanded && (
                <div className="space-y-2 border-t border-border/[0.08] p-3 text-sm text-text-secondary">
                  <div>
                    <span className="text-text-muted">{n.maxTemperature}</span> {entry.maxTemperatureC.toFixed(1)}°C
                  </div>
                  <div>
                    <span className="text-text-muted">{n.maxPressure}</span> {entry.maxPressureKPa.toFixed(1)} кПа
                  </div>
                  {entry.reactionHistory.length > 0 && (
                    <div>
                      <span className="text-text-muted">{n.reactions}</span> {entry.reactionHistory.map((r) => r.title).join(", ")}
                    </div>
                  )}
                  {hazards.length > 0 && (
                    <div>
                      <span className="text-text-muted">{n.hazards}</span> {hazards.join(", ")}
                    </div>
                  )}
                  {entry.safetyWarnings.length > 0 && (
                    <div>
                      <span className="text-text-muted">{n.warnings}</span> {entry.safetyWarnings.join(", ")}
                    </div>
                  )}
                  {entry.studentActions.length > 0 && (
                    <div>
                      <span className="text-text-muted">{n.actions}</span> {entry.studentActions.join(" → ")}
                    </div>
                  )}
                  {entry.studentConclusion && (
                    <div>
                      <span className="text-text-muted">{n.conclusion}</span> {entry.studentConclusion}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
