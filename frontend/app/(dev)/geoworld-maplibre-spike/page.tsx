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
 *
 * G6.8 — high-resolution imagery / deep-zoom (полный research — см.
 * GEOWORLD_ROADMAP.md, раздел G6.8). BlueMarble (500м/px) остаётся базовым
 * слоем для низкого zoom, но deep zoom на Душанбе/Памир получает ДВА
 * дополнительных tier'а поверх него:
 *
 * 5. NASA GIBS HLS (Harmonized Landsat Sentinel-2), слой
 *    `HLS_S30_Nadir_BRDF_Adjusted_Reflectance` — 30м/px, БЕЗ ключа, public
 *    domain, EPSG:3857 `GoogleMapsCompatible_Level12` (тот же принцип
 *    стандартной XYZ-сетки, что BlueMarble). ВАЖНОЕ ОТЛИЧИЕ от BlueMarble,
 *    найденное эмпирически (не догадка): HLS — это композит по КОНКРЕТНЫМ
 *    датам (спутник пролетает не каждый день + облачность), а не
 *    непрерывный ежедневный глобальный охват. Прямой curl-тест тайла над
 *    Душанбе на 8 датах подряд (2026-08-01…2026-08-10) дал 404 на 7 из 8 —
 *    рабочей оказалась ровно одна (2026-08-05). Поэтому дата не
 *    захардкожена — при инициализации `resolveHlsDate()` пробует несколько
 *    последних дней ПАРАЛЛЕЛЬНО для тайла-представителя (около Душанбе) и
 *    берёт самую свежую дату с реальным попаданием; если ни одна не
 *    сработала за разумное число попыток — tier честно пропускается
 *    (fallback на BlueMarble/Esri), без пустого экрана.
 *
 * 6. Esri World Imagery (`server.arcgisonline.com/.../World_Imagery/`) —
 *    технически: БЕЗ ключа, `Access-Control-Allow-Origin: *`, подтверждено
 *    curl (HTTP 200 до z18 включительно над Душанбе И Памиром, реальные
 *    JPEG с деталями — не заглушки). ЮРИДИЧЕСКИ: подтверждено официальными
 *    условиями Esri (Esri Master Agreement / community.esri.com) — сервис
 *    "не доступен для коммерческого использования" без ArcGIS
 *    Online/Enterprise-лицензии. Это ПРЯМОЙ конфликт с production-планами
 *    (коммерческий EdTech-продукт), поэтому подключён здесь ТОЛЬКО как
 *    demo/evaluation-слой, по умолчанию с явной пометкой риска в UI и
 *    возможностью выключить. См. §8 требования задания — проблема не
 *    скрыта, а прямо показана.
 *
 * Исследованы, но НЕ подключены живым кодом (полный разбор в
 * GEOWORLD_ROADMAP.md): Sentinel-2 cloudless EOX (`s2cloudless-2025_3857` —
 * подтверждено curl+WMTSCapabilities.xml, EPSG:3857 XYZ есть, НО
 * официальная лицензия в самом capabilities-документе — CC BY-NC-SA
 * 4.0, NonCommercial — прямой конфликт с production); MapTiler Satellite
 * (free-план подтверждён как "non-commercial + R&D only" в их Terms —
 * тоже не production-ready без платного плана); Mapbox Satellite
 * (требует карту при регистрации — прямой конфликт с "no billing/no card"
 * требованием); Bing Maps imagery (ToS прямо запрещает комбинировать с
 * не-Bing картографической библиотекой — исключён без вариантов); Google
 * Photorealistic 3D Tiles / Maps Platform (billing, ограниченное покрытие
 * городов — comparison-only, без ключа).
 */

import { useEffect, useRef, useState } from "react";

