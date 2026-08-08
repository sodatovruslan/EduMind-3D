import type { TileBounds } from "./tiling";

/**
 * Декодированная сетка высот одного тайла источника данных. heights —
 * построчный (row-major) массив в метрах, ДО экзагерации/клампа уровня
 * моря — сырые физически корректные данные остаются источником истины,
 * визуальные эффекты применяются отдельно (см. elevation-sampling.ts).
 */
export interface ElevationTileData {
  heights: Float32Array;
  width: number;
  height: number;
  /** Реальные географические границы ЭТОЙ сетки — могут отличаться от границ запрошенного тайла (см. ElevationProvider.requestElevation). */
  bounds: TileBounds;
  attribution?: string;
  dispose?: () => void;
}

/**
 * Контракт источника высот — НАМЕРЕННО НЕ похож на TileDataProvider<T>
 * (который работает по внутреннему TileId). Общий язык между рельефом и
 * тайловой/LOD-системой — географические границы (bounds), а не id
 * конкретной адресной схемы: у карт высот может быть своя сетка (у
 * Terrarium — Web Mercator, отличная и от нашей geodetic-квадротрёх, и от
 * схемы NASA GIBS), и это не должно просачиваться выше уровня адаптера.
 */
export interface ElevationProvider {
  requestElevation(bounds: TileBounds, signal: AbortSignal): Promise<ElevationTileData>;
}
