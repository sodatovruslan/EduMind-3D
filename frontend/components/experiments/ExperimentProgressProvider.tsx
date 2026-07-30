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

/**
 * Chemistry World — владение прогрессом эксперимента (текущий эксперимент/
 * XP), тот же принцип, что и TaskProgressProvider в Electricity Lab, но
 * СВОЯ отдельная реализация и НЕ интегрируется с Learning Profile —
 * Stage 5 намеренно ограничен Chemistry World Foundation (интеграция с
 * Adaptive Learning — задача будущего этапа).
 */
interface ExperimentProgressContextValue {
  experimentIndex: number;
  experiment: ExperimentDefinition;
  totalXp: number;
  status: ExperimentStatus;
  result: ExperimentValidationResult;
  isLastExperiment: boolean;
  advance: () => void;
}

const ExperimentProgressContext = createContext<ExperimentProgressContextValue | undefined>(undefined);

export function ExperimentProgressProvider({ labState, children }: { labState: LabState; children: React.ReactNode }) {
  const [experimentIndex, setExperimentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [totalXp, setTotalXp] = useState(0);

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

  const value: ExperimentProgressContextValue = {
    experimentIndex,
    experiment,
    totalXp,
    status,
    result,
    isLastExperiment: experimentIndex === EXPERIMENTS.length - 1,
    advance: () => setExperimentIndex((i) => Math.min(i + 1, EXPERIMENTS.length - 1)),
  };

  return <ExperimentProgressContext.Provider value={value}>{children}</ExperimentProgressContext.Provider>;
}

export function useExperimentProgress(): ExperimentProgressContextValue {
  const ctx = useContext(ExperimentProgressContext);
  if (!ctx) throw new Error("useExperimentProgress должен использоваться внутри <ExperimentProgressProvider>");
  return ctx;
}
