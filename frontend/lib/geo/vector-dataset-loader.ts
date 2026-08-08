/**
 * Простой загрузчик "весь датасет целиком, по одному из нескольких
 * фиксированных ключей" (например, tier "coarse"/"medium") — НЕ TileEngine.
 * Границы стран и подписи городов не тайлятся по квадротрёх (см.
 * geo-vector-lod.ts за обоснованием) — на источник данных здесь всего 2-3
 * возможных ключа за всё время жизни страницы, каждый запрашивается не
 * более одного раза и кэшируется НАВСЕГДА (сами данные не устаревают —
 * границы стран не меняются в рамках сессии пользователя). Дедупликация
 * параллельных запросов одного и того же ключа — обязательна (LOD может
 * попросить один и тот же tier дважды подряд на соседних тиках, пока первый
 * запрос ещё не отработал).
 */
export interface VectorDatasetLoaderOptions {
  fetchImpl?: typeof fetch;
}

export class VectorDatasetLoader<T> {
  private cache = new Map<string, T>();
  private inFlight = new Map<string, { promise: Promise<T>; controller: AbortController }>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly urlFor: (key: string) => string, options: VectorDatasetLoaderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isCached(key: string): boolean {
    return this.cache.has(key);
  }

  getCached(key: string): T | undefined {
    return this.cache.get(key);
  }

  /** Возвращает уже закэшированные данные синхронно, либо запускает (или переиспользует уже идущий) запрос. */
  load(key: string): Promise<T> {
    const cached = this.cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    const existing = this.inFlight.get(key);
    if (existing) return existing.promise; // не дублируем параллельный запрос того же ключа

    const controller = new AbortController();
    const promise = this.fetchImpl(this.urlFor(key), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Vector dataset request failed: HTTP ${response.status} for key "${key}"`);
        }
        return response.json() as Promise<T>;
      })
      .then((data) => {
        this.cache.set(key, data);
        this.inFlight.delete(key);
        return data;
      })
      .catch((err) => {
        this.inFlight.delete(key);
        throw err;
      });

    this.inFlight.set(key, { promise, controller });
    return promise;
  }

  /** Отменяет все запросы в полёте — вызывать при размонтировании владеющего компонента. */
  dispose(): void {
    for (const { controller } of this.inFlight.values()) controller.abort();
    this.inFlight.clear();
  }
}
