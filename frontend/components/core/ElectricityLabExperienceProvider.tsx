"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CircuitComponent, CircuitSolution, Connection } from "@/lib/circuit-engine";
import {
  ELECTRICITY_LAB_CATALOG,
  getElectricityLabExperiment,
  isElectricityExperimentUnlocked,
  snapshotMeasurement,
  bulbBrightness,
  type ElectricityLabExperiment,
  type ElectricityLabStep,
  type ElectricityLabStepContext,
} from "@/lib/electricity-lab-catalog";
import {
  buildElectricityNotebookEntry,
  sortElectricityNotebookEntriesByDateDesc,
  type ElectricityMeasurement,
  type ElectricityNotebookEntry,
  type QuestionResult,
} from "@/lib/electricity-notebook";
import { submitTaskEvent, type LearningProfile } from "@/lib/progress-client";

/**
 * Electricity Lab — Guided Laboratory System (Stage E-2). Аналог
 * ChemistryLabExperienceProvider.tsx для Electricity Lab: выбранный
 * эксперимент из электро-каталога, текущий шаг, реальные счётчики сессии
 * (измерения/подсказки/наблюдавшиеся диапазоны напряжения и
 * сопротивления/факты КЗ и перегорания предохранителя), Лабораторный
 * журнал (localStorage) и автоматический отчёт (electricity-notebook.ts).
 * НИЧЕГО не пересчитывает физику — весь `stepContext` (components/
 * connections/solution) приходит уже готовым из родителя
 * (ElectricityLabScene), который и так владеет этими данными через
 * ExperimentStateProvider/solveCircuit (единственный вызов, см. Stage E-1).
 *
 * Progress Tracking использует тот же submitTaskEvent, что и
 * TaskProgressProvider (6 быстрых заданий) — тот же backend-эндпоинт,
 * никаких новых серверных изменений.
 */
const NOTEBOOK_STORAGE_KEY = "edumind_electricity_notebook";

function loadNotebook(): ElectricityNotebookEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NOTEBOOK_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ElectricityNotebookEntry[]) : [];
  } catch {
    return [];
  }
}

function saveNotebook(entries: ElectricityNotebookEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTEBOOK_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // переполнение localStorage не должно ломать лабораторию
  }
}

export interface ElectricityStepContextInput {
  components: CircuitComponent[];
  connections: Connection[];
  solution: CircuitSolution;
}

interface ElectricityLabExperienceContextValue {
  catalog: ElectricityLabExperiment[];
  completedExperimentIds: string[];
  selectedExperiment: ElectricityLabExperiment | null;
  selectExperiment: (id: string) => void;
  exitExperiment: () => void;
  resetLabSession: () => void;
  currentStepIndex: number;
  currentStep: ElectricityLabStep | null;
  isCurrentStepUnlocked: boolean;
  advanceStep: () => void;
  isLastStep: boolean;
  suggestedTerminals: [string, string] | null;
  measurements: ElectricityMeasurement[];
  recordMeasurement: () => void;
  questionAnswers: Record<string, number>;
  answerQuestion: (questionId: string, selectedIndex: number) => void;
  observationsDraft: string;
  setObservationsDraft: (text: string) => void;
  conclusionDraft: string;
  setConclusionDraft: (text: string) => void;
  completeExperiment: () => void;
  recordHintUsed: () => void;
  notebookEntries: ElectricityNotebookEntry[];
  lastNotebookEntry: ElectricityNotebookEntry | null;
  learningProfile: LearningProfile | null;
  isExperimentUnlockedFor: (experiment: ElectricityLabExperiment) => boolean;
}

const ElectricityLabExperienceContext = createContext<ElectricityLabExperienceContextValue | undefined>(undefined);

