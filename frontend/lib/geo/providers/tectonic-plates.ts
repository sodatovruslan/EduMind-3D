import type { GeoFeatureCollection, LineStringGeometry, PolygonGeometry, MultiPolygonGeometry } from "../vector-geojson";
import { VectorDatasetLoader } from "../vector-dataset-loader";

// Peter Bird, "An updated digital model of plate boundaries" (Geochemistry
// Geophysics Geosystems, 2003) — стандартный, широко цитируемый научный
// источник границ плит (модель PB2002). Данные в современном GeoJSON —
// через сообщество-поддерживаемый репозиторий fraxen/tectonicplates,
// лицензия Open Data Commons Attribution License (ODC-BY) — атрибуция
// обязательна (в отличие от Natural Earth/NASA GIBS выше).
export const TECTONIC_PLATES_ATTRIBUTION =
  "Tectonic plate boundaries: Peter Bird (2003) PB2002 model, via fraxen/tectonicplates (ODC-BY)";

const BOUNDARIES_URL = "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json";
const PLATES_URL = "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_plates.json";

export interface PlateBoundaryProperties {
  Name: string;
  PlateA: string;
  PlateB: string;
  // Классификация PB2002 бедна (в реальных данных встречается только
  // "" и "subduction") — не выдумываем недостающие типы (convergent/
  // divergent/transform), честно показываем то, что есть в источнике.
  Type: string;
}

export interface PlatePolygonProperties {
  Code: string;
  PlateName: string;
}

export type PlateBoundaryFeatureCollection = GeoFeatureCollection<LineStringGeometry, PlateBoundaryProperties>;
export type PlatePolygonFeatureCollection = GeoFeatureCollection<PolygonGeometry | MultiPolygonGeometry, PlatePolygonProperties>;

export function createPlateBoundaryLoader(fetchImpl?: typeof fetch): VectorDatasetLoader<PlateBoundaryFeatureCollection> {
  return new VectorDatasetLoader<PlateBoundaryFeatureCollection>(() => BOUNDARIES_URL, { fetchImpl });
}

export function createPlatePolygonLoader(fetchImpl?: typeof fetch): VectorDatasetLoader<PlatePolygonFeatureCollection> {
  return new VectorDatasetLoader<PlatePolygonFeatureCollection>(() => PLATES_URL, { fetchImpl });
}

/** Цвет границы по классификации PB2002 — только реально существующие в данных значения (см. Type выше). */
export function plateBoundaryColor(type: string): string {
  return type === "subduction" ? "#f97316" : "#facc15";
}

/** Code ("AF") → человекочитаемое имя ("Africa") — для подписи при клике по границе (PlateA/PlateB — коды, не имена). */
export function buildPlateNameLookup(polygons: PlatePolygonFeatureCollection): Map<string, string> {
  const map = new Map<string, string>();
  for (const feature of polygons.features) {
    map.set(feature.properties.Code, feature.properties.PlateName);
  }
  return map;
}
