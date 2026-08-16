import type { GeoFeatureCollection, MultiPolygonGeometry, PointGeometry, PolygonGeometry } from "../vector-geojson";
import { VectorDatasetLoader } from "../vector-dataset-loader";
import type { BorderTier } from "../geo-vector-lod";

// Natural Earth — общественное достояние (public domain), сопровождается
// сообществом на GitHub. raw.githubusercontent.com отдаёт файлы с
// Access-Control-Allow-Origin: * (проверено эмпирически, curl с реальным
// GET — HEAD-запрос к этому источнику CORS-заголовки не показывает вообще,
// это не то же самое, что их отсутствие). Официальной формы атрибуции
// (как у NASA GIBS) у Natural Earth нет — их собственный сайт прямо
// говорит "no attribution required", но проект указывает источник как
// хорошая практика.
export const NATURAL_EARTH_ATTRIBUTION = "Boundaries & place names: Natural Earth (public domain, naturalearthdata.com)";

const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";

// Сознательно ограничено 110m/50m — 10m-датасет (высшая детализация Natural
// Earth) весит десятки МБ, что противоречит требованию не грузить
// избыточные объёмы данных ради образовательного масштаба этой стадии (см.
// GEOWORLD_ROADMAP.md, раздел G5, "Известные ограничения").
const BORDER_URLS: Record<BorderTier, string> = {
  coarse: `${BASE}/ne_110m_admin_0_countries.geojson`,
  medium: `${BASE}/ne_50m_admin_0_countries.geojson`,
};

const CITY_URLS: Record<BorderTier, string> = {
  coarse: `${BASE}/ne_110m_populated_places.geojson`,
  medium: `${BASE}/ne_50m_populated_places.geojson`,
};

export interface CountryProperties {
  NAME: string;
  NAME_RU?: string;
}

export interface CityProperties {
  NAME: string;
  NAME_RU?: string;
  SCALERANK: number;
  // 1 = столица (Admin-0 capital), 0 — обычный город. Реальное поле
  // датасета (проверено на Душанбе — ADM0CAP:1), не выведено эвристически
  // из размера/ранга (по прямому указанию G6: "Do NOT infer capitals from
  // city size unless dataset explicitly supports it").
  ADM0CAP: number;
}

export type CountryFeatureCollection = GeoFeatureCollection<PolygonGeometry | MultiPolygonGeometry, CountryProperties>;
export type CityFeatureCollection = GeoFeatureCollection<PointGeometry, CityProperties>;

export function createBorderLoader(fetchImpl?: typeof fetch): VectorDatasetLoader<CountryFeatureCollection> {
  return new VectorDatasetLoader<CountryFeatureCollection>((tier) => BORDER_URLS[tier as BorderTier], { fetchImpl });
}

export function createCityLoader(fetchImpl?: typeof fetch): VectorDatasetLoader<CityFeatureCollection> {
  return new VectorDatasetLoader<CityFeatureCollection>((tier) => CITY_URLS[tier as BorderTier], { fetchImpl });
}
