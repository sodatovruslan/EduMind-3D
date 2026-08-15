// G6.10 — вынесено из /geoworld-maplibre-spike. Чистые данные (без React/
// MapLibre-зависимостей) — координаты и camera presets, проверенные через
// G6.7 (визуально владельцем продукта) и G6.8.x (georeferencing validation,
// см. GEOWORLD_ROADMAP.md "Verdict: GEOREFERENCING VERIFIED").

export interface CameraPreset {
  center: readonly [number, number];
  zoom: number;
  pitch: number;
  label: string;
}

export const LOCATIONS = {
  earth: { center: [0, 20], zoom: 1.3, pitch: 0, label: "Вся Земля" },
  asia: { center: [90, 35], zoom: 2.6, pitch: 0, label: "Азия" },
  centralAsia: { center: [70, 40], zoom: 4.0, pitch: 0, label: "Центральная Азия" },
  tajikistan: { center: [71.0, 38.8], zoom: 6.2, pitch: 45, label: "Таджикистан" },
  dushanbe: { center: [68.773879, 38.560035], zoom: 11.5, pitch: 60, label: "Душанбе (столица)" },
  pamir: { center: [72.0, 38.5], zoom: 9.2, pitch: 65, label: "Памир" },
} as const;

export type LocationKey = keyof typeof LOCATIONS;

/**
 * Georeferencing regression anchors (G6.8.x) — координаты из НАДЁЖНЫХ
 * источников, не угаданы, независимо перепроверены:
 *
 * 1. Памятник Исмоили Сомони — OSM Nominatim (way 1375034135) + Wikidata
 *    (независимо согласуются, расхождение ~2 метра).
 * 2. Гипрозем — OSM Nominatim (relation 3951319, building).
 * 3. 46-й микрорайон — OSM Nominatim (relation 11017357, admin boundary).
 *
 * ПРЯМОЕ УКАЗАНИЕ G6.10 §6: сохранить именно эти три точки как
 * regression/reference anchors — не менять координаты без нового
 * research-цикла (см. georeferencing.test.ts, который проверяет tile-
 * coordinate math именно на этих значениях).
 */
export const CONTROL_POINTS = {
  ismoiliSomoni: {
    center: [68.7853518, 38.5739336] as [number, number],
    label: "Памятник Исмоили Сомони",
    source: "OSM Nominatim way 1375034135 + Wikidata (независимо согласуются, ~2м)",
  },
  giprozem: {
    center: [68.7380377, 38.5112209] as [number, number],
    label: "Гипрозем",
    source: "OSM Nominatim relation 3951319 (building=Гипрозем)",
  },
  microdistrict46: {
    center: [68.7663808, 38.5289730] as [number, number],
    label: "46-й микрорайон",
    source: "OSM Nominatim relation 11017357 (admin boundary centroid)",
  },
} as const;

export type ControlPointKey = keyof typeof CONTROL_POINTS;
