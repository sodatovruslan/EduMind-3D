// G6.10 — вынесено из /geoworld-maplibre-spike. Строит MapLibre style JSON
// (globe projection + imagery tiers + terrain + hillshade + borders/cities)
// как чистую функцию от конфигурации — без побочных эффектов, без
// зависимости от React/DOM (кроме типа `any` для стиля MapLibre, т.к.
// движок грузится через CDN/self-hosted script, не npm-типы).
import { BLUEMARBLE_MAX_ZOOM, ESRI_MAX_ZOOM, ESRI_MIN_ZOOM, ESRI_URL, GIBS_ATTRIBUTION, GIBS_URL } from "./imagery-sources";
import { TERRAIN_MAX_ZOOM, TERRAIN_URL, TERRAIN_ATTRIBUTION, DEFAULT_TERRAIN_EXAGGERATION } from "./terrain";

export interface BuildStyleOptions {
  /** Показывать Esri eval-only слой. По умолчанию `false` в production-контексте (§16: не production dependency). */
  esriEnabled?: boolean;
  terrainExaggeration?: number;
}

/**
 * "no-HLS" стиль всегда используется при инициализации (см. G6.9 —
 * прогрессивная загрузка: карта не должна ждать необязательный HLS-tier
 * для первого кадра). HLS подключается ОТДЕЛЬНО, поверх уже созданной
 * карты, см. `upgradeStyleWithHls` ниже — та же архитектура, что
 * `/geoworld-maplibre-spike` использует с G6.9.
 */
export function buildBaseStyle(options: BuildStyleOptions = {}): any {
  const { esriEnabled = false, terrainExaggeration = DEFAULT_TERRAIN_EXAGGERATION } = options;

  const sources: Record<string, any> = {
    "gibs-bluemarble": {
      type: "raster",
      tiles: [GIBS_URL],
      tileSize: 256,
      minzoom: 0,
      maxzoom: BLUEMARBLE_MAX_ZOOM,
      attribution: GIBS_ATTRIBUTION,
    },
    "esri-world-imagery": {
      type: "raster",
      tiles: [ESRI_URL],
      tileSize: 256,
      minzoom: ESRI_MIN_ZOOM,
      maxzoom: ESRI_MAX_ZOOM,
      attribution: "Esri World Imagery — EVALUATION ONLY",
    },
    "aws-terrarium": {
      type: "raster-dem",
      tiles: [TERRAIN_URL],
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: TERRAIN_MAX_ZOOM,
      attribution: TERRAIN_ATTRIBUTION,
    },
    "country-borders": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    "country-labels": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    "city-points": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  };

  return {
    version: 8,
    projection: { type: "globe" },
    sources,
    sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
    light: { anchor: "map", position: [1.5, 90, 80] },
    terrain: { source: "aws-terrarium", exaggeration: terrainExaggeration },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#000814" } },
      {
        id: "bluemarble",
        type: "raster",
        source: "gibs-bluemarble",
        paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 6, 1, 9, 0], "raster-fade-duration": 400 },
      },
      {
        id: "esri-imagery",
        type: "raster",
        source: "esri-world-imagery",
        layout: { visibility: esriEnabled ? "visible" : "none" },
        paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 8, 1], "raster-fade-duration": 400 },
      },
      {
        id: "hillshade",
        type: "hillshade",
        source: "aws-terrarium",
        paint: { "hillshade-exaggeration": 0.6, "hillshade-illumination-direction": 315, "hillshade-shadow-color": "#0b0b12" },
      },
      {
        id: "borders-line",
        type: "line",
        source: "country-borders",
        paint: { "line-color": "#fbbf24", "line-width": 1.1, "line-opacity": 0.85 },
      },
      {
        id: "country-label",
        type: "symbol",
        source: "country-labels",
        maxzoom: 6,
        layout: { "text-field": ["get", "NAME"], "text-font": ["Open Sans Bold"], "text-size": 13, "text-allow-overlap": false },
        paint: { "text-color": "#fde68a", "text-halo-color": "#000000", "text-halo-width": 1.4 },
      },
      {
        id: "city-point",
        type: "circle",
        source: "city-points",
        filter: ["<=", ["get", "EFFECTIVE_RANK"], ["step", ["zoom"], 3, 3, 6, 5, 9, 8, 14]],
        paint: {
          "circle-radius": ["case", ["==", ["get", "ADM0CAP"], 1], 5, 3],
          "circle-color": ["case", ["==", ["get", "ADM0CAP"], 1], "#fbbf24", "#e2e8f0"],
          "circle-stroke-color": "#000000",
          "circle-stroke-width": 1,
        },
      },
      {
        id: "city-label",
        type: "symbol",
        source: "city-points",
        filter: ["<=", ["get", "EFFECTIVE_RANK"], ["step", ["zoom"], 3, 3, 6, 5, 9, 8, 14]],
        layout: {
          "text-field": ["get", "DISPLAY_NAME"],
          "text-font": ["Open Sans Regular"],
          "text-size": ["case", ["==", ["get", "ADM0CAP"], 1], 13, 11],
          "text-offset": [0.8, 0],
          "text-anchor": "left",
          "text-allow-overlap": false,
          "symbol-sort-key": ["get", "EFFECTIVE_RANK"],
        },
        paint: {
          "text-color": ["case", ["==", ["get", "ADM0CAP"], 1], "#fbbf24", "#e2e8f0"],
          "text-halo-color": "#000000",
          "text-halo-width": 1.2,
        },
      },
    ],
  };
}

