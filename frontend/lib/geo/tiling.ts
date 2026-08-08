// GeoWorld G2 — тайловая адресация: geodetic-схема (широта/долгота), НЕ
// cube-sphere. Выбор обоснован в GEOWORLD_ROADMAP.md (раздел G2); коротко:
// почти все открытые источники растровых снимков/рельефа публикуют данные
// в виде lat/lng (или производной от неё, Web Mercator) XYZ-плиток — эта
// схема напрямую совместима с ними без репроекции в G3+, а также
// напрямую переиспользует существующую формулу координат сцены
// (lib/geo/coordinates.ts), не заводя вторую систему координат.

export interface TileId {
  /** Уровень детализации. 0 = вся Земля (в виде 2 корневых тайлов). */
  z: number;
  /** Индекс столбца (долгота), оборачивается по модулю — у долготы нет края. */
  x: number;
  /** Индекс строки (широта), 0 = самая северная строка. Полюса — реальный край, не оборачивается. */
  y: number;
}

export interface TileBounds {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

/** Число столбцов на уровне z. Растёт вдвое каждый уровень, начиная с 2 на z=0. */
export function colsAtLevel(z: number): number {
  return 2 ** (z + 1);
}

/** Число строк на уровне z. Растёт вдвое каждый уровень, начиная с 1 на z=0. */
export function rowsAtLevel(z: number): number {
  return 2 ** z;
}

/** Оборачивает индекс столбца по долготе (запад/восток стыкуются на сфере). */
export function wrapX(x: number, z: number): number {
  const cols = colsAtLevel(z);
  return ((x % cols) + cols) % cols;
}

export function normalizeTile(id: TileId): TileId {
  return { z: id.z, x: wrapX(id.x, id.z), y: id.y };
}

export function tileKey(id: TileId): string {
  return `${id.z}/${id.x}/${id.y}`;
}

export function parseTileKey(key: string): TileId {
  const parts = key.split("/").map(Number);
  return { z: parts[0], x: parts[1], y: parts[2] };
}

/** Родитель тайла, либо null для корневого уровня (z=0). */
export function parentOf(id: TileId): TileId | null {
  if (id.z <= 0) return null;
  return normalizeTile({ z: id.z - 1, x: Math.floor(id.x / 2), y: Math.floor(id.y / 2) });
}

/** Ровно 4 потомка тайла на следующем уровне детализации. */
export function childrenOf(id: TileId): [TileId, TileId, TileId, TileId] {
  const z = id.z + 1;
  const x = id.x * 2;
  const y = id.y * 2;
  return [
    normalizeTile({ z, x, y }),
    normalizeTile({ z, x: x + 1, y }),
    normalizeTile({ z, x, y: y + 1 }),
    normalizeTile({ z, x: x + 1, y: y + 1 }),
  ];
}

/** Географические границы тайла в градусах. */
export function tileBounds(id: TileId): TileBounds {
  const cols = colsAtLevel(id.z);
  const rows = rowsAtLevel(id.z);
  const lngSpan = 360 / cols;
  const latSpan = 180 / rows;
  const lngMin = -180 + id.x * lngSpan;
  const latMax = 90 - id.y * latSpan;
  return {
    lngMin,
    lngMax: lngMin + lngSpan,
    latMin: latMax - latSpan,
    latMax,
  };
}

export function tileCenter(id: TileId): { lat: number; lng: number } {
  const b = tileBounds(id);
  return { lat: (b.latMin + b.latMax) / 2, lng: (b.lngMin + b.lngMax) / 2 };
}

/** Корневой уровень — 2 тайла (западное/восточное полушарие), вместе покрывают всю планету. */
export const ROOT_TILES: TileId[] = [
  { z: 0, x: 0, y: 0 },
  { z: 0, x: 1, y: 0 },
];
