import type { GeoFeatureCollection } from "../vector-geojson";
import { VectorDatasetLoader } from "../vector-dataset-loader";

// USGS Earthquake Hazards Program — общественное достояние (US government
// work), подтверждено эмпирически (access-control-allow-origin: * на
// реальном GET). Сознательно ОГРАНИЧЕННЫЙ снимок (M4.5+, последние 30
// дней) — не живой поток: по прямому указанию G6 GeoWorld должен оставаться
// детерминированным для преподавания, а не меняться у преподавателя на
// глазах между показами одного и того же урока в течение дня.
export const EARTHQUAKES_ATTRIBUTION =
  "Earthquake data: USGS Earthquake Hazards Program (public domain) — magnitude 4.5+, past 30 days, snapshot (not live)";

const FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";

export interface EarthquakeProperties {
  mag: number;
  place: string;
  time: number;
  url: string;
}

// USGS Point-геометрия — [lng, lat, depth_km], не стандартный 2-элементный
// LngLat — третья координата (глубина в км) нам реально нужна для инфокарты.
export interface EarthquakePointGeometry {
  type: "Point";
  coordinates: [number, number, number];
}

export type EarthquakeFeatureCollection = GeoFeatureCollection<EarthquakePointGeometry, EarthquakeProperties>;

export function createEarthquakeLoader(fetchImpl?: typeof fetch): VectorDatasetLoader<EarthquakeFeatureCollection> {
  return new VectorDatasetLoader<EarthquakeFeatureCollection>(() => FEED_URL, { fetchImpl });
}

/** Три бина по магнитуде — ровно то, что показано в легенде (layer-registry.ts). */
export function magnitudeColor(mag: number): string {
  if (mag >= 6.5) return "#ef4444";
  if (mag >= 5.5) return "#fb923c";
  return "#fde047";
}
