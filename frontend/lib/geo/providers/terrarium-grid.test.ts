import { describe, expect, it } from "vitest";
import {
  buildTerrariumTileUrl,
  decodeTerrariumPixel,
  pickTerrariumLevel,
  terrariumTileBounds,
  terrariumTileForLatLng,
} from "./terrarium-grid";

describe("GeoWorld G4 — Terrarium grid: стандартная Web Mercator XYZ-адресация", () => {
  it("на z=0 весь мир — один тайл (0,0)", () => {
    expect(terrariumTileForLatLng(0, 0, 0)).toEqual({ z: 0, x: 0, y: 0 });
  });

  it("экватор/Гринвич попадает в ожидаемый центральный тайл на z=2", () => {
    const ref = terrariumTileForLatLng(2, 0, 0);
    expect(ref.z).toBe(2);
    expect(ref.x).toBeGreaterThanOrEqual(0);
    expect(ref.x).toBeLessThan(4);
    expect(ref.y).toBeGreaterThanOrEqual(0);
    expect(ref.y).toBeLessThan(4);
  });

  it("terrariumTileBounds(terrariumTileForLatLng(z,lat,lng)) содержит исходную точку (кроме экстремальных широт)", () => {
    const points: Array<[number, number, number]> = [
      [4, 10, 20],
      [6, -33, -70],
      [8, 38.5, 72], // Памир
      [8, 27.98, 86.92], // Эверест/Гималаи
      [5, 46.5, 9.8], // Альпы
      [5, 23, 10], // Сахара
    ];
    for (const [z, lat, lng] of points) {
      const ref = terrariumTileForLatLng(z, lat, lng);
      const b = terrariumTileBounds(ref);
      expect(lat).toBeGreaterThanOrEqual(b.latMin);
      expect(lat).toBeLessThanOrEqual(b.latMax);
      expect(lng).toBeGreaterThanOrEqual(b.lngMin);
      expect(lng).toBeLessThanOrEqual(b.lngMax);
    }
  });

  it("около полярного предела Web Mercator не даёт NaN/бесконечности (широта зажимается)", () => {
    const ref = terrariumTileForLatLng(4, 89.9, 0);
    expect(Number.isFinite(ref.y)).toBe(true);
    const b = terrariumTileBounds(ref);
    expect(Number.isFinite(b.latMin)).toBe(true);
    expect(Number.isFinite(b.latMax)).toBe(true);

    const refSouth = terrariumTileForLatLng(4, -89.9, 0);
    expect(Number.isFinite(refSouth.y)).toBe(true);
  });

  it("шов на антимеридиане: x у последнего столбца не выходит за границу сетки", () => {
    const east = terrariumTileForLatLng(5, 0, 179.9);
    expect(east.x).toBeLessThan(2 ** 5);
    const west = terrariumTileForLatLng(5, 0, -180);
    expect(west.x).toBe(0);
  });

  it("границы тайлов НЕ NaN на разных уровнях/широтах", () => {
    for (let z = 0; z <= 8; z++) {
      const ref = terrariumTileForLatLng(z, 45, 45);
      const b = terrariumTileBounds(ref);
      expect(Number.isFinite(b.latMin)).toBe(true);
      expect(Number.isFinite(b.latMax)).toBe(true);
      expect(Number.isFinite(b.lngMin)).toBe(true);
      expect(Number.isFinite(b.lngMax)).toBe(true);
      expect(b.latMin).toBeLessThan(b.latMax);
      expect(b.lngMin).toBeLessThan(b.lngMax);
    }
  });
});

describe("GeoWorld G4 — pickTerrariumLevel: угловой размер тайла Mercator зависит от широты", () => {
  it("для крупного желаемого охвата выбирает z=0 (единственный тайл z=0 покрывает 360° по долготе)", () => {
    expect(pickTerrariumLevel(0, 360, 12)).toBe(0);
  });

  it("не превышает переданный потолок уровня", () => {
    expect(pickTerrariumLevel(0, 0.001, 6)).toBe(6);
  });

  it("на высоких широтах (полярное растяжение Mercator) всё ещё возвращает валидный уровень в пределах потолка", () => {
    const z = pickTerrariumLevel(80, 1, 10);
    expect(z).toBeGreaterThanOrEqual(0);
    expect(z).toBeLessThanOrEqual(10);
  });
});

describe("GeoWorld G4 — decodeTerrariumPixel: официальная формула Mapzen/Tilezen", () => {
  it("(0,0,0) декодируется в -32768 (смещение формата)", () => {
    expect(decodeTerrariumPixel(0, 0, 0)).toBe(-32768);
  });

  it("(128,0,0) декодируется в 0 (уровень моря)", () => {
    expect(decodeTerrariumPixel(128, 0, 0)).toBe(0);
  });

  it("корректно декодирует высоту Эвереста в разумных пределах по примерным пиксельным значениям", () => {
    // 8849м + 32768 = 41617 = 162*256 + 145 (R=162,G=145,B=0)
    const meters = decodeTerrariumPixel(162, 145, 0);
    expect(meters).toBeCloseTo(8849, 0);
  });
});

describe("GeoWorld G4 — buildTerrariumTileUrl", () => {
  it("строит корректный URL по XYZ-шаблону AWS Open Data", () => {
    expect(buildTerrariumTileUrl({ z: 5, x: 20, y: 12 })).toBe("https://s3.amazonaws.com/elevation-tiles-prod/terrarium/5/20/12.png");
  });
});
