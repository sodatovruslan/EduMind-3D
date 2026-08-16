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

describe("GeoWorld G6.5 — ElevationEngineAdapter: тайлы целиком за пределом Web Mercator (±85.05°) не бьют по сети вообще", () => {
  it("тайл у самого северного полюса (z=6,y=0 — latMin=87.19°) получает плоский результат БЕЗ вызова провайдера", async () => {
    const provider: ElevationProvider = { requestElevation: vi.fn() };
    const adapter = new ElevationEngineAdapter(provider);
    const result = await adapter.requestTile({ z: 6, x: 0, y: 0 }, new AbortController().signal);
    expect(provider.requestElevation).not.toHaveBeenCalled();
    expect(Array.from(result.heights)).toEqual([0, 0, 0, 0]);
  });

  it("тайл у самого южного полюса (z=6,y=63 — latMax=-87.19°) тоже получает плоский результат без сети", async () => {
    const provider: ElevationProvider = { requestElevation: vi.fn() };
    const adapter = new ElevationEngineAdapter(provider);
    await adapter.requestTile({ z: 6, x: 0, y: 63 }, new AbortController().signal);
    expect(provider.requestElevation).not.toHaveBeenCalled();
  });

  it("тайл, ЧАСТИЧНО заходящий за предел (не целиком) — реальный запрос всё равно выполняется", async () => {
    const fakeData: ElevationTileData = { heights: new Float32Array([1]), width: 1, height: 1, bounds: { latMin: 0, latMax: 1, lngMin: 0, lngMax: 1 } };
    const provider: ElevationProvider = { requestElevation: vi.fn(async () => fakeData) };
    const adapter = new ElevationEngineAdapter(provider);
    // z=6,y=1: latMax=87.1875°, latMin=84.375° — заходит за 85.05°, но не целиком
    await adapter.requestTile({ z: 6, x: 0, y: 1 }, new AbortController().signal);
    expect(provider.requestElevation).toHaveBeenCalledTimes(1);
  });

  it("обычный, неполярный тайл (экватор) запрашивается у провайдера как обычно", async () => {
    const fakeData: ElevationTileData = { heights: new Float32Array([1]), width: 1, height: 1, bounds: { latMin: 0, latMax: 1, lngMin: 0, lngMax: 1 } };
    const provider: ElevationProvider = { requestElevation: vi.fn(async () => fakeData) };
    const adapter = new ElevationEngineAdapter(provider);
    await adapter.requestTile({ z: 4, x: 0, y: 8 }, new AbortController().signal);
    expect(provider.requestElevation).toHaveBeenCalledTimes(1);
  });
});
