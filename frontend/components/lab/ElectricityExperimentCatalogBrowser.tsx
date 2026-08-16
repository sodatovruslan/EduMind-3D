"use client";

import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { useElectricityLabExperience } from "@/components/core/ElectricityLabExperienceProvider";
import { searchElectricityExperiments, type LabDifficulty } from "@/lib/electricity-lab-catalog";
import { bestElectricityScoreForExperiment, electricityAttemptsForExperiment } from "@/lib/electricity-notebook";
import { useLocale } from "@/lib/locale-context";

/**
 * Electricity Lab — Laboratory Experiment Catalog UI (Stage E-2, Task 8).
 * Только отображает и фильтрует уже готовый каталог (electricity-lab-
 * catalog.ts) — ничего не решает про разблокировку сама, всё берёт из
 * useElectricityLabExperience() (isExperimentUnlockedFor — реальная
 * проверка по фактическому прогрессу).
 *
 * D6.2 — same Light Mode fix and i18n treatment as its Chemistry sibling
 * (ExperimentCatalogBrowser.tsx) — see that file's header comment and the
 * D6.2 notes in EDUMIND_DESIGN_SYSTEM_V2.md for why `bg-white/5` broke
 * Light Mode. `exp.title`/`.description` stay untranslated (catalog data).
 */
const DIFFICULTY_FILTERS: ("all" | LabDifficulty)[] = ["all", "beginner", "intermediate", "advanced"];

export default function ElectricityExperimentCatalogBrowser() {
  const { t } = useLocale();
  const c = t.electricity.catalog;
  const DIFFICULTY_LABEL: Record<LabDifficulty, string> = {
    beginner: c.difficultyBeginner,
    intermediate: c.difficultyIntermediate,
    advanced: c.difficultyAdvanced,
  };
  const UNLOCK_HINT: Record<LabDifficulty, string | null> = {
    beginner: null,
    intermediate: c.unlockHintIntermediate,
    advanced: c.unlockHintAdvanced,
  };
  const { completedExperimentIds, notebookEntries, selectExperiment, isExperimentUnlockedFor } = useElectricityLabExperience();
  const [query, setQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | LabDifficulty>("all");

  const results = useMemo(() => {
    const bySearch = searchElectricityExperiments(query);
    return bySearch.filter((e) => difficultyFilter === "all" || e.difficulty === difficultyFilter);
  }, [query, difficultyFilter]);

  return (
    <div className="rounded-ds-panel border border-border/[0.08] bg-surface p-4" data-testid="electricity-experiment-catalog-browser">
      <h3 className="mb-3 text-ds-title text-text-primary">{c.heading}</h3>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">{c.searchLabel}</span>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={c.searchPlaceholder}
            data-testid="electricity-catalog-search"
            className="ds-input ds-focus-ring rounded-full py-2 pl-9 pr-3"
          />
        </label>

        <label>
          <span className="sr-only">{c.filterLabel}</span>
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as "all" | LabDifficulty)}
            data-testid="electricity-catalog-difficulty-filter"
            className="ds-input ds-focus-ring rounded-full py-2"
          >
            {DIFFICULTY_FILTERS.map((d) => (
              <option key={d} value={d}>
                {d === "all" ? c.allLevels : DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="electricity-catalog-results">
        {results.map((exp) => {
          const unlocked = isExperimentUnlockedFor(exp);
          const completed = completedExperimentIds.includes(exp.id);
          const best = bestElectricityScoreForExperiment(notebookEntries, exp.id);
          const attempts = electricityAttemptsForExperiment(notebookEntries, exp.id);
          return (
            <li key={exp.id}>
              <button
                type="button"
                onClick={() => unlocked && selectExperiment(exp.id)}
                disabled={!unlocked}
                data-testid={`electricity-catalog-item-${exp.id}`}
                className={`ds-focus-ring flex w-full flex-col gap-1 rounded-ds-control border p-3 text-left transition-colors ${
                  unlocked
                    ? "border-border/[0.1] bg-surface-elevated hover:border-accent/60"
                    : "cursor-not-allowed border-border/[0.06] bg-surface-elevated opacity-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text-primary">{exp.title}</span>
                  {!unlocked && <Lock size={14} className="shrink-0 text-text-muted" aria-label={c.lockedAria} />}
                </div>
                <div className="flex items-center gap-2 font-mono text-ds-caption uppercase tracking-widest text-text-muted">
                  <span>{DIFFICULTY_LABEL[exp.difficulty]}</span>
                  <span>·</span>
                  <span>{exp.estimatedMinutes} {c.minutesSuffix}</span>
                  <span>·</span>
                  <span>{exp.xpReward} {c.xpSuffix}</span>
                  {completed && <span className="text-success">· {c.completedSuffix}</span>}
                </div>
                <p className="text-ds-caption text-text-secondary">{exp.description}</p>
                {!unlocked && UNLOCK_HINT[exp.difficulty] && (
                  <p className="mt-1 text-ds-caption italic text-text-muted">{UNLOCK_HINT[exp.difficulty]}</p>
                )}
                {best !== null && (
                  <div className="mt-1 font-mono text-ds-caption text-accent">
                    {c.bestScore.replace("{best}", String(best)).replace("{attempts}", String(attempts))}
                  </div>
                )}
              </button>
            </li>
          );
        })}
        {results.length === 0 && <li className="text-ds-body text-text-muted sm:col-span-2">{c.empty}</li>}
      </ul>
    </div>
  );
}
