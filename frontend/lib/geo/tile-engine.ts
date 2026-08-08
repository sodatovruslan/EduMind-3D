import { TileCache, type TileCacheEntry } from "./tile-cache";
import { DEFAULT_LOD_POLICY, selectTiles, type LodPolicy, type SelectedTile, type Vec3 } from "./tile-lod";
import { tileKey, type TileId } from "./tiling";
import type { TileData, TileProvider } from "./tile-provider";

export interface TileEngineStats {
  /** Сколько тайлов рендерится в этом кадре (после LOD/видимости). */
  visibleCount: number;
  /** Сколько записей сейчас в кэше (любого статуса). */
  loadedCount: number;
  /** Максимальный уровень детализации среди отрендеренных тайлов. */
  maxActiveLod: number;
}

export interface TileEngineFrame {
  rendered: SelectedTile[];
  /** Данные готовых тайлов из числа rendered — ключ = SelectedTile.key. */
  tiles: Map<string, TileData>;
  stats: TileEngineStats;
}

/**
 * Склеивает чистую LOD-логику (tile-lod.ts), провайдера данных и кэш в один
 * тикаемый объект. Единственная точка, которая знает и про "что хотим
 * показать" (LOD-политика), и про "что реально готово" (кэш) — вызывающий
 * React-слой (TileDebugLayer) вызывает tick(cameraPos) раз в
 * тик-интервал и получает готовый к рендеру список.
 */
export class TileEngine {
  private cache: TileCache<TileData>;

  constructor(
    private readonly provider: TileProvider,
    private readonly policy: LodPolicy = DEFAULT_LOD_POLICY,
    cacheSize = 200
  ) {
    this.cache = new TileCache<TileData>(cacheSize);
  }

  private isReady = (key: string): boolean => this.cache.isReady(key);

  private ensureRequested(id: TileId): void {
    const key = tileKey(id);
    if (this.cache.has(key)) return; // уже запрошен/грузится/готов/упал — не дублируем

    const controller = new AbortController();
    const entry: TileCacheEntry<TileData> = { status: "loading", data: null, controller };
    this.cache.set(key, entry);

    this.provider
      .requestTile(id, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return; // устаревший запрос — результат игнорируем
        const current = this.cache.get(key);
        // Запись могла быть вытеснена и переспрошена заново (другой
        // controller) — применяем результат ТОЛЬКО к "своей" записи.
        if (!current || current.controller !== controller) return;
        current.status = "ready";
        current.data = data;
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        const current = this.cache.get(key);
        if (!current || current.controller !== controller) return;
        current.status = "error";
      });
  }

  /** Один "тик" движка: решает LOD, запрашивает недостающее, возвращает кадр для рендера. */
  tick(cameraPos: Vec3): TileEngineFrame {
    const { rendered, pending } = selectTiles(cameraPos, this.isReady, this.policy);
    pending.forEach((id) => this.ensureRequested(id));

    const tiles = new Map<string, TileData>();
    let maxActiveLod = 0;
    for (const t of rendered) {
      const entry = this.cache.get(t.key);
      if (entry?.status === "ready" && entry.data) {
        tiles.set(t.key, entry.data);
      }
      maxActiveLod = Math.max(maxActiveLod, t.id.z);
    }

    return {
      rendered,
      tiles,
      stats: {
        visibleCount: rendered.length,
        loadedCount: this.cache.size(),
        maxActiveLod,
      },
    };
  }

  /** Отменяет все запросы в полёте — вызывать при размонтировании владеющего компонента. */
  dispose(): void {
    for (const entry of this.cache.values()) {
      if (entry.status === "loading" || entry.status === "requested") {
        entry.controller.abort();
      }
    }
  }
}
