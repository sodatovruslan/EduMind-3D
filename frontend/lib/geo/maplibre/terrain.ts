// G6.10 — вынесено из /geoworld-maplibre-spike (G6.7). ТОТ ЖЕ САМЫЙ
// источник, что уже используется в production
// (`lib/geo/providers/terrarium-grid.ts`) — AWS Open Data
// `elevation-tiles-prod`, Terrarium PNG-кодирование. MapLibre `raster-dem`
// источник поддерживает `encoding: "terrarium"` НАТИВНО — урл идентичен
// production-коду, никакого адаптера не нужно.

export const TERRAIN_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const TERRAIN_ATTRIBUTION = "Terrain: AWS Open Data — elevation-tiles-prod (Terrarium, Mapzen/Tilezen legacy, open)";
export const TERRAIN_MAX_ZOOM = 15;

// Централизованная константа (G6.10 §5 "exaggeration контролируется
// централизованно") — было инлайновое магическое число 1.5 в спайке,
// вынесено сюда единственным источником истины для production foundation.
// НЕ менять без визуальной проверки — 1.5 уже одобрен владельцем продукта
// (G6.7 "3D-рельеф реально читается как горы", G6.9 подтверждено повторно).
export const DEFAULT_TERRAIN_EXAGGERATION = 1.5;