/**
 * HLS резолвится и подключается ПОСЛЕ того, как карта уже создана и
 * рендерится — честное необязательное улучшение, не условие первого
 * кадра (см. G6.9). Мутирует уже созданную `map` через addSource/addLayer/
 * setPaintProperty, а не пересоздаёт стиль.
 */
export function upgradeStyleWithHls(map: any, hlsTileUrl: string, hlsAttribution: string, esriEnabled: boolean): void {
  map.addSource("gibs-hls", {
    type: "raster",
    tiles: [hlsTileUrl],
    tileSize: 256,
    minzoom: 5,
    // Source-maxzoom НЕ ограничивает, докуда HLS остаётся ВИДИМЫМ (это
    // делает paint-opacity ниже) — только докуда MapLibre сам тянет новые
    // тайлы; за пределами он честно overzoom'ит последний загруженный.
    maxzoom: 10,
    attribution: hlsAttribution,
  });
  // РЕАЛЬНЫЙ баг, найденный по скриншоту владельца продукта (deep zoom на
  // Памир): прежняя кривая гасила HLS к zoom 10 в расчёте, что Esri
  // "подхватит" выше по zoom — но если Esri по умолчанию ВЫКЛЮЧЕН
  // (production, §16 — не production dependency), слой скрыт
  // (`layout.visibility: "none"`) НЕЗАВИСИМО от своей opacity, и после
  // zoom 10 не остаётся вообще никакой картинки — только hillshade-рельеф
  // без цвета. Если Esri не включён — HLS не гаснет вообще (пусть
  // overzoom'ленный/размытый, но видимый), затухание до Esri актуально
  // ТОЛЬКО когда Esri реально будет показан.
  const hlsOpacity = esriEnabled
    ? ["interpolate", ["linear"], ["zoom"], 5, 0, 7, 1, 8, 1, 10, 0]
    : ["interpolate", ["linear"], ["zoom"], 5, 0, 7, 1];
  map.addLayer(
    {
      id: "hls",
      type: "raster",
      source: "gibs-hls",
      paint: { "raster-opacity": hlsOpacity, "raster-fade-duration": 400 },
    },
    "esri-imagery"
  );
  map.setPaintProperty("bluemarble", "raster-opacity", ["interpolate", ["linear"], ["zoom"], 5, 1, 7, 0]);
  if (esriEnabled) {
    map.setPaintProperty("esri-imagery", "raster-opacity", ["interpolate", ["linear"], ["zoom"], 7, 0, 9, 1]);
  }
}
