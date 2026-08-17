"use client";

// G6.10 — production-oriented host component. Использует
// `useMapLibreGlobe` (тот же lifecycle/imagery/terrain pipeline, что уже
// проверен G6.7-G6.9 в /geoworld-maplibre-spike), но UI здесь — Design V2
// токены (ds-glass/ds-focus-ring/text-*), не спайковый monospace/hardcoded-
// цвет debug-стиль. Diagnostics-панель — ТОЛЬКО dev (`showDiagnostics`
// проп по умолчанию `false`, вызывающий код должен явно включить, обычно
// гейтя на `process.env.NODE_ENV !== "production"` — см. G6.10 §8: "Production
// user не должен видеть технические counters").
import { useLocale } from "@/lib/locale-context";
import { useMapLibreGlobe } from "@/lib/geo/maplibre/useMapLibreGlobe";
import { LOCATIONS, type LocationKey } from "@/lib/geo/maplibre/camera-presets";
import type { CameraContext } from "@/lib/geo/maplibre/camera-context";

export interface MapLibreGlobeCanvasProps {
  /** Esri eval-only слой по умолчанию ВЫКЛЮЧЕН в production-контексте (G6.10 §16 — не production dependency). */
  esriEnabledByDefault?: boolean;
  showControlPoints?: boolean;
  showDiagnostics?: boolean;
  className?: string;
  /** G6.11 — реальное геовзаимодействие: клик по глобусу отдаёт lng/lat, без образовательной семантики (та остаётся на вызывающем коде/бэкенде). */
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  /** G6.11 — нормализованный камера-контекст (throttled на `moveend`). */
  onCameraChange?: (camera: CameraContext) => void;
}

export default function MapLibreGlobeCanvas({
  esriEnabledByDefault = false,
  showControlPoints = false,
  showDiagnostics = false,
  className,
  onMapClick,
  onCameraChange,
}: MapLibreGlobeCanvasProps) {
  const { t } = useLocale();
  const engine = useMapLibreGlobe({ esriEnabledByDefault, showControlPoints, onMapClick, onCameraChange });

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-ds-panel bg-black ${className ?? ""}`}>
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

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap gap-2 p-3">
        {(Object.keys(LOCATIONS) as LocationKey[]).map((key) => (
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
      </div>

      {showDiagnostics && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 max-w-[280px] rounded-ds-control bg-surface-deep/80 p-2.5 font-mono text-[11px] text-text-secondary backdrop-blur">
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