const MAPLIBRE_VERSION = "5.24.0";
// G6.9 — самое дорогое звено cold-load'а (см. GEOWORLD_ROADMAP.md, раздел
// G6.9): реальный замер (и `curl` вне браузера, и Resource Timing внутри)
// показал десятки секунд на загрузку ~1МБ `maplibre-gl.js` именно с
// unpkg.com в этой песочнице — воспроизводимо, не GPU/рендеринг. Файлы
// скачаны ОДИН РАЗ и лежат статикой в `public/vendor/` (тот же CDN-байт-в-
// байт, просто раздаётся нашим сервером — НЕ npm-зависимость, package.json
// не тронут). CDN остаётся честным fallback'ом на случай, если локальные
// файлы почему-то отсутствуют (see `loadScriptWithFallback`).
const MAPLIBRE_JS_LOCAL = `/vendor/maplibre-gl-${MAPLIBRE_VERSION}/maplibre-gl.js`;
const MAPLIBRE_CSS_LOCAL = `/vendor/maplibre-gl-${MAPLIBRE_VERSION}/maplibre-gl.css`;
const MAPLIBRE_JS_CDN = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS_CDN = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

const GIBS_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
const GIBS_ATTRIBUTION = "Imagery: NASA GIBS / Blue Marble Next Generation (public domain)";
const TERRAIN_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const TERRAIN_ATTRIBUTION = "Terrain: AWS Open Data — elevation-tiles-prod (Terrarium, Mapzen/Tilezen legacy, open)";
const BORDERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const CITIES_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places.geojson";
const VECTOR_ATTRIBUTION = "Borders/labels: Natural Earth (public domain)";

// G6.8 — high-res imagery tiers (см. комментарий в шапке файла).
const HLS_TILE_TEMPLATE =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png";
const HLS_ATTRIBUTION = "Imagery: NASA GIBS / HLS Sentinel-2 (~30m/px, public domain, no key)";
const ESRI_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "Imagery: Esri World Imagery — EVALUATION ONLY (Esri Master Agreement disallows production use outside an ArcGIS subscription)";

function lngLatToTileXY(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Тайл-представитель около Душанбе — главный acceptance-регион задания.
const HLS_PROBE_Z = 8;
const HLS_PROBE_TILE = lngLatToTileXY(68.773879, 38.560035, HLS_PROBE_Z);

/**
 * HLS — композит по КОНКРЕТНЫМ датам, не непрерывный ежедневный охват (см.
 * пояснение в шапке файла). Пробуем несколько последних дней ПАРАЛЛЕЛЬНО
 * (не угадываем одну дату и не перебираем последовательно — это было бы и
 * медленнее, и всё ещё гаданием), берём самую свежую дату с реальным
 * попаданием (HTTP 200) для тайла-представителя. Если ни одна не сработала
 * за `maxDaysBack` попыток — возвращаем `null`, вызывающий код честно
 * пропускает этот tier (см. `init()`), НЕ показывает пустой экран.
 */
async function resolveHlsDate(maxDaysBack = 8, timeoutMs = 7000): Promise<string | null> {
  const candidates = Array.from({ length: maxDaysBack }, (_, i) => isoDateDaysAgo(i));
  const results = await Promise.allSettled(
    candidates.map(async (date) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = HLS_TILE_TEMPLATE.replace("{date}", date)
          .replace("{z}", String(HLS_PROBE_Z))
          .replace("{y}", String(HLS_PROBE_TILE.y))
          .replace("{x}", String(HLS_PROBE_TILE.x));
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return date;
      } finally {
        clearTimeout(timer);
      }
    })
  );
  const working = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value)
    .sort()
    .reverse();
  return working[0] ?? null;
}

// G6.9 §17 — HLS date-discovery делает до 8 параллельных пробных запросов
// при КАЖДОЙ загрузке страницы (найдено измерением: ~7с у каждой попытки,
// если она не попадает точно, см. GEOWORLD_ROADMAP.md G6.9). Кэшируем
// резолвленную дату в `localStorage` с TTL — повторный визит в течение TTL
// пропускает пробник целиком. TTL сознательно короткий (2 часа, не "навсегда"),
// т.к. HLS-даты по своей природе МЕНЯЮТСЯ (новый спутниковый пролёт делает более
// свежую дату доступной, а старая может выпасть из ротации GIBS) — прямое
// требование §17 "данные не должны тихо устаревать навсегда".
const HLS_CACHE_KEY = "g69-hls-date-cache-v1";
const HLS_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

