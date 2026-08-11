"use client";

/**
 * MapLibre GL JS Engine Spike — сравнение с CesiumJS-спайком
 * (`/geoworld-engine-spike`, G6.6.1) по прямому указанию: полностью
 * ИЗОЛИРОВАННЫЙ dev-only маршрут, НЕ трогает ни production `/geo3d/[id]`,
 * ни Cesium-спайк. Никакой миграции — только визуальная оценка владельцем
 * продукта в браузере.
 *
 * ИСТОЧНИКИ (проверены curl/WebFetch/WebSearch перед реализацией, не по
 * памяти — см. GEOWORLD_ROADMAP.md за полным разбором):
 *
 * 1. Движок: maplibre-gl@5.24.0 — BSD-3-Clause, последняя версия с UMD-
 *    сборкой (`dist/maplibre-gl.js`, глобальный `window.maplibregl`,
 *    загружается через CDN-тег, как и Cesium в соседнем спайке — НЕ трогаем
 *    package.json/webpack). v6.x существует (npm dist-tag "latest" на
 *    момент проверки), но публикует ТОЛЬКО ES-модули (.mjs) без
 *    классического `<script>`-совместимого бандла — сознательно закреплена
 *    v5.24.0 ради того же паттерна подключения, что уже работает для
 *    Cesium. Globe projection появился в 5.0.0 (январь 2025) — 5.24.0 это
 *    покрывает с запасом.
 *
 * 2. Имиджи: NASA GIBS BlueMarble_NextGeneration, EPSG:3857
 *    (GoogleMapsCompatible_Level8) — подтверждено напрямую через
 *    WMTSCapabilities.xml (curl, 5.7MB, разобран построчно), СТАНДАРТНАЯ
 *    XYZ-сетка (TileMatrix=z, TileRow=y, TileCol=x — та же конвенция, что
 *    Google/OSM/MapLibre), поэтому подключается родным MapLibre `raster`-
 *    источником БЕЗ кастомной tiling scheme — в отличие от Cesium-спайка,
 *    где для EPSG:4326 понадобился отдельный адаптер
 *    (gibs-cesium-tiling-scheme.ts). Максимальный уровень — 8 (совпадает с
 *    нативным разрешением датасета, 500 м/пиксель) — тот же честный лимит,
 *    что и в Cesium-спайке (там maximumLevel:7 для EPSG:4326 500m-сетки).
 *    БЕЗ параметра {Time} — статичная бесшовная композитная картинка круглый
 *    год, ни ключа, ни обликов/дат выбирать не нужно (в отличие от
 *    MODIS/VIIRS true-color слоёв, у которых maxzoom выше (9), но которые
 *    ТРЕБУЮТ конкретную дату и могут показывать облака — сознательно не
 *    взяты, ради предсказуемо чистой картинки).
 *
 * 3. Рельеф: ТОТ ЖЕ САМЫЙ источник, что уже используется в production
 *    (`lib/geo/providers/terrarium-grid.ts`) и был предложен для повторного
 *    использования гипотезой в HANDOFF.md — AWS Open Data
 *    `elevation-tiles-prod`, Terrarium PNG-кодирование. Подтверждено curl
 *    (HTTP 200, `Access-Control-Allow-Origin: *`). MapLibre `raster-dem`
 *    источник поддерживает `encoding: "terrarium"` НАТИВНО — никакого
 *    адаптера/конвертации не нужно, урл идентичен production-коду.
 *
 * 4. MapTiler Free (сравнение только по документации, БЕЗ live-кода в этом
 *    спайке): подтверждено, что free-план не требует карты/биллинга
 *    (100k tile-запросов/мес). Не подключён сюда, т.к. требует личного
 *    API-ключа владельца аккаунта — заводить аккаунт от имени пользователя
 *    без явного запроса не стал. Цифры для итогового отчёта взяты из
 *    официальной документации MapTiler.
 *
 * Границы/подписи стран и городов — Natural Earth (те же датасеты/URL, что
 * production G5 и Cesium-спайк G6.6.1), но LOD/anti-spam реализован
 * MapLibre-нативными механизмами: (a) встроенное collision detection у
 * symbol-слоёв (text-allow-overlap:false по умолчанию — перекрывающиеся
 * подписи сами скрываются, без ручного per-frame фильтра), (b) zoom-based
 * `filter`-выражения по SCALERANK вместо Cesium'овского
 * DistanceDisplayCondition. Дедупликация подписей стран (Natural Earth даёт
 * НЕСКОЛЬКО Feature на одну страну — материк + заморские территории) — та
 * же идея, что фикс в Cesium-спайке (G6.6.1, второй раунд): группировка по
 * имени, оставляем только самый большой полигон по площади bbox.
 */

