"use client";

// G6.11 — task/objective/feedback/progress/completion panel for the first
// real MapLibre GeoWorld lesson. Design V2 tokens only (ds-glass/ds-focus-
// ring/text-*/accent-geo — same primitives GeoWorldScene.tsx already uses),
// no new visual language (§14/§23). Data-driven layer list, not scattered
// hardcoded JSX per layer (§7's "data-driven, not hardcoded" principle
// applied to the one educational list this stage actually has).
import { useLocale } from "@/lib/locale-context";
import type { ContinentResult, EarthLayerKey, LayerResult } from "@/lib/geo/education/useGeoLessonState";

const LAYER_KEYS: EarthLayerKey[] = ["crust", "mantle", "outer_core", "inner_core"];

export interface GeoLessonPanelProps {
  selectedLayer: LayerResult | null;
  selectedContinent: ContinentResult | null;
  exploredLayers: Set<EarthLayerKey>;
  isSubmitting: boolean;
  error: string | null;
  completionScore: number | null;
  onExploreLayer: (layer: EarthLayerKey) => void;
  onComplete: () => void;
  canComplete: boolean;
}

export default function GeoLessonPanel({
  selectedLayer,
  selectedContinent,
  exploredLayers,
  isSubmitting,
  error,
  completionScore,
  onExploreLayer,
  onComplete,
  canComplete,
}: GeoLessonPanelProps) {
  const { t } = useLocale();
  const lesson = t.geo.maplibre.lesson;
  const layerLabels: Record<EarthLayerKey, string> = {
    crust: lesson.layerCrust,
    mantle: lesson.layerMantle,
    outer_core: lesson.layerOuterCore,
    inner_core: lesson.layerInnerCore,
  };

  return (
    <div className="ds-glass mt-4 rounded-ds-panel p-4" data-testid="geo-lesson-panel">
      <p className="text-ds-body text-text-secondary">{lesson.objective}</p>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={lesson.objective}>
        {LAYER_KEYS.map((key) => {
          const explored = exploredLayers.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onExploreLayer(key)}
              disabled={isSubmitting}
              aria-pressed={explored}
              className={`ds-focus-ring rounded-full border px-4 py-2 text-ds-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                explored
                  ? "border-accent-geo/60 bg-accent-geo/20 text-accent-geo"
                  : "border-border/[0.12] text-text-secondary hover:text-text-primary"
              }`}
            >
              {layerLabels[key]}
              {explored && <span className="ml-1.5 text-ds-caption">({lesson.exploredBadge})</span>}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-ds-caption text-text-muted">
        {lesson.progressLabel.replace("{done}", String(exploredLayers.size)).replace("{total}", String(LAYER_KEYS.length))}
      </p>

      <div className="mt-3 rounded-ds-panel border border-border/[0.1] bg-surface-elevated p-3 text-ds-body text-text-secondary">
        {!selectedContinent && !selectedLayer && <p className="text-text-muted">{lesson.continentPrompt}</p>}
        {selectedContinent && (
          <>
            <p className="font-semibold text-text-primary">{selectedContinent.name}</p>
            <p className="text-text-muted">
              {t.geo.hud.areaPopulationLabel
                .replace("{area}", String(selectedContinent.area_million_km2))
                .replace("{population}", String(selectedContinent.population_millions))}
            </p>
            <p className="text-text-muted">{selectedContinent.fact}</p>
          </>
        )}
        {selectedLayer && !selectedContinent && (
          <>
            <p className="font-semibold text-text-primary">{selectedLayer.name}</p>
            <p className="text-text-muted">
              {t.geo.hud.depthTemperatureLabel
                .replace("{depth}", selectedLayer.depth_km)
                .replace("{temp}", selectedLayer.temperature_c)}
            </p>
            <p className="text-text-muted">
              {t.geo.hud.stateCompositionLabel
                .replace("{state}", selectedLayer.state)
                .replace("{composition}", selectedLayer.composition)}
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-ds-body text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onComplete}
          disabled={!canComplete}
          className="ds-focus-ring rounded-full border border-border/[0.12] px-4 py-2 text-ds-body font-medium text-text-primary transition-colors hover:bg-text-primary/5 disabled:opacity-50"
        >
          {t.geo.hud.completeAttempt}
        </button>
        {completionScore !== null && (
          <span className="font-mono text-ds-body font-medium text-text-primary">
            {t.geo.hud.scoreLabel.replace("{score}", String(completionScore))}
          </span>
        )}
      </div>
    </div>
  );
}
