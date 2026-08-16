import { describe, expect, it } from "vitest";
import {
  GIBS_500M_LEVELS,
  GIBS_MAX_LEVEL,
  buildGibsTileUrl,
  gibsLatSpan,
  gibsLngSpan,
  gibsTileBounds,
  gibsTileForLatLng,
  pickGibsLevel,
} from "./gibs-grid";

describe("GeoWorld G3 — GIBS grid: сетка НЕ совпадает с нашей внутренней (это ожидаемо и проверяется явно)", () => {
  it("уровни 0-2 нерегулярны (2×1 → 3×2 → 5×3) — НЕ степень двойки, в отличие от нашей quadtree", () => {
    expect(GIBS_500M_LEVELS[0]).toEqual({ z: 0, matrixWidth: 2, matrixHeight: 1 });
    expect(GIBS_500M_LEVELS[1]).toEqual({ z: 1, matrixWidth: 3, matrixHeight: 2 });
    expect(GIBS_500M_LEVELS[2]).toEqual({ z: 2, matrixWidth: 5, matrixHeight: 3 });
  });

  it("с уровня 3 сетка выходит на чистое удвоение (10×5 → 20×10 → 40×20 → 80×40 → 160×80)", () => {
    const widths = GIBS_500M_LEVELS.slice(3).map((l) => l.matrixWidth);
    const heights = GIBS_500M_LEVELS.slice(3).map((l) => l.matrixHeight);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBe(widths[i - 1] * 2);
      expect(heights[i]).toBe(heights[i - 1] * 2);
    }
  });

  it("максимальный уровень провайдера — 7 (500м/пиксель), выше не выдумываем", () => {
    expect(GIBS_MAX_LEVEL).toBe(7);
  });

  it("угловой размер тайла = 360/matrixWidth по долготе и 180/matrixHeight по широте", () => {
    expect(gibsLngSpan(0)).toBe(180);
    expect(gibsLatSpan(0)).toBe(180);
    expect(gibsLngSpan(1)).toBe(120); // 360/3 — НЕ квадратный тайл на этом уровне, это реальность сетки GIBS
    expect(gibsLatSpan(1)).toBe(90);
    expect(gibsLngSpan(3)).toBe(36);
    expect(gibsLatSpan(3)).toBe(36); // с z=3 тайлы снова угловые квадраты
  });
});

describe("GeoWorld G3 — gibsTileForLatLng / gibsTileBounds: адресация реальной точки в сетке GIBS", () => {
  it("находит корректный тайл на верхнем уровне (z=0, 2 тайла на весь мир)", () => {
    expect(gibsTileForLatLng(0, 0, -90)).toEqual({ z: 0, row: 0, col: 0 }); // западное полушарие
    expect(gibsTileForLatLng(0, 0, 90)).toEqual({ z: 0, row: 0, col: 1 }); // восточное полушарие
  });

  it("угловые случаи (полюса, край долготы ±180) дают валидный, не вылезающий за сетку тайл", () => {
    const north = gibsTileForLatLng(4, 89.9, 0);
    expect(north.row).toBeGreaterThanOrEqual(0);
    expect(north.row).toBeLessThan(GIBS_500M_LEVELS[4].matrixHeight);

    const south = gibsTileForLatLng(4, -89.9, 0);
    expect(south.row).toBeGreaterThanOrEqual(0);
    expect(south.row).toBeLessThan(GIBS_500M_LEVELS[4].matrixHeight);

    const east = gibsTileForLatLng(4, 0, 179.9);
    expect(east.col).toBeGreaterThanOrEqual(0);
    expect(east.col).toBeLessThan(GIBS_500M_LEVELS[4].matrixWidth);

    const west = gibsTileForLatLng(4, 0, -180);
    expect(west.col).toBe(0);
  });

  it("gibsTileBounds(gibsTileForLatLng(z,lat,lng)) всегда содержит исходную точку", () => {
    const points: Array<[number, number, number]> = [
      [3, 10, 20],
      [5, -45, -100],
      [7, 38.5, 72], // Памир, см. GeoWorldScene PAMIR_LAT/PAMIR_LNG
      [2, 89, 179],
      [6, -89, -179],
    ];
    for (const [z, lat, lng] of points) {
      const ref = gibsTileForLatLng(z, lat, lng);
      const b = gibsTileBounds(ref);
      expect(lat).toBeGreaterThanOrEqual(b.latMin);
      expect(lat).toBeLessThanOrEqual(b.latMax);
      expect(lng).toBeGreaterThanOrEqual(b.lngMin);
      expect(lng).toBeLessThanOrEqual(b.lngMax);
    }
  });

  it("границы тайлов НЕ являются NaN/некорректными на любом уровне 0..7", () => {
    for (let z = 0; z <= GIBS_MAX_LEVEL; z++) {
      const ref = gibsTileForLatLng(z, 0, 0);
      const b = gibsTileBounds(ref);
      expect(Number.isFinite(b.latMin)).toBe(true);
      expect(Number.isFinite(b.latMax)).toBe(true);
      expect(Number.isFinite(b.lngMin)).toBe(true);
      expect(Number.isFinite(b.lngMax)).toBe(true);
      expect(b.latMin).toBeLessThan(b.latMax);
      expect(b.lngMin).toBeLessThan(b.lngMax);
    }
  });
});

describe("GeoWorld G3 — pickGibsLevel: выбор уровня НЕ грубее желаемого, не выдумывая детализацию сверх maxLevel", () => {
  it("для очень крупного желаемого охвата (весь мир) выбирает z=0", () => {
    expect(pickGibsLevel(180)).toBe(0);
  });

  it("для мелкого желаемого охвата — самый мелкий доступный уровень, не мельче", () => {
    expect(pickGibsLevel(2)).toBe(GIBS_MAX_LEVEL); // 2° мельче, чем даже z=7 (2.25°) — упираемся в потолок провайдера
  });

  it("не превышает переданный maxLevel, даже если хочется мельче", () => {
    expect(pickGibsLevel(0.5, 4)).toBe(4);
  });

  it("подбирает уровень, чей тайл РЕАЛЬНО не грубее желаемого (не апскейлит мимо необходимости)", () => {
    const desired = 20; // хотим тайл не крупнее 20°
    const z = pickGibsLevel(desired);
    const span = Math.max(gibsLngSpan(z), gibsLatSpan(z));
    expect(span).toBeLessThanOrEqual(desired);
  });
});

describe("GeoWorld G3 — buildGibsTileUrl", () => {
  it("строит корректный REST URL по шаблону GIBS WMTS", () => {
    const url = buildGibsTileUrl("BlueMarble_NextGeneration", "500m", { z: 4, row: 3, col: 10 });
    expect(url).toBe("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/500m/4/3/10.jpeg");
  });
});
