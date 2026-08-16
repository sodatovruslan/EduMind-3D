/**
 * Electricity Lab — Autosave/Resume Save Schema (Stage S9.7).
 *
 * Аналог chemistry-save-schema.ts по духу (versioned snapshot + отдельный
 * serializer/hydrate слой), но НЕ копия его формы: Chemistry World хранит
 * многослойный workspace (containers/stockBottles/burners/cabinets —
 * произвольно расставляемые предметы), у Electricity Lab же ФИКСИРОВАННЫЙ
 * физический стенд (см. electricity-lab-catalog.ts — единственная
 * возможная раскладка). Поэтому здесь снимок цепи — это просто
 * components/connections (то же самое, что уже хранит
 * ExperimentStateProvider), без слоёв позиционирования/шкафов.
 *
 * Хранится ТОЛЬКО в localStorage (осознанное архитектурное решение S9.7 —
 * у Electricity Lab, в отличие от Chemistry World, до сих пор не было
 * НИКАКОГО backend-сохранения, только localStorage для Лабораторного
 * журнала; заводить новую backend-таблицу/роутер под чужую сущность
 * "chemistry_saves" означало бы либо семантически неверное переиспользование,
 * либо отдельную backend-разработку, которой в S9.1-S9.6 сознательно не
 * было). При необходимости серверной синхронизации в будущем схема ниже
 * уже версионирована (`schemaVersion`) и несёт `revision`, ровно как у
 * Chemistry World, поэтому миграция на backend возможна без изменения формы.
 */
import type { CircuitComponent, Connection } from "./circuit-engine";
import type { ElectricityMeasurement } from "./electricity-notebook";
import type { ElectricityEvidenceEvent } from "./electricity-evidence";

export type ElectricitySaveTaskStatus = "in_progress" | "completed";

// снимок цепи — components/connections один в один как в
// ExperimentStateProvider.tsx; включает состояние предохранителя
// (isBlown)/переключателя (isClosed) — они уже поля CircuitComponent, не
// отдельная сущность
export interface ElectricityCircuitSnapshotV1 {
  components: CircuitComponent[];
  connections: Connection[];
}

// счётчики диапазонов наблюдений сессии (используются гейтингом
// resistanceInfluence/voltageInfluence/lampBrightness в
// electricity-lab-catalog.ts) — без них возобновлённая сессия заставила бы
// студента заново исследовать уже пройденный диапазон
export interface ElectricitySessionObservationsV1 {
  minVoltageV: number;
  maxVoltageV: number;
  minResistanceOhm: number;
  maxResistanceOhm: number;
  maxCurrentA: number;
  maxBulbBrightness: number;
  fuseBlownObserved: boolean;
  openCircuitObserved: boolean;
  shortCircuitObserved: boolean;
}

export interface ElectricityExperimentSnapshotV1 {
  experimentId: string;
  currentStepIndex: number;
  // производное поле (steps[0..currentStepIndex)) — хранится явно для
  // читаемости снимка и потенциальной будущей ветвящейся структуры шагов,
  // hydrate использует currentStepIndex как источник истины
  completedStepIds: string[];
  taskStatus: ElectricitySaveTaskStatus;
  startedAt: string; // ISO — сохраняется от первого selectExperiment(), не от момента resume
  hintsUsed: number;
  measurements: ElectricityMeasurement[];
  questionAnswers: Record<string, number>;
  observationsDraft: string;
  conclusionDraft: string;
  evidenceEvents: ElectricityEvidenceEvent[];
  sessionObservations: ElectricitySessionObservationsV1;
}

export interface ElectricitySaveSnapshotV1 {
  schemaVersion: "1.0";
  saveId: string;
  simulationId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  circuit: ElectricityCircuitSnapshotV1;
  experiment: ElectricityExperimentSnapshotV1;
}

export interface ElectricitySaveValidationResult {
  isValid: boolean;
  errors: string[];
}
