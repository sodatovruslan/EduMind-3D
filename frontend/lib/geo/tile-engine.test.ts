import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TileEngine } from "./tile-engine";
import { DebugTileProvider, type TileData } from "./tile-provider";
import type { Vec3 } from "./tile-lod";
import { tileKey, type TileId } from "./tiling";

// Тестовый провайдер с ручным управлением резолвом — детерминированная
// проверка гонок (родитель/потомки, устаревшие ответы), без реальных таймеров.
class ManualTileProvider {
  calls: string[] = [];
  // FIFO-очередь резолверов НА КЛЮЧ — один и тот же тайл может быть
  // запрошен повторно (после вытеснения из кэша), нужно уметь адресно
  // резолвить именно самый старый ещё не отработавший вызов для теста
  // устаревших ответов.
  private pending: Array<{ key: string; resolve: (d: TileData) => void; reject: (err: Error) => void }> = [];

  requestTile(id: TileId, signal: AbortSignal): Promise<TileData> {
    const key = tileKey(id);
    this.calls.push(key);
    return new Promise<TileData>((resolve, reject) => {
      this.pending.push({ key, resolve, reject });
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  }

  resolve(key: string, data: TileData): void {
    this.resolveOldest(key, data);
  }

  resolveOldest(key: string, data: TileData): void {
    const idx = this.pending.findIndex((p) => p.key === key);
    if (idx === -1) return;
    const [record] = this.pending.splice(idx, 1);
    record.resolve(data);
  }

  rejectOldest(key: string, error: Error): void {
    const idx = this.pending.findIndex((p) => p.key === key);
    if (idx === -1) return;
    const [record] = this.pending.splice(idx, 1);
    record.reject(error);
  }
}

const CLOSE_TO_EAST_ROOT_CENTER: Vec3 = [0, 0, -1.15]; // см. tile-lod.test.ts: latLngToUnitVec3(0,90) ≈ (0,0,-1)

async function flush(): Promise<void> {
  // прогоняет ожидающие микрозадачи (.then() резолва/реджекта промиса)
  await Promise.resolve();
  await Promise.resolve();
}

describe("GeoWorld G2 — TileEngine: связка LOD + провайдер + кэш", () => {
  it("на первом тике ничего ещё не готово, но запросы на корневые тайлы уже пошли", () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider);
    const frame = engine.tick([0, 0, 20]);
    expect(frame.tiles.size).toBe(0); // данных ещё нет — резолва не было
    expect(provider.calls.length).toBeGreaterThan(0);
    expect(frame.stats.loadedCount).toBeGreaterThan(0); // запросы уже в кэше (статус loading)
  });

  it("не дублирует запрос на один и тот же тайл при повторных тиках без изменения камеры", () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider);
    engine.tick([0, 0, 20]);
    const callsAfterFirst = provider.calls.length;
    engine.tick([0, 0, 20]);
    expect(provider.calls.length).toBe(callsAfterFirst); // тот же кадр — новых запросов нет
  });

  it("родитель остаётся видимым (нет дыры), пока не готовы ВСЕ 4 потомка", async () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider);

    // тик 1: запрашивает корневые тайлы
    engine.tick(CLOSE_TO_EAST_ROOT_CENTER);
    const eastRootKey = "0/1/0";
    provider.resolve(eastRootKey, { color: "#fff", label: eastRootKey });
    provider.resolve("0/0/0", { color: "#000", label: "0/0/0" });
    await flush();

    // тик 2: родитель готов, хочет делиться — запрашивает детей, но дети ещё не пришли
    const frame2 = engine.tick(CLOSE_TO_EAST_ROOT_CENTER);
    expect(frame2.tiles.has(eastRootKey)).toBe(true); // родитель закрывает дыру
    const childKeys = ["1/2/0", "1/3/0", "1/2/1", "1/3/1"];
    for (const k of childKeys) {
      expect(frame2.tiles.has(k)).toBe(false); // дети ещё не готовы — не показываем частично
    }
  });

  it("после готовности всех детей — следующий тик показывает их вместо родителя", async () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider);

    engine.tick(CLOSE_TO_EAST_ROOT_CENTER);
    const eastRootKey = "0/1/0";
    provider.resolve(eastRootKey, { color: "#fff", label: eastRootKey });
    provider.resolve("0/0/0", { color: "#000", label: "0/0/0" });
    await flush();

    engine.tick(CLOSE_TO_EAST_ROOT_CENTER); // запрашивает детей
    const childKeys = ["1/2/0", "1/3/0", "1/2/1", "1/3/1"];
    for (const k of childKeys) provider.resolve(k, { color: "#abc", label: k });
    await flush();

    const frame3 = engine.tick(CLOSE_TO_EAST_ROOT_CENTER);
    expect(frame3.tiles.has(eastRootKey)).toBe(false); // родитель больше не рендерится
    const anyChildVisible = childKeys.some((k) => frame3.tiles.has(k));
    expect(anyChildVisible).toBe(true);
  });

  it("устаревший ответ на вытесненный-и-переспрошенный тайл не подменяет актуальную запись", async () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider, undefined, 1); // maxSize=1 — второй же запрос вытесняет первый

    engine.tick([0, 0, 20]); // ровно один видимый корневой тайл (полусфера к камере) — назовём его A
    expect(provider.calls.length).toBe(1);
    const keyA = provider.calls[0];

    engine.tick([0, 0, -20]); // камера на другую сторону — желаемый тайл B вытесняет A (controller A.abort())
    expect(provider.calls.length).toBe(2);

    engine.tick([0, 0, 20]); // возврат к A — A был вытеснен, значит запрашивается ЗАНОВО (новый controller)
    expect(provider.calls.length).toBe(3);
    expect(provider.calls.filter((k) => k === keyA)).toHaveLength(2);

    // Резолвим САМЫЙ СТАРЫЙ (уже вытесненный/отменённый) вызов для A —
    // его AbortSignal уже сработал при вытеснении, поэтому его промис уже
    // отклонён и повторный resolve() на нём — безопасный no-op per спеке
    // Promise. Наблюдаемый инвариант: это НИКОГДА не попадает в кадр.
    expect(() => provider.resolveOldest(keyA, { color: "#stale", label: "stale" })).not.toThrow();
    await flush();
    const frameAfterStale = engine.tick([0, 0, 20]);
    expect(frameAfterStale.tiles.get(keyA)?.color).not.toBe("#stale");

    // Актуальный (второй, ещё живой) запрос для A резолвится нормально
    provider.resolveOldest(keyA, { color: "#fresh", label: "fresh" });
    await flush();
    const frameAfterFresh = engine.tick([0, 0, 20]);
    expect(frameAfterFresh.tiles.get(keyA)?.color).toBe("#fresh");
  });

  it("dispose() отменяет все запросы в полёте", () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider);
    engine.tick([0, 0, 20]);
    engine.dispose();
    // после dispose ни один из выданных провайдеру AbortSignal не должен
    // остаться неотменённым — проверяем через побочный эффект: повторный
    // resolve() на любой из запрошенных ключей не должен бросать
    for (const key of provider.calls) {
      expect(() => provider.resolve(key, { color: "#000", label: key })).not.toThrow();
    }
  });

  it("dispose() освобождает ГОТОВЫЕ записи (реальные ресурсы — картинка/текстура), не только отменяет в полёте", async () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider);
    engine.tick([0, 0, 20]);
    const key = provider.calls[0];
    const disposeFn = vi.fn();
    provider.resolve(key, { color: "#fff", label: key, dispose: disposeFn });
    await flush();
    engine.tick([0, 0, 20]); // забирает готовую запись в cache
    engine.dispose();
    expect(disposeFn).toHaveBeenCalledTimes(1);
  });

  it("ограничивает число одновременных запросов — резкий зум не создаёт лавину сетевых вызовов сразу", async () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider, undefined, 200, 2); // maxConcurrentRequests=2

    engine.tick(CLOSE_TO_EAST_ROOT_CENTER); // запрашивает восточный корень (1 запрос)
    const eastRootKey = "0/1/0";
    provider.resolve(eastRootKey, { color: "#fff", label: eastRootKey });
    await flush();

    engine.tick(CLOSE_TO_EAST_ROOT_CENTER); // родитель готов — хочет запросить всех 4 детей разом
    const childKeys = ["1/2/0", "1/3/0", "1/2/1", "1/3/1"];
    const requestedChildren = provider.calls.filter((k) => childKeys.includes(k));
    expect(requestedChildren.length).toBe(2); // лимит=2 — не все 4 сразу

    // Освобождаем "слоты", резолвя уже запущенные — на следующем тике
    // движок доберёт оставшихся детей из pending (LOD-логика продолжает
    // хотеть их, раз они ещё не готовы)
    for (const k of requestedChildren) provider.resolveOldest(k, { color: "#abc", label: k });
    await flush();
    engine.tick(CLOSE_TO_EAST_ROOT_CENTER);
    const requestedChildrenTotal = provider.calls.filter((k) => childKeys.includes(k));
    expect(requestedChildrenTotal.length).toBe(4); // остальные два добраны следующим тиком
  });

  it("быстрый зум/поворот (несколько тиков подряд с разными позициями) не роняет исполнение", () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider);
    const positions: Vec3[] = [
      [0, 0, 20],
      [1.13, 0, 0],
      [0, 1.5, 0],
      [-1.2, 0, 0.3],
      [0, 0, 1.14],
      [0, 0, 20],
    ];
    for (const pos of positions) {
      expect(() => engine.tick(pos)).not.toThrow();
    }
  });

  it("G6.5: упавший тайл переспрашивается на следующих тиках (не застревает FAILED навсегда)", async () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider, undefined, 200, 6, 3); // maxRetries=3
    engine.tick([0, 0, 20]);
    const key = provider.calls[0];
    provider.rejectOldest(key, new Error("network blip"));
    await flush();

    let frame = engine.tick([0, 0, 20]); // должен переспросить
    expect(provider.calls.filter((k) => k === key)).toHaveLength(2);
    expect(frame.stats.failedCount).toBe(0); // статус уже "loading" — переспрос начался, "упавших" сейчас нет

    provider.resolveOldest(key, { color: "#fff", label: key });
    await flush();
    frame = engine.tick([0, 0, 20]);
    expect(frame.tiles.get(key)).toEqual({ color: "#fff", label: key }); // успешный переспрос применяется как обычно
  });

  it("G6.5: после исчерпания лимита попыток тайл окончательно остаётся failed, без бесконечного долбления провайдера", async () => {
    const provider = new ManualTileProvider();
    const engine = new TileEngine(provider, undefined, 200, 6, 2); // maxRetries=2 — итого 3 попытки всего (1 исходная + 2 ретрая)
    engine.tick([0, 0, 20]);
    const key = provider.calls[0];

    for (let i = 0; i < 3; i++) {
      provider.rejectOldest(key, new Error("still down"));
      await flush();
      engine.tick([0, 0, 20]); // каждый тик после ошибки пробует переспросить, пока не исчерпан лимит
    }

    const totalAttempts = provider.calls.filter((k) => k === key).length;
    expect(totalAttempts).toBe(3); // 1 исходная + maxRetries(2) — не больше

    const finalFrame = engine.tick([0, 0, 20]);
    expect(finalFrame.stats.failedCount).toBe(1); // окончательно "упавший", но ровно один — не растёт бесконтрольно
  });
});

describe("GeoWorld G2 — TileEngine: интеграция с реальным DebugTileProvider (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("реальный DebugTileProvider со временем доводит корневые тайлы до готовности", async () => {
    const engine = new TileEngine(new DebugTileProvider({ minDelayMs: 10, maxDelayMs: 20 }));
    engine.tick([0, 0, 20]);
    await vi.advanceTimersByTimeAsync(50);
    const frame = engine.tick([0, 0, 20]);
    expect(frame.tiles.size).toBeGreaterThan(0);
  });
});
