export type TileStatus = "requested" | "loading" | "ready" | "error";

export interface TileCacheEntry<T> {
  status: TileStatus;
  data: T | null;
  controller: AbortController;
}

// Данные тайла МОГУТ владеть реальным ресурсом, который нужно явно
// освободить при вытеснении (декодированное изображение, GPU-текстура) —
// TileCache не знает и не должен знать конкретный тип T (G2 использует
// TileCache<TileData-заглушка>, G3 — TileCache<TileData-с-картинкой>), поэтому
// проверяем структурно: если у данных ЕСТЬ метод dispose(), вызываем его.
export function disposeIfPossible(data: unknown): void {
  if (data && typeof (data as { dispose?: unknown }).dispose === "function") {
    (data as { dispose: () => void }).dispose();
  }
}

/**
 * Ограниченный по размеру кэш с вытеснением "давно не использовавшихся"
 * записей (LRU). Обязателен по спецификации G2: глубина LOD растёт
 * экспоненциально, поэтому число КОГДА-ЛИБО увиденных тайлов неограничено,
 * но одновременно в памяти держим только ограниченное число записей.
 *
 * Вытеснение самой старой записи отменяет её AbortController, если она ещё
 * в полёте (loading/requested) — это осознанно безопасно: если тайл настолько
 * давно не использовался, что стал кандидатом на вытеснение, отмена его
 * загрузки не наблюдаема пользователем (он всё равно не смотрит туда), а при
 * повторной необходимости LOD-движок просто перезапросит тайл заново. Если
 * вытесняемая запись уже ГОТОВА (ready) и её данные владеют ресурсом
 * (GPU-текстура/декодированная картинка) — вызывается dispose(), иначе
 * вытеснение "холодных" тайлов реального провайдера в G3+ было бы утечкой.
 */
export class TileCache<T> {
  private map = new Map<string, TileCacheEntry<T>>();

  constructor(private readonly maxSize: number = 200) {}

  get(key: string): TileCacheEntry<T> | undefined {
    const entry = this.map.get(key);
    if (entry) {
      // Map хранит порядок вставки — переставляя запись в конец, помечаем
      // её "недавно использованной" для LRU-вытеснения.
      this.map.delete(key);
      this.map.set(key, entry);
    }
    return entry;
  }

  set(key: string, entry: TileCacheEntry<T>): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, entry);
    this.evictIfNeeded();
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  isReady(key: string): boolean {
    return this.map.get(key)?.status === "ready";
  }

  size(): number {
    return this.map.size;
  }

  values(): IterableIterator<TileCacheEntry<T>> {
    return this.map.values();
  }

  private evictIfNeeded(): void {
    while (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      const entry = this.map.get(oldestKey);
      if (entry) {
        if (entry.status === "loading" || entry.status === "requested") {
          entry.controller.abort();
        } else if (entry.status === "ready") {
          disposeIfPossible(entry.data);
        }
      }
      this.map.delete(oldestKey);
    }
  }
}
