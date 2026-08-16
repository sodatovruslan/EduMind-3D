import { describe, expect, it } from "vitest";
import { isFacingCamera, maxVisibleScaleRank, pickBorderTier, selectVisibleCities, type RankedCity } from "./geo-vector-lod";
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

describe("GeoWorld G6 — selectVisibleCities: приоритет столиц + жёсткий потолок", () => {
  function cameraTowards(lat: number, lng: number, distance: number): Vec3 {
    const [dx, dy, dz] = latLngToUnitVec3(lat, lng);
    return [dx * distance, dy * distance, dz * distance];
  }

  it("столица появляется на ~2 ранга раньше обычного города того же ранга", () => {
    const cam = cameraTowards(0, 0, 2.7); // maxVisibleScaleRank(2.7) === 0
    const capital: RankedCity = { key: "capital", lat: 0, lng: 0, scaleRank: 2, isCapital: true };
    const regular: RankedCity = { key: "regular", lat: 0, lng: 0, scaleRank: 2, isCapital: false };
    const selected = selectVisibleCities([capital, regular], 2.7, cam, 10);
    expect(selected.map((c) => c.key)).toContain("capital");
    expect(selected.map((c) => c.key)).not.toContain("regular");
  });

  it("столицы идут первыми при обрезании по потолку maxCount", () => {
    const cam = cameraTowards(0, 0, 0.5); // вплотную — maxVisibleScaleRank(0.5) === 10, все проходят по рангу
    const cities: RankedCity[] = [
      { key: "regular-1", lat: 0, lng: 0, scaleRank: 1, isCapital: false },
      { key: "capital-1", lat: 0, lng: 0, scaleRank: 5, isCapital: true },
      { key: "regular-2", lat: 0, lng: 0, scaleRank: 1, isCapital: false },
    ];
    const selected = selectVisibleCities(cities, 0.5, cam, 1);
    expect(selected).toHaveLength(1);
    expect(selected[0].key).toBe("capital-1");
  });

  it("не превышает maxCount даже когда кандидатов больше", () => {
    const cam = cameraTowards(0, 0, 0.5);
    const cities: RankedCity[] = Array.from({ length: 20 }, (_, i) => ({ key: `c${i}`, lat: 0, lng: 0, scaleRank: 0, isCapital: false }));
    expect(selectVisibleCities(cities, 0.5, cam, 5)).toHaveLength(5);
  });

  it("город на дальней стороне глобуса не попадает в выборку, даже будучи столицей", () => {
    const cam = cameraTowards(0, 90, 3);
    const antipodeCapital: RankedCity = { key: "far-capital", lat: 0, lng: -90, scaleRank: 0, isCapital: true };
    expect(selectVisibleCities([antipodeCapital], 3, cam, 10)).toHaveLength(0);
  });
});
