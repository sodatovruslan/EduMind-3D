/**
 * Electricity Lab — Guided Experiment Evidence Layer (Stage S9.6).
 *
 * Аналог наблюдения за реальными действиями студента, но НЕ дублирует
 * ChemistryWorld's тяжёлую (и, как выяснилось при аудите, фактически
 * неиспользуемую в production) evidence-log-систему с evidenceEventIds —
 * это лёгкий, дискретный журнал ТОЛЬКО тех фактов, которые
 * ElectricityLabExperienceProvider.tsx уже и так вычисляет через
 * measurement-validation.ts/electricity-safety.ts (Stage S9.3/S9.4) для
 * геймплейного гейтинга (Stage S9.5) — здесь ничего не пересчитывается
 * заново, только фиксируется МОМЕНТ, когда что-то реально произошло.
 *
 * Каждое событие — один факт из реальной попытки прохождения guided
 * experiment: начало, шаг пройден, подсказка использована, ошибка
 * подключения приборов, опасная проводка, самостоятельное исправление,
 * успешное измерение, завершение. Никакого покадрового состояния схемы —
 * события создаются только на РЕАЛЬНЫХ переходах (state transitions), а не
 * на каждом ре-рендере.
 */

export type ElectricityEvidenceCode =
  | "experiment_started"
  | "step_completed"
  | "hint_used"
  | "incorrect_wiring"
  | "unsafe_wiring"
  | "ammeter_placement_error"
  | "voltmeter_placement_error"
  | "successful_correction"
  | "short_circuit_triggered"
  | "fuse_blown"
  | "successful_measurement"
  | "experiment_completed";

export interface ElectricityEvidenceEvent {
  code: ElectricityEvidenceCode;
  at: number; // Date.now()
  detail?: string;
}

export interface ElectricityEvidenceSummary {
  stepsCompletedCount: number;
  hintsUsed: number;
  // "ошибка" = любое неверное/небезопасное действие: неправильное
  // размещение прибора ИЛИ опасная проводка (пересекается с
  // safetyIncidentsCount по замыслу — одна и та же ошибка может быть и тем,
  // и другим одновременно, как в реальной лаборатории)
  mistakesCount: number;
  safetyIncidentsCount: number;
  measurementErrorsCount: number;
  selfCorrectionsCount: number;
  successfulMeasurementsCount: number;
}

function countCode(events: readonly ElectricityEvidenceEvent[], code: ElectricityEvidenceCode): number {
  return events.reduce((total, e) => (e.code === code ? total + 1 : total), 0);
}

/** Детерминированная агрегация — чистая функция от уже случившихся событий, ничего не решает сама. */
export function summarizeElectricityEvidence(events: readonly ElectricityEvidenceEvent[]): ElectricityEvidenceSummary {
  return {
    stepsCompletedCount: countCode(events, "step_completed"),
    hintsUsed: countCode(events, "hint_used"),
    mistakesCount: countCode(events, "incorrect_wiring") + countCode(events, "unsafe_wiring"),
    safetyIncidentsCount:
      countCode(events, "unsafe_wiring") + countCode(events, "short_circuit_triggered") + countCode(events, "fuse_blown"),
    measurementErrorsCount: countCode(events, "ammeter_placement_error") + countCode(events, "voltmeter_placement_error"),
    selfCorrectionsCount: countCode(events, "successful_correction"),
    successfulMeasurementsCount: countCode(events, "successful_measurement"),
  };
}
