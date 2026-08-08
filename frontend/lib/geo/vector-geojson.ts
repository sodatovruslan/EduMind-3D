// Минимальные типы GeoJSON, которые нам реально нужны — не тянем полноценный
// пакет @types/geojson ради двух геометрий (Polygon/MultiPolygon/Point).
export type LngLat = [number, number];
export type LinearRing = LngLat[];

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: LinearRing[];
}

export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: LinearRing[][];
}

export interface PointGeometry {
  type: "Point";
  coordinates: LngLat;
}

export interface GeoFeature<G, P> {
  type: "Feature";
  geometry: G;
  properties: P;
}

export interface GeoFeatureCollection<G, P> {
  type: "FeatureCollection";
  features: Array<GeoFeature<G, P>>;
}

/**
 * Извлекает все замкнутые кольца (внешние границы + "дыры"-анклавы) из
 * Polygon/MultiPolygon в единый плоский список — для отрисовки границ нам
 * достаточно контуров, полная триангуляция полигона не нужна (мы рисуем
 * линии, не закрашенные страны).
 */
export function extractRings(geometry: PolygonGeometry | MultiPolygonGeometry): LinearRing[] {
  if (geometry.type === "Polygon") return geometry.coordinates;
  return geometry.coordinates.flat();
}

/** GeoJSON хранит координаты как [lng, lat] — легко перепутать порядок и получить зеркальную географию. Явная, именованная функция вместо `coord[0]`/`coord[1]` россыпью по коду. */
export function lngLatToLatLng(coord: LngLat): { lat: number; lng: number } {
  return { lat: coord[1], lng: coord[0] };
}

/**
 * Некоторые кольца (например, детальная береговая линия Норвегии в 50m-
 * датасете) содержат тысячи точек — избыточно для контурной линии на
 * масштабе всей планеты. Равномерно прореживает кольцо до maxPoints,
 * сохраняя последнюю точку явно (иначе контур может визуально "не
 * замкнуться" на разрыве шага прореживания).
 */
export function simplifyRing(ring: LinearRing, maxPoints: number): LinearRing {
  if (ring.length <= maxPoints || maxPoints < 2) return ring;
  const stride = Math.ceil(ring.length / maxPoints);
  const result: LinearRing = [];
  for (let i = 0; i < ring.length; i += stride) result.push(ring[i]);
  const last = ring[ring.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}
