import type { TileDataProvider } from "./tile-engine";
import { tileBounds, type TileBounds, type TileId } from "./tiling";
import type { ElevationProvider, ElevationTileData } from "./elevation-provider";
import { MAX_MERCATOR_LAT } from "./providers/terrarium-grid";

/** Тайл целиком лежит за пределом Web Mercator (±85.05°) — ни одна его точка не адресуема в сетке Terrarium. */
function isFullyBeyondMercator(bounds: TileBounds): boolean {
  return bounds.latMin >= MAX_MERCATOR_LAT || bounds.latMax <= -MAX_MERCATOR_LAT;
}

/**
 * Синтетический "плоский, без рельефа" результат — та же идея, что клamp
 * уровня моря в elevation-sampling.ts (нет данных = равнина, не выдуманная
 * геометрия). Возвращается как УСПЕХ (не ошибка): это не сбой сети, а
 * заранее известное, честно задокументированное ограничение источника
 * данных за полярным кругом (см. GEOWORLD_ROADMAP.md, раздел G6.5,
 * "TERRAIN FAILED" — раньше такие тайлы тратили реальный сетевой запрос,
 * получали HTTP/декодирование-ошибку от Terrarium и засоряли счётчик
 * failedCount постоянной, не туда попадающей записью).
 */
function flatFallback(bounds: TileBounds): ElevationTileData {
  return { heights: new Float32Array([0, 0, 0, 0]), width: 2, height: 2, bounds };
}

/**
 * Единственное место, где встречаются две развязанные абстракции: наша
 * id-адресная тайловая система (TileEngine/TileId) и bounds-адресный
 * ElevationProvider. Позволяет переиспользовать TileEngine (тот же LOD/
 * кэш/конкурентность/dispose механизм, что и у растровых снимков G3) для
 * рельефа, не заставляя ElevationProvider ничего знать о TileId, и не
 * заставляя TileEngine ничего знать о географических границах.
 */
export class ElevationEngineAdapter implements TileDataProvider<ElevationTileData> {
  constructor(private readonly provider: ElevationProvider) {}

  requestTile(id: TileId, signal: AbortSignal): Promise<ElevationTileData> {
    const bounds = tileBounds(id);
    if (isFullyBeyondMercator(bounds)) {
      return Promise.resolve(flatFallback(bounds));
    }
    return this.provider.requestElevation(bounds, signal);
  }
}