export function ElectricityLabExperienceProvider({
  simulationId,
  stepContext,
  children,
}: {
  simulationId: string;
  stepContext: ElectricityStepContextInput;
  children: React.ReactNode;
}) {
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [measurements, setMeasurements] = useState<ElectricityMeasurement[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, number>>({});
  const [observationsDraft, setObservationsDraft] = useState("");
  const [conclusionDraft, setConclusionDraft] = useState("");
  const [notebookEntries, setNotebookEntries] = useState<ElectricityNotebookEntry[]>([]);
  const [lastNotebookEntry, setLastNotebookEntry] = useState<ElectricityNotebookEntry | null>(null);
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null);

  useEffect(() => {
    setNotebookEntries(sortElectricityNotebookEntriesByDateDesc(loadNotebook()));
  }, []);

  const selectedExperiment = selectedExperimentId ? getElectricityLabExperiment(selectedExperimentId) ?? null : null;

  const battery = stepContext.components.find((c) => c.kind === "battery");
  const resistor = stepContext.components.find((c) => c.kind === "resistor");
  const bulb = stepContext.components.find((c) => c.kind === "bulb");
  const fuse = stepContext.components.find((c) => c.kind === "fuse");

  // реальные счётчики сессии текущего эксперимента — refs, чтобы не
  // ре-рендерить на каждый физический пересчёт; сбрасываются при выборе
  // нового эксперимента (тот же паттерн, что ChemistryLabExperienceProvider)
  const hintsRef = useRef(0);
  const minVoltageRef = useRef(battery?.voltageV ?? 0);
  const maxVoltageRef = useRef(battery?.voltageV ?? 0);
  const minResistanceRef = useRef(resistor?.resistanceOhm ?? 0);
  const maxResistanceRef = useRef(resistor?.resistanceOhm ?? 0);
  const maxCurrentRef = useRef(0);
  const maxBrightnessRef = useRef(0);
  const fuseBlownObservedRef = useRef(false);
  const openCircuitObservedRef = useRef(false);
  const shortCircuitObservedRef = useRef(false);

  useEffect(() => {
    if (!selectedExperiment) return;
    const v = battery?.voltageV ?? 0;
    if (v < minVoltageRef.current) minVoltageRef.current = v;
    if (v > maxVoltageRef.current) maxVoltageRef.current = v;
  }, [selectedExperiment, battery?.voltageV]);

  useEffect(() => {
    if (!selectedExperiment) return;
    const r = resistor?.resistanceOhm ?? 0;
    if (r < minResistanceRef.current) minResistanceRef.current = r;
    if (r > maxResistanceRef.current) maxResistanceRef.current = r;
  }, [selectedExperiment, resistor?.resistanceOhm]);

  useEffect(() => {
    if (!selectedExperiment) return;
    if (stepContext.solution.currentA > maxCurrentRef.current) maxCurrentRef.current = stepContext.solution.currentA;
  }, [selectedExperiment, stepContext.solution.currentA]);

  useEffect(() => {
    if (!selectedExperiment || !bulb) return;
    const brightness = bulbBrightness(stepContext.solution.readings[bulb.id], bulb.ratedPowerW ?? 0);
    if (brightness > maxBrightnessRef.current) maxBrightnessRef.current = brightness;
  }, [selectedExperiment, bulb, stepContext.solution.readings]);

  useEffect(() => {
    if (!selectedExperiment) return;
    if (fuse?.isBlown) fuseBlownObservedRef.current = true;
  }, [selectedExperiment, fuse?.isBlown]);

  useEffect(() => {
    if (!selectedExperiment) return;
    if (stepContext.solution.isClosedLoop && !stepContext.solution.isCircuitActive) openCircuitObservedRef.current = true;
  }, [selectedExperiment, stepContext.solution.isClosedLoop, stepContext.solution.isCircuitActive]);

  useEffect(() => {
    if (!selectedExperiment) return;
    if (stepContext.solution.isShortCircuit) shortCircuitObservedRef.current = true;
  }, [selectedExperiment, stepContext.solution.isShortCircuit]);

  const completedExperimentIds = useMemo(() => {
    const ids = new Set<string>();
    notebookEntries.forEach((e) => {
      if (e.score >= 40) ids.add(e.experimentId); // 40 = базовый балл, начисляемый только по факту реального завершения
    });
    return Array.from(ids);
  }, [notebookEntries]);

  function selectExperiment(id: string) {
    const experiment = getElectricityLabExperiment(id);
    if (!experiment) return;
    setSelectedExperimentId(id);
    setCurrentStepIndex(0);
    setMeasurements([]);
    setQuestionAnswers({});
    setObservationsDraft("");
    setConclusionDraft("");
    setLastNotebookEntry(null);

    hintsRef.current = 0;
    minVoltageRef.current = battery?.voltageV ?? 0;
    maxVoltageRef.current = battery?.voltageV ?? 0;
    minResistanceRef.current = resistor?.resistanceOhm ?? 0;
    maxResistanceRef.current = resistor?.resistanceOhm ?? 0;
    maxCurrentRef.current = 0;
    maxBrightnessRef.current = 0;
    fuseBlownObservedRef.current = false;
    openCircuitObservedRef.current = false;
    shortCircuitObservedRef.current = false;
  }

  function exitExperiment() {
    setSelectedExperimentId(null);
  }

  // сценарий сброса — та же необходимость, что нашлась в Chemistry World
  // Stage 5.7: сброс цепи (кнопка "Сбросить") должен также выходить из
  // текущей учебной сессии, иначе студент остаётся на устаревшем шаге
  // против уже сброшенной, пустой цепи
  function resetLabSession() {
    setSelectedExperimentId(null);
    setLastNotebookEntry(null);
  }

  const effectiveStepContext: ElectricityLabStepContext = {
    components: stepContext.components,
    connections: stepContext.connections,
    solution: stepContext.solution,
    measurementsRecorded: measurements.length,
    minVoltageVObserved: minVoltageRef.current,
    maxVoltageVObserved: Math.max(maxVoltageRef.current, battery?.voltageV ?? 0),
    minResistanceOhmObserved: minResistanceRef.current,
    maxResistanceOhmObserved: Math.max(maxResistanceRef.current, resistor?.resistanceOhm ?? 0),
    maxCurrentAObserved: Math.max(maxCurrentRef.current, stepContext.solution.currentA),
    maxBulbBrightnessObserved: maxBrightnessRef.current,
    fuseBlownObserved: fuseBlownObservedRef.current,
    openCircuitObserved: openCircuitObservedRef.current,
    shortCircuitObserved: shortCircuitObservedRef.current,
    conclusionText: conclusionDraft,
  };

  const currentStep = selectedExperiment ? selectedExperiment.steps[currentStepIndex] ?? null : null;
  const isCurrentStepUnlocked = currentStep ? currentStep.isUnlocked(effectiveStepContext) : false;
  const isLastStep = selectedExperiment ? currentStepIndex === selectedExperiment.steps.length - 1 : false;
  const suggestedTerminals = currentStep?.suggestedTerminals ? currentStep.suggestedTerminals(effectiveStepContext) : null;

  function advanceStep() {
    if (!selectedExperiment || !currentStep) return;
    if (!currentStep.isUnlocked(effectiveStepContext)) return; // реальная проверка, не просто клик
    setCurrentStepIndex((i) => Math.min(i + 1, selectedExperiment.steps.length - 1));
  }

  function recordMeasurement() {
    const snap = snapshotMeasurement({ components: stepContext.components, solution: stepContext.solution });
    setMeasurements((prev) => [...prev, { ...snap, at: Date.now() }]);
  }

  function answerQuestion(questionId: string, selectedIndex: number) {
    setQuestionAnswers((prev) => ({ ...prev, [questionId]: selectedIndex }));
  }

  function recordHintUsed() {
    hintsRef.current += 1;
  }

  const completingRef = useRef(false);

  function completeExperiment() {
    if (completingRef.current) return;
    if (!selectedExperiment) return;
    if (!selectedExperiment.isComplete(effectiveStepContext)) return; // нельзя завершить без реального подтверждения
    completingRef.current = true;

    const questionResults: QuestionResult[] = selectedExperiment.questions.map((q) => {
      const selectedIndex = questionAnswers[q.id] ?? -1;
      const correctIndex = q.correctIndex(effectiveStepContext);
      return { questionId: q.id, prompt: q.prompt, selectedIndex, correctIndex, correct: selectedIndex === correctIndex };
    });

    const entry = buildElectricityNotebookEntry({
      experimentId: selectedExperiment.id,
      experimentTitle: selectedExperiment.title,
      difficulty: selectedExperiment.difficulty,
      objective: selectedExperiment.goal,
      componentKinds: stepContext.components.map((c) => c.kind),
      connectionsCount: stepContext.connections.length,
      measurements,
      questionResults,
      observations: observationsDraft,
      conclusion: conclusionDraft,
      hintsUsed: hintsRef.current,
    });

    const nextEntries = sortElectricityNotebookEntriesByDateDesc([...notebookEntries, entry]);
    setNotebookEntries(nextEntries);
    saveNotebook(nextEntries);
    setLastNotebookEntry(entry);

    submitTaskEvent({
      simulationId,
      taskId: selectedExperiment.id,
      difficulty: selectedExperiment.difficulty,
      xpReward: selectedExperiment.xpReward,
      completed: true,
      hintsUsed: hintsRef.current,
      attempts: measurements.length,
      mistakes: questionResults.filter((q) => !q.correct).map((q) => q.questionId),
    })
      .then((res) => setLearningProfile(res.profile))
      .catch(() => {
        // сеть недоступна — запись уже сохранена локально в журнале,
        // потеряется только серверная синхронизация Learning Profile
      });

    setSelectedExperimentId(null);
    completingRef.current = false;
  }

  function isExperimentUnlockedFor(experiment: ElectricityLabExperiment): boolean {
    return isElectricityExperimentUnlocked(experiment, completedExperimentIds);
  }

  const value: ElectricityLabExperienceContextValue = {
    catalog: ELECTRICITY_LAB_CATALOG,
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
    suggestedTerminals,
    measurements,
    recordMeasurement,
    questionAnswers,
    answerQuestion,
    observationsDraft,
    setObservationsDraft,
    conclusionDraft,
    setConclusionDraft,
    completeExperiment,
    recordHintUsed,
    notebookEntries,
    lastNotebookEntry,
    learningProfile,
    isExperimentUnlockedFor,
  };

  return <ElectricityLabExperienceContext.Provider value={value}>{children}</ElectricityLabExperienceContext.Provider>;
}

export function useElectricityLabExperience(): ElectricityLabExperienceContextValue {
  const ctx = useContext(ElectricityLabExperienceContext);
  if (!ctx) throw new Error("useElectricityLabExperience должен использоваться внутри <ElectricityLabExperienceProvider>");
  return ctx;
}
