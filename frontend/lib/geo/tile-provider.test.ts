import { describe, expect, it } from "vitest";
import { DebugTileProvider } from "./tile-provider";

describe("GeoWorld G2 — DebugTileProvider: честный async-жизненный цикл заглушки", () => {
  it("резолвится детерминированными данными для одного и того же id (без Math.random)", async () => {
    const provider = new DebugTileProvider({ minDelayMs: 1, maxDelayMs: 3 });
    const id = { z: 2, x: 1, y: 1 };
    const a = await provider.requestTile(id, new AbortController().signal);
    const b = await provider.requestTile(id, new AbortController().signal);
    expect(a).toEqual(b); // один и тот же тайл — один и тот же результат при каждом запросе
    expect(a.label).toBe("2/1/1");
  });

  it("разные тайлы обычно получают разные цвета (детерминированный, но не константный выбор)", async () => {
    const provider = new DebugTileProvider({ minDelayMs: 1, maxDelayMs: 3 });
    const results = await Promise.all(
      [
        { z: 1, x: 0, y: 0 },
        { z: 1, x: 1, y: 0 },
        { z: 1, x: 0, y: 1 },
        { z: 1, x: 1, y: 1 },
      ].map((id) => provider.requestTile(id, new AbortController().signal))
    );
    const colors = new Set(results.map((r) => r.color));
    expect(colors.size).toBeGreaterThan(1);
  });

  it("отмена ДО завершения задержки отклоняет промис с AbortError, а не резолвит его", async () => {
    const provider = new DebugTileProvider({ minDelayMs: 50, maxDelayMs: 100 });
    const controller = new AbortController();
    const promise = provider.requestTile({ z: 0, x: 0, y: 0 }, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("уже отменённый signal отклоняет запрос немедленно, не запуская таймер", async () => {
    const provider = new DebugTileProvider({ minDelayMs: 50, maxDelayMs: 100 });
    const controller = new AbortController();
    controller.abort();
    await expect(provider.requestTile({ z: 0, x: 0, y: 0 }, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