import { useEffect, useRef, useState } from "react";

const MAPLIBRE_VERSION = "5.24.0";
const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

const GIBS_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
const GIBS_ATTRIBUTION = "Imagery: NASA GIBS / Blue Marble Next Generation (public domain)";
const TERRAIN_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const TERRAIN_ATTRIBUTION = "Terrain: AWS Open Data — elevation-tiles-prod (Terrarium, Mapzen/Tilezen legacy, open)";
const BORDERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const CITIES_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places.geojson";
const VECTOR_ATTRIBUTION = "Borders/labels: Natural Earth (public domain)";

const LOCATIONS = {
  earth: { center: [0, 20] as [number, number], zoom: 1.3, pitch: 0, label: "Вся Земля" },
  asia: { center: [90, 35] as [number, number], zoom: 2.6, pitch: 0, label: "Азия" },
  centralAsia: { center: [70, 40] as [number, number], zoom: 4.0, pitch: 0, label: "Центральная Азия" },
  tajikistan: { center: [71.0, 38.8] as [number, number], zoom: 6.2, pitch: 45, label: "Таджикистан" },
  dushanbe: { center: [68.773879, 38.560035] as [number, number], zoom: 11.5, pitch: 60, label: "Душанбе (столица)" },
  pamir: { center: [72.0, 38.5] as [number, number], zoom: 9.2, pitch: 65, label: "Памир" },
} as const;

type LocationKey = keyof typeof LOCATIONS;

