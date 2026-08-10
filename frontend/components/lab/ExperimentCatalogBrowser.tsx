"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Lock, Play, Search } from "lucide-react";
import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";
import { searchExperiments, type LabDifficulty } from "@/lib/chemistry-lab-catalog";
import { attemptsForExperiment, bestScoreForExperiment } from "@/lib/chemistry-notebook";
import { apiFetch } from "@/lib/api";
import { offlineSaveDB } from "@/lib/offline-save-db";
import type { ChemistrySaveSnapshotV1 } from "@/lib/chemistry-save-schema";
import ResumeExperimentModal from "@/components/lab/ResumeExperimentModal";
import { useLocale } from "@/lib/locale-context";

/**
 * Chemistry World — Laboratory Experiment Catalog UI (Stage 5.6 & S8.4).
 *
 * D6.2 — moved from `.glass-panel`/`bg-white/5`/`slate-*`/`neon-violet`
 * onto D1 tokens (`Surface`, `.ds-input`, `text-text-*`, `bg-accent`) and
 * `useLocale()`/t.chemistry.catalog.*. This is the component the D6.1
 * follow-up review specifically flagged as visually broken in Light Mode
 * — `bg-white/5` reads as "a card" only against a dark background; on a
 * light `bg-surface` it was nearly invisible, which is why the whole
 * browser looked "stuck in dark mode" even when the OS/app theme was
 * Light. `exp.title`/`.description` stay untranslated — catalog DATA
 * (lib/chemistry-lab-catalog.ts), a separate deferred item (see D6.1/D6.2
 * notes).
 */
const DIFFICULTY_FILTERS: ("all" | LabDifficulty)[] = ["all", "beginner", "intermediate", "advanced"];

/**
 * /api/chemistry/saves returns every save row ever created for a user (one
 * per started attempt, newest-first) — not one per experiment. An experiment
 * can have older abandoned "active" rows sitting alongside a newer
 * "completed" one, so only the MOST RECENT row per experiment_id may decide
 * whether to offer Resume; stale active rows from earlier abandoned attempts
 * must not resurrect the badge for an experiment that's since been finished.
 */
export function computeActiveSaveMap(saves: unknown): Record<string, ChemistrySaveSnapshotV1> {
  const saveMap: Record<string, ChemistrySaveSnapshotV1> = {};
  if (!Array.isArray(saves)) return saveMap;
  const latestSeenExperiments = new Set<string>();
  for (const s of saves) {
    if (!s?.experiment_id || latestSeenExperiments.has(s.experiment_id)) continue;
    latestSeenExperiments.add(s.experiment_id);
    if (s.status === "active" && s.snapshot) {
      saveMap[s.experiment_id] = s.snapshot;
    }
  }
  return saveMap;
}

