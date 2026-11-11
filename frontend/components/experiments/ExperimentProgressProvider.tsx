"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  EXPERIMENTS,
  ExperimentStatus,
  deriveExperimentStatus,
  validateExperiment,
  type ExperimentDefinition,
  type ExperimentValidationResult,
  type LabState,
} from "@/lib/experiment-validator";
import { useOptionalAuth } from "@/lib/auth-context";

/**
 * Chemistry World — владение прогрессом заданий (текущее задание, пройденные,
 * XP), тот же принцип, что и TaskProgressProvider в Electricity Lab, но
 * СВОЯ отдельная реализация и НЕ интегрируется с Learning Profile.
 *
 * Прогресс хранится в браузере отдельно для каждого ученика и лаборатории,
 * чтобы обновление страницы не возвращало к заданию 1.
 */
interface StoredExperimentProgress {
  experimentIndex: number;
  completedIds: string[];
  totalXp: number;
}

function progressKey(userId: string | undefined, simulationId: string): string {
  return `edumind:experiment-progress:${userId ?? "anon"}:${simulationId}`;
}

function loadProgress(key: string): StoredExperimentProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredExperimentProgress;
    const known = new Set(EXPERIMENTS.map((e) => e.id));
    return {
      experimentIndex: Math.min(Math.max(0, Math.floor(parsed.experimentIndex ?? 0)), EXPERIMENTS.length - 1),
      completedIds: (parsed.completedIds ?? []).filter((id) => known.has(id)),
      totalXp: Math.max(0, Number(parsed.totalXp) || 0),
    };
  } catch {
    return null;
  }
}

interface ExperimentProgressContextValue {
  experimentIndex: number;
  experiment: ExperimentDefinition;
  totalXp: number;
  status: ExperimentStatus;
  result: ExperimentValidationResult;
  isLastExperiment: boolean;
  advance: () => void;
  /** Ids of every experiment the student has completed at least once. */
  completedExperimentIds: string[];
  /** An experiment can be opened once the one before it has been completed. */
  isExperimentUnlocked: (index: number) => boolean;
  /** Open an unlocked experiment (again): the scene resets the lab for it. XP is only awarded the first time. */
  goToExperiment: (index: number) => void;
}

const ExperimentProgressContext = createContext<ExperimentProgressContextValue | undefined>(undefined);

export function ExperimentProgressProvider({
  labState,
  simulationId = "default",
  onSelectExperiment,
  children,
}: {
  labState: LabState;
  simulationId?: string;
  // вызывается, когда ученик сам открывает задание из списка (в том числе
  // уже пройденное — "пройти заново"): сцена готовит для него чистый стол
  onSelectExperiment?: (experiment: ExperimentDefinition) => void;
  children: React.ReactNode;
}) {
  const auth = useOptionalAuth();
  const storageKey = progressKey(auth?.user?.id, simulationId);
  const [stored] = useState(() => loadProgress(storageKey));
  const [experimentIndex, setExperimentIndex] = useState(stored?.experimentIndex ?? 0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set(stored?.completedIds ?? []));
  const [totalXp, setTotalXp] = useState(stored?.totalXp ?? 0);

  useEffect(() => {
    try {
      const data: StoredExperimentProgress = { experimentIndex, completedIds: Array.from(completedIds), totalXp };
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // приватный режим / переполненное хранилище — прогресс просто не переживёт перезагрузку
    }
  }, [storageKey, experimentIndex, completedIds, totalXp]);

  const experiment = EXPERIMENTS[experimentIndex];
  const hasStarted = labState.container.contents.length > 0 || labState.container.precipitate.length > 0;

  const result = useMemo(() => validateExperiment(experiment, labState), [experiment, labState]);
  const status = deriveExperimentStatus(result, hasStarted);

  useEffect(() => {
    if (status === ExperimentStatus.COMPLETED && !completedIds.has(experiment.id)) {
      setCompletedIds((prev) => new Set(prev).add(experiment.id));
      setTotalXp((prev) => prev + experiment.xpReward);
    }
  }, [status, experiment, completedIds]);

  const isExperimentUnlocked = (index: number) =>
    index >= 0 && index < EXPERIMENTS.length && (index === 0 || completedIds.has(EXPERIMENTS[index - 1].id));

  const value: ExperimentProgressContextValue = {
    experimentIndex,
    experiment,
    totalXp,
    status,
    result,
    isLastExperiment: experimentIndex === EXPERIMENTS.length - 1,
    advance: () => setExperimentIndex((i) => Math.min(i + 1, EXPERIMENTS.length - 1)),
    completedExperimentIds: Array.from(completedIds),
    isExperimentUnlocked,
    goToExperiment: (index: number) => {
      if (!isExperimentUnlocked(index)) return;
      onSelectExperiment?.(EXPERIMENTS[index]);
      setExperimentIndex(index);
    },
  };

  return <ExperimentProgressContext.Provider value={value}>{children}</ExperimentProgressContext.Provider>;
}

export function useExperimentProgress(): ExperimentProgressContextValue {
  const ctx = useContext(ExperimentProgressContext);
  if (!ctx) throw new Error("useExperimentProgress должен использоваться внутри <ExperimentProgressProvider>");
  return ctx;
}