declare global {
  interface Window {
    maplibregl?: any;
  }
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if ((existing as HTMLScriptElement).dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

function loadStylesheetOnce(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

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
function polygonBBoxArea(geometry: { type: string; coordinates: unknown }): { bbox: BBox; area: number } {
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

function buildDedupedCountryLabels(countries: { features: Array<{ properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }> }) {
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
// города того же ранга. Здесь считается один раз при загрузке (не per-
// frame) — MapLibre сам решает видимость через zoom-based `filter` в стиле
// слоя, ручного тика не нужно.
function annotateCityRank(cities: { features: Array<{ properties: Record<string, unknown> }> }) {
  for (const feature of cities.features) {
    const scaleRank = Number(feature.properties.SCALERANK ?? 8);
    const isCapital = feature.properties.ADM0CAP === 1;
    feature.properties.EFFECTIVE_RANK = isCapital ? Math.max(0, scaleRank - 2) : scaleRank;
    feature.properties.DISPLAY_NAME = (feature.properties.NAME_RU as string) || (feature.properties.NAME as string);
  }
  return cities;
}

function countRecentTiles(hostFragment: string, sinceMs: number): number {
  if (typeof performance === "undefined" || !performance.getEntriesByType) return 0;
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  let count = 0;
  for (const entry of entries) {
    if (entry.startTime >= sinceMs && entry.name.includes(hostFragment)) count++;
  }
  return count;
}

export default function GeoWorldMapLibreSpikePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeLocation, setActiveLocation] = useState<LocationKey>("earth");
  const [projection, setProjectionMode] = useState<"globe" | "mercator">("globe");
  const [terrainStatus, setTerrainStatus] = useState<"pending" | "ready" | "failed">("pending");
  const [labelsStatus, setLabelsStatus] = useState<"pending" | "ready" | "failed">("pending");
  const [tileStats, setTileStats] = useState({ gibs: 0, terrain: 0 });
  const [fps, setFps] = useState(0);
  const [memoryMB, setMemoryMB] = useState<number | null>(null);
  const loadStartRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        loadStartRef.current = performance.now();
        loadStylesheetOnce(MAPLIBRE_CSS);
        await loadScriptOnce(MAPLIBRE_JS);
        if (cancelled || !containerRef.current) return;

        const maplibregl = window.maplibregl;
        if (!maplibregl) throw new Error("window.maplibregl не появился после загрузки скрипта");

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: {
            version: 8,
            projection: { type: "globe" },
            sources: {
              "gibs-bluemarble": {
                type: "raster",
                tiles: [GIBS_URL],
                tileSize: 256,
                minzoom: 0,
                maxzoom: 8,
                attribution: GIBS_ATTRIBUTION,
              },
              "aws-terrarium": {
                type: "raster-dem",
                tiles: [TERRAIN_URL],
                tileSize: 256,
                encoding: "terrarium",
                maxzoom: 15,
                attribution: TERRAIN_ATTRIBUTION,
              },
              "country-borders": { type: "geojson", data: BORDERS_URL, attribution: VECTOR_ATTRIBUTION },
              "country-labels": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
              "city-points": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
            },
            sky: {
              "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
            },
            light: { anchor: "map", position: [1.5, 90, 80] },
            terrain: { source: "aws-terrarium", exaggeration: 1.5 },
            layers: [
              { id: "background", type: "background", paint: { "background-color": "#000814" } },
              { id: "bluemarble", type: "raster", source: "gibs-bluemarble" },
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
                layout: {
                  "text-field": ["get", "NAME"],
                  "text-font": ["Open Sans Bold"],
                  "text-size": 13,
                  "text-allow-overlap": false,
                },
                paint: {
                  "text-color": "#fde68a",
                  "text-halo-color": "#000000",
                  "text-halo-width": 1.4,
                },
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
          },
          center: LOCATIONS.earth.center,
          zoom: LOCATIONS.earth.zoom,
          pitch: LOCATIONS.earth.pitch,
          maxPitch: 75,
          attributionControl: { compact: true },
        });
        mapRef.current = map;

        // "Готово" — по первому реальному отрисованному кадру (`render`),
        // а НЕ по событию `load`. Найдено headless-браузером (не догадкой):
        // `load` у MapLibre ждёт готовности ВСЕХ источников стиля, включая
        // 3D-террейн, а террейн обрабатывается через GPU-readback (декодирует
        // DEM-тайлы в геометрию рельефа) — на медленном/программном GPU это
        // может идти намного дольше, чем реальная отрисовка первого кадра
        // (сам глобус с имиджами и террейном к тому моменту уже виден
        // пользователю, см. скриншот). Плюс страховочный таймаут — на
        // случай, если даже `render` почему-то не придёт вовсе.
        let readyDeclared = false;
        function declareReady() {
          if (readyDeclared || cancelled) return;
          readyDeclared = true;
          setStatus("ready");
        }
        map.once("render", declareReady);
        const readyFallbackId = setTimeout(declareReady, 8_000);

        map.on("error", (e: any) => {
          // Честная диагностика — не маскируем ошибки тайлов, только логируем.
          // eslint-disable-next-line no-console
          console.warn("MapLibre error event:", e?.sourceId ?? "(no source)", e?.error?.message ?? e?.error);
          if (e?.sourceId === "aws-terrarium" && terrainStatus === "pending") setTerrainStatus("failed");
        });

        map.on("load", () => {
          clearTimeout(readyFallbackId);
          declareReady();

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15_000);
          (async () => {
            try {
              const [bordersRes, citiesRes] = await Promise.all([
                fetch(BORDERS_URL, { signal: controller.signal }),
                fetch(CITIES_URL, { signal: controller.signal }),
              ]);
              const [borders, cities] = await Promise.all([bordersRes.json(), citiesRes.json()]);
              if (cancelled) return;
              const labelPoints = buildDedupedCountryLabels(borders);
              annotateCityRank(cities);
              (map.getSource("country-labels") as any).setData(labelPoints);
              (map.getSource("city-points") as any).setData(cities);
              setLabelsStatus("ready");
            } catch (labelErr) {
              if (!cancelled) setLabelsStatus("failed");
              // eslint-disable-next-line no-console
              console.warn("Не удалось загрузить Natural Earth границы/города:", labelErr);
            } finally {
              clearTimeout(timeoutId);
            }
          })();
        });

        // Терраин-готовность — по `sourcedata` конкретно для DEM-источника
        // (даёт `isSourceLoaded` напрямую), а не только по глобальному
        // `idle`: на медленном GPU (см. комментарий у `declareReady` выше)
        // `idle` может прийти намного позже, чем реально нужные тайлы уже
        // загружены и рельеф уже виден.
        map.on("sourcedata", (e: any) => {
          if (cancelled) return;
          if (e.sourceId === "aws-terrarium" && e.isSourceLoaded && terrainStatus === "pending") {
            setTerrainStatus("ready");
          }
        });

        const statsIntervalId = setInterval(() => {
          if (cancelled) {
            clearInterval(statsIntervalId);
            return;
          }
          setTileStats({
            gibs: countRecentTiles("gibs.earthdata.nasa.gov", loadStartRef.current),
            terrain: countRecentTiles("elevation-tiles-prod", loadStartRef.current),
          });
        }, 2_000);
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FPS — честный счётчик по реальным кадрам (rAF), не заглушка как в Cesium-спайке счётчик тайлов.
  useEffect(() => {
    let frames = 0;
    let lastReport = performance.now();
    let rafId = 0;
    function tick() {
      frames++;
      const now = performance.now();
      if (now - lastReport >= 1000) {
        setFps(frames);
        frames = 0;
        lastReport = now;
        const mem = (performance as any).memory;
        if (mem) setMemoryMB(Math.round(mem.usedJSHeapSize / (1024 * 1024)));
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  function flyTo(key: LocationKey) {
    const map = mapRef.current;
    if (!map) return;
    const loc = LOCATIONS[key];
    setActiveLocation(key);
    map.flyTo({ center: loc.center, zoom: loc.zoom, pitch: loc.pitch, duration: 2500, essential: true });
  }

  function toggleProjection() {
    const map = mapRef.current;
    if (!map) return;
    const next = projection === "globe" ? "mercator" : "globe";
    map.setProjection({ type: next });
    setProjectionMode(next);
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#000" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "monospace" }}>
          {`Загрузка MapLibre GL JS ${MAPLIBRE_VERSION} с CDN...`}
        </div>
      )}

      {status === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", fontFamily: "monospace", padding: 24, textAlign: "center" }}>
          {`Ошибка инициализации MapLibre: ${errorMessage}`}
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          maxWidth: 420,
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        {(Object.keys(LOCATIONS) as LocationKey[]).map((key) => (
          <button
            key={key}
            onClick={() => flyTo(key)}
            disabled={status !== "ready"}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.3)",
              background: activeLocation === key ? "rgba(139,92,246,0.4)" : "rgba(0,0,0,0.5)",
              color: "#fff",
              cursor: status === "ready" ? "pointer" : "not-allowed",
            }}
          >
            {LOCATIONS[key].label}
          </button>
        ))}
        <button
          onClick={toggleProjection}
          disabled={status !== "ready"}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(56,189,248,0.5)",
            background: "rgba(8,47,73,0.6)",
            color: "#7dd3fc",
            cursor: status === "ready" ? "pointer" : "not-allowed",
          }}
        >
          {projection === "globe" ? "Globe → Mercator" : "Mercator → Globe"}
        </button>
      </div>

      {/* Диагностика — те же принципы честности, что и в Cesium-спайке: реальные счётчики сетевых запросов через performance API (не выдуманные), FPS из реального rAF-цикла. */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 10,
          fontFamily: "monospace",
          fontSize: 11,
          color: "#fff",
          background: "rgba(0,0,0,0.6)",
          padding: "8px 10px",
          borderRadius: 6,
          maxWidth: 320,
        }}
      >
        <div>FPS: {fps}</div>
        <div>{`GIBS tile requests: ${tileStats.gibs}`}</div>
        <div>{`Terrain tile requests: ${tileStats.terrain}`}</div>
        <div>
          Terrain:{" "}
          {terrainStatus === "ready" ? (
            <span style={{ color: "#4ade80" }}>AWS Terrarium (real relief)</span>
          ) : terrainStatus === "failed" ? (
            <span style={{ color: "#f87171" }}>failed — flat fallback</span>
          ) : (
            "loading..."
          )}
        </div>
        <div>
          Borders/labels:{" "}
          {labelsStatus === "ready" ? (
            <span style={{ color: "#4ade80" }}>Natural Earth loaded</span>
          ) : labelsStatus === "failed" ? (
            <span style={{ color: "#f87171" }}>failed to load</span>
          ) : (
            "loading..."
          )}
        </div>
        {memoryMB !== null && <div>{`JS heap: ~${memoryMB} MB (Chromium only)`}</div>}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          zIndex: 10,
          maxWidth: 640,
          fontFamily: "monospace",
          fontSize: 10,
          color: "rgba(255,255,255,0.7)",
          background: "rgba(0,0,0,0.5)",
          padding: "6px 8px",
          borderRadius: 6,
        }}
      >
        {`MapLibre GL JS ${MAPLIBRE_VERSION} (CDN, BSD-3-Clause, без ключа/токена) · ${GIBS_ATTRIBUTION} · ${TERRAIN_ATTRIBUTION} · ${VECTOR_ATTRIBUTION} · dev-only спайк, ничего из production/Cesium-спайка не тронуто.`}
      </div>
    </div>
  );
}
