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

/**
 * Chemistry World — Laboratory Experiment Catalog UI (Stage 5.6 & S8.4).
 */
const DIFFICULTY_LABEL: Record<LabDifficulty, string> = {
  beginner: "Начальный",
  intermediate: "Средний",
  advanced: "Продвинутый",
};

const DIFFICULTY_FILTERS: ("all" | LabDifficulty)[] = ["all", "beginner", "intermediate", "advanced"];

const UNLOCK_HINT: Record<LabDifficulty, string | null> = {
  beginner: null,
  intermediate: "Заверши любой эксперимент уровня «Начальный», чтобы открыть",
  advanced: "Заверши любой эксперимент уровня «Средний», чтобы открыть",
};

export default function ExperimentCatalogBrowser() {
  const { completedExperimentIds, notebookEntries, selectExperiment, isExperimentUnlockedFor } = useChemistryLabExperience();
  const [query, setQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | LabDifficulty>("all");
  const [activeSaves, setActiveSaves] = useState<Record<string, ChemistrySaveSnapshotV1>>({});
  const [modalSnapshot, setModalSnapshot] = useState<{ expId: string; snapshot: ChemistrySaveSnapshotV1 } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadActiveSaves() {
      try {
        const saves = await apiFetch<any[]>("/api/chemistry/saves").catch(() => []);
        const saveMap: Record<string, ChemistrySaveSnapshotV1> = {};
        if (Array.isArray(saves)) {
          for (const s of saves) {
            if (s.status === "active" && s.experiment_id && s.snapshot) {
              saveMap[s.experiment_id] = s.snapshot;
            }
          }
        }
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
          const activeSave = activeSaves[exp.id];

          return (
            <li key={exp.id}>
              <div
                className={`flex w-full flex-col gap-1.5 rounded-xl border p-3.5 text-left transition ${
                  unlocked
                    ? "border-glass-border bg-white/5 hover:border-neon-violet/60"
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

                {!unlocked && UNLOCK_HINT[exp.difficulty] && (
                  <p className="mt-1 text-[11px] italic text-slate-500">{UNLOCK_HINT[exp.difficulty]}</p>
                )}

                {best !== null && (
                  <div className="mt-1 font-mono text-[10px] text-neon-violet">
                    Лучший результат: {best}/100 · попыток: {attempts}
                  </div>
                )}

                {unlocked && (
                  <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-glass-border/40">
                    {activeSave ? (
                      <div className="flex items-center gap-1.5 font-mono text-xs text-amber-300">
                        <Clock size={13} />
                        <span>Есть сохранение (шаг {activeSave.experiment.currentStepIndex + 1})</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Новый эксперимент</span>
                    )}

                    <div className="flex items-center gap-2">
                      {activeSave && (
                        <button
                          type="button"
                          onClick={() => setModalSnapshot({ expId: exp.id, snapshot: activeSave })}
                          data-testid={`catalog-resume-${exp.id}`}
                          className="flex items-center gap-1 rounded-full bg-neon-violet px-3 py-1 text-xs font-medium text-white transition hover:brightness-110"
                        >
                          <Play size={12} className="fill-white" />
                          Продолжить
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => selectExperiment(exp.id)}
                        data-testid={`catalog-start-${exp.id}`}
                        className="rounded-full border border-glass-border px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10"
                      >
                        {activeSave ? "Заново" : "Начать"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {results.length === 0 && <li className="text-sm text-slate-500 sm:col-span-2">Ничего не найдено.</li>}
      </ul>

      <ResumeExperimentModal
        isOpen={Boolean(modalSnapshot)}
        experimentTitle={activeModalExp?.title || ""}
        saveSnapshot={modalSnapshot?.snapshot || null}
        onResume={() => {
          if (modalSnapshot) {
            selectExperiment(modalSnapshot.expId);
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
