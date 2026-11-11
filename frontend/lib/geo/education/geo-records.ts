// "Records of the Earth" mission: the student is asked for the longest
// mountain range, the deepest place in the ocean, the biggest country — and
// has to find it on the globe. Pure data and pure geometry, no map and no
// React, so the checks are testable without WebGL.
//
// Two kinds of answers live side by side on purpose:
//   * countries are checked against the real Natural Earth outlines the
//     globe already loads (a click is right only inside the actual border);
//   * physical features (a range, a river, a desert, a trench) have no
//     polygons in that file, so each carries its own curated anchor — a
//     point, a line or a box, with the tolerance written down next to it.
// Nothing here is guessed at runtime: every coordinate is a fixed, checked
// value, and the tolerance is part of the definition of the question.

import type { CountryCollection } from "./continents";
import { countryAt } from "./continents";

export type GeoRecordId =
  | "andes"
  | "everest"
  | "sahara"
  | "nile"
  | "mariana"
  | "baikal"
  | "dead-sea"
  | "caspian"
  | "russia"
  | "greenland";

export type LngLat = readonly [number, number];

export type RecordTarget =
  /** The whole territory of a country, by its Natural Earth ADM0_A3 code. */
  | { kind: "country"; adm0: string }
  /** A single place: right when the click lands within radiusKm of it. */
  | { kind: "point"; center: LngLat; radiusKm: number }
  /** A long feature (a river, a mountain range): a line with a corridor around it. */
  | { kind: "path"; points: readonly LngLat[]; radiusKm: number }
  /** An area that is roughly a box on the map (a desert, a sea). */
  | { kind: "bbox"; bbox: readonly [number, number, number, number] };

export interface GeoRecord {
  id: GeoRecordId;
  target: RecordTarget;
  /** Where the camera goes for the hint and after a correct answer. */
  view: { center: LngLat; zoom: number };
}

/** How many questions one run of the mission asks (drawn from the pool below). */
export const RECORDS_PER_RUN = 5;

export const GEO_RECORDS: readonly GeoRecord[] = [
  {
    id: "andes",
    // the range runs from the Caribbean coast down to Tierra del Fuego
    target: {
      kind: "path",
      points: [
        [-71.5, 10.5],
        [-75.5, 0.0],
        [-77.5, -10.0],
        [-70.0, -20.0],
        [-70.5, -33.0],
        [-71.5, -45.0],
        [-72.5, -52.0],
      ],
      radiusKm: 320,
    },
    view: { center: [-70, -25], zoom: 2 },
  },
  {
    id: "everest",
    target: { kind: "point", center: [86.925, 27.988], radiusKm: 320 },
    view: { center: [86.925, 27.988], zoom: 4.2 },
  },
  {
    id: "sahara",
    target: { kind: "bbox", bbox: [-16, 15, 33, 30] },
    view: { center: [10, 22], zoom: 2.2 },
  },
  {
    id: "nile",
    target: {
      kind: "path",
      points: [
        [31.23, 30.05],
        [32.9, 24.1],
        [32.53, 15.6],
        [31.5, 9.5],
        [31.0, 4.8],
        [30.5, 0.4],
      ],
      radiusKm: 220,
    },
    view: { center: [31.5, 18], zoom: 2.6 },
  },
  {
    id: "mariana",
    target: { kind: "point", center: [142.2, 11.37], radiusKm: 420 },
    view: { center: [142.2, 11.37], zoom: 3.8 },
  },
  {
    id: "baikal",
    target: {
      kind: "path",
      points: [
        [103.9, 51.6],
        [106.5, 52.6],
        [108.5, 54.2],
        [109.6, 55.6],
      ],
      radiusKm: 180,
    },
    view: { center: [107.5, 53.4], zoom: 3.6 },
  },
  {
    id: "dead-sea",
    target: { kind: "point", center: [35.5, 31.5], radiusKm: 140 },
    view: { center: [35.5, 31.5], zoom: 4.6 },
  },
  {
    id: "caspian",
    target: { kind: "bbox", bbox: [46.8, 36.6, 54.8, 47.0] },
    view: { center: [51, 42], zoom: 3.2 },
  },
  {
    id: "russia",
    target: { kind: "country", adm0: "RUS" },
    view: { center: [95, 62], zoom: 1.7 },
  },
  {
    id: "greenland",
    target: { kind: "country", adm0: "GRL" },
    view: { center: [-42, 72], zoom: 2.1 },
  },
];

