"use client";

/**
 * G6.6 → G6.6.1 — GeoWorld Engine Replacement Spike, Cesium Visual Proof.
 *
 * ИЗОЛИРОВАННЫЙ dev-only маршрут — НЕ трогает production `/geo3d/[id]`.
 *
 * G6.6.1 — исправления по итогам первой браузерной проверки владельца
 * продукта (G6.6 визуально НЕ принят):
 *
 * 1. "Синий globe" — найден и исправлен РЕАЛЬНЫЙ баг: таблица `resolution`
 *    из официального примера NASA (портированная в G6.6) при 512px/тайл
 *    давала ГЕОМЕТРИЧЕСКИ НЕВОЗМОЖНУЮ ширину тайла на уровне 0 (288°
 *    вместо положенных 180° — подтверждено независимым числовым расчётом,
 *    см. gibs-cesium-tiling-scheme.ts). Переписано на ту же формулу, что
 *    уже проверена тестами в lib/geo/providers/gibs-grid.ts (G3). Заодно
 *    imagery-URL переведён с KVP на REST-шаблон — тот же самый URL,
 *    который уже эмпирически подтверждён в G3 (curl, HTTP 200).
 * 2. "Спам белых пинов" — GeoJsonDataSource больше НЕ используется для
 *    городов (его дефолтная стилизация рисует billboard-пин на КАЖДУЮ
 *    точку без LOD). Вместо этого — вручную созданные `Entity` с текстовым
 *    label (не иконкой) и Cesium'овским `DistanceDisplayCondition`
 *    (встроенный, бесплатный механизм LOD по дистанции камеры — не нужно
 *    писать свой per-frame фильтр, как в production G5).
 * 3. "Ellipsoid — не финальная демонстрация" — подключен НАСТОЯЩИЙ рельеф:
 *    Re:Earth Terrain (terrain.reearth.land), open-source (MIT), без
 *    ключа/токена, quantized-mesh (родной формат Cesium, адаптер не
 *    нужен), данные — Mapterhorn (BSD-3, Copernicus DEM 30м) + EGM2008
 *    (NGA, public domain). ЧЕСТНАЯ ОГОВОРКА: community best-effort сервис
 *    БЕЗ SLA — подходит для спайка/оценки, не для production без
 *    self-hosted зеркала (см. GEOWORLD_ROADMAP.md, G6.6.1).
 */

import { useEffect, useRef, useState } from "react";

const CESIUM_VERSION = "1.136";
const CESIUM_BASE = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;
const TERRAIN_URL = "https://terrain.reearth.land/cesium-mesh/ellipsoid";
const TERRAIN_ATTRIBUTION =
  "Terrain: Re:Earth Terrain (Eukarya, MIT) — Mapterhorn (BSD-3, Copernicus DEM) + EGM2008 (NGA) + OpenStreetMap. Community best-effort service, no SLA.";

