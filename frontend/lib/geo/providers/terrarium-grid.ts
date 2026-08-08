import type { TileBounds } from "../tiling";

// Terrarium-тайлы высот (AWS Open Data, elevation-tiles-prod, изначально
// Mapzen/Tilezen "Joerd") используют СТАНДАРТНУЮ Web Mercator XYZ-схему
// (EPSG:3857) — НЕ нашу внутреннюю geodetic-квадротрёх (`tiling.ts`) и НЕ
// схему GIBS (`gibs-grid.ts`). Формулы здесь — классическая прямая/обратная
// проекция Web Mercator, тот же алгоритм, что использует любой стандартный
// XYZ-тайл-сервер (OSM, Mapbox и т.д.).

export interface TerrariumTileRef {
  z: number;
  x: number;
  y: number;
}

const MAX_MERCATOR_LAT = 85.05112878; // стандартный предел Web Mercator — за этим широта уходит в бесконечность проекции

function clampLat(lat: number): number {
  return Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
}

export function terrariumTileForLatLng(z: number, lat: number, lng: number): TerrariumTileRef {
  const n = 2 ** z;
  const clampedLat = clampLat(lat);
  const x = Math.max(0, Math.min(n - 1, Math.floor(((lng + 180) / 360) * n)));
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.max(
    0,
    Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n))
  );
  return { z, x, y };
}

export function terrariumTileBounds(ref: TerrariumTileRef): TileBounds {
  const n = 2 ** ref.z;
  const lngMin = (ref.x / n) * 360 - 180;
  const lngMax = ((ref.x + 1) / n) * 360 - 180;
  const latMax = mercatorYToLat(ref.y, n);
  const latMin = mercatorYToLat(ref.y + 1, n);
  return { lngMin, lngMax, latMin, latMax };
}

function mercatorYToLat(y: number, n: number): number {
  const t = Math.PI * (1 - (2 * y) / n);
  return (Math.atan(Math.sinh(t)) * 180) / Math.PI;
}

/**
 * Подбирает уровень Terrarium, чей тайл на ДАННОЙ ШИРОТЕ не грубее
 * желаемого углового охвата. В отличие от GIBS-таблицы, размер тайла в
 * градусах у Web Mercator зависит от широты (полярное растяжение
 * проекции) — поэтому уровень подбирается через реальный расчёт границ
 * тайла в конкретной точке, а не через статичную таблицу.
 */
export function pickTerrariumLevel(lat: number, desiredDegSpan: number, maxLevel: number): number {
  const cap = Math.max(0, maxLevel);
  for (let z = 0; z <= cap; z++) {
    const ref = terrariumTileForLatLng(z, lat, 0);
    const b = terrariumTileBounds(ref);
    const span = Math.max(b.lngMax - b.lngMin, b.latMax - b.latMin);
    if (span <= desiredDegSpan) return z;
  }
  return cap;
}

export function buildTerrariumTileUrl(ref: TerrariumTileRef): string {
  return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ref.z}/${ref.x}/${ref.y}.png`;
}

/**
 * Декодирует Terrarium-кодирование высоты из значений пикселя (R,G,B) в
 * метры. Формула — официальная спецификация формата (Mapzen/Tilezen):
 * elevation = (R*256 + G + B/256) - 32768. Смещение 32768 позволяет
 * закодировать отрицательные высоты (батиметрию океана) без отрицательных
 * значений пикселя.
 */
export function decodeTerrariumPixel(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}
