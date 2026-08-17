import { describe, expect, it } from "vitest";
import { anomalyColor, PAMIR_LAT, PAMIR_LNG, CLIMATE_THRESHOLD_C } from "./useClimateOverlay";

// G6.12 §26 — координаты/порог должны совпадать с backend
// geography_engine.py (CLIMATE_THRESHOLD_C=3.0) и старым R3F-рендерером
// (PAMIR_LAT/PAMIR_LNG=38.5/72.0) — портированы, не придуманы заново.
describe("useClimateOverlay constants", () => {
  it("координаты Памира и порог совпадают с backend/старым рендерером", () => {
    expect(PAMIR_LAT).toBe(38.5);
    expect(PAMIR_LNG).toBe(72.0);
    expect(CLIMATE_THRESHOLD_C).toBe(3.0);
  });
});

describe("anomalyColor", () => {
  it("монотонно переходит от голубого к красному по мере роста progress", () => {
    expect(anomalyColor(0)).toBe("#38bdf8");
    expect(anomalyColor(0.2)).toBe("#38bdf8");
    expect(anomalyColor(0.4)).toBe("#facc15");
    expect(anomalyColor(0.7)).toBe("#fb923c");
    expect(anomalyColor(1)).toBe("#ef4444");
  });

  it("значения выше 1 (за порогом) остаются насыщенно-красными, не выходят за пределы шкалы", () => {
    expect(anomalyColor(1.5)).toBe("#ef4444");
  });
});
