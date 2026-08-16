import { describe, expect, it, vi } from "vitest";
import { VolcanoProvider, dedupeVolcanoes, type VolcanoApiRecord } from "./volcanoes";

function record(overrides: Partial<VolcanoApiRecord>): VolcanoApiRecord {
  return {
    volcanoLocationId: 1,
    year: 2000,
    name: "Test",
    country: "Testland",
    latitude: 0,
    longitude: 0,
    elevation: 1000,
    morphology: "Stratovolcano",
    deathsTotal: null,
    ...overrides,
  };
}

describe("GeoWorld G6 — dedupeVolcanoes: одна запись на реальный вулкан", () => {
  it("несколько извержений одного вулкана схлопываются в одну запись", () => {
    const records = [record({ volcanoLocationId: 5, year: 1800 }), record({ volcanoLocationId: 5, year: 1950 })];
    const result = dedupeVolcanoes(records);
    expect(result).toHaveLength(1);
  });

  it("оставляет запись с САМЫМ ПОЗДНИМ известным годом извержения", () => {
    const records = [record({ volcanoLocationId: 5, year: 1800, deathsTotal: 10 }), record({ volcanoLocationId: 5, year: 1950, deathsTotal: 99 })];
    const result = dedupeVolcanoes(records);
    expect(result[0].lastEruptionYear).toBe(1950);
    expect(result[0].deathsTotal).toBe(99);
  });

  it("запись с year=null не перебивает запись с реальным годом", () => {
    const records = [record({ volcanoLocationId: 5, year: 1950 }), record({ volcanoLocationId: 5, year: null })];
    const result = dedupeVolcanoes(records);
    expect(result[0].lastEruptionYear).toBe(1950);
  });

  it("разные вулканы (разный volcanoLocationId) остаются раздельными записями", () => {
    const records = [record({ volcanoLocationId: 1 }), record({ volcanoLocationId: 2 })];
    expect(dedupeVolcanoes(records)).toHaveLength(2);
  });
});

describe("GeoWorld G6 — VolcanoProvider: пагинация + кэш + дедуп сети замокана", () => {
  function mockPaginatedFetch(pages: VolcanoApiRecord[][]): typeof fetch {
    return vi.fn(async (url: string) => {
      const pageNum = Number(new URL(url).searchParams.get("page"));
      const items = pages[pageNum - 1] ?? [];
      return { ok: true, status: 200, json: async () => ({ items, page: pageNum, totalPages: pages.length }) };
    }) as unknown as typeof fetch;
  }

  it("проходит все страницы и объединяет результат", async () => {
    const fetchImpl = mockPaginatedFetch([[record({ volcanoLocationId: 1 })], [record({ volcanoLocationId: 2 })]]);
    const provider = new VolcanoProvider(fetchImpl);
    const result = await provider.load();
    expect(result).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("второй вызов load() берёт из кэша, не бьёт по сети снова", async () => {
    const fetchImpl = mockPaginatedFetch([[record({ volcanoLocationId: 1 })]]);
    const provider = new VolcanoProvider(fetchImpl);
    await provider.load();
    await provider.load();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("параллельные вызовы load() дедуплицируются в одну загрузку", async () => {
    const fetchImpl = mockPaginatedFetch([[record({ volcanoLocationId: 1 })]]);
    const provider = new VolcanoProvider(fetchImpl);
    const [a, b] = await Promise.all([provider.load(), provider.load()]);
    expect(a).toEqual(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("HTTP-ошибка на любой странице отклоняет весь load() детерминированной ошибкой", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const provider = new VolcanoProvider(fetchImpl);
    await expect(provider.load()).rejects.toThrow(/500/);
  });

  it("dispose() отменяет запрос в полёте", async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;
    const provider = new VolcanoProvider(fetchImpl);
    const promise = provider.load();
    provider.dispose();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
