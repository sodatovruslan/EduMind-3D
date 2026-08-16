import { describe, expect, it } from "vitest";
import { summarizeElectricityEvidence, type ElectricityEvidenceEvent } from "./electricity-evidence";

function ev(code: ElectricityEvidenceEvent["code"], detail?: string, at = 0): ElectricityEvidenceEvent {
  return { code, at, detail };
}

describe("electricity-evidence — summarizeElectricityEvidence", () => {
  it("возвращает все нули для пустого журнала", () => {
    expect(summarizeElectricityEvidence([])).toEqual({
      stepsCompletedCount: 0,
      hintsUsed: 0,
      mistakesCount: 0,
      safetyIncidentsCount: 0,
      measurementErrorsCount: 0,
      selfCorrectionsCount: 0,
      successfulMeasurementsCount: 0,
    });
  });

  it("считает шаги/подсказки/успешные измерения по фактическому количеству событий", () => {
    const events = [
      ev("experiment_started"),
      ev("step_completed", "introduction"),
      ev("step_completed", "theory"),
      ev("hint_used"),
      ev("hint_used"),
      ev("hint_used"),
      ev("successful_measurement"),
      ev("successful_measurement"),
    ];
    const summary = summarizeElectricityEvidence(events);
    expect(summary.stepsCompletedCount).toBe(2);
    expect(summary.hintsUsed).toBe(3);
    expect(summary.successfulMeasurementsCount).toBe(2);
  });

  it("mistakesCount суммирует incorrect_wiring и unsafe_wiring (разные грани ошибок), не пересекаясь с safetyIncidentsCount искусственно", () => {
    const events = [
      ev("incorrect_wiring", "ammeter:parallel_invalid"),
      ev("ammeter_placement_error"),
      ev("unsafe_wiring", "short_circuit"),
      ev("short_circuit_triggered"),
    ];
    const summary = summarizeElectricityEvidence(events);
    expect(summary.mistakesCount).toBe(2); // 1 incorrect_wiring + 1 unsafe_wiring
    expect(summary.safetyIncidentsCount).toBe(2); // unsafe_wiring + short_circuit_triggered — оба фиксируют один и тот же инцидент с двух сторон
    expect(summary.measurementErrorsCount).toBe(1); // ammeter_placement_error
  });

  it("safetyIncidentsCount учитывает unsafe_wiring + short_circuit_triggered + fuse_blown раздельно как отдельные факты", () => {
    const events = [
      ev("unsafe_wiring", "short_circuit"),
      ev("short_circuit_triggered"),
      ev("unsafe_wiring", "fuse_blown"),
      ev("fuse_blown"),
    ];
    const summary = summarizeElectricityEvidence(events);
    // 2 unsafe_wiring + 1 short_circuit_triggered + 1 fuse_blown = 4 (каждый код считается по своей семантике)
    expect(summary.safetyIncidentsCount).toBe(4);
  });

  it("selfCorrectionsCount и measurementErrorsCount считаются независимо друг от друга", () => {
    const events = [
      ev("incorrect_wiring", "ammeter:parallel_invalid"),
      ev("ammeter_placement_error"),
      ev("successful_correction", "ammeter"),
      ev("incorrect_wiring", "voltmeter:series_invalid"),
      ev("voltmeter_placement_error"),
      ev("successful_correction", "voltmeter"),
    ];
    const summary = summarizeElectricityEvidence(events);
    expect(summary.measurementErrorsCount).toBe(2);
    expect(summary.selfCorrectionsCount).toBe(2);
    expect(summary.mistakesCount).toBe(2);
  });
});
