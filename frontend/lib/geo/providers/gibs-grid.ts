import type { TileBounds } from "../tiling";

// Точная сетка WMTS EPSG:4326 NASA GIBS для TileMatrixSet "500m" (то, что
// использует слой BlueMarble_NextGeneration) — извлечена ЭМПИРИЧЕСКИ из
// реального GetCapabilities (https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml),
// не приблизительно. НЕ совпадает с нашей внутренней geodetic-квадротрёх
// схемой (`tiling.ts`: cols=2^(z+1), rows=2^z) — у GIBS первые уровни
// нерегулярны (2×1 → 3×2 → 5×3), чистое удвоение начинается только с z=3:
//
//   z=0:  2×1     z=1:  3×2     z=2:  5×3     z=3: 10×5
//   z=4: 20×10    z=5: 40×20    z=6: 80×40    z=7: 160×80
//
// TopLeftCorner всегда (-180, 90), тайл всегда 512×512px — это то, что
// делает адаптер вообще возможным без искажения нашей внутренней схемы:
// мы НЕ подгоняем свою квадротрёх под эту сетку, а вычисляем, какой
// конкретно тайл GIBS покрывает нужную нам географическую точку/охват, и
// используем РЕАЛЬНЫЕ границы этого тайла (не наши) для текстурирования.
export interface GibsGridLevel {
  z: number;
  matrixWidth: number;
  matrixHeight: number;
}

export const GIBS_500M_LEVELS: readonly GibsGridLevel[] = [
  { z: 0, matrixWidth: 2, matrixHeight: 1 },
  { z: 1, matrixWidth: 3, matrixHeight: 2 },
  { z: 2, matrixWidth: 5, matrixHeight: 3 },
  { z: 3, matrixWidth: 10, matrixHeight: 5 },
  { z: 4, matrixWidth: 20, matrixHeight: 10 },
  { z: 5, matrixWidth: 40, matrixHeight: 20 },
  { z: 6, matrixWidth: 80, matrixHeight: 40 },
  { z: 7, matrixWidth: 160, matrixHeight: 80 },
];

export const GIBS_MAX_LEVEL = GIBS_500M_LEVELS.length - 1;
export const GIBS_TILE_PX = 512;
const TOP_LEFT_LAT = 90;
const TOP_LEFT_LNG = -180;

function levelInfo(z: number): GibsGridLevel {
  const clamped = Math.max(0, Math.min(GIBS_MAX_LEVEL, Math.round(z)));
  return GIBS_500M_LEVELS[clamped];
}

export function gibsLngSpan(z: number): number {
  return 360 / levelInfo(z).matrixWidth;
}

export function gibsLatSpan(z: number): number {
  return 180 / levelInfo(z).matrixHeight;
}

export interface GibsTileRef {
  z: number;
  row: number;
  col: number;
}

/** Какой конкретно тайл GIBS на уровне z содержит точку (lat,lng). */
export function gibsTileForLatLng(z: number, lat: number, lng: number): GibsTileRef {
  const info = levelInfo(z);
  const lngSpan = 360 / info.matrixWidth;
  const latSpan = 180 / info.matrixHeight;
  const col = Math.max(0, Math.min(info.matrixWidth - 1, Math.floor((lng - TOP_LEFT_LNG) / lngSpan)));
  const row = Math.max(0, Math.min(info.matrixHeight - 1, Math.floor((TOP_LEFT_LAT - lat) / latSpan)));
  return { z: info.z, row, col };
}

/** Реальные географические границы конкретного тайла GIBS — НЕ наши внутренние границы. */
export function gibsTileBounds(ref: GibsTileRef): TileBounds {
  const info = levelInfo(ref.z);
  const lngSpan = 360 / info.matrixWidth;
  const latSpan = 180 / info.matrixHeight;
  const lngMin = TOP_LEFT_LNG + ref.col * lngSpan;
  const latMax = TOP_LEFT_LAT - ref.row * latSpan;
  return {
    lngMin,
    lngMax: lngMin + lngSpan,
    latMin: latMax - latSpan,
    latMax,
  };
}

/**
 * Подбирает уровень GIBS, чей тайл РАВЕН ИЛИ МЕЛЬЧЕ желаемого углового
 * охвата (не грубее) — чтобы не апскейлить размытую картинку сверх
 * необходимого, но и не запрашивать бессмысленно глубже, чем реально
 * нужно нашему внутреннему LOD. Ограничено maxLevel (реальный потолок
 * разрешения провайдера — НЕ выдумываем детализацию сверх того, что он
 * фактически предоставляет).
 */
export function pickGibsLevel(desiredDegSpan: number, maxLevel: number = GIBS_MAX_LEVEL): number {
  const cap = Math.max(0, Math.min(GIBS_MAX_LEVEL, maxLevel));
  for (let z = 0; z <= cap; z++) {
    const span = Math.max(gibsLngSpan(z), gibsLatSpan(z));
    if (span <= desiredDegSpan) return z;
  }
  return cap;
}

export function buildGibsTileUrl(layer: string, tileMatrixSet: string, ref: GibsTileRef, format: "jpeg" | "png" = "jpeg"): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${tileMatrixSet}/${ref.z}/${ref.row}/${ref.col}.${format}`;
}
