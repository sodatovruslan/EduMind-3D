"use client";

import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";
import { searchExperiments, type LabDifficulty } from "@/lib/chemistry-lab-catalog";
import { attemptsForExperiment, bestScoreForExperiment } from "@/lib/chemistry-notebook";

/**
 * Chemistry World — Laboratory Experiment Catalog UI (Stage 5.6). Только
 * отображает и фильтрует уже готовый каталог (chemistry-lab-catalog.ts) —
 * ничего не решает про химию/разблокировку сама, всё берёт из
 * useChemistryLabExperience() (isExperimentUnlockedFor — реальная проверка
 * по фактическому прогрессу).
 */
const DIFFICULTY_LABEL: Record<LabDifficulty, string> = {
  beginner: "Начальный",
  intermediate: "Средний",
  advanced: "Продвинутый",
};

const DIFFICULTY_FILTERS: ("all" | LabDifficulty)[] = ["all", "beginner", "intermediate", "advanced"];

export default function ExperimentCatalogBrowser() {
  const { completedExperimentIds, notebookEntries, selectExperiment, isExperimentUnlockedFor } = useChemistryLabExperience();
  const [query, setQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | LabDifficulty>("all");

  const results = useMemo(() => {
    const bySearch = searchExperiments(query);
    return bySearch.filter((e) => difficultyFilter === "all" || e.difficulty === difficultyFilter);
  }, [query, difficultyFilter]);

  return (
    <div className="glass-panel rounded-2xl p-4" data-testid="experiment-catalog-browser">
      <h3 className="mb-3 font-headline text-lg font-semibold text-slate-100">Каталог лабораторных работ</h3>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Поиск экспериментов</span>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию или цели..."
            data-testid="catalog-search"
            className="w-full rounded-full border border-glass-border bg-white/5 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-neon-violet focus:outline-none"
          />
        </label>

        <label>
          <span className="sr-only">Фильтр по сложности</span>
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as "all" | LabDifficulty)}
            data-testid="catalog-difficulty-filter"
            className="rounded-full border border-glass-border bg-white/5 px-3 py-2 text-sm text-slate-200 focus:border-neon-violet focus:outline-none"
          >
            {DIFFICULTY_FILTERS.map((d) => (
              <option key={d} value={d}>
                {d === "all" ? "Все уровни" : DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="catalog-results">
        {results.map((exp) => {
          const unlocked = isExperimentUnlockedFor(exp);
          const completed = completedExperimentIds.includes(exp.id);
          const best = bestScoreForExperiment(notebookEntries, exp.id);
          const attempts = attemptsForExperiment(notebookEntries, exp.id);
          return (
            <li key={exp.id}>
              <button
                type="button"
                onClick={() => unlocked && selectExperiment(exp.id)}
                disabled={!unlocked}
                data-testid={`catalog-item-${exp.id}`}
                className={`flex w-full flex-col gap-1 rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-violet ${
                  unlocked
                    ? "border-glass-border hover:border-neon-violet/60 hover:bg-white/5"
                    : "cursor-not-allowed border-glass-border/50 opacity-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-100">{exp.title}</span>
                  {!unlocked && <Lock size={14} className="shrink-0 text-slate-500" aria-label="Заблокировано" />}
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  <span>{DIFFICULTY_LABEL[exp.difficulty]}</span>
                  <span>·</span>
                  <span>{exp.estimatedMinutes} мин</span>
                  {completed && <span className="text-emerald-400">· пройдено</span>}
                </div>
                <p className="text-xs text-slate-400">{exp.description}</p>
                {best !== null && (
                  <div className="mt-1 font-mono text-[10px] text-neon-violet">
                    Лучший результат: {best}/100 · попыток: {attempts}
                  </div>
                )}
              </button>
            </li>
          );
        })}
        {results.length === 0 && <li className="text-sm text-slate-500 sm:col-span-2">Ничего не найдено.</li>}
      </ul>
    </div>
  );
}
