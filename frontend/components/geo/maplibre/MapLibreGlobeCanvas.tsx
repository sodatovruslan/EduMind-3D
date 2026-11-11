"use client";

// G6.10 — production-oriented host component. Использует
// `useMapLibreGlobe` (тот же lifecycle/imagery/terrain pipeline, что уже
// проверен G6.7-G6.9 в /geoworld-maplibre-spike), но UI здесь — Design V2
// токены (ds-glass/ds-focus-ring/text-*), не спайковый monospace/hardcoded-
// цвет debug-стиль. Diagnostics-панель — ТОЛЬКО dev (`showDiagnostics`
// проп по умолчанию `false`, вызывающий код должен явно включить, обычно
// гейтя на `process.env.NODE_ENV !== "production"` — см. G6.10 §8: "Production
// user не должен видеть технические counters").
import { useEffect } from "react";
import { useLocale } from "@/lib/locale-context";
import { useMapLibreGlobe, type MapLibreGlobeState } from "@/lib/geo/maplibre/useMapLibreGlobe";
import { LOCATIONS, type LocationKey } from "@/lib/geo/maplibre/camera-presets";
import type { CameraContext } from "@/lib/geo/maplibre/camera-context";

export interface MapLibreGlobeCanvasProps {
  /** Esri eval-only слой по умолчанию ВЫКЛЮЧЕН в production-контексте (G6.10 §16 — не production dependency). */
  esriEnabledByDefault?: boolean;
  showControlPoints?: boolean;
  showDiagnostics?: boolean;
  /**
   * G6.11 (post-review) — тот же переключатель, что уже есть в
   * `/geoworld-maplibre-spike`, для визуального сравнения deep zoom с
   * NASA HLS (default) против Esri (eval-only, суб-метровая детализация).
   * По умолчанию `false` — НЕ показывается реальному пользователю
   * production-сборки (вызывающий код гейтит на dev-режим, как и
   * `showDiagnostics`/`showControlPoints`), сам Esri остаётся выключен по
   * умолчанию даже когда переключатель виден.
   */
  showEsriToggle?: boolean;
  /**
   * Row of "fly to" buttons (whole Earth / Asia / … / Pamir) over the map.
   * On by default; the missions scene turns it off — it draws its own
   * prompt in the same place, and "Asia" would give the answer away.
   */
  showPresets?: boolean;
  className?: string;
  /** G6.11 — реальное геовзаимодействие: клик по глобусу отдаёт lng/lat, без образовательной семантики (та остаётся на вызывающем коде/бэкенде). */
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  /** G6.11 — нормализованный камера-контекст (throttled на `moveend`). */
  onCameraChange?: (camera: CameraContext) => void;
  /**
   * G6.12 — отдаёт наверх `getMap`/`status` composable-хукам родителя
   * (useEarthScienceLayers/useClimateOverlay), которым нужен доступ к
   * сырому instance карты для добавления своих source/layer поверх
   * базового стиля. `getMap` замыкается на внутренний `mapRef` хука — вызов
   * ВСЕГДА отдаёт актуальный instance, даже если сам колбэк захвачен один
   * раз при первом рендере (тот же приём, что onMapClick/onCameraChange).
   */
  onEngineReady?: (getMap: () => any, status: MapLibreGlobeState["status"]) => void;
}

const STARFIELD_STYLE: React.CSSProperties = {
  backgroundColor: "#02040a",
  backgroundImage: [
    "radial-gradient(1px 1px at 23px 41px, rgba(255,255,255,0.9), transparent)",
    "radial-gradient(1px 1px at 131px 97px, rgba(255,255,255,0.7), transparent)",
    "radial-gradient(1.5px 1.5px at 211px 163px, rgba(190,215,255,0.9), transparent)",
    "radial-gradient(1px 1px at 67px 229px, rgba(255,255,255,0.6), transparent)",
    "radial-gradient(1px 1px at 173px 19px, rgba(255,240,220,0.8), transparent)",
    "radial-gradient(1px 1px at 89px 137px, rgba(255,255,255,0.5), transparent)",
  ].join(", "),
  backgroundSize: "260px 260px, 260px 260px, 340px 340px, 340px 340px, 190px 190px, 190px 190px",
};

