// "Guess the country by its shape" mission: a silhouette is drawn next to
// the globe and the student has to find that country on the globe itself.
//
// The silhouette is built from the SAME Natural Earth outlines the globe
// draws — not from hand-made pictures — so the shape on the card and the
// country under the finger are the same geometry, and a right answer can be
// checked honestly with a point-in-polygon test.
//
// Pure: no map, no React, no DOM. The projection is a local equirectangular
// one (longitude shrunk by cos of the middle latitude), which keeps a
// country looking like itself instead of smeared sideways near the poles.

import type { CountryCollection, CountryFeature } from "./continents";
import { countryByCode } from "./continents";

/**
 * The countries this mission may ask for, by Natural Earth ADM0_A3 code.
 * Chosen on purpose: every one of them is a single compact territory whose
 * outline is recognisable at card size, and the list leads with the ones a
 * Central Asian classroom sees on the wall map every day. Countries whose
 * dataset geometry would mislead (overseas territories far from the
 * mainland, or a border crossing the antimeridian) are deliberately absent.
 */
export const SHAPE_COUNTRY_CODES: readonly string[] = [
  "TJK",
  "UZB",
  "KAZ",
  "IND",
  "ITA",
  "JPN",
  "BRA",
  "EGY",
  "TUR",
  "CHL",
  "AUS",
  "MNG",
];

/** How many countries one run of the mission asks for. */
export const SHAPES_PER_RUN = 4;

export type Ring = [number, number][];

function polygonsOf(geometry: CountryFeature["geometry"]): Ring[][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates as Ring[]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Ring[][];
  return [];
}

/** Planar area of a ring, in squared degrees — only ever used to compare parts of one country. */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(sum / 2);
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function boundsOfRings(rings: readonly Ring[]): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

/**
 * The parts of a country worth drawing: the biggest landmass plus every
 * island at least `minShare` of it. Tiny far-away specks are dropped —
 * otherwise they stretch the bounding box and shrink the actual country to
 * a dot on the card.
 */
export function significantRings(feature: CountryFeature, minShare = 0.05): Ring[] {
  const rings: Ring[] = [];
  for (const polygon of polygonsOf(feature.geometry)) {
    // ring 0 is the outline, the rest are holes; holes travel with their polygon
    for (const ring of polygon) if (ring.length > 2) rings.push(ring);
  }
  if (rings.length === 0) return [];
  const areas = rings.map(ringArea);
  const largest = Math.max(...areas);
  return rings.filter((_, i) => areas[i] >= largest * minShare);
}

export interface Silhouette {
  /** SVG path data in a `size` × `size` box, north up. */
  path: string;
  size: number;
  bounds: Bounds;
}

/**
 * Build the silhouette of a country, fitted into a square box with padding
 * and centred. Returns null when the feature carries no usable geometry.
 */
export function buildSilhouette(feature: CountryFeature, size = 160, padding = 8): Silhouette | null {
  const rings = significantRings(feature);
  const bounds = boundsOfRings(rings);
  if (!bounds) return null;

  const latScale = Math.cos(((bounds.north + bounds.south) / 2) * (Math.PI / 180)) || 1;
  const width = Math.max((bounds.east - bounds.west) * latScale, 1e-6);
  const height = Math.max(bounds.north - bounds.south, 1e-6);
  const inner = size - padding * 2;
  const scale = Math.min(inner / width, inner / height);
  // centre whichever axis does not fill the box
  const offsetX = padding + (inner - width * scale) / 2;
  const offsetY = padding + (inner - height * scale) / 2;

  const project = (lng: number, lat: number): [number, number] => [
    offsetX + (lng - bounds.west) * latScale * scale,
    // SVG y grows downwards, latitude grows upwards
    offsetY + (bounds.north - lat) * scale,
  ];

  const parts: string[] = [];
  for (const ring of rings) {
    const points = ring.map(([lng, lat]) => {
      const [x, y] = project(lng, lat);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    if (points.length > 2) parts.push(`M${points.join("L")}Z`);
  }
  return parts.length > 0 ? { path: parts.join(""), size, bounds } : null;
}

/** Silhouette of a country by code, or null when it is not in the dataset. */
export function silhouetteOfCountry(countries: CountryCollection, adm0: string, size = 160): Silhouette | null {
  const feature = countryByCode(countries, adm0);
  return feature ? buildSilhouette(feature, size) : null;
}

/** A camera that frames the given bounds: centre plus a zoom that fits the wider side. */
export function cameraForBounds(bounds: Bounds): { center: [number, number]; zoom: number } {
  const spanLng = Math.max(bounds.east - bounds.west, 0.5);
  const spanLat = Math.max(bounds.north - bounds.south, 0.5);
  const span = Math.max(spanLng, spanLat * 1.6);
  const zoom = Math.max(1.2, Math.min(5, Math.log2(360 / span) - 0.4));
  return { center: [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2], zoom };
}

/** Which of the asked countries exist in the loaded dataset (guards a silent empty card). */
export function availableShapeCodes(countries: CountryCollection): string[] {
  return SHAPE_COUNTRY_CODES.filter((code) => countryByCode(countries, code) !== null);
}

/** A new random set of countries for one run (Fisher-Yates, then the first `count`). */
export function shuffledShapes(
  random: () => number = Math.random,
  count: number = SHAPES_PER_RUN,
  pool: readonly string[] = SHAPE_COUNTRY_CODES
): string[] {
  const codes = [...pool];
  for (let i = codes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [codes[i], codes[j]] = [codes[j], codes[i]];
  }
  return codes.slice(0, Math.max(1, Math.min(count, codes.length)));
}
