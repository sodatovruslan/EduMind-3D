// "Which continent did the student click?" — answered from real country
// outlines (Natural Earth, the same file the globe already loads for
// labels), not from rough latitude/longitude boxes: a click in the ocean is
// the ocean, and Arabia is not Africa. Pure functions, no map or React.
//
// The six continents follow the school course used in the CIS: Eurasia is
// one continent (Europe and Asia are "parts of the world", not continents),
// and Australia is the mainland only — the islands of Oceania are not it.

export type MaterikId = "eurasia" | "africa" | "north_america" | "south_america" | "australia" | "antarctica";

export const MATERIK_IDS: readonly MaterikId[] = [
  "eurasia",
  "africa",
  "north_america",
  "south_america",
  "australia",
  "antarctica",
];

/** Where to point the camera to show a continent: [lng, lat] and a zoom that fits it. */
export const MATERIK_VIEW: Record<MaterikId, { center: [number, number]; zoom: number }> = {
  eurasia: { center: [80, 48], zoom: 1.6 },
  africa: { center: [20, 3], zoom: 1.9 },
  north_america: { center: [-100, 45], zoom: 1.8 },
  south_america: { center: [-60, -18], zoom: 1.9 },
  australia: { center: [134, -25], zoom: 2.4 },
  antarctica: { center: [0, -78], zoom: 1.6 },
};

type Position = [number, number];
type Ring = Position[];

export interface CountryFeature {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
}

export interface CountryCollection {
  type?: string;
  features: CountryFeature[];
}

export interface ContinentHit {
  /** The continent, or null when the land is an island that belongs to no continent (Oceania). */
  materik: MaterikId | null;
  /** Country properties from the dataset, for naming the place in feedback. */
  country: Record<string, unknown>;
}

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
function inPolygon(lng: number, lat: number, polygon: Ring[]): boolean {
  if (polygon.length === 0 || !inRing(lng, lat, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) if (inRing(lng, lat, polygon[i])) return false;
  return true;
}

function polygonsOf(geometry: CountryFeature["geometry"]): Ring[][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates as Ring[]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Ring[][];
  return [];
}

/**
 * Continent of a country in the dataset. `lng` settles the countries whose
 * territory spans two continents in one feature (France with French Guiana).
 */
export function materikOfCountry(properties: Record<string, unknown>, lng: number): MaterikId | null {
  const continent = String(properties.CONTINENT ?? "");
  const code = String(properties.ADM0_A3 ?? "");
  if (code === "FRA" && lng < -30) return "south_america";
  switch (continent) {
    case "Asia":
    case "Europe":
      return "eurasia";
    case "Africa":
      return "africa";
    case "North America":
      return "north_america";
    case "South America":
      return "south_america";
    case "Antarctica":
      return "antarctica";
    case "Oceania":
      return code === "AUS" ? "australia" : null;
    default:
      return null;
  }
}

/**
 * The country whose border contains this point, or null for open water.
 * The single place where "what did the student click" is answered — the
 * continent, the records and the country-shape missions all go through it.
 */
export function countryAt(lng: number, lat: number, countries: CountryCollection): Record<string, unknown> | null {
  for (const feature of countries.features) {
    for (const polygon of polygonsOf(feature.geometry)) {
      if (inPolygon(lng, lat, polygon)) return feature.properties;
    }
  }
  return null;
}

/** The feature of one country by its ADM0_A3 code, for drawing its outline. */
export function countryByCode(countries: CountryCollection, adm0: string): CountryFeature | null {
  return countries.features.find((feature) => String(feature.properties.ADM0_A3 ?? "") === adm0) ?? null;
}

/** What is at this point: a continent, an island outside the continents, or null for open water. */
export function continentAt(lng: number, lat: number, countries: CountryCollection): ContinentHit | null {
  // the dataset stops short of the pole; everything south of 85°S is Antarctica
  if (lat <= -85) return { materik: "antarctica", country: { CONTINENT: "Antarctica", NAME: "Antarctica", NAME_RU: "Антарктида" } };
  const country = countryAt(lng, lat, countries);
  return country ? { materik: materikOfCountry(country, lng), country } : null;
}

/**
 * The same outlines with a MATERIK property on every feature, so the globe
 * can tint a whole continent with one filter. Features that span two
 * continents are tagged by their main territory.
 */
export function tagCountriesWithMaterik(countries: CountryCollection): CountryCollection {
  return {
    type: "FeatureCollection",
    features: countries.features.map((feature) => ({
      ...feature,
      properties: { ...feature.properties, MATERIK: materikOfCountry(feature.properties, 0) ?? "none" },
    })),
  };
}

/** A new random order of the six continents (Fisher–Yates). */
export function shuffledMateriki(random: () => number = Math.random): MaterikId[] {
  const order = [...MATERIK_IDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
