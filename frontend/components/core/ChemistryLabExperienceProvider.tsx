"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { HazardLevel } from "@/lib/hazard-engine";
import {
  getLabExperiment,
  isExperimentUnlocked,
  LAB_CATALOG,
  type LabExperiment,
  type LabStep,
  type LabStepContext,
} from "@/lib/chemistry-lab-catalog";
import { getModeConfig, type LabModeConfig, type LearningMode } from "@/lib/chemistry-lab-modes";
import { assessExperiment, type AssessmentReport } from "@/lib/chemistry-assessment";
import { buildNotebookEntry, sortNotebookEntriesByDateDesc, type NotebookEntry } from "@/lib/chemistry-notebook";
import { submitTaskEvent, type LearningProfile } from "@/lib/progress-client";
import { autosaveEngine } from "@/lib/autosave-engine";
import { hydrateChemistrySave, type SerializeOptions } from "@/lib/chemistry-save-serializer";
import { observationLogger } from "@/lib/observation-logger";
import { WorkspaceContext } from "@/components/core/ChemistryWorkspaceProvider";
import type { ChemistrySaveSnapshotV1 } from "@/lib/chemistry-save-schema";

/**
 * Chemistry World — Guided Laboratory System (Stage 5.6). Владеет учебным
 * слоем поверх уже существующей лаборатории: выбранный эксперимент из
 * каталога, текущий шаг, режим обучения, счетчики сессии (реальные —
 * подсказки/попытки/предупреждения/уровни опасности/макс. температура и
 * давление), Лабораторный журнал (localStorage) и оценка (chemistry-
 * assessment.ts). НИЧЕГО не пересчитывает химию/опасность заново — весь
 * `LabStepContext` приходит уже готовым из родителя (ChemistryWorldScene),
 * который и так владеет этими данными.
 *
 * Progress Tracking интегрирован с уже существующим Learning Profile
 * (progress-client.ts, /api/progress/task-event) — тот же вызов, что
 * использует Electricity Lab, backend не тронут.
 */
const NOTEBOOK_STORAGE_KEY = "edumind_chemistry_notebook";

function loadNotebook(): NotebookEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NOTEBOOK_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NotebookEntry[]) : [];
  } catch {
    return [];
  }
}

function saveNotebook(entries: NotebookEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTEBOOK_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // переполнение localStorage не должно ломать лабораторию
  }
}

interface ChemistryLabExperienceContextValue {
  mode: LearningMode;
  setMode: (m: LearningMode) => void;
  modeConfig: LabModeConfig;
  catalog: LabExperiment[];
  completedExperimentIds: string[];
  selectedExperiment: LabExperiment | null;
  selectExperiment: (id: string) => void;
  exitExperiment: () => void;
  resetLabSession: () => void;
  currentStepIndex: number;
  currentStep: LabStep | null;
  isCurrentStepUnlocked: boolean;
  advanceStep: () => void;
  isLastStep: boolean;
  completeExperiment: () => void;
  recordHintUsed: () => void;
  conclusionDraft: string;
  setConclusionDraft: (text: string) => void;
  notebookEntries: NotebookEntry[];
  lastAssessment: AssessmentReport | null;
  lastNotebookEntry: NotebookEntry | null;
  learningProfile: LearningProfile | null;
  resumeSave: (snapshot: ChemistrySaveSnapshotV1) => void;
  isExperimentUnlockedFor: (experiment: LabExperiment) => boolean;
}

const ChemistryLabExperienceContext = createContext<ChemistryLabExperienceContextValue | undefined>(undefined);