export const RECORD_IDS: readonly GeoRecordId[] = GEO_RECORDS.map((r) => r.id);

export function recordById(id: GeoRecordId): GeoRecord {
  const found = GEO_RECORDS.find((r) => r.id === id);
  if (!found) throw new Error(`unknown geo record: ${id}`);
  return found;
}

// ---- geometry ---------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance from a point to a segment. Works on a local flat projection
 * (longitude shrunk by cos(latitude)) — over the few hundred kilometres a
 * tolerance corridor spans, the error against the true great-circle
 * distance is far smaller than the corridor itself.
 */
function distanceToSegmentKm(p: LngLat, a: LngLat, b: LngLat): number {
  const latScale = Math.cos(toRad((a[1] + b[1]) / 2));
  const px = p[0] * latScale;
  const ax = a[0] * latScale;
  const bx = b[0] * latScale;
  const dx = bx - ax;
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (p[1] - a[1]) * dy) / lengthSq));
  const nearest: LngLat = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return haversineKm(p, nearest);
}

function distanceToPathKm(p: LngLat, points: readonly LngLat[]): number {
  if (points.length === 1) return haversineKm(p, points[0]);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegmentKm(p, points[i - 1], points[i]));
  return best;
}

function distanceToBboxKm(p: LngLat, bbox: readonly [number, number, number, number]): number {
  const [west, south, east, north] = bbox;
  const lng = Math.max(west, Math.min(east, p[0]));
  const lat = Math.max(south, Math.min(north, p[1]));
  return haversineKm(p, [lng, lat]);
}

function centerOf(target: RecordTarget, fallback: LngLat): LngLat {
  if (target.kind === "point") return target.center;
  if (target.kind === "bbox") return [(target.bbox[0] + target.bbox[2]) / 2, (target.bbox[1] + target.bbox[3]) / 2];
  if (target.kind === "path") return target.points[Math.floor(target.points.length / 2)];
  return fallback;
}

/** Did this click answer the question? */
export function isRecordHit(record: GeoRecord, click: LngLat, countries: CountryCollection | null): boolean {
  const target = record.target;
  switch (target.kind) {
    case "point":
      return haversineKm(click, target.center) <= target.radiusKm;
    case "path":
      return distanceToPathKm(click, target.points) <= target.radiusKm;
    case "bbox": {
      const [west, south, east, north] = target.bbox;
      return click[0] >= west && click[0] <= east && click[1] >= south && click[1] <= north;
    }
    case "country": {
      if (!countries) return false;
      const hit = countryAt(click[0], click[1], countries);
      return Boolean(hit && String(hit.ADM0_A3 ?? "") === target.adm0);
    }
  }
}

/**
 * How far the click is from the answer, in kilometres — 0 when it is a hit.
 * For a country the outlines are needed; without them the distance falls
 * back to the camera view of the record, which is enough for "you are far
 * away" feedback and never claims a hit.
 */
export function distanceToRecordKm(record: GeoRecord, click: LngLat, countries: CountryCollection | null): number {
  const target = record.target;
  switch (target.kind) {
    case "point":
      return Math.max(0, haversineKm(click, target.center) - target.radiusKm);
    case "path":
      return Math.max(0, distanceToPathKm(click, target.points) - target.radiusKm);
    case "bbox":
      return distanceToBboxKm(click, target.bbox);
    case "country": {
      if (isRecordHit(record, click, countries)) return 0;
      return haversineKm(click, centerOf(target, record.view.center));
    }
  }
}

/** A new random set of questions for one run (Fisher-Yates, then the first `count`). */
export function shuffledRecords(random: () => number = Math.random, count: number = RECORDS_PER_RUN): GeoRecordId[] {
  const pool = [...RECORD_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(1, Math.min(count, pool.length)));
}
