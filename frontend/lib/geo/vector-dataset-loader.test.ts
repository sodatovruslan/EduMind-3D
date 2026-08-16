import { describe, expect, it, vi } from "vitest";
import { VectorDatasetLoader } from "./vector-dataset-loader";

function mockFetchOk(data: unknown): typeof fetch {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => data })) as unknown as typeof fetch;
}

describe("GeoWorld G5 — VectorDatasetLoader: загрузка+кэш+дедуп по фиксированному ключу", () => {
  it("загружает по правильному URL, построенному из ключа", async () => {
    const fetchImpl = mockFetchOk({ ok: true });
    const loader = new VectorDatasetLoader<{ ok: boolean }>((key) => `https://example.com/${key}.json`, { fetchImpl });
    await loader.load("coarse");
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/coarse.json", expect.anything());
  });

  it("второй запрос того же ключа НЕ бьёт по сети повторно — берёт из кэша", async () => {
    const fetchImpl = mockFetchOk({ v: 1 });
    const loader = new VectorDatasetLoader<{ v: number }>(() => "https://example.com/x.json", { fetchImpl });
    await loader.load("a");
    await loader.load("a");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("параллельные запросы одного ключа ДО завершения первого дедуплицируются в один сетевой вызов", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const fetchImpl = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as typeof fetch;
    const loader = new VectorDatasetLoader<{ v: number }>(() => "https://example.com/x.json", { fetchImpl });

    const p1 = loader.load("a");
    const p2 = loader.load("a");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, status: 200, json: async () => ({ v: 42 }) });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ v: 42 });
    expect(r2).toEqual({ v: 42 });
  });

  it("разные ключи запрашиваются независимо", async () => {
    const fetchImpl = mockFetchOk({ ok: true });
    const loader = new VectorDatasetLoader<{ ok: boolean }>((key) => `https://example.com/${key}.json`, { fetchImpl });
    await loader.load("coarse");
    await loader.load("medium");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("HTTP-ошибка отклоняет промис детерминированной ошибкой и не кэширует результат", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    const loader = new VectorDatasetLoader<unknown>(() => "https://example.com/missing.json", { fetchImpl });
    await expect(loader.load("missing")).rejects.toThrow(/404/);
    expect(loader.isCached("missing")).toBe(false);
  });

  it("dispose() отменяет запросы в полёте", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;
    const loader = new VectorDatasetLoader<unknown>(() => "https://example.com/x.json", { fetchImpl });

    const promise = loader.load("a");
    loader.dispose();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    void controller; // не используется напрямую — отмена идёт через внутренний controller загрузчика
  });

  it("getCached/isCached отражают реальное состояние кэша", async () => {
    const loader = new VectorDatasetLoader<{ v: number }>(() => "https://example.com/x.json", { fetchImpl: mockFetchOk({ v: 7 }) });
    expect(loader.isCached("a")).toBe(false);
    expect(loader.getCached("a")).toBeUndefined();
    await loader.load("a");
    expect(loader.isCached("a")).toBe(true);
    expect(loader.getCached("a")).toEqual({ v: 7 });
  });
});
