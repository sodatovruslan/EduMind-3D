"use client";

/**
 * G6.6 — GeoWorld Engine Replacement Spike.
 *
 * ИЗОЛИРОВАННЫЙ dev-only маршрут — НЕ трогает production `/geo3d/[id]`
 * (GeoWorldScene.tsx, GlobeControls.tsx, TileEngine и весь G1-G6.5 остаются
 * полностью нетронутыми). Цель — реально запустить CesiumJS в браузере на
 * тех же данных (NASA GIBS, Natural Earth), что уже использует наш
 * собственный движок, и дать честное визуальное сравнение.
 *
 * CesiumJS грузится через CDN (<script>/<link>), НЕ через npm-пакет —
 * осознанное решение для спайка: не трогаем package.json/next.config.js
 * (webpack-конфигурация Cesium требует копирования статических ассетов —
 * реальная работа для полноценной миграции, не для оценочного спайка).
 * Полностью изолировано: ни один расшаренный файл конфигурации не тронут.
 *
 * Cesium.Ion.defaultAccessToken НЕ используется вообще — весь спайк
 * работает БЕЗ единого API-ключа/токена (GIBS imagery, Natural Earth
 * overlays, Ellipsoid-террейн без рельефа). Cesium World Terrain и Google
 * Photorealistic 3D Tiles ТРЕБУЮТ Cesium ion аккаунт (регистрация на
 * cesium.com, которую ассистент не может выполнить сам) — см.
 * GEOWORLD_ROADMAP.md, раздел G6.6, за честной оценкой того, что НЕ
 * проверено из-за отсутствия credentials.
 */

import { useEffect, useRef, useState } from "react";

const CESIUM_VERSION = "1.136";
const CESIUM_BASE = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;

// Реальные координаты — те же PAMIR_LAT/PAMIR_LNG, что уже использует
// production GeoWorldScene.tsx (не выдуманы заново для спайка), плюс
// Душанбе — взят из РЕАЛЬНОГО ответа Natural Earth ne_50m_populated_places
// (ADM0CAP=1, подтверждено запросом при подготовке G6.6, не по памяти).
const LOCATIONS = {
  earth: { lng: 0, lat: 20, height: 20_000_000, label: "Вся Земля" },
  asia: { lng: 90, lat: 35, height: 6_000_000, label: "Азия" },
  centralAsia: { lng: 70, lat: 40, height: 1_800_000, label: "Центральная Азия" },
  tajikistan: { lng: 71.0, lat: 38.8, height: 400_000, label: "Таджикистан" },
  dushanbe: { lng: 68.773879, lat: 38.560035, height: 25_000, label: "Душанбе (столица)" },
  pamir: { lng: 72.0, lat: 38.5, height: 60_000, label: "Памир" },
} as const;

type LocationKey = keyof typeof LOCATIONS;

declare global {
  interface Window {
    Cesium?: any;
  }
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      if ((existing as HTMLScriptElement).dataset.loaded === "true") resolve();
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

export default function GeoWorldEngineSpikePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeLocation, setActiveLocation] = useState<LocationKey>("earth");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        loadStylesheetOnce(`${CESIUM_BASE}/Widgets/widgets.css`);
        await loadScriptOnce(`${CESIUM_BASE}/Cesium.js`);
        if (cancelled || !containerRef.current) return;

        const Cesium = window.Cesium;
        if (!Cesium) throw new Error("window.Cesium не появился после загрузки скрипта");

        // Явно НЕ используем Cesium ion — весь спайк работает без единого
        // токена/API-ключа (см. комментарий в шапке файла).
        Cesium.Ion.defaultAccessToken = undefined;

        const { createGibsTilingScheme } = await import("./gibs-cesium-tiling-scheme");

        // Тот же слой (BlueMarble_NextGeneration, статичный, без временного
        // измерения), что и production RealEarthTileLayer.tsx (G3) — то же
        // САМОЕ легально проверенное изображение, другой движок вокруг него.
        const gibsProvider = new Cesium.WebMapTileServiceImageryProvider({
          url: "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi",
          layer: "BlueMarble_NextGeneration",
          style: "",
          tileMatrixSetID: "500m",
          format: "image/jpeg",
          maximumLevel: 7,
          tileWidth: 512,
          tileHeight: 512,
          tilingScheme: createGibsTilingScheme(Cesium),
        });

        const viewer = new Cesium.Viewer(containerRef.current, {
          imageryProvider: gibsProvider,
          // Без Cesium ion настоящего мирового рельефа нет — честный
          // плоский эллипсоид, не выдаём его за террейн. См. GEOWORLD_ROADMAP.md,
          // G6.6, за оценкой пути к реальному рельефу (свой TerrainProvider
          // поверх уже проверенных данных Terrarium из G4, либо Cesium ion).
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          infoBox: true, // бесплатно из коробки — клик по объекту показывает его свойства
          selectionIndicator: true,
        });
        viewerRef.current = viewer;

        // G5-переиспользование: те же самые URL Natural Earth, что уже
        // использует production CountryBordersLayer.tsx/CityLabelsLayer.tsx
        // (см. lib/geo/providers/natural-earth.ts) — здесь грузятся штатным
        // Cesium.GeoJsonDataSource, без единой строчки нашего собственного
        // кода извлечения колец/проекции на сферу (см. vector-geojson.ts) —
        // движок делает это сам.
        const borders = await Cesium.GeoJsonDataSource.load(
          "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
          { stroke: Cesium.Color.fromCssColorString("#fbbf24"), fill: Cesium.Color.TRANSPARENT, strokeWidth: 1.5, clampToGround: false }
        );
        if (!cancelled) viewer.dataSources.add(borders);

        const cities = await Cesium.GeoJsonDataSource.load(
          "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places.geojson",
          { markerColor: Cesium.Color.fromCssColorString("#e2e8f0"), markerSize: 12 }
        );
        if (!cancelled) viewer.dataSources.add(cities);

        if (!cancelled) {
          const start = LOCATIONS.earth;
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(start.lng, start.lat, start.height),
          });
          setStatus("ready");
        }
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
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  function flyTo(key: LocationKey) {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;
    const loc = LOCATIONS[key];
    setActiveLocation(key);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(loc.lng, loc.lat, loc.height),
      duration: 2.5,
    });
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#000" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "monospace" }}>
          Загрузка CesiumJS {CESIUM_VERSION} с CDN...
        </div>
      )}

      {status === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", fontFamily: "monospace", padding: 24, textAlign: "center" }}>
          Ошибка инициализации Cesium: {errorMessage}
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
        G6.6 spike — CesiumJS {CESIUM_VERSION} (CDN, без ion-токена) · Imagery: NASA GIBS BlueMarble (то же, что production G3) · Terrain:
        Ellipsoid (без рельефа — см. GEOWORLD_ROADMAP.md G6.6) · Borders/cities: Natural Earth (те же URL, что production G5) · dev-only,
        production /geo3d/[id] не тронут.
      </div>
    </div>
  );
}
