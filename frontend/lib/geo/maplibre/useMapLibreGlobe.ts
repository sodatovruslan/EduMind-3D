"use client";

// G6.10 — production-foundation React hook, вынесенный из
// /geoworld-maplibre-spike (G6.7-G6.9). Владеет ПОЛНЫМ жизненным циклом
// карты (создание/загрузка/cleanup) — presentational-компоненты (spike и
// production scene) только рендерят container div и UI поверх состояния,
// которое отдаёт этот хук.
//
// Lifecycle-гарантии (G6.10 §3, проверено этим же кодом в spike G6.7-G6.9
// на протяжении нескольких чекпоинтов):
// - React StrictMode double-invoke safe — `cancelled`-флаг проверяется
//   после каждого `await` внутри `init()`, ранний `return` не даёт второй
//   карте создаться поверх первой (см. Cesium-спайк G6.6.1, тот же приём).
// - `map.remove()` + explicit marker cleanup + `clearInterval` в cleanup —
//   не оставляет висящих таймеров/подписок при route leave.
// - Единственный `mapRef` — повторный вызов `init()` (второй mount в
//   StrictMode) не создаёт вторую карту: инстанс создаётся один раз за
//   успешный `init()`, cleanup обнуляет `mapRef.current`.
import { useEffect, useRef, useState } from "react";
import { loadMapLibreEngine } from "./engine-loader";
import { buildBaseStyle, upgradeStyleWithHls } from "./style";
import { LOCATIONS, CONTROL_POINTS, type LocationKey, type ControlPointKey } from "./camera-presets";
import { HLS_TILE_TEMPLATE, HLS_ATTRIBUTION, getCachedHlsDate, setCachedHlsDate, resolveHlsDate } from "./imagery-sources";
import { BORDERS_URL, CITIES_URL, buildDedupedCountryLabels, annotateCityRank } from "./labels";
import { DEFAULT_TERRAIN_EXAGGERATION } from "./terrain";
import { normalizeCameraState, type CameraContext } from "./camera-context";

export interface MapLibreGlobeOptions {
  /** Esri eval-only слой включён по умолчанию. Production-контекст должен передавать `false` (§16 — не production dependency). */
  esriEnabledByDefault?: boolean;
  /** Рисовать georeferencing-маркеры контрольных точек (G6.8.x). Полезно для внутреннего сравнения, необязательно для production UX. */
  showControlPoints?: boolean;
  terrainExaggeration?: number;
  /**
   * G6.11 §6 — клик по глобусу (lng/lat самой точки клика, не привязан к
   * дискретным маркерам). Вызывающий код решает, что с этим делать
   * (например, отправить в бэкенд для классификации континента) — этот
   * хук ничего не знает про образовательную семантику.
   */
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  /**
   * G6.11 §19/§28 — нормализованный камера-контекст, обновляется на
   * `moveend` (НЕ на каждый кадр `move`) — естественный троттлинг: событие
   * приходит один раз на жест/анимацию, не 60 раз в секунду.
   */
  onCameraChange?: (camera: CameraContext) => void;
}

export interface MapLibreGlobeState {
  status: "loading" | "ready" | "error";
  errorMessage: string | null;
  terrainStatus: "pending" | "ready" | "failed";
  labelsStatus: "pending" | "ready" | "failed";
  hlsDate: "probing" | "unavailable" | string;
  esriEnabled: boolean;
  projection: "globe" | "mercator";
  engineSource: "local" | "cdn" | null;
  activeLocation: LocationKey | null;
  activeControlPoint: ControlPointKey | null;
  fps: number;
  memoryMB: number | null;
  failedTiles: number;
}

export interface MapLibreGlobeApi extends MapLibreGlobeState {
  containerRef: React.RefObject<HTMLDivElement>;
  flyTo: (key: LocationKey) => void;
  flyToControlPoint: (key: ControlPointKey) => void;
  toggleEsri: () => void;
  toggleProjection: () => void;
}

