import type { ElevationTileData } from "./elevation-provider";

/** Средний радиус Земли в метрах — единственная константа перевода метров высоты в единицы сцены (crust radius = 1 юнит = этот радиус). */
export const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Пресеты визуальной экзагерации рельефа (см. GEOWORLD_ROADMAP.md, раздел
 * G4 "Elevation exaggeration"). Реальный перепад высот ничтожен относительно
 * радиуса планеты — Эверест (8849м) на масштабе сцены дал бы бугорок высотой
 * ~0.0014 юнита при radius=1, невидимый на глаз. Экзагерация — ЧИСТО
 * визуальный множитель поверх физически корректных сырых данных, НЕ
 * записывается обратно в сами данные высот.
 */
export const EXAGGERATION_PRESETS = {
  realistic: 1,
  educational: 15,
  enhanced: 30,
} as const;

export type ExaggerationPreset = keyof typeof EXAGGERATION_PRESETS;

export const DEFAULT_EXAGGERATION = EXAGGERATION_PRESETS.educational;

/**
 * G4 — только суша: отрицательная высота (батиметрия океана) обрезается
 * до 0, поверхность океана остаётся на базовом радиусе коры (уровень моря).
 * Не выдумываем детальный рельеф океанского дна — не то, для чего эта
 * стадия и источник данных предназначены (см. явное указание в ТЗ G4).
 */
export function clampSeaLevel(meters: number): number {
  return Math.max(0, meters);
}

export function applyExaggeration(meters: number, factor: number): number {
  return meters * factor;
}

/** Метры высоты (после клампа/экзагерации) → безразмерные единицы сцены, относительно заданного базового радиуса. */
export function metersToSceneUnits(meters: number, baseRadius: number): number {
  return (meters / EARTH_RADIUS_METERS) * baseRadius;
}

/**
 * Полный, физически осмысленный путь от сырой высоты в метрах до
 * итогового радиуса вершины сцены: кламп уровня моря → экзагерация →
 * перевод в единицы сцены → прибавление к базовому радиусу коры.
 */
export function elevationToSceneRadius(rawMeters: number, baseRadius: number, exaggeration: number): number {
  const clamped = clampSeaLevel(rawMeters);
  const exaggerated = applyExaggeration(clamped, exaggeration);
  return baseRadius + metersToSceneUnits(exaggerated, baseRadius);
}

/**
 * Билинейная выборка высоты в точке (lat,lng) из сетки данных тайла.
 * Точки за пределами границ сетки зажимаются к краю (clamp), а не
 * экстраполируются — соседний тайл сам отвечает за свою территорию.
 */
export function sampleElevation(data: ElevationTileData, lat: number, lng: number): number {
  const { bounds, heights, width, height } = data;
  const u = (lng - bounds.lngMin) / (bounds.lngMax - bounds.lngMin);
  // lat растёт к северу, а строки сетки (как и в любом растровом изображении) — сверху вниз, т.е. строка 0 = north (latMax)
  const v = (bounds.latMax - lat) / (bounds.latMax - bounds.latMin);

  const fx = clamp01(u) * (width - 1);
  const fy = clamp01(v) * (height - 1);

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const h00 = heights[y0 * width + x0];
  const h10 = heights[y0 * width + x1];
  const h01 = heights[y1 * width + x0];
  const h11 = heights[y1 * width + x1];

  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * ty;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
