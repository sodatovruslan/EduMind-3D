import { describe, expect, it, vi } from "vitest";
import { GIBS_ATTRIBUTION, GibsTileProvider } from "./gibs-provider";

// Мок-декодер — jsdom не умеет декодировать реальные JPEG (нет createImageBitmap
// с настоящим кодеком); тесты подменяют декодирование, чтобы проверять
// логику провайдера (URL/уровень/отмена/ошибки), а не реальный codec.
function fakeImage(): ImageBitmap {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

function mockFetchOk(): typeof fetch {
  return vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob() })) as unknown as typeof fetch;
}

describe("GeoWorld G3 — GibsTileProvider: реальный провайдер, сеть замокана", () => {
  it("запрашивает корректный URL, подобранный под уровень нашего внутреннего тайла", async () => {
    const fetchImpl = mockFetchOk();
    const provider = new GibsTileProvider({ fetchImpl, decode: async () => fakeImage() });

    await provider.requestTile({ z: 0, x: 1, y: 0 }, new AbortController().signal);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\/epsg4326\/best\/BlueMarble_NextGeneration\/default\/500m\/\d+\/\d+\/\d+\.jpeg$/);
  });

  it("возвращает реальные границы тайла GIBS (bounds), не наши внутренние границы", async () => {
    const fetchImpl = mockFetchOk();
    const provider = new GibsTileProvider({ fetchImpl, decode: async () => fakeImage() });

    const data = await provider.requestTile({ z: 2, x: 3, y: 1 }, new AbortController().signal);
    expect(data.bounds).toBeDefined();
    expect(Number.isFinite(data.bounds!.latMin)).toBe(true);
    expect(Number.isFinite(data.bounds!.lngMin)).toBe(true);
  });

  it("прикладывает официальную формулировку NASA GIBS дословно", async () => {
    const provider = new GibsTileProvider({ fetchImpl: mockFetchOk(), decode: async () => fakeImage() });
    const data = await provider.requestTile({ z: 0, x: 0, y: 0 }, new AbortController().signal);
    expect(data.attribution).toBe(GIBS_ATTRIBUTION);
  });

  it("dispose() вызывает close() у декодированной картинки — освобождает ресурс", async () => {
    const image = fakeImage();
    const provider = new GibsTileProvider({ fetchImpl: mockFetchOk(), decode: async () => image });
    const data = await provider.requestTile({ z: 0, x: 0, y: 0 }, new AbortController().signal);
    data.dispose?.();
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it("HTTP-ошибка отклоняет промис детерминированной ошибкой, а не проглатывает её", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, blob: async () => new Blob() })) as unknown as typeof fetch;
    const provider = new GibsTileProvider({ fetchImpl, decode: async () => fakeImage() });
    await expect(provider.requestTile({ z: 0, x: 0, y: 0 }, new AbortController().signal)).rejects.toThrow(/503/);
  });

  it("уважает AbortSignal — fetch получает signal, отмена до ответа отклоняет запрос", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;
    const provider = new GibsTileProvider({ fetchImpl, decode: async () => fakeImage() });

    const promise = provider.requestTile({ z: 0, x: 0, y: 0 }, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("уважает переданный maxLevel — не запрашивает уровень выше реального потолка провайдера", async () => {
    const fetchImpl = mockFetchOk();
    const provider = new GibsTileProvider({ fetchImpl, decode: async () => fakeImage(), maxLevel: 2 });

    await provider.requestTile({ z: 4, x: 10, y: 5 }, new AbortController().signal); // наш внутренний глубокий тайл
    const [url] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    const level = Number(String(url).split("/500m/")[1].split("/")[0]);
    expect(level).toBeLessThanOrEqual(2);
  });
});
