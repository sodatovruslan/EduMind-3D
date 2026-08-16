import { describe, expect, it } from "vitest";
import { buildPlateNameLookup, plateBoundaryColor, type PlatePolygonFeatureCollection } from "./tectonic-plates";

describe("GeoWorld G6 — tectonic-plates: цвет по классификации PB2002", () => {
  it("subduction — оранжевый (зона субдукции)", () => {
    expect(plateBoundaryColor("subduction")).toBe("#f97316");
  });

  it("пустая/любая другая классификация — жёлтый (обычная граница)", () => {
    expect(plateBoundaryColor("")).toBe("#facc15");
    expect(plateBoundaryColor("unknown")).toBe("#facc15");
  });
});

describe("GeoWorld G6 — buildPlateNameLookup: код плиты → человекочитаемое имя", () => {
  it("строит корректную карту Code → PlateName", () => {
    const polygons: PlatePolygonFeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { Code: "AF", PlateName: "Africa" } },
        { type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { Code: "AN", PlateName: "Antarctica" } },
      ],
    };
    const lookup = buildPlateNameLookup(polygons);
    expect(lookup.get("AF")).toBe("Africa");
    expect(lookup.get("AN")).toBe("Antarctica");
    expect(lookup.get("XX")).toBeUndefined();
  });
});
