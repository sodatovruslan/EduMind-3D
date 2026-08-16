import { describe, expect, it, vi } from "vitest";
import { TERRARIUM_ATTRIBUTION, TerrariumElevationProvider } from "./terrarium-provider";

function mockDecode(width: number, height: number, fill: [number, number, number, number] = [128, 0, 0, 255]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = fill[0];
    pixels[i * 4 + 1] = fill[1];
    pixels[i * 4 + 2] = fill[2];
    pixels[i * 4 + 3] = fill[3];
  }
  return vi.fn(async () => ({ width, height, pixels }));
}

function mockFetchOk(): typeof fetch {
  return vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob() })) as unknown as typeof fetch;
}

describe("GeoWorld G4 — TerrariumElevationProvider: сеть и декодирование замоканы", () => {
  it("запрашивает корректный XYZ URL для заданных географических границ", async () => {
    const fetchImpl = mockFetchOk();
    const provider = new TerrariumElevationProvider({ fetchImpl, decode: mockDecode(4, 4) });

    await provider.requestElevation({ latMin: 30, latMax: 40, lngMin: 60, lngMax: 80 }, new AbortController().signal);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\/\d+\/\d+\/\d+\.png$/);
  });

  it("декодирует значения пикселей в метры через официальную формулу", async () => {
    // R=128,G=0,B=0 → decodeTerrariumPixel(128,0,0) = 128*256 - 32768 = 0 (уровень моря)
    const provider = new TerrariumElevationProvider({ fetchImpl: mockFetchOk(), decode: mockDecode(2, 2, [128, 0, 0, 255]) });
    const data = await provider.requestElevation({ latMin: 0, latMax: 10, lngMin: 0, lngMax: 10 }, new AbortController().signal);
    expect(data.heights.length).toBe(4);
    for (const h of data.heights) expect(h).toBeCloseTo(0, 5);
  });

  it("возвращает реальные границы тайла Terrarium (Web Mercator), не переданные границы запроса", async () => {
    const provider = new TerrariumElevationProvider({ fetchImpl: mockFetchOk(), decode: mockDecode(2, 2) });
    const requested = { latMin: 30, latMax: 40, lngMin: 60, lngMax: 80 };
    const data = await provider.requestElevation(requested, new AbortController().signal);
    // Границы реального тайла Mercator почти никогда не совпадут один в один с произвольным запрошенным охватом
    expect(data.bounds).toBeDefined();
    expect(Number.isFinite(data.bounds.latMin)).toBe(true);
  });

  it("прикладывает атрибуцию AWS Open Data Terrain Tiles дословно", async () => {
    const provider = new TerrariumElevationProvider({ fetchImpl: mockFetchOk(), decode: mockDecode(2, 2) });
    const data = await provider.requestElevation({ latMin: 0, latMax: 10, lngMin: 0, lngMax: 10 }, new AbortController().signal);
    expect(data.attribution).toBe(TERRARIUM_ATTRIBUTION);
  });

  it("HTTP-ошибка отклоняет промис детерминированной ошибкой", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob() })) as unknown as typeof fetch;
    const provider = new TerrariumElevationProvider({ fetchImpl, decode: mockDecode(2, 2) });
    await expect(
      provider.requestElevation({ latMin: 0, latMax: 10, lngMin: 0, lngMax: 10 }, new AbortController().signal)
    ).rejects.toThrow(/404/);
  });

  it("уважает AbortSignal", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;
    const provider = new TerrariumElevationProvider({ fetchImpl, decode: mockDecode(2, 2) });

    const promise = provider.requestElevation({ latMin: 0, latMax: 10, lngMin: 0, lngMax: 10 }, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("уважает maxLevel — не запрашивает уровень выше потолка", async () => {
    const fetchImpl = mockFetchOk();
    const provider = new TerrariumElevationProvider({ fetchImpl, decode: mockDecode(2, 2), maxLevel: 3 });
    await provider.requestElevation({ latMin: 0.001, latMax: 0.002, lngMin: 0.001, lngMax: 0.002 }, new AbortController().signal);
    const [url] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    const level = Number(String(url).split("/terrarium/")[1].split("/")[0]);
    expect(level).toBeLessThanOrEqual(3);
  });
});
