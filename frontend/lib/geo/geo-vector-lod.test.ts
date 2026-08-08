import { describe, expect, it } from "vitest";
import { isFacingCamera, maxVisibleScaleRank, pickBorderTier } from "./geo-vector-lod";
import { latLngToUnitVec3, type Vec3 } from "./tile-lod";

describe("GeoWorld G5 — pickBorderTier: переключение ЦЕЛОГО датасета по дистанции камеры", () => {
  it("издалека — грубые границы (110m)", () => {
    expect(pickBorderTier(10)).toBe("coarse");
  });

  it("вблизи — детальные границы (50m)", () => {
    expect(pickBorderTier(1.2)).toBe("medium");
  });

  it("граница переключения — детерминирована, не дребезжит на равных значениях", () => {
    expect(pickBorderTier(2.5)).toBe(pickBorderTier(2.5));
  });
});

describe("GeoWorld G5 — maxVisibleScaleRank: больше городов видно при приближении", () => {
  it("очень далеко — ничего не подписываем (-1, чистая Земля)", () => {
    expect(maxVisibleScaleRank(10)).toBe(-1);
  });

  it("монотонно растёт по мере приближения (никогда не показывает МЕНЬШЕ городов при большем приближении)", () => {
    const distances = [10, 5, 3, 2, 1.5, 1, 0.5];
    const ranks = distances.map(maxVisibleScaleRank);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });

  it("вплотную к поверхности — максимальный ранг (все доступные в датасете)", () => {
    expect(maxVisibleScaleRank(0.1)).toBe(10);
  });
});

describe("GeoWorld G5 — isFacingCamera: та же идея видимости полусферы, что в tile-lod.ts", () => {
  // Камера ставится РОВНО в направлении latLngToUnitVec3 (тот же приём, что
  // cameraTowards в tile-lod.test.ts) — исключает ручные ошибки в подборе
  // координат камеры под конкретную точку.
  function cameraTowards(lat: number, lng: number, distance: number): Vec3 {
    const [dx, dy, dz] = latLngToUnitVec3(lat, lng);
    return [dx * distance, dy * distance, dz * distance];
  }

  it("точка прямо под камерой — считается видимой", () => {
    const cameraPos = cameraTowards(0, 90, 3);
    expect(isFacingCamera(0, 90, cameraPos)).toBe(true);
  });

  it("точка на противоположной стороне глобуса — не видна", () => {
    const cameraPos = cameraTowards(0, 90, 3);
    expect(isFacingCamera(0, -90, cameraPos)).toBe(false); // антипод (lng сдвинут на 180°)
  });

  it("не даёт NaN/исключений на нулевом векторе камеры (защита от деления на 0)", () => {
    expect(() => isFacingCamera(0, 0, [0, 0, 0])).not.toThrow();
  });
});
