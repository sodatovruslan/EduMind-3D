"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { bulbBrightness, type CircuitComponent, type CircuitSolution, type Connection } from "@/lib/circuit-engine";
import { useExperimentState } from "./ExperimentStateProvider";
import {
  ELECTRICITY_LAB_CATALOG,
  getElectricityLabExperiment,
  isElectricityExperimentUnlocked,
  snapshotMeasurement,
  type ElectricityLabExperiment,
  type ElectricityLabStep,
  type ElectricityLabStepContext,
} from "@/lib/electricity-lab-catalog";
import { checkElectricalSafety } from "@/lib/electricity-safety";
import {
  ammeterPlacementMessage,
  checkAmmeterPlacement,
  checkVoltmeterPlacement,
  voltmeterPlacementMessage,
} from "@/lib/measurement-validation";
import {
  buildElectricityNotebookEntry,
  sortElectricityNotebookEntriesByDateDesc,
  type ElectricityMeasurement,
  type ElectricityNotebookEntry,
  type QuestionResult,
} from "@/lib/electricity-notebook";
import type { ElectricityEvidenceCode, ElectricityEvidenceEvent } from "@/lib/electricity-evidence";
import { submitTaskEvent, type LearningProfile } from "@/lib/progress-client";
import type { ElectricitySaveSnapshotV1 } from "@/lib/electricity-save-schema";
import { hydrateElectricitySave, type SerializeElectricitySaveOptions } from "@/lib/electricity-save-serializer";
import { clearElectricitySave, electricityAutosaveEngine, loadElectricitySave } from "@/lib/electricity-autosave-engine";

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
  // Stage S9.5 — Guided Experiments: почему currentStep всё ещё заблокирован
  // (null, если он разблокирован или причина не сводится к безопасности/
  // размещению приборов — тогда UI покажет только общую инструкцию шага).
  // Переиспользует те же сообщения, что уже показывает баннер безопасности
  // и приборные подсказки — ничего не выдумывает заново.
  currentStepFeedback: string | null;
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
  // Stage S9.7 — Autosave & Resume: снимок незавершённой сессии, найденный
  // в localStorage при монтировании (null — сохранения нет или студент уже
  // в активной сессии). UI показывает модалку "Продолжить"/"Начать заново"
  // только пока pendingResume не null и selectedExperiment ещё null.
  pendingResume: ElectricitySaveSnapshotV1 | null;
  resumeSave: (snapshot: ElectricitySaveSnapshotV1) => void;
  discardPendingResume: () => void;
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
  // Stage S9.7 — Autosave & Resume: незавершённая сессия из localStorage,
  // найденная один раз при монтировании (тот же паттерн, что и notebook
  // выше). Мутирует реальное состояние ExperimentStateProvider (соседний
  // провайдер, всегда предок этого — тот же способ, каким Chemistry World's
  // ChemistryLabExperienceProvider вызывает workspaceContext.hydrateFromSave).
  const [pendingResume, setPendingResume] = useState<ElectricitySaveSnapshotV1 | null>(null);
  const { resetExperiment, addConnection } = useExperimentState();

  useEffect(() => {
    setNotebookEntries(sortElectricityNotebookEntriesByDateDesc(loadNotebook()));
    setPendingResume(loadElectricitySave(simulationId));
  }, [simulationId]);

  // размонтирование провайдера (уход со страницы Electricity Lab) —
  // останавливает таймеры движка окончательно; localStorage-снимок не
  // трогается (та же логика, что и uninit() внутри exitExperiment())
  useEffect(() => () => electricityAutosaveEngine.destroy(), []);

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

  // Stage S9.6 — Assessment & Teacher Analytics: лёгкий дискретный журнал
  // реальных событий текущей попытки (electricity-evidence.ts), плюс refs
  // для обнаружения ПЕРЕХОДОВ (не пересчитывается физика — просто
  // сравнивается предыдущий и текущий статус уже готовых проверок
  // measurement-validation.ts/electricity-safety.ts). Единственный источник
  // правды для оценки (electricity-assessment.ts) при завершении.
  const evidenceRef = useRef<ElectricityEvidenceEvent[]>([]);
  const experimentStartedAtRef = useRef<number | null>(null);
  const ammeterInvalidRef = useRef(false);
  const voltmeterInvalidRef = useRef(false);
  const activeDangerCodesRef = useRef<Set<string>>(new Set());

  function pushEvidence(code: ElectricityEvidenceCode, detail?: string) {
    evidenceRef.current = [...evidenceRef.current, { code, at: Date.now(), detail }];
  }

  // ammeter/voltmeter placement — переиспользует measurement-validation.ts
  // (Stage S9.3), тот же расчёт, что уже используется для currentStepFeedback
  // ниже; здесь только фиксируется МОМЕНТ появления/исчезновения ошибки.
  useEffect(() => {
    if (!selectedExperiment) return;
    const check = checkAmmeterPlacement(stepContext.components, stepContext.connections, stepContext.solution);
    const isInvalid = check.status === "parallel_invalid" || check.status === "not_in_loop";
    if (isInvalid && !ammeterInvalidRef.current) {
      pushEvidence("incorrect_wiring", `ammeter:${check.status}`);
      pushEvidence("ammeter_placement_error", ammeterPlacementMessage(check) ?? undefined);
    } else if (!isInvalid && ammeterInvalidRef.current) {
      pushEvidence("successful_correction", "ammeter");
    }
    ammeterInvalidRef.current = isInvalid;
  }, [selectedExperiment, stepContext.components, stepContext.connections, stepContext.solution]);

  useEffect(() => {
    if (!selectedExperiment) return;
    const check = checkVoltmeterPlacement(stepContext.components, stepContext.connections, stepContext.solution);
    const isInvalid = check.status === "series_invalid";
    if (isInvalid && !voltmeterInvalidRef.current) {
      pushEvidence("incorrect_wiring", `voltmeter:${check.status}`);
      pushEvidence("voltmeter_placement_error", voltmeterPlacementMessage(check) ?? undefined);
    } else if (!isInvalid && voltmeterInvalidRef.current) {
      pushEvidence("successful_correction", "voltmeter");
    }
    voltmeterInvalidRef.current = isInvalid;
  }, [selectedExperiment, stepContext.components, stepContext.connections, stepContext.solution]);

  // danger-предупреждения безопасности — переиспользует checkElectricalSafety
  // (Stage S9.4). "unsafe_measurement" сознательно пропущен здесь: та же
  // самая ошибка уже полностью учтена выше через ammeter/voltmeter-эффекты
  // (иначе одна и та же реальная ошибка засчиталась бы дважды).
  useEffect(() => {
    if (!selectedExperiment) return;
    const warnings = checkElectricalSafety({
      components: stepContext.components,
      connections: stepContext.connections,
      solution: stepContext.solution,
    });
    const dangerCodes = new Set(
      warnings.filter((w) => w.severity === "danger" && w.code !== "unsafe_measurement").map((w) => w.code)
    );
    dangerCodes.forEach((code) => {
      if (!activeDangerCodesRef.current.has(code)) {
        pushEvidence("unsafe_wiring", code);
        if (code === "short_circuit") pushEvidence("short_circuit_triggered");
        if (code === "fuse_blown") pushEvidence("fuse_blown");
      }
    });
    activeDangerCodesRef.current.forEach((code) => {
      if (!dangerCodes.has(code)) pushEvidence("successful_correction", code);
    });
    activeDangerCodesRef.current = dangerCodes;
  }, [selectedExperiment, stepContext.components, stepContext.connections, stepContext.solution]);

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

  // Stage S9.7 — Autosave & Resume: единственное место, которое знает, КАК
  // собрать снимок текущей сессии — переиспользуется и автосохранением
  // (через electricityAutosaveEngine.updateStateGetter), и ничем больше.
  // null, если нет активного эксперимента (движок в этом случае не пишет
  // ничего — тот же контракт, что и Chemistry's getSerializeOptions).
  const getSerializeOptions = useCallback((): Omit<
    SerializeElectricitySaveOptions,
    "saveId" | "simulationId" | "revision"
  > | null => {
    if (!selectedExperiment) return null;
    return {
      components: stepContext.components,
      connections: stepContext.connections,
      experimentId: selectedExperiment.id,
      currentStepIndex,
      completedStepIds: selectedExperiment.steps.slice(0, currentStepIndex).map((s) => s.id),
      taskStatus: "in_progress",
      startedAt: new Date(experimentStartedAtRef.current ?? Date.now()).toISOString(),
      hintsUsed: hintsRef.current,
      measurements,
      questionAnswers,
      observationsDraft,
      conclusionDraft,
      evidenceEvents: evidenceRef.current,
      sessionObservations: {
        minVoltageV: minVoltageRef.current,
        maxVoltageV: Math.max(maxVoltageRef.current, battery?.voltageV ?? 0),
        minResistanceOhm: minResistanceRef.current,
        maxResistanceOhm: Math.max(maxResistanceRef.current, resistor?.resistanceOhm ?? 0),
        maxCurrentA: Math.max(maxCurrentRef.current, stepContext.solution.currentA),
        maxBulbBrightness: maxBrightnessRef.current,
        fuseBlownObserved: fuseBlownObservedRef.current,
        openCircuitObserved: openCircuitObservedRef.current,
        shortCircuitObserved: shortCircuitObservedRef.current,
      },
    };
  }, [
    selectedExperiment,
    currentStepIndex,
    stepContext.components,
    stepContext.connections,
    stepContext.solution,
    measurements,
    questionAnswers,
    observationsDraft,
    conclusionDraft,
    battery?.voltageV,
    resistor?.resistanceOhm,
  ]);

  // держит геттер движка свежим на каждый рендер (движок вызывает его
  // ПОЗЖЕ, из debounce/periodic таймера — обязан видеть актуальное состояние)
  useEffect(() => {
    electricityAutosaveEngine.updateStateGetter(getSerializeOptions);
  }, [getSerializeOptions]);

  // dirty-detection: React уже даёт это бесплатно через массив зависимостей
  // — эффект перезапускается ТОЛЬКО когда одно из значений реально
  // изменилось (новая ссылка на components/connections после реального
  // экшена в ExperimentStateProvider, не на каждый холостой рендер).
  // markDirty() сам обеспечивает debounce записи — здесь просто сигнал
  // "что-то из значимого состояния сессии изменилось".
  useEffect(() => {
    if (!selectedExperiment) return;
    electricityAutosaveEngine.markDirty();
  }, [selectedExperiment, currentStepIndex, stepContext.components, stepContext.connections, measurements, questionAnswers, observationsDraft, conclusionDraft]);

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

    experimentStartedAtRef.current = Date.now();
    ammeterInvalidRef.current = false;
    voltmeterInvalidRef.current = false;
    activeDangerCodesRef.current = new Set();
    evidenceRef.current = [{ code: "experiment_started", at: Date.now(), detail: id }];

    setPendingResume(null);
    electricityAutosaveEngine.init(`electricity-save-${simulationId}`, simulationId, 1, getSerializeOptions);
  }

  // Stage S9.7 — Autosave & Resume: восстанавливает РЕАЛЬНОЕ состояние
  // обоих провайдеров (ExperimentStateProvider — через resetExperiment +
  // повторный addConnection на каждое сохранённое соединение;
  // ElectricityLabExperienceProvider — через прямое присвоение состояния/
  // refs) из снимка. Ничего не пересчитывает физику — solveCircuit()
  // отработает сам на следующем рендере от восстановленных components/
  // connections, тот же путь, что и для любого другого реального действия.
  function resumeSave(snapshot: ElectricitySaveSnapshotV1) {
    const hydrated = hydrateElectricitySave(snapshot);
    const experiment = getElectricityLabExperiment(hydrated.experimentId);
    if (!experiment) return; // защитный случай: неизвестный/устаревший id эксперимента в снимке

    resetExperiment(hydrated.components);
    hydrated.connections.forEach((c) => addConnection(c));

    setSelectedExperimentId(hydrated.experimentId);
    setCurrentStepIndex(Math.min(hydrated.currentStepIndex, experiment.steps.length - 1));
    setMeasurements(hydrated.measurements);
    setQuestionAnswers(hydrated.questionAnswers);
    setObservationsDraft(hydrated.observationsDraft);
    setConclusionDraft(hydrated.conclusionDraft);
    setLastNotebookEntry(null);

    hintsRef.current = hydrated.hintsUsed;
    evidenceRef.current = hydrated.evidenceEvents;
    experimentStartedAtRef.current = hydrated.startedAtMs; // исходное начало сессии, не момент resume — честный durationMs
    minVoltageRef.current = hydrated.sessionObservations.minVoltageV;
    maxVoltageRef.current = hydrated.sessionObservations.maxVoltageV;
    minResistanceRef.current = hydrated.sessionObservations.minResistanceOhm;
    maxResistanceRef.current = hydrated.sessionObservations.maxResistanceOhm;
    maxCurrentRef.current = hydrated.sessionObservations.maxCurrentA;
    maxBrightnessRef.current = hydrated.sessionObservations.maxBulbBrightness;
    fuseBlownObservedRef.current = hydrated.sessionObservations.fuseBlownObserved;
    openCircuitObservedRef.current = hydrated.sessionObservations.openCircuitObserved;
    shortCircuitObservedRef.current = hydrated.sessionObservations.shortCircuitObserved;
    // сбрасываем детекторы ПЕРЕХОДОВ (не итоги) — следующий рендер честно
    // пересчитает текущий статус амперметра/вольтметра/опасностей против
    // восстановленной цепи заново, без ложных срабатываний из старого ref
    ammeterInvalidRef.current = false;
    voltmeterInvalidRef.current = false;
    activeDangerCodesRef.current = new Set();

    setPendingResume(null);
    electricityAutosaveEngine.init(snapshot.saveId, simulationId, snapshot.revision, getSerializeOptions);
  }

  function discardPendingResume() {
    clearElectricitySave(simulationId);
    setPendingResume(null);
  }

  function exitExperiment() {
    setSelectedExperimentId(null);
    // сохранение НЕ трогается — именно это делает выход посередине
    // эксперимента возобновляемым позже; движок просто перестаёт активно
    // отслеживать изменения, пока не выбран следующий эксперимент
    electricityAutosaveEngine.uninit();
  }

  // сценарий сброса — та же необходимость, что нашлась в Chemistry World
  // Stage 5.7: сброс цепи (кнопка "Сбросить") должен также выходить из
  // текущей учебной сессии, иначе студент остаётся на устаревшем шаге
  // против уже сброшенной, пустой цепи. Stage S9.7: явный сброс цепи —
  // достаточно сильный сигнал, чтобы удалить сохранение (иначе оно бы
  // предлагало восстановить состояние, которое студент только что стёр).
  function resetLabSession() {
    setSelectedExperimentId(null);
    setLastNotebookEntry(null);
    clearElectricitySave(simulationId);
    electricityAutosaveEngine.uninit();
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

  // Stage S9.5 — Guided Experiments: объяснение блокировки. Сначала — самая
  // критичная опасность (danger, например короткое замыкание — она может
  // сделать показания приборов бессмысленными/недостоверными), затем сам шаг
  // (если у него есть специфичная причина — например, амперметр включён
  // параллельно), затем общая проверка размещения приборов.
  let currentStepFeedback: string | null = null;
  if (currentStep && !isCurrentStepUnlocked) {
    const dangerWarning = checkElectricalSafety({
      components: effectiveStepContext.components,
      connections: effectiveStepContext.connections,
      solution: effectiveStepContext.solution,
    }).find((w) => w.severity === "danger");
    currentStepFeedback = dangerWarning?.message ?? currentStep.feedback?.(effectiveStepContext) ?? null;
    if (!currentStepFeedback) {
      const ammeterMsg = ammeterPlacementMessage(
        checkAmmeterPlacement(effectiveStepContext.components, effectiveStepContext.connections, effectiveStepContext.solution)
      );
      const voltmeterMsg = voltmeterPlacementMessage(
        checkVoltmeterPlacement(effectiveStepContext.components, effectiveStepContext.connections, effectiveStepContext.solution)
      );
      currentStepFeedback = ammeterMsg ?? voltmeterMsg ?? null;
    }
  }

  function advanceStep() {
    if (!selectedExperiment || !currentStep) return;
    if (!currentStep.isUnlocked(effectiveStepContext)) return; // реальная проверка, не просто клик
    pushEvidence("step_completed", currentStep.id);
    setCurrentStepIndex((i) => Math.min(i + 1, selectedExperiment.steps.length - 1));
  }

  function recordMeasurement() {
    const snap = snapshotMeasurement({ components: stepContext.components, solution: stepContext.solution });
    setMeasurements((prev) => [...prev, { ...snap, at: Date.now() }]);
    const warnings = checkElectricalSafety({
      components: stepContext.components,
      connections: stepContext.connections,
      solution: stepContext.solution,
    });
    if (!warnings.some((w) => w.severity === "danger")) pushEvidence("successful_measurement");
  }

  function answerQuestion(questionId: string, selectedIndex: number) {
    setQuestionAnswers((prev) => ({ ...prev, [questionId]: selectedIndex }));
  }

  function recordHintUsed() {
    hintsRef.current += 1;
    pushEvidence("hint_used");
  }

  const completingRef = useRef(false);

  function completeExperiment() {
    if (completingRef.current) return;
    if (!selectedExperiment) return;
    if (!selectedExperiment.isComplete(effectiveStepContext)) return; // нельзя завершить без реального подтверждения
    completingRef.current = true;
    pushEvidence("experiment_completed");

    const questionResults: QuestionResult[] = selectedExperiment.questions.map((q) => {
      const selectedIndex = questionAnswers[q.id] ?? -1;
      const correctIndex = q.correctIndex(effectiveStepContext);
      return { questionId: q.id, prompt: q.prompt, selectedIndex, correctIndex, correct: selectedIndex === correctIndex };
    });

    const durationMs = experimentStartedAtRef.current !== null ? Date.now() - experimentStartedAtRef.current : null;

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
      evidenceEvents: evidenceRef.current,
      totalSteps: selectedExperiment.steps.length,
      durationMs,
    });

    const nextEntries = sortElectricityNotebookEntriesByDateDesc([...notebookEntries, entry]);
    setNotebookEntries(nextEntries);
    saveNotebook(nextEntries);
    setLastNotebookEntry(entry);

    // Stage S9.6: обогащаем уже существующий пайплайн submitTaskEvent
    // реальными кодами ошибок из Evidence Layer (не только неверные ответы
    // на вопросы) — тот же backend-эндпоинт, никакой новой системы прогресса.
    const evidenceMistakeCodes = Array.from(
      new Set(
        evidenceRef.current
          .filter((e) => e.code === "incorrect_wiring" || e.code === "unsafe_wiring")
          .map((e) => e.detail ?? e.code)
      )
    );

    submitTaskEvent({
      simulationId,
      taskId: selectedExperiment.id,
      difficulty: selectedExperiment.difficulty,
      xpReward: selectedExperiment.xpReward,
      completed: true,
      hintsUsed: hintsRef.current,
      attempts: measurements.length,
      mistakes: [...questionResults.filter((q) => !q.correct).map((q) => q.questionId), ...evidenceMistakeCodes],
    })
      .then((res) => setLearningProfile(res.profile))
      .catch(() => {
        // сеть недоступна — запись уже сохранена локально в журнале,
        // потеряется только серверная синхронизация Learning Profile
      });

    // Stage S9.7: эксперимент реально завершён — восстанавливать больше
    // нечего, снимок удаляется (иначе резюме-модалка предложила бы
    // "продолжить" уже пройденную работу при следующей загрузке страницы)
    clearElectricitySave(simulationId);
    electricityAutosaveEngine.uninit();

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
    currentStepFeedback,
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
    pendingResume,
    resumeSave,
    discardPendingResume,
  };

  return <ElectricityLabExperienceContext.Provider value={value}>{children}</ElectricityLabExperienceContext.Provider>;
}

export function useElectricityLabExperience(): ElectricityLabExperienceContextValue {
  const ctx = useContext(ElectricityLabExperienceContext);
  if (!ctx) throw new Error("useElectricityLabExperience должен использоваться внутри <ElectricityLabExperienceProvider>");
  return ctx;
}
