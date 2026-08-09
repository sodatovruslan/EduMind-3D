import { describe, expect, it, vi } from "vitest";
import { createEarthquakeLoader, magnitudeColor } from "./earthquakes";

describe("GeoWorld G6 — magnitudeColor: три бина по легенде", () => {
  it("M >= 6.5 — красный", () => {
    expect(magnitudeColor(6.5)).toBe("#ef4444");
    expect(magnitudeColor(7.8)).toBe("#ef4444");
  });

  it("5.5 <= M < 6.5 — оранжевый", () => {
    expect(magnitudeColor(5.5)).toBe("#fb923c");
    expect(magnitudeColor(6.4)).toBe("#fb923c");
  });

  it("M < 5.5 — жёлтый (нижний бин, включая ровно 4.5)", () => {
    expect(magnitudeColor(4.5)).toBe("#fde047");
    expect(magnitudeColor(5.4)).toBe("#fde047");
  });
});

describe("GeoWorld G6 — createEarthquakeLoader: запрашивает правильный снимок USGS", () => {
  it("бьёт по URL снимка M4.5+ за месяц (не живой поток)", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ type: "FeatureCollection", features: [] }) })) as unknown as typeof fetch;
    const loader = createEarthquakeLoader(fetchImpl);
    await loader.load("default");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson",
      expect.anything()
    );
  });
});