function getCachedHlsDate(): string | null {
  try {
    const raw = localStorage.getItem(HLS_CACHE_KEY);
    if (!raw) return null;
    const { date, cachedAt } = JSON.parse(raw) as { date: string; cachedAt: number };
    if (Date.now() - cachedAt > HLS_CACHE_TTL_MS) return null;
    return date;
  } catch {
    return null;
  }
}

function setCachedHlsDate(date: string): void {
  try {
    localStorage.setItem(HLS_CACHE_KEY, JSON.stringify({ date, cachedAt: Date.now() }));
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — не критично, просто нет кэша.
  }
}

const LOCATIONS = {
  earth: { center: [0, 20] as [number, number], zoom: 1.3, pitch: 0, label: "Вся Земля" },
  asia: { center: [90, 35] as [number, number], zoom: 2.6, pitch: 0, label: "Азия" },
  centralAsia: { center: [70, 40] as [number, number], zoom: 4.0, pitch: 0, label: "Центральная Азия" },
  tajikistan: { center: [71.0, 38.8] as [number, number], zoom: 6.2, pitch: 45, label: "Таджикистан" },
  dushanbe: { center: [68.773879, 38.560035] as [number, number], zoom: 11.5, pitch: 60, label: "Душанбе (столица)" },
  pamir: { center: [72.0, 38.5] as [number, number], zoom: 9.2, pitch: 65, label: "Памир" },
} as const;

type LocationKey = keyof typeof LOCATIONS;

/**
 * Georeferencing validation (по прямому указанию владельца продукта) —
 * ТРИ контрольные точки Душанбе с координатами из НАДЁЖНЫХ источников, не
 * угаданными:
 *
 * 1. Памятник Исмоили Сомони (Ҳайкали Исмоили Сомонӣ), площадь Дусти —
 *    lat=38.5739365, lon=68.7853619, OpenStreetMap Nominatim (way
 *    1375034135, тип tourism/attraction, адрес "кӯчаи Теҳрон, Ноҳияи
 *    Исмоили Сомонӣ, Душанбе"). Независимо перепроверено ВТОРЫМ
 *    источником — Wikidata (через веб-поиск): lat=38.5739306,
 *    lon=68.7853416 — расхождение между источниками ~0.00002° (~2 метра),
 *    то есть согласованно. Взято среднее.
 * 2. Гипрозем (здание/институт, давший имя району), улица Гипрозем,
 *    район Сино — lat=38.5112209, lon=68.7380377, OpenStreetMap Nominatim
 *    (relation 3951319, class=building, name="Гипрозем").
 * 3. 46-й микрорайон, район Фирдавси — lat=38.5289730, lon=68.7663808,
 *    OpenStreetMap Nominatim (relation 11017357, class=boundary,
 *    type=administrative, addresstype=suburb — центр официальной
 *    административной границы микрорайона).
 *
 * Цель — НЕ обычные city-labels (те уже есть, LOD по SCALERANK), а
 * КОНТРОЛЬНЫЕ точки для проверки, что imagery действительно совмещена с
 * координатами (не только "маркер стоит на слове Душанбе"), поэтому
 * визуально отличаются (маджента, не золото/белый) и не участвуют в
 * anti-spam LOD.
 */
const CONTROL_POINTS = {
  ismoiliSomoni: {
    center: [68.7853518, 38.5739336] as [number, number],
    label: "🎯 Памятник Исмоили Сомони",
    source: "OSM Nominatim way 1375034135 + Wikidata (независимо согласуются, ~2м)",
  },
  giprozem: {
    center: [68.7380377, 38.5112209] as [number, number],
    label: "🎯 Гипрозем",
    source: "OSM Nominatim relation 3951319 (building=Гипрозем)",
  },
  microdistrict46: {
    center: [68.7663808, 38.5289730] as [number, number],
    label: "🎯 46-й микрорайон",
    source: "OSM Nominatim relation 11017357 (admin boundary centroid)",
  },
} as const;