export default function MapLibreGlobeCanvas({
  esriEnabledByDefault = false,
  showControlPoints = false,
  showDiagnostics = false,
  showEsriToggle = false,
  showPresets = true,
  className,
  onMapClick,
  onCameraChange,
  onEngineReady,
}: MapLibreGlobeCanvasProps) {
  const { t } = useLocale();
  const engine = useMapLibreGlobe({ esriEnabledByDefault, showControlPoints, onMapClick, onCameraChange });

  useEffect(() => {
    // browser-test bridge (dev builds only): lets a Playwright check read the
    // real map state (layers, loaded features) instead of guessing from pixels
    if (process.env.NODE_ENV !== "production") (window as any).__e2eGeoMap = engine.getMap;
    onEngineReady?.(engine.getMap, engine.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.status]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-ds-panel ${className ?? ""}`}
      // space behind the globe: near-black with a faint star field (two
      // dot patterns of different period, so the repeat is not obvious)
      style={STARFIELD_STYLE}
    >
      {/*
        G6.11 — реальный баг, найденный browser QA (не GPU-артефакт
        песочницы): MapLibre САМ добавляет класс `maplibregl-map` этому
        элементу (`container` в конструкторе `Map`), а стиль этого класса
        (`position: relative`, maplibre-gl.css) грузится ПОСЛЕ Tailwind
        (через `loadStylesheetOnce`, во время выполнения) — при равной
        специфичности выигрывает источник, подключённый позже, поэтому
        Tailwind-класс `absolute` тихо перебивался на `relative`, `inset-0`
        переставал что-либо значить (применяется только к absolute/fixed),
        и канвас схлопывался до дефолтных 300px высоты вместо контейнера.
        Инлайн-стиль имеет более высокий приоритет, чем ЛЮБОЕ правило из
        подключаемого класса (кроме `!important`, которого здесь нет) —
        поэтому не зависит от порядка подключения стилей.
      */}
      <div ref={engine.containerRef} style={{ position: "absolute", inset: 0 }} />

      {engine.status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-ds-body text-text-secondary">
          {t.geo.maplibre?.loading ?? "Загрузка..."}
        </div>
      )}

      {engine.status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-ds-body text-danger">
          {(t.geo.maplibre?.error ?? "Ошибка инициализации карты: {message}").replace("{message}", engine.errorMessage ?? "")}
        </div>
      )}

      {/*
        G6.11 (post-review) — реальный баг, найденный по скриншоту
        владельца продукта: `SimulationShell` рисует свою шапку
        (назад/название/Locale/Theme) как `fixed` элемент, который
        "плавает" НАД контентом и НЕ резервирует под себя место (см.
        комментарий в самом SimulationShell.tsx — так сделано намеренно,
        чтобы не давить своей высотой на каждую сцену). Это значит, что
        любой элемент, начинающийся у самого верха СВОЕГО контейнера
        (здесь — `top-0` внутри канваса карты, который сам стартует у
        верха страницы), визуально перекрывается шапкой. `top-20` — тот же
        приём, что уже применяли для канваса/попапов: явный отступ, не
        зависящий от того, как SimulationShell решит спозиционировать себя.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex flex-wrap gap-2 p-3">
        {showPresets && (Object.keys(LOCATIONS) as LocationKey[]).map((key) => (
          <button
            key={key}
            onClick={() => engine.flyTo(key)}
            disabled={engine.status !== "ready"}
            className={`ds-focus-ring pointer-events-auto rounded-full px-3 py-1.5 text-ds-caption font-medium backdrop-blur transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              engine.activeLocation === key
                ? "bg-accent-geo/40 text-white"
                : "bg-surface-deep/60 text-text-secondary hover:text-text-primary"
            }`}
          >
            {LOCATIONS[key].label}
          </button>
        ))}
        {showEsriToggle && (
          <button
            onClick={engine.toggleEsri}
            disabled={engine.status !== "ready"}
            title="Esri World Imagery — EVALUATION ONLY (Esri Master Agreement disallows production use outside an ArcGIS subscription)"
            className={`ds-focus-ring pointer-events-auto rounded-full border px-3 py-1.5 text-ds-caption font-medium backdrop-blur transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              engine.esriEnabled
                ? "border-danger/50 bg-danger/20 text-danger"
                : "border-border/20 bg-surface-deep/60 text-text-secondary hover:text-text-primary"
            }`}
          >
            {engine.esriEnabled ? "Esri (eval-only): ON" : "Esri (eval-only): OFF"}
          </button>
        )}
      </div>

      {showDiagnostics && (
        <div className="pointer-events-none absolute right-3 top-20 z-10 max-w-[280px] rounded-ds-control bg-surface-deep/80 p-2.5 font-mono text-[11px] text-text-secondary backdrop-blur">
          <div className="mb-1 text-accent">MapLibre GL JS — dev diagnostics</div>
          <div>Engine: {engine.engineSource ?? "loading..."}</div>
          <div>FPS: {engine.fps}</div>
          <div className={engine.failedTiles > 0 ? "text-danger" : undefined}>Failed tiles: {engine.failedTiles}</div>
          <div>
            Terrain:{" "}
            {engine.terrainStatus === "ready" ? (
              <span className="text-success">ready</span>
            ) : engine.terrainStatus === "failed" ? (
              <span className="text-danger">failed</span>
            ) : (
              "loading..."
            )}
          </div>
          <div>HLS: {engine.hlsDate}</div>
          {engine.memoryMB !== null && <div>JS heap: ~{engine.memoryMB} MB</div>}
        </div>
      )}
    </div>
  );
}