const LOCATIONS = {
  earth: { lng: 0, lat: 20, height: 20_000_000, label: "Вся Земля" },
  asia: { lng: 90, lat: 35, height: 6_000_000, label: "Азия" },
  centralAsia: { lng: 70, lat: 40, height: 1_800_000, label: "Центральная Азия" },
  tajikistan: { lng: 71.0, lat: 38.8, height: 400_000, label: "Таджикистан" },
  dushanbe: { lng: 68.773879, lat: 38.560035, height: 25_000, label: "Душанбе (столица)" },
  pamir: { lng: 72.0, lat: 38.5, height: 40_000, label: "Памир" },
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

// Natural Earth admin-0 countries — грубый центр (среднее по вершинам
// первого/самого большого кольца) для подписи-текста страны. Не идеальный
// картографический центроид (для сложных форм типа архипелагов может
// уехать в сторону) — достаточно для спайка, честно не выдаётся за точную
// картографию.
function roughPolygonCenter(Cesium: any, positions: any[]): any {
  return Cesium.BoundingSphere.fromPoints(positions).center;
}

export default function GeoWorldEngineSpikePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeLocation, setActiveLocation] = useState<LocationKey>("earth");
  const [imageryStats, setImageryStats] = useState({ success: 0, failed: 0, lastError: "" });
  const [terrainReady, setTerrainReady] = useState<"pending" | "ready" | "failed">("pending");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        loadStylesheetOnce(`${CESIUM_BASE}/Widgets/widgets.css`);
        await loadScriptOnce(`${CESIUM_BASE}/Cesium.js`);
        if (cancelled || !containerRef.current) return;

        const Cesium = window.Cesium;
        if (!Cesium) throw new Error("window.Cesium не появился после загрузки скрипта");

        // Без Cesium ion — весь спайк работает без единого токена/API-ключа.
        Cesium.Ion.defaultAccessToken = undefined;

        const { createGibsTilingScheme } = await import("./gibs-cesium-tiling-scheme");

        // REST-шаблон — ТОТ ЖЕ САМЫЙ URL, что уже эмпирически подтверждён
        // в G3 (curl, HTTP 200) для production RealEarthTileLayer.tsx, не
        // KVP-режим (см. шапку файла — G6.6.1 честная причина смены).
        const gibsProvider = new Cesium.WebMapTileServiceImageryProvider({
          url: "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpeg",
          layer: "BlueMarble_NextGeneration",
          style: "default",
          tileMatrixSetID: "500m",
          format: "image/jpeg",
          maximumLevel: 7,
          tileWidth: 512,
          tileHeight: 512,
          tilingScheme: createGibsTilingScheme(Cesium),
        });

        // Диагностика — НЕ маскируем проблему: реальные ошибки загрузки
        // тайлов видны прямо на странице, не только "синий globe без объяснений".
        gibsProvider.errorEvent.addEventListener((err: any) => {
          setImageryStats((s) => ({ ...s, failed: s.failed + 1, lastError: String(err?.message ?? err) }));
        });

        let terrainProvider = new Cesium.EllipsoidTerrainProvider();
        try {
          terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(TERRAIN_URL, {
            requestVertexNormals: true,
            requestWaterMask: false,
          });
          if (!cancelled) setTerrainReady("ready");
        } catch (terrainErr) {
          // Честно деградируем к Ellipsoid, а не молча — статус виден в UI.
          if (!cancelled) setTerrainReady("failed");
          // eslint-disable-next-line no-console
          console.warn("Re:Earth Terrain недоступен, откат на Ellipsoid:", terrainErr);
        }
        if (cancelled) return;

        const viewer = new Cesium.Viewer(containerRef.current, {
          imageryProvider: gibsProvider,
          terrainProvider,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          infoBox: true,
          selectionIndicator: true,
        });
        viewerRef.current = viewer;

        // Cesium сам считает успешные тайлы через tileLoadProgressEvent —
        // используем его вместо ручного подсчёта в каждом обработчике.
        let successCount = 0;
        viewer.scene.globe.tileLoadProgressEvent.addEventListener((queued: number) => {
          if (queued === 0) {
            successCount += 1;
            setImageryStats((s) => ({ ...s, success: successCount }));
          }
        });

        // Cesium сам не даёт камере проходить сквозь настоящий рельеф
        // (enableCollisionDetection, включено по умолчанию) — РЕАЛЬНОЕ,
        // нативное решение той же задачи, для которой в G6.5 пришлось
        // вручную считать computeSafeMinDistance (глобальный худший случай
        // без знания фактического рельефа под камерой). При реальном
        // terrainProvider это работает точнее и без нашего кода вообще.
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50; // метры — насколько близко к поверхности можно подлететь

        // Границы стран (Natural Earth, те же URL, что production G5) —
        // только контур, без заливки.
        const borders = await Cesium.GeoJsonDataSource.load(
          "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
          { stroke: Cesium.Color.fromCssColorString("#fbbf24"), fill: Cesium.Color.TRANSPARENT, strokeWidth: 1.5, clampToGround: false }
        );
        if (cancelled) return;
        viewer.dataSources.add(borders);

        // Подписи СТРАН — текстом, не иконками, видны почти всегда
        // (глобальный/региональный масштаб) — 177 стран не создают спама,
        // в отличие от 1000+ городов.
        for (const entity of borders.entities.values) {
          if (!entity.polygon) continue;
          const hierarchy = entity.polygon.hierarchy?.getValue(Cesium.JulianDate.now());
          const positions = hierarchy?.positions ?? hierarchy;
          if (!positions || !Array.isArray(positions) || positions.length === 0) continue;
          const center = roughPolygonCenter(Cesium, positions);
          const name = entity.properties?.NAME_RU?.getValue?.() ?? entity.properties?.NAME?.getValue?.() ?? "";
          if (!name) continue;
          viewer.entities.add({
            position: center,
            label: {
              text: name,
              font: "bold 15px sans-serif",
              fillColor: Cesium.Color.fromCssColorString("#fde68a"),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              // Видна с любой разумной дистанции — до сотни км текст стран
              // не нужен (там уже видны города), поэтому диапазон обрезан
              // СНИЗУ, не только сверху.
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(100_000, 2.0e8),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }

        // Города — БЕЗ GeoJsonDataSource (его дефолт — billboard-пин на
        // каждую точку без LOD, см. шапку файла). Вручную, с
        // DistanceDisplayCondition по SCALERANK — тот же принцип "больше
        // видно ближе", что в production geo-vector-lod.ts (G5), но
        // реализован штатным механизмом Cesium, не нашим кодом.
        const citiesResponse = await fetch(
          "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places.geojson"
        );
        const citiesGeoJson = await citiesResponse.json();
        if (cancelled) return;

        for (const feature of citiesGeoJson.features) {
          const [lng, lat] = feature.geometry.coordinates;
          const props = feature.properties;
          const name: string = props.NAME_RU || props.NAME;
          const isCapital = props.ADM0CAP === 1;
          const scaleRank: number = props.SCALERANK ?? 8;

          // Столицы и крупнейшие города (ранг 0-3) видны с глобального
          // масштаба; средние (4-6) — с регионального; мелкие (7+) —
          // только вблизи. Три грубых тира, не 8 отдельных условий.
          // Нижняя граница всегда 0 — подпись не обязана прятаться, когда
          // камера подлетела ВПЛОТНУЮ к этому же городу.
          const nearMeters = 0;
          const farMeters = isCapital
            ? 2.0e8
            : scaleRank <= 3
              ? 2.0e8
              : scaleRank <= 6
                ? 4_000_000
                : 800_000;

          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lng, lat),
            point: {
              pixelSize: isCapital ? 8 : 5,
              color: isCapital ? Cesium.Color.fromCssColorString("#fbbf24") : Cesium.Color.fromCssColorString("#e2e8f0"),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(nearMeters, farMeters),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: name,
              font: isCapital ? "bold 13px sans-serif" : "12px sans-serif",
              fillColor: isCapital ? Cesium.Color.fromCssColorString("#fbbf24") : Cesium.Color.fromCssColorString("#e2e8f0"),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(10, 0),
              horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(nearMeters, farMeters),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }

        if (!cancelled) {
          const start = LOCATIONS.earth;
          viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(start.lng, start.lat, start.height) });
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

      {/* Диагностика — по прямому указанию "не маскируй проблему": реальные
          счётчики успех/провал загрузки тайлов и статус террейна видны
          прямо на странице, не только в консоли. */}
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
        <div>Imagery tiles loaded: {imageryStats.success}</div>
        <div style={{ color: imageryStats.failed > 0 ? "#f87171" : undefined }}>Imagery tiles failed: {imageryStats.failed}</div>
        {imageryStats.lastError && <div style={{ color: "#f87171", fontSize: 10 }}>Last error: {imageryStats.lastError.slice(0, 120)}</div>}
        <div style={{ marginTop: 4 }}>
          Terrain:{" "}
          {terrainReady === "ready" ? (
            <span style={{ color: "#4ade80" }}>Re:Earth (real relief)</span>
          ) : terrainReady === "failed" ? (
            <span style={{ color: "#f87171" }}>failed → Ellipsoid fallback</span>
          ) : (
            "loading..."
          )}
        </div>
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
        G6.6.1 spike — CesiumJS {CESIUM_VERSION} (CDN, без ion-токена) · Imagery: NASA GIBS BlueMarble · {TERRAIN_ATTRIBUTION} · Borders/labels:
        Natural Earth · dev-only, production /geo3d/[id] не тронут.
      </div>
    </div>
  );
}
