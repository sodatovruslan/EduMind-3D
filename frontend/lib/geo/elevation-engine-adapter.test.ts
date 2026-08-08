import { describe, expect, it, vi } from "vitest";
import { ElevationEngineAdapter } from "./elevation-engine-adapter";
import { tileBounds } from "./tiling";
import type { ElevationProvider, ElevationTileData } from "./elevation-provider";

describe("GeoWorld G4 — ElevationEngineAdapter: мост между TileId-адресацией и bounds-адресацией", () => {
  it("вызывает ElevationProvider.requestElevation с РЕАЛЬНЫМИ границами внутреннего тайла", async () => {
    const fakeData: ElevationTileData = { heights: new Float32Array([0]), width: 1, height: 1, bounds: { latMin: 0, latMax: 1, lngMin: 0, lngMax: 1 } };
    const provider: ElevationProvider = { requestElevation: vi.fn(async () => fakeData) };
    const adapter = new ElevationEngineAdapter(provider);

    const id = { z: 2, x: 3, y: 1 };
    const signal = new AbortController().signal;
    const result = await adapter.requestTile(id, signal);

    expect(provider.requestElevation).toHaveBeenCalledWith(tileBounds(id), signal);
    expect(result).toBe(fakeData);
  });

  it("пробрасывает отказ провайдера как есть (не проглатывает ошибку/отмену)", async () => {
    const provider: ElevationProvider = { requestElevation: vi.fn(async () => Promise.reject(new DOMException("aborted", "AbortError"))) };
    const adapter = new ElevationEngineAdapter(provider);
    await expect(adapter.requestTile({ z: 0, x: 0, y: 0 }, new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