type ControlPointKey = keyof typeof CONTROL_POINTS;

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

// G6.9 — локальный файл первым (см. комментарий у MAPLIBRE_JS_LOCAL), CDN
// как честный fallback, если по какой-то причине статика недоступна (напр.
// сборка без public/vendor) — не превращаем "быстрее" в "хрупче".
async function loadScriptWithFallback(localSrc: string, cdnSrc: string): Promise<"local" | "cdn"> {
  try {
    await loadScriptOnce(localSrc);
    return "local";
  } catch {
    await loadScriptOnce(cdnSrc);
    return "cdn";
  }
}

function loadStylesheetOnce(href: string, fallbackHref?: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  if (fallbackHref) {
    link.onerror = () => {
      link.onerror = null;
      link.href = fallbackHref;
    };
  }
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
  const controlMarkersRef = useRef<any[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeLocation, setActiveLocation] = useState<LocationKey | null>("earth");
  const [activeControlPoint, setActiveControlPoint] = useState<ControlPointKey | null>(null);
  const [projection, setProjectionMode] = useState<"globe" | "mercator">("globe");
  const [terrainStatus, setTerrainStatus] = useState<"pending" | "ready" | "failed">("pending");
  const [labelsStatus, setLabelsStatus] = useState<"pending" | "ready" | "failed">("pending");
  const [tileStats, setTileStats] = useState({ gibs: 0, terrain: 0, esri: 0 });
  const [failedTiles, setFailedTiles] = useState(0);
  const [fps, setFps] = useState(0);
  const [memoryMB, setMemoryMB] = useState<number | null>(null);
  const [hlsDate, setHlsDate] = useState<"probing" | "unavailable" | string>("probing");
  const [esriEnabled, setEsriEnabled] = useState(true);
  const loadStartRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        loadStartRef.current = performance.now();
        // Честный счётчик тайлов (`countRecentTiles`, ниже) читает
        // `performance.getEntriesByType("resource")` — у браузеров есть
        // ограничение размера этого буфера (обычно 250 записей по
        // умолчанию), которое может незаметно переполниться на длинной
        // сессии (HLS date-probe сам по себе даёт до 8 доп. запросов) и
        // "стереть" более ранние записи — тогда счётчик молча занижает
        // реальное число тайлов. Поднимаем лимit заранее, а не гадаем.
        if (typeof performance.setResourceTimingBufferSize === "function") {
          performance.setResourceTimingBufferSize(2000);
        }
        loadStylesheetOnce(MAPLIBRE_CSS_LOCAL, MAPLIBRE_CSS_CDN);
        // G6.9 — HLS-дата БОЛЬШЕ НЕ блокирует создание карты (реальный баг
        // G6.8, найден code-review при расследовании cold-load: `await
        // Promise.all([loadScriptOnce(...), resolveHlsDate()])` заставлял
        // ждать резолвинга HLS-даты (до 7с таймаута на каждую из 8
        // параллельных попыток) ПЕРЕД тем, как вообще появится глобус —
        // прямое нарушение "progressive loading" (§9 задания G6.9), хотя
        // сам движок к этому моменту уже был готов). Теперь: карта
        // создаётся сразу после загрузки движка, ВСЕГДА в "no-HLS"
        // конфигурации слоёв (BlueMarble → Esri, без разрыва по zoom —
        // см. imageryLayers ниже); HLS резолвится в фоне и, если/когда
        // готов, ДОБАВЛЯЕТСЯ поверх уже работающей карты (см. `upgradeToHls`
        // в конце функции) — тем самым HLS honestly превращается из
        // "обязательного условия первого кадра" в "необязательное
        // качественное улучшение", как и требует ТЗ.
        const engineSource = await loadScriptWithFallback(MAPLIBRE_JS_LOCAL, MAPLIBRE_JS_CDN);
        if (cancelled || !containerRef.current) return;
        // eslint-disable-next-line no-console
        console.log(`[G6.9] MapLibre engine loaded from: ${engineSource}`);

        const maplibregl = window.maplibregl;
        if (!maplibregl) throw new Error("window.maplibregl не появился после загрузки скрипта");

        // ВАЖНО (найдено headless-тестом в G6.8, реальный баг, не гипотеза):
        // `GoogleMapsCompatible_Level8` — это ПОТОЛОК тайловой сетки
        // BlueMarble, буквально 8 уровней (z0-8), НЕ произвольное число.
        // Запрос z9 к этой TileMatrixSet — невалидный TileMatrix, GIBS
        // отвечает HTTP 400 (не 404). Source-`maxzoom` для BlueMarble
        // должен быть 8 ВСЕГДА — MapLibre сам умеет "overzoom" (растянуть
        // z8-тайл на z9+), лишний трафик и невалидные запросы для этого не
        // нужны.
        const bluemarbleMaxZoom = 8;
        const esriMinZoom = 6;

        const sources: Record<string, any> = {
          "gibs-bluemarble": {
            type: "raster",
            tiles: [GIBS_URL],
            tileSize: 256,
            minzoom: 0,
            maxzoom: bluemarbleMaxZoom,
            attribution: GIBS_ATTRIBUTION,
          },
          "esri-world-imagery": {
            type: "raster",
            tiles: [ESRI_URL],
            tileSize: 256,
            minzoom: esriMinZoom,
            maxzoom: 19,
            attribution: ESRI_ATTRIBUTION,
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
        };

        // Кроссфейд между tier'ами — не резкий обрыв по zoom, а
        // zoom-интерполированная `raster-opacity` с перекрытием в 2 уровня
        // между соседними источниками (см. §6 задания G6.8: "no white
        // flash, no резкая граница"). `raster-fade-duration` сглаживает
        // ещё и подгрузку отдельных тайлов ВНУТРИ каждого слоя. Это ВСЕГДА
        // "no-HLS" вариант при старте (см. комментарий выше про G6.9) —
        // HLS-вариант этих же opacity-выражений применяется динамически в
        // `upgradeToHls` ниже, один-в-один совпадает с прежней G6.8 веткой.
        const imageryLayers = [
          {
            id: "bluemarble",
            type: "raster",
            source: "gibs-bluemarble",
            paint: {
              "raster-opacity": ["interpolate", ["linear"], ["zoom"], 6, 1, 9, 0],
              "raster-fade-duration": 400,
            },
          },
          {
            id: "esri-imagery",
            type: "raster",
            source: "esri-world-imagery",
            layout: { visibility: "visible" },
            paint: {
              "raster-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 8, 1],
              "raster-fade-duration": 400,
            },
          },
        ];

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: {
            version: 8,
            projection: { type: "globe" },
            sources,
            sky: {
              "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
            },
            light: { anchor: "map", position: [1.5, 90, 80] },
            terrain: { source: "aws-terrarium", exaggeration: 1.5 },
            layers: [
              { id: "background", type: "background", paint: { "background-color": "#000814" } },
              ...imageryLayers,
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

        // Georeferencing validation — маркеры контрольных точек. DOM-based
        // `Marker` (не data-driven слой), т.к. их всего 3, статичны и не
        // участвуют в LOD/anti-spam логике city-labels — визуально ЯРКО
        // отличаются (маджента) от золотых/белых city-меток намеренно, это
        // debug-инструмент проверки, не часть обычного контента карты.
        for (const key of Object.keys(CONTROL_POINTS) as ControlPointKey[]) {
          const point = CONTROL_POINTS[key];
          const el = document.createElement("div");
          el.style.width = "16px";
          el.style.height = "16px";
          el.style.borderRadius = "50%";
          el.style.background = "#ec4899";
          el.style.border = "3px solid #ffffff";
          el.style.boxShadow = "0 0 0 2px #ec4899, 0 0 8px rgba(236,72,153,0.9)";
          const marker = new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat(point.center)
            .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${point.label}</b><br/>${point.center[1].toFixed(6)}, ${point.center[0].toFixed(6)}<br/><span style="font-size:10px">${point.source}</span>`))
            .addTo(map);
          controlMarkersRef.current.push(marker);
        }

        // G6.9 — HLS резолвится и подключается ПОСЛЕ того, как карта уже
        // создана и рендерится (см. комментарий выше про progressive
        // loading) — честное необязательное улучшение, не условие первого
        // кадра. Кэш (`getCachedHlsDate`, TTL 2ч, §17) пропускает 8
        // параллельных пробных запросов целиком на повторных визитах.
        (async () => {
          const cached = getCachedHlsDate();
          const resolvedHlsDate = cached ?? (await resolveHlsDate());
          if (cancelled || mapRef.current !== map) return;
          if (!resolvedHlsDate) {
            setHlsDate("unavailable");
            return;
          }
          if (!cached) setCachedHlsDate(resolvedHlsDate);
          setHlsDate(resolvedHlsDate);

          // `addSource`/`addLayer` требуют загруженного стиля — если карта
          // ещё не успела (маловероятно к этому моменту, но не гадаем).
          if (!map.isStyleLoaded()) {
            await new Promise<void>((resolve) => map.once("load", () => resolve()));
          }
          if (cancelled || mapRef.current !== map) return;

          map.addSource("gibs-hls", {
            type: "raster",
            tiles: [HLS_TILE_TEMPLATE.replace("{date}", resolvedHlsDate)],
            tileSize: 256,
            minzoom: 5,
            maxzoom: 10,
            attribution: HLS_ATTRIBUTION,
          });
          // Вставлен ПЕРЕД esri-imagery — тот же порядок слоёв (bluemarble →
          // hls → esri), что и в прежней G6.8 статической ветке.
          map.addLayer(
            {
              id: "hls",
              type: "raster",
              source: "gibs-hls",
              paint: {
                "raster-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 7, 1, 8, 1, 10, 0],
                "raster-fade-duration": 400,
              },
            },
            "esri-imagery"
          );
          // Те же opacity-выражения, что были в G6.8 "hasHls"-ветке —
          // BlueMarble теперь уступает HLS раньше (zoom 5-7, не 6-9), Esri
          // подхватывает чуть позже (zoom 7-9, не 6-8), т.к. HLS покрывает
          // промежуток.
          map.setPaintProperty("bluemarble", "raster-opacity", ["interpolate", ["linear"], ["zoom"], 5, 1, 7, 0]);
          map.setPaintProperty("esri-imagery", "raster-opacity", ["interpolate", ["linear"], ["zoom"], 7, 0, 9, 1]);
        })().catch((hlsErr) => {
          if (!cancelled) setHlsDate("unavailable");
          // eslint-disable-next-line no-console
          console.warn("HLS upgrade failed:", hlsErr);
        });

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
          if (e?.sourceId) setFailedTiles((n) => n + 1);
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
            esri: countRecentTiles("arcgisonline.com", loadStartRef.current),
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
      for (const marker of controlMarkersRef.current) marker.remove();
      controlMarkersRef.current = [];
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
    setActiveControlPoint(null);
    map.flyTo({ center: loc.center, zoom: loc.zoom, pitch: loc.pitch, duration: 2500, essential: true });
  }

  // Deep zoom (18) — достаточно, чтобы визуально сверить конкретный
  // объект/квартал под маркером с imagery, не просто "в целом Душанбе".
  function flyToControlPoint(key: ControlPointKey) {
    const map = mapRef.current;
    if (!map) return;
    const point = CONTROL_POINTS[key];
    setActiveControlPoint(key);
    setActiveLocation(null);
    map.flyTo({ center: point.center, zoom: 18, pitch: 0, bearing: 0, duration: 2500, essential: true });
  }

  function toggleEsri() {
    const map = mapRef.current;
    if (!map || !map.getLayer("esri-imagery")) return;
    const next = !esriEnabled;
    map.setLayoutProperty("esri-imagery", "visibility", next ? "visible" : "none");
    setEsriEnabled(next);
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
        <button
          onClick={toggleEsri}
          disabled={status !== "ready"}
          title={ESRI_ATTRIBUTION}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: esriEnabled ? "1px solid rgba(248,113,113,0.6)" : "1px solid rgba(255,255,255,0.3)",
            background: esriEnabled ? "rgba(127,29,29,0.5)" : "rgba(0,0,0,0.5)",
            color: esriEnabled ? "#fca5a5" : "#fff",
            cursor: status === "ready" ? "pointer" : "not-allowed",
          }}
        >
          {esriEnabled ? "High-res (Esri, eval-only) ON" : "High-res (Esri, eval-only) OFF"}
        </button>
      </div>

      {/* Georeferencing validation — контрольные точки Душанбе, координаты из OSM Nominatim/Wikidata (см. комментарий у CONTROL_POINTS), не city-labels. */}
      <div
        style={{
          position: "absolute",
          top: 90,
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
        {(Object.keys(CONTROL_POINTS) as ControlPointKey[]).map((key) => (
          <button
            key={key}
            onClick={() => flyToControlPoint(key)}
            disabled={status !== "ready"}
            title={`${CONTROL_POINTS[key].center[1].toFixed(6)}, ${CONTROL_POINTS[key].center[0].toFixed(6)} — ${CONTROL_POINTS[key].source}`}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(236,72,153,0.6)",
              background: activeControlPoint === key ? "rgba(236,72,153,0.4)" : "rgba(0,0,0,0.5)",
              color: "#f9a8d4",
              cursor: status === "ready" ? "pointer" : "not-allowed",
            }}
          >
            {CONTROL_POINTS[key].label}
          </button>
        ))}
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
        <div style={{ marginBottom: 4, color: "#7dd3fc" }}>Engine: MapLibre GL JS {MAPLIBRE_VERSION}</div>
        <div>FPS: {fps}</div>
        <div>{`GIBS (BlueMarble+HLS) requests: ${tileStats.gibs}`}</div>
        <div>{`Esri requests: ${tileStats.esri}`}</div>
        <div>{`Terrain tile requests: ${tileStats.terrain}`}</div>
        <div style={{ color: failedTiles > 0 ? "#f87171" : undefined }}>{`Failed tiles: ${failedTiles}`}</div>
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
        <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 4 }}>
          Imagery tiers (G6.8):
        </div>
        <div>{`· z0-7: NASA GIBS BlueMarble (500m/px)`}</div>
        <div>
          {hlsDate === "probing" && "· mid-zoom: NASA GIBS HLS (30m/px) — resolving date..."}
          {hlsDate === "unavailable" && (
            <span style={{ color: "#fbbf24" }}>· mid-zoom: HLS unavailable — BlueMarble extends further</span>
          )}
          {hlsDate !== "probing" && hlsDate !== "unavailable" && (
            <span style={{ color: "#4ade80" }}>{`· z5-10: NASA GIBS HLS (30m/px), date ${hlsDate}`}</span>
          )}
        </div>
        <div style={{ color: esriEnabled ? "#fca5a5" : "rgba(255,255,255,0.5)" }}>
          {`· z7+: Esri World Imagery (sub-meter) — ${esriEnabled ? "ON, eval-only" : "OFF"}`}
        </div>
        {memoryMB !== null && <div style={{ marginTop: 4 }}>{`JS heap: ~${memoryMB} MB (Chromium only)`}</div>}
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
        {`MapLibre GL JS ${MAPLIBRE_VERSION} (CDN, BSD-3-Clause, без ключа/токена) · ${GIBS_ATTRIBUTION} · ${HLS_ATTRIBUTION} · ${ESRI_ATTRIBUTION} · ${TERRAIN_ATTRIBUTION} · ${VECTOR_ATTRIBUTION} · dev-only спайк, ничего из production/Cesium-спайка не тронуто.`}
      </div>
    </div>
  );
}
