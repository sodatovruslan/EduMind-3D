// G6.12 — MapLibre-адаптер поверх УЖЕ существующих, лицензионно проверенных
// провайдеров Earth Science данных (lib/geo/providers/*, впервые
// использованы старым R3F-рендерером в G6). Dataset = source of truth
// (§10 задания) — здесь НЕТ новых источников, новых полей, новых типов
// границ — только конвертация в формат, который умеет читать нативный
// MapLibre GeoJSON source (`FeatureCollection`), плюс поддержка
// нескольких временных окон для землетрясений (§18 — реально существующие
// у USGS day/week/month, проверено curl, не выдумано).
import { VectorDatasetLoader } from "../vector-dataset-loader";
import type { GeoFeatureCollection } from "../vector-geojson";
import {
  createPlateBoundaryLoader,
  createPlatePolygonLoader,
  buildPlateNameLookup,
  plateBoundaryColor,
  TECTONIC_PLATES_ATTRIBUTION,
  type PlateBoundaryFeatureCollection,
  type PlatePolygonFeatureCollection,
} from "../providers/tectonic-plates";
import { VolcanoProvider, VOLCANOES_ATTRIBUTION, type VolcanoRecord } from "../providers/volcanoes";
import { magnitudeColor, EARTHQUAKES_ATTRIBUTION, type EarthquakeFeatureCollection, type EarthquakeProperties, type EarthquakePointGeometry } from "../providers/earthquakes";

export {
  buildPlateNameLookup,
  plateBoundaryColor,
  TECTONIC_PLATES_ATTRIBUTION,
  VOLCANOES_ATTRIBUTION,
  magnitudeColor,
  EARTHQUAKES_ATTRIBUTION,
};
export { createPlateBoundaryLoader, createPlatePolygonLoader, VolcanoProvider };
export type { PlateBoundaryFeatureCollection, PlatePolygonFeatureCollection, VolcanoRecord, EarthquakeFeatureCollection };

/**
 * USGS Earthquake Hazards Program — три РЕАЛЬНО поддерживаемых окна (все
 * три проверены curl → HTTP 200). Production R3F-рендерер сознательно
 * использует только "month" (детерминированность урока — см.
 * earthquakes.ts). G6.12 честно предлагает выбор окна, раз API его
 * действительно поддерживает (§18), но по умолчанию оставляет тот же
 * "month" снимок — тот же принцип детерминированности.
 */
export const EARTHQUAKE_WINDOWS = {
  day: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
  week: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
  month: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson",
} as const;
export type EarthquakeWindowKey = keyof typeof EARTHQUAKE_WINDOWS;
export const DEFAULT_EARTHQUAKE_WINDOW: EarthquakeWindowKey = "month";

export function createEarthquakeWindowLoader(fetchImpl?: typeof fetch): VectorDatasetLoader<EarthquakeFeatureCollection> {
  return new VectorDatasetLoader<EarthquakeFeatureCollection>((key) => EARTHQUAKE_WINDOWS[key as EarthquakeWindowKey], { fetchImpl });
}

export type { EarthquakeProperties, EarthquakePointGeometry };

/** NOAA/NCEI отдаёт пагинированный JSON, не GeoJSON — конвертируем один раз в FeatureCollection для MapLibre GeoJSON source. */
export function volcanoesToFeatureCollection(records: VolcanoRecord[]): GeoFeatureCollection<{ type: "Point"; coordinates: [number, number] }, VolcanoRecord> {
  return {
    type: "FeatureCollection",
    features: records.map((r) => ({
      type: "Feature",
      properties: r,
      geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
    })),
  };
}
