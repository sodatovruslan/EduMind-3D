import type { TileDataProvider } from "./tile-engine";
import { tileBounds, type TileId } from "./tiling";
import type { ElevationProvider, ElevationTileData } from "./elevation-provider";

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
    return this.provider.requestElevation(tileBounds(id), signal);
  }
}
