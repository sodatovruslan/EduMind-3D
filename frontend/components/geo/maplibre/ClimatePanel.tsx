"use client";

// G6.12 §23-27 — климатический сценарий для MapLibre-урока: тот же слайдер
// (0-5°C, шаг 0.5) и тот же backend-контракт (trigger_climate_scenario),
// что уже проверен старым R3F-рендерером (GeoWorldScene.tsx) — семантика
// портирована, не переизобретена (§26). Карта уже показывает визуальный
// индикатор (useClimateOverlay.ts, кольцо у Памира) — эта панель добавляет
// слайдер, легенду единиц/сценария и явную оговорку "образовательная
// симуляция, не научный прогноз" (§26, обязательно, т.к. это НЕ полноценная
// климатическая модель, а один смоделированный сценарий схода селя).
import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/lib/locale-context";

export interface ClimatePanelProps {
  temperatureAnomaly: number;
  onChange: (value: number) => void;
  triggered: boolean;
  phenomenon: string | null;
  location: string | null;
  description: string;
}

export default function ClimatePanel({ temperatureAnomaly, onChange, triggered, phenomenon, location, description }: ClimatePanelProps) {
  const { t } = useLocale();
  const c = t.geo.maplibre.earthScience.climate;

  return (
    <div className="ds-glass mt-4 rounded-ds-panel p-4" data-testid="geo-climate-panel">
      <p className="mb-2 text-ds-caption text-text-muted">{c.disclaimer}</p>
      <label className="mb-1 block font-mono text-ds-caption uppercase tracking-widest text-text-muted" htmlFor="climate-anomaly-slider">
        {c.warmingLabel.replace("{value}", temperatureAnomaly.toFixed(1))}
      </label>
      <input
        id="climate-anomaly-slider"
        type="range"
        min={0}
        max={5}
        step={0.5}
        value={temperatureAnomaly}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent-geo"
      />
      <p className="mt-1 text-[11px] text-text-muted">{c.unitsHint}</p>

      <div
        className={`mt-3 rounded-ds-panel border p-3 text-ds-body ${
          triggered ? "border-warning/40 bg-warning/10 text-warning" : "border-border/[0.1] bg-surface-elevated text-text-secondary"
        }`}
        role="status"
      >
        {triggered && phenomenon && location && (
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={14} className="shrink-0" />
            {phenomenon} — {location}
          </p>
        )}
        <p className={triggered ? "text-warning/90" : "text-text-muted"}>{description}</p>
      </div>
    </div>
  );
}
