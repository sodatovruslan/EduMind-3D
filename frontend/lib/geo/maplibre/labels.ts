// G6.10 — вынесено из /geoworld-maplibre-spike (G6.7). Чистые функции
// (без React/MapLibre) — та же Natural Earth дедупликация/LOD-логика,
// что уже была в спайке, теперь переиспользуема production foundation'ом.

export const BORDERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
export const CITIES_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places.geojson";
export const VECTOR_ATTRIBUTION = "Borders/labels: Natural Earth (public domain)";

type Ring = Array<[number, number]>;
type BBox = [number, number, number, number];

function extendBBox(bbox: BBox, ring: Ring): void {
  for (const [lng, lat] of ring) {
    if (lng < bbox[0]) bbox[0] = lng;
    if (lat < bbox[1]) bbox[1] = lat;
    if (lng > bbox[2]) bbox[2] = lng;
    if (lat > bbox[3]) bbox[3] = lat;
  }
}

// Площадь bbox как грубая мера "размера" полигона — та же роль, что у
// Cesium.BoundingSphere.radius в дедупликации Cesium-спайка (G6.6.1):
// выбрать основную территорию страны среди нескольких Feature с одинаковым
// именем (материк vs заморские территории/анклавы), не точная геометрия.
export function polygonBBoxArea(geometry: { type: string; coordinates: unknown }): { bbox: BBox; area: number } {
  const bbox: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates as Ring[]) extendBBox(bbox, ring);
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates as Ring[][]) {
      for (const ring of polygon) extendBBox(bbox, ring);
    }
  }
  const area = Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
  return { bbox, area };
}

export function buildDedupedCountryLabels(countries: {
  features: Array<{ properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }>;
}) {
  const best = new Map<string, { bbox: BBox; area: number }>();
  for (const feature of countries.features) {
    const name = (feature.properties.NAME_RU as string) || (feature.properties.NAME as string);
    if (!name) continue;
    const { bbox, area } = polygonBBoxArea(feature.geometry);
    if (!Number.isFinite(area) || area <= 0) continue;
    const existing = best.get(name);
    if (!existing || area > existing.area) best.set(name, { bbox, area });
  }
  return {
    type: "FeatureCollection" as const,
    features: [...best.entries()].map(([name, { bbox }]) => ({
      type: "Feature" as const,
      properties: { NAME: name },
      geometry: { type: "Point" as const, coordinates: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] },
    })),
  };
}

// Та же формула допуска для столиц, что production `geo-vector-lod.ts`
// (`selectVisibleCities`): столица допускается на 2 ранга раньше обычного
// города того же ранга. Считается один раз при загрузке (не per-frame) —
// MapLibre сам решает видимость через zoom-based `filter` в стиле слоя.
export function annotateCityRank(cities: { features: Array<{ properties: Record<string, unknown> }> }) {
  for (const feature of cities.features) {
    const scaleRank = Number(feature.properties.SCALERANK ?? 8);
    const isCapital = feature.properties.ADM0CAP === 1;
    feature.properties.EFFECTIVE_RANK = isCapital ? Math.max(0, scaleRank - 2) : scaleRank;
    feature.properties.DISPLAY_NAME = (feature.properties.NAME_RU as string) || (feature.properties.NAME as string);
  }
  return cities;
}
