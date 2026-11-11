import { describe, it, expect } from "vitest";
import {
  SHAPES_PER_RUN,
  SHAPE_COUNTRY_CODES,
  availableShapeCodes,
  boundsOfRings,
  buildSilhouette,
  cameraForBounds,
  shuffledShapes,
  significantRings,
  silhouetteOfCountry,
  type Ring,
} from "./country-shapes";
import type { CountryCollection, CountryFeature } from "./continents";

function ring(west: number, south: number, width: number, height: number): Ring {
  return [
    [west, south],
    [west + width, south],
    [west + width, south + height],
    [west, south + height],
    [west, south],
  ];
}

function feature(adm0: string, rings: Ring[][]): CountryFeature {
  return {
    properties: { ADM0_A3: adm0, NAME: adm0, NAME_RU: adm0 },
    geometry: { type: "MultiPolygon", coordinates: rings },
  };
}

describe("country-shapes — which parts of a country get drawn", () => {
  it("keeps the mainland and the big islands, drops the specks", () => {
    const mainland = ring(0, 0, 10, 10);
    const island = ring(20, 0, 3, 3); // 9% of the mainland area — kept
    const speck = ring(40, 0, 0.5, 0.5); // 0.25% — dropped
    const kept = significantRings(feature("TST", [[mainland], [island], [speck]]));
    expect(kept).toHaveLength(2);
    const bounds = boundsOfRings(kept);
    expect(bounds?.east).toBe(23);
  });

  it("ignores geometry that is not a polygon", () => {
    const point: CountryFeature = { properties: {}, geometry: { type: "Point", coordinates: [0, 0] } };
    expect(significantRings(point)).toHaveLength(0);
    expect(buildSilhouette(point)).toBeNull();
    expect(boundsOfRings([])).toBeNull();
  });
});

describe("country-shapes — the silhouette", () => {
  const square = feature("SQR", [[ring(10, 10, 10, 10)]]);

  it("is a closed path that fits inside the box, with padding", () => {
    const size = 160;
    const padding = 8;
    const silhouette = buildSilhouette(square, size, padding);
    expect(silhouette).not.toBeNull();
    expect(silhouette!.size).toBe(size);
    expect(silhouette!.path.startsWith("M")).toBe(true);
    expect(silhouette!.path.endsWith("Z")).toBe(true);

    const numbers = silhouette!.path
      .replace(/[MLZ]/g, " ")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    expect(numbers.every((n) => Number.isFinite(n))).toBe(true);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(padding - 0.01);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(size - padding + 0.01);
  });

  it("draws north upwards: the top of the country has the smaller y", () => {
    const silhouette = buildSilhouette(square)!;
    const points = silhouette.path
      .slice(1, -1)
      .split("L")
      .map((pair) => pair.split(",").map(Number) as [number, number]);
    const southWest = points[0]; // first vertex of the ring is [west, south]
    const northWest = points[3]; // [west, north]
    expect(northWest[1]).toBeLessThan(southWest[1]);
  });

  it("draws every significant part as its own subpath", () => {
    const twoParts = feature("TWO", [[ring(0, 0, 10, 10)], [ring(20, 0, 8, 8)]]);
    const silhouette = buildSilhouette(twoParts)!;
    expect(silhouette.path.match(/M/g)).toHaveLength(2);
  });

  it("is looked up by country code, and is null for a code the dataset lacks", () => {
    const countries: CountryCollection = { type: "FeatureCollection", features: [square] };
    expect(silhouetteOfCountry(countries, "SQR")).not.toBeNull();
    expect(silhouetteOfCountry(countries, "XXX")).toBeNull();
  });
});

describe("country-shapes — the camera for a hint", () => {
  it("centres on the country and zooms in more for a smaller one", () => {
    const big = cameraForBounds({ west: -40, south: -40, east: 40, north: 40 });
    const small = cameraForBounds({ west: 67, south: 36, east: 75, north: 41 });
    expect(big.center).toEqual([0, 0]);
    expect(small.center[0]).toBeCloseTo(71, 5);
    expect(small.zoom).toBeGreaterThan(big.zoom);
    expect(big.zoom).toBeGreaterThanOrEqual(1.2);
    expect(small.zoom).toBeLessThanOrEqual(5);
  });

  it("survives a degenerate bounding box", () => {
    const camera = cameraForBounds({ west: 10, south: 10, east: 10, north: 10 });
    expect(Number.isFinite(camera.zoom)).toBe(true);
    expect(camera.zoom).toBeLessThanOrEqual(5);
  });
});

describe("country-shapes — one run of the mission", () => {
  it("asks for SHAPES_PER_RUN different countries from the curated list", () => {
    const run = shuffledShapes();
    expect(run).toHaveLength(SHAPES_PER_RUN);
    expect(new Set(run).size).toBe(SHAPES_PER_RUN);
    for (const code of run) expect(SHAPE_COUNTRY_CODES).toContain(code);
  });

  it("can be limited to the countries the loaded dataset actually has", () => {
    const countries: CountryCollection = {
      type: "FeatureCollection",
      features: [feature("TJK", [[ring(67, 36, 8, 5)]]), feature("ITA", [[ring(6, 36, 12, 11)]])],
    };
    const available = availableShapeCodes(countries);
    expect(available).toEqual(["TJK", "ITA"]);
    const run = shuffledShapes(Math.random, 4, available);
    expect(run).toHaveLength(2);
  });

  it("is driven by the random source it is given", () => {
    const always = (value: number) => () => value;
    expect(shuffledShapes(always(0))).not.toEqual(shuffledShapes(always(0.999999)));
  });
});
