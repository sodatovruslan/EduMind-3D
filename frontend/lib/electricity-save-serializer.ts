/**
 * Electricity Lab — Save Serializer/Hydrator (Stage S9.7). Тот же принцип,
 * что и chemistry-save-serializer.ts: чистые функции, никакой физики не
 * пересчитывают, только упаковывают/распаковывают уже существующее
 * состояние (ExperimentStateProvider + ElectricityLabExperienceProvider) в
 * версионированный снимок и обратно.
 */
import type { CircuitComponent, Connection } from "./circuit-engine";
import type { ElectricityMeasurement } from "./electricity-notebook";
import type { ElectricityEvidenceEvent } from "./electricity-evidence";
import {
  type ElectricitySaveSnapshotV1,
  type ElectricitySaveValidationResult,
  type ElectricitySaveTaskStatus,
  type ElectricitySessionObservationsV1,
} from "./electricity-save-schema";

export interface SerializeElectricitySaveOptions {
  saveId: string;
  simulationId: string;
  revision: number;
  createdAt?: string;
  now?: () => number;
  components: CircuitComponent[];
  connections: Connection[];
  experimentId: string;
  currentStepIndex: number;
  completedStepIds: string[];
  taskStatus: ElectricitySaveTaskStatus;
  startedAt: string;
  hintsUsed: number;
  measurements: ElectricityMeasurement[];
  questionAnswers: Record<string, number>;
  observationsDraft: string;
  conclusionDraft: string;
  evidenceEvents: ElectricityEvidenceEvent[];
  sessionObservations: ElectricitySessionObservationsV1;
}

// детерминированная сериализация — компоненты/соединения отсортированы по
// id (тот же приём, что и chemistry-save-serializer.ts), чтобы два вызова
// с одинаковым состоянием давали идентичный JSON
export function serializeElectricitySave(options: SerializeElectricitySaveOptions): ElectricitySaveSnapshotV1 {
  const now = options.now ? options.now() : Date.now();
  const updatedAt = new Date(now).toISOString();
  return {
    schemaVersion: "1.0",
    saveId: options.saveId,
    simulationId: options.simulationId,
    revision: options.revision,
    createdAt: options.createdAt ?? updatedAt,
    updatedAt,
    circuit: {
      components: [...options.components].sort((a, b) => a.id.localeCompare(b.id)),
      connections: [...options.connections].sort((a, b) => a.id.localeCompare(b.id)),
    },
    experiment: {
      experimentId: options.experimentId,
      currentStepIndex: options.currentStepIndex,
      completedStepIds: [...options.completedStepIds],
      taskStatus: options.taskStatus,
      startedAt: options.startedAt,
      hintsUsed: options.hintsUsed,
      measurements: options.measurements,
      questionAnswers: options.questionAnswers,
      observationsDraft: options.observationsDraft,
      conclusionDraft: options.conclusionDraft,
      evidenceEvents: options.evidenceEvents,
      sessionObservations: options.sessionObservations,
    },
  };
}

export function validateElectricitySaveSnapshot(raw: unknown): ElectricitySaveValidationResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { isValid: false, errors: ["snapshot is not an object"] };
  }
  const snap = raw as Partial<ElectricitySaveSnapshotV1>;

  if (snap.schemaVersion !== "1.0") errors.push(`unsupported schemaVersion: ${String(snap.schemaVersion)}`);
  if (typeof snap.saveId !== "string" || !snap.saveId) errors.push("missing saveId");
  if (typeof snap.simulationId !== "string" || !snap.simulationId) errors.push("missing simulationId");
  if (typeof snap.revision !== "number" || snap.revision < 1) errors.push("invalid revision");
  if (typeof snap.updatedAt !== "string" || Number.isNaN(Date.parse(snap.updatedAt))) errors.push("invalid updatedAt");

  if (!snap.circuit || !Array.isArray(snap.circuit.components) || !Array.isArray(snap.circuit.connections)) {
    errors.push("invalid circuit snapshot");
  }

  if (!snap.experiment || typeof snap.experiment.experimentId !== "string" || !snap.experiment.experimentId) {
    errors.push("invalid experiment snapshot");
  } else {
    if (typeof snap.experiment.currentStepIndex !== "number" || snap.experiment.currentStepIndex < 0) {
      errors.push("invalid currentStepIndex");
    }
    if (!Array.isArray(snap.experiment.measurements)) errors.push("invalid measurements");
    if (!Array.isArray(snap.experiment.evidenceEvents)) errors.push("invalid evidenceEvents");
    if (!snap.experiment.questionAnswers || typeof snap.experiment.questionAnswers !== "object") {
      errors.push("invalid questionAnswers");
    }
    if (!snap.experiment.sessionObservations || typeof snap.experiment.sessionObservations !== "object") {
      errors.push("invalid sessionObservations");
    }
  }

  return { isValid: errors.length === 0, errors };
}

export interface HydratedElectricityState {
  components: CircuitComponent[];
  connections: Connection[];
  experimentId: string;
  currentStepIndex: number;
  measurements: ElectricityMeasurement[];
  questionAnswers: Record<string, number>;
  observationsDraft: string;
  conclusionDraft: string;
  hintsUsed: number;
  evidenceEvents: ElectricityEvidenceEvent[];
  sessionObservations: ElectricitySessionObservationsV1;
  // исходный момент старта сессии (до перезагрузки), не момент resume —
  // так итоговый durationMs при завершении честно учитывает всё время
  // работы, а не только время после возобновления
  startedAtMs: number;
}

export function hydrateElectricitySave(snapshot: ElectricitySaveSnapshotV1): HydratedElectricityState {
  const validation = validateElectricitySaveSnapshot(snapshot);
  if (!validation.isValid) {
    throw new Error(`Invalid electricity save snapshot: ${validation.errors.join(", ")}`);
  }
  const startedAtMs = Date.parse(snapshot.experiment.startedAt);
  return {
    components: snapshot.circuit.components,
    connections: snapshot.circuit.connections,
    experimentId: snapshot.experiment.experimentId,
    currentStepIndex: snapshot.experiment.currentStepIndex,
    measurements: snapshot.experiment.measurements,
    questionAnswers: snapshot.experiment.questionAnswers,
    observationsDraft: snapshot.experiment.observationsDraft,
    conclusionDraft: snapshot.experiment.conclusionDraft,
    hintsUsed: snapshot.experiment.hintsUsed,
    evidenceEvents: snapshot.experiment.evidenceEvents,
    sessionObservations: snapshot.experiment.sessionObservations,
    startedAtMs: Number.isNaN(startedAtMs) ? Date.now() : startedAtMs,
  };
}
