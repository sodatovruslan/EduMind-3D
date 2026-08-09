import { TileCache, disposeIfPossible, type TileCacheEntry } from "./tile-cache";
import { DEFAULT_LOD_POLICY, selectTiles, type LodPolicy, type SelectedTile, type Vec3 } from "./tile-lod";
import { tileKey, type TileId } from "./tiling";

export interface TileEngineStats {
  /** Сколько тайлов рендерится в этом кадре (после LOD/видимости). */
  visibleCount: number;
  /** Сколько записей сейчас в кэше (любого статуса). */
  loadedCount: number;
  /** Максимальный уровень детализации среди отрендеренных тайлов. */
  maxActiveLod: number;
  /** Сколько тайлов упало с ошибкой (сеть/декодирование) — видно только в debug. */
  failedCount: number;
  /** Сколько запросов реально в полёте прямо сейчас (не считая ожидающих своей очереди из-за лимита конкурентности). */
  activeRequestCount: number;
}

export interface TileEngineFrame<T> {
  rendered: SelectedTile[];
  /** Данные готовых тайлов из числа rendered — ключ = SelectedTile.key. */
  tiles: Map<string, T>;
  stats: TileEngineStats;
}

/**
 * Минимальный контракт, который требуется от любого провайдера, чтобы им
 * мог управлять TileEngine — G3 (растровые снимки) и G4 (карта высот)
 * подставляют СВОЙ тип данных T, не деля между собой ни кэш, ни очередь
 * запросов (см. GEOWORLD_ROADMAP.md, раздел G4 "Do NOT couple imagery and
 * elevation providers") — но переиспользуют этот же, уже проверенный,
 * LOD/кэш/конкурентность/dispose механизм, вместо того чтобы копировать его.
 */
export interface TileDataProvider<T> {
  requestTile(id: TileId, signal: AbortSignal): Promise<T>;
}

/**
 * Склеивает чистую LOD-логику (tile-lod.ts), провайдера данных и кэш в один
 * тикаемый объект. Единственная точка, которая знает и про "что хотим
 * показать" (LOD-политика), и про "что реально готово" (кэш) — вызывающий
 * React-слой вызывает tick(cameraPos) раз в тик-интервал и получает готовый
 * к рендеру список. Параметризован типом данных тайла (T) — сам движок не
 * знает и не должен знать, что именно возит: цвет-заглушку (G2), снимок
 * (G3) или сетку высот (G4).
 */
export class TileEngine<T> {
  private cache: TileCache<T>;
  private activeRequestCount = 0;
  // G6.5: раньше `if (this.cache.has(key)) return;` блокировал ЛЮБОЙ
  // повторный запрос навсегда, включая статус "error" — упавший однажды
  // тайл (сетевая заминка, временная недоступность провайдера) оставался
  // "FAILED" до конца сессии страницы, даже если причина была разовой. Счёт
  // попыток на тайл — не бесконечный ретрай (не заваливаем провайдера
  // одним и тем же мёртвым запросом навечно), а разовое право на 3 попытки,
  // раскиданных по естественным интервалам между тиками (см. tick ниже).
  private readonly retryAttempts = new Map<string, number>();

  constructor(
    private readonly provider: TileDataProvider<T>,
    private readonly policy: LodPolicy = DEFAULT_LOD_POLICY,
    cacheSize = 200,
    // Реальная сеть (G3+) вносит настоящее давление на конкурентность —
    // без лимита резкий зум/поворот мог бы выстрелить десятками
    // одновременных fetch(). 6 — стандартный практический потолок
    // одновременных соединений браузера на один хост, дальше запросы всё
    // равно очередятся самим браузером; ограничиваем на уровне движка,
    // чтобы отдавать приоритет актуальным тайлам, а не FIFO-очереди браузера.
    private readonly maxConcurrentRequests: number = 6,
    private readonly maxRetries: number = 3
  ) {
    this.cache = new TileCache<T>(cacheSize);
  }

  private isReady = (key: string): boolean => this.cache.isReady(key);

  private ensureRequested(id: TileId): void {
    const key = tileKey(id);
    const existing = this.cache.get(key);
    if (existing) {
      if (existing.status !== "error") return; // уже запрошен/грузится/готов — не дублируем
      const attempts = this.retryAttempts.get(key) ?? 0;
      if (attempts >= this.maxRetries) return; // попытки исчерпаны — окончательно "упавший" тайл, не долбим провайдера вечно
      this.retryAttempts.set(key, attempts + 1);
    }
    if (this.activeRequestCount >= this.maxConcurrentRequests) return; // лимит — тайл останется в pending и переспросится на следующем тике

    const controller = new AbortController();
    const entry: TileCacheEntry<T> = { status: "loading", data: null, controller };
    this.cache.set(key, entry);
    this.activeRequestCount++;

    const settle = () => {
      this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);
    };

    this.provider
      .requestTile(id, controller.signal)
      .then((data) => {
        settle();
        if (controller.signal.aborted) return; // устаревший запрос — результат игнорируем
        const current = this.cache.get(key);
        // Запись могла быть вытеснена и переспрошена заново (другой
        // controller) — применяем результат ТОЛЬКО к "своей" записи.
        if (!current || current.controller !== controller) {
          disposeIfPossible(data); // результат никому не принадлежит — не течём GPU-ресурсом
          return;
        }
        current.status = "ready";
        current.data = data;
        this.retryAttempts.delete(key); // успех — счётчик попыток больше не нужен
      })
      .catch(() => {
        settle();
        if (controller.signal.aborted) return;
        const current = this.cache.get(key);
        if (!current || current.controller !== controller) return;
        current.status = "error";
      });
  }

  /** Один "тик" движка: решает LOD, запрашивает недостающее (в пределах лимита конкурентности), возвращает кадр для рендера. */
  tick(cameraPos: Vec3): TileEngineFrame<T> {
    const { rendered, pending } = selectTiles(cameraPos, this.isReady, this.policy);
    pending.forEach((id) => this.ensureRequested(id));

    const tiles = new Map<string, T>();
    let maxActiveLod = 0;
    for (const t of rendered) {
      const entry = this.cache.get(t.key);
      if (entry?.status === "ready" && entry.data) {
        tiles.set(t.key, entry.data);
      }
      maxActiveLod = Math.max(maxActiveLod, t.id.z);
    }

    let failedCount = 0;
    for (const entry of this.cache.values()) {
      if (entry.status === "error") failedCount++;
    }

    return {
      rendered,
      tiles,
      stats: {
        visibleCount: rendered.length,
        loadedCount: this.cache.size(),
        maxActiveLod,
        failedCount,
        activeRequestCount: this.activeRequestCount,
      },
    };
  }

  /** Отменяет всё в полёте и освобождает ресурсы готовых записей — вызывать при размонтировании владеющего компонента. */
  dispose(): void {
    for (const entry of this.cache.values()) {
      if (entry.status === "loading" || entry.status === "requested") {
        entry.controller.abort();
      } else if (entry.status === "ready") {
        disposeIfPossible(entry.data);
      }
    }
  }
}
