"use client";

// G6.12 §28/§29/§41 — перегруппированная панель слоёв: BASE / EARTH SCIENCE
// / SPECIAL MODES (вместо плоского списка чекбоксов). Design V2 токены,
// никакого нового визуального языка (§43 — D10 freeze). Тектоника+вулканы
// +землетрясения комбинируемы (реальная образовательная ценность —
// корреляция с границами плит, §21/§22); Earth Structure — эксклюзивный
// режим (карта скрывается под R3F cutaway, поэтому остальные тоглы во
// время него неактуальны — задизейблены, не удалены).
// Настоящие (не декоративные) checkbox-семантика (`<input type="checkbox">`)
// — клавиатурно доступны нативно, без ручной ARIA-реализации (§41).
import { useLocale } from "@/lib/locale-context";
import type { EarthScienceLayerDiagnostics } from "@/lib/geo/maplibre/useEarthScienceLayers";
import type { EarthquakeWindowKey } from "@/lib/geo/maplibre/earth-science-sources";

export interface BaseToggles {
  labels: boolean;
  terrain: boolean;
}

export interface EarthScienceToggles {
  tectonics: boolean;
  volcanoes: boolean;
  earthquakes: boolean;
  climate: boolean;
}

export interface LayerControlPanelProps {
  base: BaseToggles;
  onToggleBase: (key: keyof BaseToggles) => void;
  earthScience: EarthScienceToggles;
  onToggleEarthScience: (key: keyof EarthScienceToggles) => void;
  earthquakeWindow: EarthquakeWindowKey;
  onEarthquakeWindowChange: (window: EarthquakeWindowKey) => void;
  earthStructureMode: boolean;
  onToggleEarthStructure: () => void;
  diagnostics: EarthScienceLayerDiagnostics;
}

function StatusDot({ status }: { status: "idle" | "loading" | "ready" | "error" | undefined }) {
  if (!status || status === "idle") return null;
  if (status === "loading") return <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />;
  if (status === "error") return <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />;
  return null;
}

export default function LayerControlPanel({
  base,
  onToggleBase,
  earthScience,
  onToggleEarthScience,
  earthquakeWindow,
  onEarthquakeWindowChange,
  earthStructureMode,
  onToggleEarthStructure,
  diagnostics,
}: LayerControlPanelProps) {
  const { t } = useLocale();
  const l = t.geo.maplibre.layers;

  return (
    <div className="ds-glass mt-4 rounded-ds-panel p-4" data-testid="geo-layer-control-panel">
      <p className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{l.groupBase}</p>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <label className="ds-focus-ring flex items-center gap-2 rounded-ds-control px-1 py-0.5 text-ds-body text-text-secondary">
          <input type="checkbox" checked={base.labels} onChange={() => onToggleBase("labels")} className="accent-accent-geo" />
          {l.labels}
        </label>
        <label className="ds-focus-ring flex items-center gap-2 rounded-ds-control px-1 py-0.5 text-ds-body text-text-secondary">
          <input type="checkbox" checked={base.terrain} onChange={() => onToggleBase("terrain")} className="accent-accent-geo" />
          {l.terrain}
        </label>
      </div>

      <p className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{l.groupEarthScience}</p>
      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1.5">
        <label
          className={`ds-focus-ring flex items-center gap-2 rounded-ds-control px-1 py-0.5 text-ds-body text-text-secondary ${earthStructureMode ? "opacity-40" : ""}`}
        >
          <input
            type="checkbox"
            checked={earthScience.tectonics}
            disabled={earthStructureMode}
            onChange={() => onToggleEarthScience("tectonics")}
            className="accent-accent-geo"
          />
          {l.tectonics}
          <StatusDot status={diagnostics.status.tectonics} />
        </label>
        <label
          className={`ds-focus-ring flex items-center gap-2 rounded-ds-control px-1 py-0.5 text-ds-body text-text-secondary ${earthStructureMode ? "opacity-40" : ""}`}
        >
          <input
            type="checkbox"
            checked={earthScience.volcanoes}
            disabled={earthStructureMode}
            onChange={() => onToggleEarthScience("volcanoes")}
            className="accent-accent-geo"
          />
          {l.volcanoes}
          <StatusDot status={diagnostics.status.volcanoes} />
        </label>
        <label
          className={`ds-focus-ring flex items-center gap-2 rounded-ds-control px-1 py-0.5 text-ds-body text-text-secondary ${earthStructureMode ? "opacity-40" : ""}`}
        >
          <input
            type="checkbox"
            checked={earthScience.earthquakes}
            disabled={earthStructureMode}
            onChange={() => onToggleEarthScience("earthquakes")}
            className="accent-accent-geo"
          />
          {l.earthquakes}
          <StatusDot status={diagnostics.status.earthquakes} />
        </label>
        <label
          className={`ds-focus-ring flex items-center gap-2 rounded-ds-control px-1 py-0.5 text-ds-body text-text-secondary ${earthStructureMode ? "opacity-40" : ""}`}
        >
          <input
            type="checkbox"
            checked={earthScience.climate}
            disabled={earthStructureMode}
            onChange={() => onToggleEarthScience("climate")}
            className="accent-accent-geo"
          />
          {l.climate}
        </label>
      </div>

      {earthScience.earthquakes && !earthStructureMode && (
        <div className="mb-2 flex items-center gap-2" role="group" aria-label={l.earthquakeWindowLabel}>
          <span className="text-[11px] text-text-muted">{l.earthquakeWindowLabel}:</span>
          {(["day", "week", "month"] as EarthquakeWindowKey[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onEarthquakeWindowChange(w)}
              aria-pressed={earthquakeWindow === w}
              className={`ds-focus-ring rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                earthquakeWindow === w ? "bg-accent-geo/30 text-accent-geo" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {l.earthquakeWindow[w]}
            </button>
          ))}
        </div>
      )}

      {(diagnostics.errors.tectonics || diagnostics.errors.volcanoes || diagnostics.errors.earthquakes) && (
        <p className="mb-2 text-[11px] text-danger" role="alert">
          {l.loadErrorHint}
        </p>
      )}

      <p className="mb-1 mt-3 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{l.groupSpecialModes}</p>
      <label className="ds-focus-ring flex items-center gap-2 rounded-ds-control px-1 py-0.5 text-ds-body text-text-secondary">
        <input type="checkbox" checked={earthStructureMode} onChange={onToggleEarthStructure} className="accent-accent-geo" />
        {l.earthStructure}
      </label>
    </div>
  );
}
