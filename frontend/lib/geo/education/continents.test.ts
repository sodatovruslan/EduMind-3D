import { describe, expect, it } from "vitest";
import { MATERIK_IDS, continentAt, materikOfCountry, shuffledMateriki, tagCountriesWithMaterik, type CountryCollection } from "./continents";

const square = (west: number, south: number, east: number, north: number): [number, number][] => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
];

// a tiny stand-in for the Natural Earth file: same properties, simple shapes
const countries: CountryCollection = {
  features: [
    { properties: { NAME: "Kazakhstan", CONTINENT: "Asia", ADM0_A3: "KAZ" }, geometry: { type: "Polygon", coordinates: [square(50, 40, 85, 55)] } },
    { properties: { NAME: "Germany", CONTINENT: "Europe", ADM0_A3: "DEU" }, geometry: { type: "Polygon", coordinates: [square(6, 47, 15, 55)] } },
    {
      properties: { NAME: "France", CONTINENT: "Europe", ADM0_A3: "FRA" },
      geometry: { type: "MultiPolygon", coordinates: [[square(-5, 42, 6, 51)], [square(-54, 2, -52, 5)]] },
    },
    { properties: { NAME: "Australia", CONTINENT: "Oceania", ADM0_A3: "AUS" }, geometry: { type: "Polygon", coordinates: [square(113, -39, 153, -11)] } },
    { properties: { NAME: "New Zealand", CONTINENT: "Oceania", ADM0_A3: "NZL" }, geometry: { type: "Polygon", coordinates: [square(166, -47, 178, -34)] } },
    {
      // a country with a lake cut out of it
      properties: { NAME: "Chad", CONTINENT: "Africa", ADM0_A3: "TCD" },
      geometry: { type: "Polygon", coordinates: [square(14, 8, 24, 23), square(16, 12, 18, 14)] },
    },
  ],
};

describe("continentAt", () => {
  it("treats Europe and Asia as one continent, Eurasia", () => {
    expect(continentAt(70, 48, countries)?.materik).toBe("eurasia");
    expect(continentAt(10, 50, countries)?.materik).toBe("eurasia");
  });

  it("returns null for open water", () => {
    expect(continentAt(-30, 30, countries)).toBeNull();
  });

  it("does not count a hole in a polygon as land", () => {
    expect(continentAt(20, 20, countries)?.materik).toBe("africa");
    expect(continentAt(17, 13, countries)).toBeNull();
  });

  it("puts French Guiana in South America although it is part of the France feature", () => {
    expect(continentAt(-53, 4, countries)?.materik).toBe("south_america");
    expect(continentAt(2, 47, countries)?.materik).toBe("eurasia");
  });

  it("counts mainland Australia but not the islands of Oceania", () => {
    expect(continentAt(134, -25, countries)?.materik).toBe("australia");
    const island = continentAt(172, -41, countries);
    expect(island?.materik).toBeNull();
    expect(island?.country.NAME).toBe("New Zealand");
  });

  it("treats the far south as Antarctica even where the dataset has no outline", () => {
    expect(continentAt(40, -88, countries)?.materik).toBe("antarctica");
  });
});

describe("materikOfCountry", () => {
  it("has no continent for the open-ocean territories", () => {
    expect(materikOfCountry({ CONTINENT: "Seven seas (open ocean)" }, 0)).toBeNull();
  });
});

describe("tagCountriesWithMaterik", () => {
  it("adds MATERIK to every feature without touching the input", () => {
    const tagged = tagCountriesWithMaterik(countries);
    expect(tagged.features.map((f) => f.properties.MATERIK)).toEqual(["eurasia", "eurasia", "eurasia", "australia", "none", "africa"]);
    expect(countries.features[0].properties.MATERIK).toBeUndefined();
  });
});

describe("shuffledMateriki", () => {
  it("returns all six continents exactly once", () => {
    expect([...shuffledMateriki()].sort()).toEqual([...MATERIK_IDS].sort());
  });

  it("is deterministic for a given random source", () => {
    const fixed = () => 0;
    expect(shuffledMateriki(fixed)).toEqual(shuffledMateriki(fixed));
  });
});
