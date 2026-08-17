"use client";

// G6.12 §13/§20/§40/§41 — легенда для включённых Earth Science слоёв.
// Цвета — из lib/geo/layer-registry.ts (единственный источник правды,
// уже используемый старым рендерером — те же hex, не переизобретены).
// ПОДПИСИ — свои, локализованные (t.geo.maplibre.earthScience.legend) —
// сами тексты в layer-registry.ts захардкожены по-русски (наследие G6, до
// i18n) и не подходят для EN/TG UI (§40: "each locale must show only its
// own language"). Тип границы плит различается НЕ только цветом
// (сплошная/пунктирная линия-образец рядом с точкой) — тот же принцип, что
// paint-выражения в useEarthScienceLayers.ts (line-dasharray).
import { useLocale } from "@/lib/locale-context";
import { LAYER_DEFINITIONS } from "@/lib/geo/layer-registry";

export interface EarthScienceLegendProps {
  showTectonics: boolean;
  showVolcanoes: boolean;
  showEarthquakes: boolean;
  showClimate: boolean;
}

function LegendSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block h-0 w-4 border-t-2"
      style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}
    />
  );
}

export default function EarthScienceLegend({ showTectonics, showVolcanoes, showEarthquakes, showClimate }: EarthScienceLegendProps) {
  const { t } = useLocale();
  const es = t.geo.maplibre.earthScience;
  const plateColors = (LAYER_DEFINITIONS.find((l) => l.id === "plates")?.legend ?? []).map((item) => item.color);
  const volcanoColor = LAYER_DEFINITIONS.find((l) => l.id === "volcanoes")?.legend?.[0]?.color ?? "#ef4444";
  const earthquakeColors = (LAYER_DEFINITIONS.find((l) => l.id === "earthquakes")?.legend ?? []).map((item) => item.color);

  if (!showTectonics && !showVolcanoes && !showEarthquakes && !showClimate) return null;

  return (
    <div className="ds-glass mt-4 rounded-ds-panel p-4" data-testid="geo-earth-science-legend">
      <p className="mb-2 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{es.legendTitle}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {showTectonics &&
          es.legend.plates.map((label, i) => (
            <span key={`plate-${i}`} className="flex items-center gap-2 text-ds-caption text-text-secondary">
              <LegendSwatch color={plateColors[i] ?? "#facc15"} dashed={i === 1} />
              {label}
            </span>
          ))}
        {showVolcanoes && (
          <span className="flex items-center gap-2 text-ds-caption text-text-secondary">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: volcanoColor }} />
            {es.legend.volcano}
          </span>
        )}
        {showEarthquakes &&
          es.legend.earthquakes.map((label, i) => (
            <span key={`quake-${i}`} className="flex items-center gap-2 text-ds-caption text-text-secondary">
              <span
                aria-hidden
                className="inline-block rounded-full"
                style={{ backgroundColor: earthquakeColors[i] ?? "#fde047", width: 6 + i * 4, height: 6 + i * 4 }}
              />
              {label}
            </span>
          ))}
        {showClimate && (
          <span className="flex items-center gap-2 text-ds-caption text-text-secondary">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[#38bdf8]" />
            {es.climateLegendLabel}
          </span>
        )}
      </div>
    </div>
  );
}