export default function ExperimentCatalogBrowser() {
  const { t } = useLocale();
  const c = t.chemistry.catalog;
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
  const { completedExperimentIds, notebookEntries, selectExperiment, resumeSave, isExperimentUnlockedFor } = useChemistryLabExperience();
  const [query, setQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | LabDifficulty>("all");
  const [activeSaves, setActiveSaves] = useState<Record<string, ChemistrySaveSnapshotV1>>({});
  const [modalSnapshot, setModalSnapshot] = useState<{ expId: string; snapshot: ChemistrySaveSnapshotV1 } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadActiveSaves() {
      try {
        const saves = await apiFetch<any[]>("/api/chemistry/saves").catch(() => []);
        const saveMap = computeActiveSaveMap(saves);
        const pending = await offlineSaveDB.getPending();
        if (pending && pending.snapshot?.experimentId) {
          saveMap[pending.snapshot.experimentId] = pending.snapshot;
        }

        if (isMounted) {
          setActiveSaves(saveMap);
        }
      } catch {
        // ignore
      }
    }
    loadActiveSaves();
    return () => {
      isMounted = false;
    };
  }, []);

  const results = useMemo(() => {
    const bySearch = searchExperiments(query);
    return bySearch.filter((e) => difficultyFilter === "all" || e.difficulty === difficultyFilter);
  }, [query, difficultyFilter]);

  const activeModalExp = useMemo(() => {
    if (!modalSnapshot) return null;
    return searchExperiments("").find((e) => e.id === modalSnapshot.expId) || null;
  }, [modalSnapshot]);

  return (
    <div className="rounded-ds-panel border border-border/[0.08] bg-surface p-4" data-testid="experiment-catalog-browser">
      <h3 className="mb-3 font-headline text-lg font-semibold text-text-primary">{c.heading}</h3>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">{c.searchLabel}</span>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={c.searchPlaceholder}
            data-testid="catalog-search"
            className="ds-input ds-focus-ring rounded-full py-2 pl-9 pr-3"
          />
        </label>

        <label>
          <span className="sr-only">{c.filterLabel}</span>
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as "all" | LabDifficulty)}
            data-testid="catalog-difficulty-filter"
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

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="catalog-results">
        {results.map((exp) => {
          const unlocked = isExperimentUnlockedFor(exp);
          const completed = completedExperimentIds.includes(exp.id);
          const best = bestScoreForExperiment(notebookEntries, exp.id);
          const attempts = attemptsForExperiment(notebookEntries, exp.id);
          const activeSave = activeSaves[exp.id];

          return (
            <li key={exp.id}>
              <div
                className={`flex w-full flex-col gap-1.5 rounded-ds-control border p-3.5 text-left transition-colors ${
                  unlocked
                    ? "border-border/[0.1] bg-surface-elevated hover:border-accent/60"
                    : "cursor-not-allowed border-border/[0.06] bg-surface-elevated opacity-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text-primary">{exp.title}</span>
                  {!unlocked && <Lock size={14} className="shrink-0 text-text-muted" aria-label={c.lockedAria} />}
                </div>

                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                  <span>{DIFFICULTY_LABEL[exp.difficulty]}</span>
                  <span>·</span>
                  <span>{exp.estimatedMinutes} {c.minutesSuffix}</span>
                  {completed && (
                    <span data-testid={`catalog-completed-${exp.id}`} className="text-success">
                      · {c.completedSuffix}
                    </span>
                  )}
                </div>

                <p className="text-xs text-text-secondary">{exp.description}</p>

                {!unlocked && UNLOCK_HINT[exp.difficulty] && (
                  <p className="mt-1 text-[11px] italic text-text-muted">{UNLOCK_HINT[exp.difficulty]}</p>
                )}

                {best !== null && (
                  <div className="mt-1 font-mono text-[10px] text-accent">
                    {c.bestScore.replace("{best}", String(best)).replace("{attempts}", String(attempts))}
                  </div>
                )}

                {unlocked && (
                  <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-border/[0.08]">
                    {activeSave ? (
                      <div data-testid={`catalog-active-save-${exp.id}`} className="flex items-center gap-1.5 font-mono text-xs text-warning">
                        <Clock size={13} />
                        <span>{c.activeSave.replace("{step}", String(activeSave.experiment.currentStepIndex + 1))}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted">{c.newExperiment}</span>
                    )}

                    <div className="flex items-center gap-2">
                      {activeSave && (
                        <button
                          type="button"
                          onClick={() => setModalSnapshot({ expId: exp.id, snapshot: activeSave })}
                          data-testid={`catalog-resume-${exp.id}`}
                          className="ds-focus-ring flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white transition-all hover:brightness-110"
                        >
                          <Play size={12} className="fill-white" />
                          {c.resumeButton}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => selectExperiment(exp.id)}
                        data-testid={`catalog-start-${exp.id}`}
                        className="ds-focus-ring rounded-full border border-border/[0.12] px-3 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-text-primary/5"
                      >
                        {activeSave ? c.restartButton : c.startButton}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {results.length === 0 && <li className="text-sm text-text-muted sm:col-span-2">{c.empty}</li>}
      </ul>

      <ResumeExperimentModal
        isOpen={Boolean(modalSnapshot)}
        experimentTitle={activeModalExp?.title || ""}
        saveSnapshot={modalSnapshot?.snapshot || null}
        onResume={() => {
          if (modalSnapshot) {
            resumeSave(modalSnapshot.snapshot);
            setModalSnapshot(null);
          }
        }}
        onRestart={() => {
          if (modalSnapshot) {
            selectExperiment(modalSnapshot.expId);
            setModalSnapshot(null);
          }
        }}
        onCancel={() => setModalSnapshot(null)}
      />
    </div>
  );
}
