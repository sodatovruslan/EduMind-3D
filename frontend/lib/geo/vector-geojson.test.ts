import { describe, expect, it } from "vitest";
import { extractRings, lngLatToLatLng, simplifyRing, type MultiPolygonGeometry, type PolygonGeometry } from "./vector-geojson";

describe("GeoWorld G5 — vector-geojson: извлечение колец из Polygon/MultiPolygon", () => {
  it("Polygon с одним внешним кольцом даёт ровно одно кольцо", () => {
    const geom: PolygonGeometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    const rings = extractRings(geom);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toEqual([[0, 0], [1, 0], [1, 1], [0, 0]]);
  });

  it("Polygon с дырой (анклав) даёт оба кольца — внешнее и внутреннее", () => {
    const geom: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 0]],
        [[2, 2], [4, 2], [4, 4], [2, 2]],
      ],
    };
    expect(extractRings(geom)).toHaveLength(2);
  });

  it("MultiPolygon даёт объединённый плоский список колец из ВСЕХ полигонов", () => {
    const geom: MultiPolygonGeometry = {
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 5]], [[5.2, 5.2], [5.4, 5.2], [5.4, 5.4], [5.2, 5.2]]],
      ],
    };
    expect(extractRings(geom)).toHaveLength(3); // 1 из первого полигона + 2 (внешнее+дыра) из второго
  });

  it("lngLatToLatLng не путает порядок координат (GeoJSON — [lng,lat])", () => {
    const result = lngLatToLatLng([32.5333, 0.5833]); // Бомбо, Уганда — реальная точка из ne_50m_populated_places
    expect(result.lng).toBe(32.5333);
    expect(result.lat).toBe(0.5833);
  });
});

describe("GeoWorld G5 — simplifyRing: прореживание избыточно детальных контуров", () => {
  it("короткое кольцо (<=maxPoints) не трогается", () => {
    const ring: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 0]];
    expect(simplifyRing(ring, 10)).toBe(ring);
  });

  it("длинное кольцо прореживается до примерно maxPoints, оставаясь замкнутым", () => {
    const ring: [number, number][] = Array.from({ length: 1000 }, (_, i) => [i, i] as [number, number]);
    const simplified = simplifyRing(ring, 50);
    expect(simplified.length).toBeLessThan(60);
    expect(simplified.length).toBeGreaterThan(10);
    expect(simplified[simplified.length - 1]).toEqual(ring[ring.length - 1]); // последняя точка сохранена — контур не рвётся
  });

  it("maxPoints < 2 возвращает кольцо без изменений (защита от вырожденного случая)", () => {
    const ring: [number, number][] = [[0, 0], [1, 0], [1, 1]];
    expect(simplifyRing(ring, 1)).toBe(ring);
  });
});
