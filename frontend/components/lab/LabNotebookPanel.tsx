"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";

/**
 * Chemistry World — Laboratory Notebook UI (Stage 5.6). Только отображает
 * уже сохранённые записи (NotebookEntry, chemistry-notebook.ts) — ничего
 * не считает и не придумывает.
 */
export default function LabNotebookPanel() {
  const { notebookEntries } = useChemistryLabExperience();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="glass-panel rounded-2xl p-4" data-testid="lab-notebook-panel">
      <h3 className="mb-3 flex items-center gap-2 font-headline text-lg font-semibold text-slate-100">
        <BookOpen size={18} /> Лабораторный журнал
      </h3>

      {notebookEntries.length === 0 && <p className="text-sm text-slate-500">Записей пока нет — заверши свой первый эксперимент.</p>}

      <ul className="space-y-2">
        {notebookEntries.map((entry) => {
          const expanded = expandedId === entry.id;
          const hazards = entry.hazardsEncountered.filter((h) => h !== "none");
          return (
            <li key={entry.id} className="rounded-xl border border-glass-border">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : entry.id)}
                data-testid={`notebook-entry-${entry.id}`}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-2 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-violet"
              >
                <div>
                  <div className="text-sm font-medium text-slate-100">{entry.experimentTitle}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    {new Date(entry.dateIso).toLocaleString("ru-RU")} · {entry.assessment.overallScore}/100
                  </div>
                </div>
                {expanded ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
              </button>
              {expanded && (
                <div className="space-y-2 border-t border-glass-border p-3 text-sm text-slate-300">
                  <div>
                    <span className="text-slate-500">Макс. температура:</span> {entry.maxTemperatureC.toFixed(1)}°C
                  </div>
                  <div>
                    <span className="text-slate-500">Макс. давление:</span> {entry.maxPressureKPa.toFixed(1)} кПа
                  </div>
                  {entry.reactionHistory.length > 0 && (
                    <div>
                      <span className="text-slate-500">Реакции:</span> {entry.reactionHistory.map((r) => r.title).join(", ")}
                    </div>
                  )}
                  {hazards.length > 0 && (
                    <div>
                      <span className="text-slate-500">Опасные явления:</span> {hazards.join(", ")}
                    </div>
                  )}
                  {entry.safetyWarnings.length > 0 && (
                    <div>
                      <span className="text-slate-500">Предупреждения:</span> {entry.safetyWarnings.join(", ")}
                    </div>
                  )}
                  {entry.studentActions.length > 0 && (
                    <div>
                      <span className="text-slate-500">Действия:</span> {entry.studentActions.join(" → ")}
                    </div>
                  )}
                  {entry.studentConclusion && (
                    <div>
                      <span className="text-slate-500">Вывод:</span> {entry.studentConclusion}
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
