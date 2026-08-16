import { describe, expect, it } from "vitest";
import { minVisibleMagnitude } from "./EarthquakesLayer";

describe("GeoWorld G6 — minVisibleMagnitude: раскрытие толчков при приближении", () => {
  it("издалека — только крупные (M6.5+)", () => {
    expect(minVisibleMagnitude(10)).toBe(6.5);
  });

  it("вблизи — раскрываются все доступные (M4.5+)", () => {
    expect(minVisibleMagnitude(1)).toBe(4.5);
  });

  it("монотонно убывает по мере приближения (никогда не прячет то, что уже было видно)", () => {
    const distances = [10, 5, 3, 2, 1];
    const thresholds = distances.map(minVisibleMagnitude);
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeLessThanOrEqual(thresholds[i - 1]);
    }
  });
});
