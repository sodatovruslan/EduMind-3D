"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useElectricityLabExperience } from "@/components/core/ElectricityLabExperienceProvider";

/**
 * Electricity Lab — Measurement Notebook UI (Stage E-2, Task 3). Только
 * отображает уже сохранённые записи (ElectricityNotebookEntry,
 * electricity-notebook.ts) — ничего не считает и не придумывает.
 */
export default function ElectricityLabNotebookPanel() {
  const { notebookEntries } = useElectricityLabExperience();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="glass-panel rounded-2xl p-4" data-testid="electricity-lab-notebook-panel">
      <h3 className="mb-3 flex items-center gap-2 font-headline text-lg font-semibold text-slate-100">
        <BookOpen size={18} /> Лабораторный журнал
      </h3>

      {notebookEntries.length === 0 && <p className="text-sm text-slate-500">Записей пока нет — заверши свою первую лабораторную работу.</p>}

      <ul className="space-y-2">
        {notebookEntries.map((entry) => {
          const expanded = expandedId === entry.id;
          return (
            <li key={entry.id} className="rounded-xl border border-glass-border">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : entry.id)}
                data-testid={`electricity-notebook-entry-${entry.id}`}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-2 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-violet"
              >
                <div>
                  <div className="text-sm font-medium text-slate-100">{entry.experimentTitle}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    {new Date(entry.dateIso).toLocaleString("ru-RU")} · {entry.score}/100
                  </div>
                </div>
                {expanded ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
              </button>
              {expanded && (
                <div className="space-y-2 border-t border-glass-border p-3 text-sm text-slate-300">
                  <div>
                    <span className="text-slate-500">Цель:</span> {entry.objective}
                  </div>
                  <div>
                    <span className="text-slate-500">Измерений сделано:</span> {entry.measurements.length}
                  </div>
                  {entry.questionResults.length > 0 && (
                    <div>
                      <span className="text-slate-500">Верно отвечено:</span>{" "}
                      {entry.questionResults.filter((q) => q.correct).length} / {entry.questionResults.length}
                    </div>
                  )}
                  {entry.observations && (
                    <div>
                      <span className="text-slate-500">Наблюдения:</span> {entry.observations}
                    </div>
                  )}
                  {entry.conclusion && (
                    <div>
                      <span className="text-slate-500">Вывод:</span> {entry.conclusion}
                    </div>
                  )}
                  <div>
                    <span className="text-slate-500">Заметка преподавателя:</span> {entry.teacherNote}
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
