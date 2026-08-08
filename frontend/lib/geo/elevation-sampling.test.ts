import { describe, expect, it } from "vitest";
import type { ElevationTileData } from "./elevation-provider";
import {
  DEFAULT_EXAGGERATION,
  EARTH_RADIUS_METERS,
  EXAGGERATION_PRESETS,
  applyExaggeration,
  clampSeaLevel,
  elevationToSceneRadius,
  metersToSceneUnits,
  sampleElevation,
} from "./elevation-sampling";

function grid(values: number[], width: number, height: number, bounds = { latMin: 0, latMax: 10, lngMin: 0, lngMax: 10 }): ElevationTileData {
  return { heights: new Float32Array(values), width, height, bounds };
}

describe("GeoWorld G4 — clampSeaLevel: только суша, океан на уровне моря", () => {
  it("отрицательная высота (батиметрия) обрезается до 0", () => {
    expect(clampSeaLevel(-5000)).toBe(0);
    expect(clampSeaLevel(-0.001)).toBe(0);
  });

  it("положительная высота не трогается", () => {
    expect(clampSeaLevel(8849)).toBe(8849);
    expect(clampSeaLevel(0)).toBe(0);
  });
});

describe("GeoWorld G4 — applyExaggeration / metersToSceneUnits / elevationToSceneRadius", () => {
  it("экзагерация — простое умножение, реалистичный пресет = 1× (без изменений)", () => {
    expect(applyExaggeration(1000, EXAGGERATION_PRESETS.realistic)).toBe(1000);
    expect(applyExaggeration(1000, EXAGGERATION_PRESETS.educational)).toBe(15000);
  });

  it("перевод в единицы сцены пропорционален отношению к радиусу Земли", () => {
    expect(metersToSceneUnits(EARTH_RADIUS_METERS, 1)).toBeCloseTo(1, 10); // высота = радиус Земли → 1 полный юнит при baseRadius=1
    expect(metersToSceneUnits(0, 1)).toBe(0);
  });

  it("elevationToSceneRadius для уровня моря (0м) возвращает ровно базовый радиус", () => {
    expect(elevationToSceneRadius(0, 1, DEFAULT_EXAGGERATION)).toBe(1);
  });

  it("elevationToSceneRadius для отрицательной высоты (океан) тоже даёт базовый радиус — не проваливается ниже коры", () => {
    expect(elevationToSceneRadius(-3000, 1, DEFAULT_EXAGGERATION)).toBe(1);
  });

  it("elevationToSceneRadius растёт с высотой и с экзагерацией", () => {
    const low = elevationToSceneRadius(1000, 1, EXAGGERATION_PRESETS.realistic);
    const high = elevationToSceneRadius(1000, 1, EXAGGERATION_PRESETS.enhanced);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(1); // положительная высота всегда поднимает вершину НАД базовым радиусом
  });

  it("Эверест с образовательной экзагерацией даёт заметный, но не абсурдный подъём (доли процента радиуса)", () => {
    const r = elevationToSceneRadius(8849, 1, DEFAULT_EXAGGERATION);
    const bump = r - 1;
    expect(bump).toBeGreaterThan(0.005); // заметно
    expect(bump).toBeLessThan(0.05); // не фантастическая гора
  });
});

describe("GeoWorld G4 — sampleElevation: билинейная выборка", () => {
  it("в узле сетки возвращает точное значение узла", () => {
    // 2×2 сетка: 0,10 / 20,30 (row-major, строка 0 = север/latMax)
    const data = grid([0, 10, 20, 30], 2, 2);
    expect(sampleElevation(data, 10, 0)).toBeCloseTo(0, 5); // (latMax, lngMin) = h00
    expect(sampleElevation(data, 10, 10)).toBeCloseTo(10, 5); // (latMax, lngMax) = h10
    expect(sampleElevation(data, 0, 0)).toBeCloseTo(20, 5); // (latMin, lngMin) = h01
    expect(sampleElevation(data, 0, 10)).toBeCloseTo(30, 5); // (latMin, lngMax) = h11
  });

  it("в центре — среднее всех четырёх узлов (билинейная интерполяция)", () => {
    const data = grid([0, 10, 20, 30], 2, 2);
    expect(sampleElevation(data, 5, 5)).toBeCloseTo(15, 5);
  });

  it("точки за пределами границ зажимаются к краю, не экстраполируются в NaN/бесконечность", () => {
    const data = grid([0, 10, 20, 30], 2, 2);
    expect(Number.isFinite(sampleElevation(data, 999, 999))).toBe(true);
    expect(Number.isFinite(sampleElevation(data, -999, -999))).toBe(true);
  });

  it("однородная сетка даёт постоянное значение в любой точке", () => {
    const data = grid(new Array(16).fill(500), 4, 4);
    expect(sampleElevation(data, 3, 3)).toBeCloseTo(500, 5);
    expect(sampleElevation(data, 7, 8)).toBeCloseTo(500, 5);
  });
});