export function ChemistryLabExperienceProvider({
  simulationId,
  stepContext,
  children,
}: {
  simulationId: string;
  stepContext: LabStepContext;
  children: React.ReactNode;
}) {
  const workspaceContext = useContext(WorkspaceContext);
  const [mode, setMode] = useState<LearningMode>("guided");
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [conclusionDraft, setConclusionDraft] = useState("");
  const [notebookEntries, setNotebookEntries] = useState<NotebookEntry[]>([]);
  const [lastAssessment, setLastAssessment] = useState<AssessmentReport | null>(null);
  const [lastNotebookEntry, setLastNotebookEntry] = useState<NotebookEntry | null>(null);
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null);

  useEffect(() => {
    setNotebookEntries(sortNotebookEntriesByDateDesc(loadNotebook()));
  }, []);

  const selectedExperiment = selectedExperimentId ? getLabExperiment(selectedExperimentId) ?? null : null;

  const hintsRef = useRef(0);
  const attemptsRef = useRef(0);
  const safetyCodesRef = useRef<Set<string>>(new Set());
  const hazardLevelsRef = useRef<Set<HazardLevel>>(new Set());
  const maxTempRef = useRef(stepContext.activeContainer.temperatureC);
  const maxPressureRatioRef = useRef(stepContext.hazard.pressureRatio);
  const maxPressureKPaRef = useRef(stepContext.hazard.pressureKPa);
  const actionsLogRef = useRef<string[]>([]);
  const reactionHistoryRef = useRef<{ reactionId: string; title: string; at: number }[]>([]);

  const prevContentsSigRef = useRef(stepContext.activeContainer.contents.length + stepContext.activeContainer.precipitate.length);
  const prevBurnerRef = useRef(stepContext.burnerOn);
  const prevSealedRef = useRef(stepContext.isSealed);
  const prevPourCountRef = useRef(stepContext.pourLog.length);

  const isLastStep = selectedExperiment ? currentStepIndex === selectedExperiment.steps.length - 1 : false;

  const completedExperimentIds = useMemo(() => {
    const ids = new Set<string>();
    notebookEntries.forEach((e) => {
      if (e.assessment.completion.score === 100) ids.add(e.experimentId);
    });
    return Array.from(ids);
  }, [notebookEntries]);

  const getSerializeOptions = useCallback((): SerializeOptions | null => {
    if (!selectedExperimentId) return null;

    const burners = (workspaceContext?.state.tools || [])
      .filter((t) => t.kind === "burner")
      .map((b) => ({
        id: b.id,
        isOn: (b as any).isOn || false,
        position: b.position,
        rotationY: b.rotationY,
        elevation: b.elevation,
        storageSlotId: b.storageSlotId,
      }));

    return {
      saveId: `save-${selectedExperimentId}`,
      userId: "user-student",
      simulationId,
      experimentId: selectedExperimentId,
      revision: 1,
      workspace: {
        containers: (workspaceContext?.state.containers || []).map((c) => ({
          id: c.id,
          kind: c.kind,
          position: c.position,
          rotationY: c.rotationY,
          elevation: c.elevation,
          storageSlotId: c.storageSlotId,
          heatingSourceId: c.heatingSourceId,
          isSealed: c.isSealed,
          pressureKPa: c.pressureKPa,
          contents: c.data.contents.map((st) => ({ substanceId: st.substanceId, grams: st.grams })),
          temperatureC: c.data.temperatureC,
          aggregateState: c.data.temperatureC > 100 ? "gas" as const : "liquid" as const,
          precipitate: c.data.precipitate ? c.data.precipitate.map((p) => ({ substanceId: p.substanceId, grams: p.grams })) : [],
          hazardLevel: c.hazard.level,
        })),
        stockBottles: (workspaceContext?.state.stockBottles || []).map((b) => ({
          id: b.id,
          substanceId: b.substanceId,
          substanceName: b.substanceId,
          remainingGrams: b.remainingGrams,
          capState: b.capState,
          position: b.position,
          rotationY: b.rotationY,
          elevation: b.elevation,
          storageSlotId: b.storageSlotId,
        })),
        burners,
        cabinets: workspaceContext?.state.cabinets || [],
        itemTransforms: [],
      },
      experiment: {
        mode,
        currentStepIndex,
        completedStepIds: [],
        taskStatus: isLastStep ? "completed" : "in_progress",
        startedAt: Date.now(),
        elapsedMs: 0,
        hintsUsed: hintsRef.current,
        conclusionDraft,
      },
      progress: {
        xp: 0,
        achievements: [],
        completedExperimentIds,
      },
      observation: {
        sessionId: observationLogger.getSessionId(),
        lastSequence: observationLogger.getEvents().length > 0
          ? observationLogger.getEvents()[observationLogger.getEvents().length - 1].sequence
          : 0,
        events: [...observationLogger.getEvents()],
      },
    };
  }, [
    selectedExperimentId,
    workspaceContext?.state,
    simulationId,
    mode,
    currentStepIndex,
    isLastStep,
    conclusionDraft,
    completedExperimentIds,
  ]);

  useEffect(() => {
    if (!selectedExperiment) return;
    if (stepContext.activeContainer.temperatureC > maxTempRef.current) maxTempRef.current = stepContext.activeContainer.temperatureC;
  }, [selectedExperiment, stepContext.activeContainer.temperatureC]);

  useEffect(() => {
    if (!selectedExperiment) return;
    if (stepContext.hazard.pressureRatio > maxPressureRatioRef.current) maxPressureRatioRef.current = stepContext.hazard.pressureRatio;
    if (stepContext.hazard.pressureKPa > maxPressureKPaRef.current) maxPressureKPaRef.current = stepContext.hazard.pressureKPa;
  }, [selectedExperiment, stepContext.hazard.pressureRatio, stepContext.hazard.pressureKPa]);

  useEffect(() => {
    if (!selectedExperiment) return;
    stepContext.safetyWarnings.forEach((w) => safetyCodesRef.current.add(w.code));
  }, [selectedExperiment, stepContext.safetyWarnings]);

  useEffect(() => {
    if (!selectedExperiment) return;
    hazardLevelsRef.current.add(stepContext.hazard.level);
  }, [selectedExperiment, stepContext.hazard.level]);

  useEffect(() => {
    if (!selectedExperiment) return;
    stepContext.occurredReactionIds.forEach((id) => {
      if (!reactionHistoryRef.current.some((r) => r.reactionId === id)) {
        reactionHistoryRef.current.push({ reactionId: id, title: id, at: Date.now() });
      }
    });
  }, [selectedExperiment, stepContext.occurredReactionIds]);

  const contentsSig = stepContext.activeContainer.contents.length + stepContext.activeContainer.precipitate.length;
  useEffect(() => {
    if (!selectedExperiment) return;
    let changed = false;
    if (contentsSig !== prevContentsSigRef.current) {
      changed = true;
      actionsLogRef.current.push("Изменение содержимого сосуда");
      prevContentsSigRef.current = contentsSig;
    }
    if (stepContext.burnerOn !== prevBurnerRef.current) {
      changed = true;
      actionsLogRef.current.push(stepContext.burnerOn ? "Горелка включена" : "Горелка выключена");
      prevBurnerRef.current = stepContext.burnerOn;
    }
    if (stepContext.isSealed !== prevSealedRef.current) {
      changed = true;
      actionsLogRef.current.push(stepContext.isSealed ? "Сосуд запечатан" : "Сосуд открыт");
      prevSealedRef.current = stepContext.isSealed;
    }
    if (stepContext.pourLog.length !== prevPourCountRef.current) {
      changed = true;
      actionsLogRef.current.push("Переливание между сосудами");
      prevPourCountRef.current = stepContext.pourLog.length;
    }
    if (changed) {
      attemptsRef.current += 1;
      autosaveEngine.markDirty();
    }
  }, [selectedExperiment, contentsSig, stepContext.burnerOn, stepContext.isSealed, stepContext.pourLog.length]);

  function resumeSave(snapshot: ChemistrySaveSnapshotV1) {
    if (!snapshot || !snapshot.experimentId) return;
    const hydrated = hydrateChemistrySave(snapshot);

    setSelectedExperimentId(snapshot.experimentId);
    setCurrentStepIndex(hydrated.experiment.currentStepIndex ?? 0);
    setConclusionDraft(hydrated.experiment.conclusionDraft || "");

    observationLogger.restoreSession(
      hydrated.observation.sessionId,
      hydrated.observation.lastSequence,
      hydrated.observation.events
    );

    if (workspaceContext) {
      workspaceContext.hydrateFromSave(snapshot);
    }

    autosaveEngine.init(
      snapshot.saveId,
      snapshot.userId,
      snapshot.simulationId,
      snapshot.experimentId,
      snapshot.revision,
      getSerializeOptions
    );
  }

  function selectExperiment(id: string) {
    const experiment = getLabExperiment(id);
    if (!experiment) return;
    setSelectedExperimentId(id);
    setCurrentStepIndex(0);
    setConclusionDraft("");
    setLastAssessment(null);
    setLastNotebookEntry(null);

    hintsRef.current = 0;
    attemptsRef.current = 0;
    safetyCodesRef.current = new Set();
    hazardLevelsRef.current = new Set();
    maxTempRef.current = stepContext.activeContainer.temperatureC;
    maxPressureRatioRef.current = stepContext.hazard.pressureRatio;
    maxPressureKPaRef.current = stepContext.hazard.pressureKPa;
    actionsLogRef.current = [];
    reactionHistoryRef.current = [];
    prevContentsSigRef.current = stepContext.activeContainer.contents.length + stepContext.activeContainer.precipitate.length;
    prevBurnerRef.current = stepContext.burnerOn;
    prevSealedRef.current = stepContext.isSealed;
    prevPourCountRef.current = stepContext.pourLog.length;

    autosaveEngine.init(
      `save-${id}`,
      "user-student",
      simulationId,
      id,
      1,
      getSerializeOptions
    );
  }

  function exitExperiment() {
    setSelectedExperimentId(null);
  }

  function resetLabSession() {
    setSelectedExperimentId(null);
    setLastAssessment(null);
    setLastNotebookEntry(null);
  }

  const effectiveStepContext: LabStepContext = {
    ...stepContext,
    maxTemperatureCObserved: Math.max(maxTempRef.current, stepContext.activeContainer.temperatureC),
    maxPressureRatioObserved: Math.max(maxPressureRatioRef.current, stepContext.hazard.pressureRatio),
  };

  const currentStep = selectedExperiment ? selectedExperiment.steps[currentStepIndex] ?? null : null;
  const isCurrentStepUnlocked = currentStep ? currentStep.isUnlocked(effectiveStepContext) : false;

  function advanceStep() {
    if (!selectedExperiment || !currentStep) return;
    if (!currentStep.isUnlocked(effectiveStepContext)) return;
    setCurrentStepIndex((i) => Math.min(i + 1, selectedExperiment.steps.length - 1));
    autosaveEngine.markDirty();
  }

  function recordHintUsed() {
    hintsRef.current += 1;
  }

  // Stage 5.7 audit — защита от повторного синхронного вызова (двойной
  // клик/быстрый повторный тап): без этого флага два клика по кнопке
  // "Завершить" в рамках одного тика могли создать две записи в журнале
  // и дважды отправить событие в Learning Profile
  const completingRef = useRef(false);

  function completeExperiment() {
    if (completingRef.current) return;
    if (!selectedExperiment) return;
    if (!selectedExperiment.isComplete(effectiveStepContext)) return; // нельзя завершить без реального подтверждения
    completingRef.current = true;

    const report = assessExperiment({
      totalSteps: selectedExperiment.steps.length,
      stepsCompleted: currentStepIndex + 1,
      attempts: attemptsRef.current,
      hintsUsed: hintsRef.current,
      safetyWarningCodesEncountered: Array.from(safetyCodesRef.current),
      hazardLevelsEncountered: Array.from(hazardLevelsRef.current),
      isComplete: true,
      conclusionText: conclusionDraft,
      mode,
    });

    const entry = buildNotebookEntry({
      experimentId: selectedExperiment.id,
      experimentTitle: selectedExperiment.title,
      difficulty: selectedExperiment.difficulty,
      studentActions: [...actionsLogRef.current],
      reactionHistory: [...reactionHistoryRef.current],
      maxTemperatureC: maxTempRef.current,
      maxPressureKPa: maxPressureKPaRef.current,
      hazardsEncountered: Array.from(hazardLevelsRef.current),
      safetyWarnings: Array.from(safetyCodesRef.current),
      observedResults: selectedExperiment.expectedObservations,
      studentConclusion: conclusionDraft,
      aiFeedback: null,
      assessment: report,
    });

    const nextEntries = sortNotebookEntriesByDateDesc([...notebookEntries, entry]);
    setNotebookEntries(nextEntries);
    saveNotebook(nextEntries);
    setLastAssessment(report);
    setLastNotebookEntry(entry);

    submitTaskEvent({
      simulationId,
      taskId: selectedExperiment.id,
      difficulty: selectedExperiment.difficulty,
      xpReward: selectedExperiment.xpReward,
      completed: true,
      hintsUsed: hintsRef.current,
      attempts: attemptsRef.current,
      mistakes: Array.from(safetyCodesRef.current),
    })
      .then((res) => setLearningProfile(res.profile))
      .catch(() => {
        // сеть недоступна — запись уже сохранена локально в Notebook,
        // потеряется только серверная синхронизация Learning Profile
      });

    setSelectedExperimentId(null);
    completingRef.current = false;
  }

  function isExperimentUnlockedFor(experiment: LabExperiment): boolean {
    return isExperimentUnlocked(experiment, completedExperimentIds);
  }

  const value: ChemistryLabExperienceContextValue = {
    mode,
    setMode,
    modeConfig: getModeConfig(mode),
    catalog: LAB_CATALOG,
    completedExperimentIds,
    selectedExperiment,
    selectExperiment,
    exitExperiment,
    resetLabSession,
    currentStepIndex,
    currentStep,
    isCurrentStepUnlocked,
    advanceStep,
    isLastStep,
    completeExperiment,
    recordHintUsed,
    conclusionDraft,
    setConclusionDraft,
    notebookEntries,
    lastAssessment,
    lastNotebookEntry,
    learningProfile,
    resumeSave,
    isExperimentUnlockedFor,
  };

  return <ChemistryLabExperienceContext.Provider value={value}>{children}</ChemistryLabExperienceContext.Provider>;
}

export function useChemistryLabExperience(): ChemistryLabExperienceContextValue {
  const ctx = useContext(ChemistryLabExperienceContext);
  if (!ctx) throw new Error("useChemistryLabExperience должен использоваться внутри <ChemistryLabExperienceProvider>");
  return ctx;
}
