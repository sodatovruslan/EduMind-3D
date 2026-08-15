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

export interface MapLibreGlobeCanvasProps {
  /** Esri eval-only слой по умолчанию ВЫКЛЮЧЕН в production-контексте (G6.10 §16 — не production dependency). */
  esriEnabledByDefault?: boolean;
  showControlPoints?: boolean;
  showDiagnostics?: boolean;
  className?: string;
}

export default function MapLibreGlobeCanvas({
  esriEnabledByDefault = false,
  showControlPoints = false,
  showDiagnostics = false,
  className,
}: MapLibreGlobeCanvasProps) {
  const { t } = useLocale();
  const engine = useMapLibreGlobe({ esriEnabledByDefault, showControlPoints });

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-ds-panel bg-black ${className ?? ""}`}>
      <div ref={engine.containerRef} className="absolute inset-0" />

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