export function useMapLibreGlobe(options: MapLibreGlobeOptions = {}): MapLibreGlobeApi {
  const { esriEnabledByDefault = false, showControlPoints = false, terrainExaggeration = DEFAULT_TERRAIN_EXAGGERATION } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const controlMarkersRef = useRef<any[]>([]);
  // Не читаем React state ИЛИ callback-пропы напрямую внутри обработчиков
  // событий карты — те захватываются ЗАМЫКАНИЕМ в момент монтирования
  // (init() запускается один раз, `useEffect(..., [])`) и остаются
  // неизменными для этих колбэков независимо от последующих ре-рендеров.
  // `terrainEverReadyRef` — тот самый реальный баг, найденный по скриншоту
  // владельца продукта после G6.9 (единичный сбой terrain-тайла ПОСЛЕ
  // настоящего успеха откатывал статус на "failed"). `onMapClick`/
  // `onCameraChange` — те же грабли на новом месте (G6.11): если бы
  // обработчики читали `options.onMapClick` напрямую, вызывающий код
  // (лекция) навсегда получал бы ПЕРВУЮ версию колбэка с первого рендера.
  // Рефы обновляются на каждый рендер отдельным эффектом ниже — актуальный
  // колбэк всегда доступен обработчикам карты.
  const terrainEverReadyRef = useRef(false);
  const onMapClickRef = useRef(options.onMapClick);
  const onCameraChangeRef = useRef(options.onCameraChange);
  useEffect(() => {
    onMapClickRef.current = options.onMapClick;
    onCameraChangeRef.current = options.onCameraChange;
  });

  const [status, setStatus] = useState<MapLibreGlobeState["status"]>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [terrainStatus, setTerrainStatus] = useState<MapLibreGlobeState["terrainStatus"]>("pending");
  const [labelsStatus, setLabelsStatus] = useState<MapLibreGlobeState["labelsStatus"]>("pending");
  const [hlsDate, setHlsDate] = useState<MapLibreGlobeState["hlsDate"]>("probing");
  const [esriEnabled, setEsriEnabled] = useState(esriEnabledByDefault);
  const [projection, setProjectionMode] = useState<"globe" | "mercator">("globe");
  const [engineSource, setEngineSource] = useState<"local" | "cdn" | null>(null);
  const [activeLocation, setActiveLocation] = useState<LocationKey | null>("earth");
  const [activeControlPoint, setActiveControlPoint] = useState<ControlPointKey | null>(null);
  const [fps, setFps] = useState(0);
  const [memoryMB, setMemoryMB] = useState<number | null>(null);
  const [failedTiles, setFailedTiles] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (typeof performance.setResourceTimingBufferSize === "function") {
          performance.setResourceTimingBufferSize(2000);
        }

        const { maplibregl, source } = await loadMapLibreEngine();
        if (cancelled || !containerRef.current) return;
        setEngineSource(source);

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: buildBaseStyle({ esriEnabled: esriEnabledByDefault, terrainExaggeration }),
          center: LOCATIONS.earth.center,
          zoom: LOCATIONS.earth.zoom,
          pitch: LOCATIONS.earth.pitch,
          maxPitch: 75,
          attributionControl: { compact: true },
        });
        mapRef.current = map;

        // G6.11 §6/§19 — реальное геовзаимодействие (клик где угодно по
        // глобусу, та же семантика, что у старого R3F-рендерера: клик даёт
        // lng/lat, ОБРАЗОВАТЕЛЬНУЮ классификацию делает бэкенд, не клиент,
        // см. compatibility audit в GEOWORLD_ROADMAP.md) + нормализованный
        // камера-контекст на `moveend` (не на каждый кадр).
        map.on("click", (e: any) => {
          onMapClickRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        });
        map.on("moveend", () => {
          onCameraChangeRef.current?.(normalizeCameraState(map));
        });

        if (showControlPoints) {
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
              .setPopup(
                new maplibregl.Popup({ offset: 14 }).setHTML(
                  `<b>${point.label}</b><br/>${point.center[1].toFixed(6)}, ${point.center[0].toFixed(6)}<br/><span style="font-size:10px">${point.source}</span>`
                )
              )
              .addTo(map);
            controlMarkersRef.current.push(marker);
          }
        }

        // HLS резолвится и подключается ПОСЛЕ создания карты — необязательное
        // качественное улучшение, не условие первого кадра (G6.9). Кэш
        // (TTL 2ч) пропускает 8 параллельных пробных запросов при повторных визитах.
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
          if (!map.isStyleLoaded()) {
            await new Promise<void>((resolve) => map.once("load", () => resolve()));
          }
          if (cancelled || mapRef.current !== map) return;
          upgradeStyleWithHls(map, HLS_TILE_TEMPLATE.replace("{date}", resolvedHlsDate), HLS_ATTRIBUTION);
        })().catch((hlsErr) => {
          if (!cancelled) setHlsDate("unavailable");
          // eslint-disable-next-line no-console
          console.warn("HLS upgrade failed:", hlsErr);
        });

        // "Готово" — по первому реальному кадру (`render`), НЕ по `load`
        // (тот ждёт готовности ВСЕХ источников стиля, включая terrain
        // GPU-readback — может идти намного дольше первого видимого кадра,
        // см. GEOWORLD_ROADMAP.md G6.7). Страховочный таймаут на случай,
        // если `render` почему-то не придёт вовсе.
        let readyDeclared = false;
        function declareReady() {
          if (readyDeclared || cancelled) return;
          readyDeclared = true;
          setStatus("ready");
        }
        map.once("render", declareReady);
        const readyFallbackId = setTimeout(declareReady, 8_000);

        map.on("error", (e: any) => {
          // eslint-disable-next-line no-console
          console.warn("MapLibre error event:", e?.sourceId ?? "(no source)", e?.error?.message ?? e?.error);
          if (e?.sourceId === "aws-terrarium" && !terrainEverReadyRef.current) setTerrainStatus("failed");
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

        map.on("sourcedata", (e: any) => {
          if (cancelled) return;
          if (e.sourceId === "aws-terrarium" && e.isSourceLoaded && !terrainEverReadyRef.current) {
            terrainEverReadyRef.current = true;
            setTerrainStatus("ready");
          }
        });
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

  // FPS — честный счётчик по реальным кадрам (rAF), не заглушка.
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

  return {
    containerRef,
    status,
    errorMessage,
    terrainStatus,
    labelsStatus,
    hlsDate,
    esriEnabled,
    projection,
    engineSource,
    activeLocation,
    activeControlPoint,
    fps,
    memoryMB,
    failedTiles,
    flyTo,
    flyToControlPoint,
    toggleEsri,
    toggleProjection,
  };
}
