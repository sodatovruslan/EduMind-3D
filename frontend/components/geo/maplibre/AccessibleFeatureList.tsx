"use client";

// G6.12 §41 — клавиатурно-доступная альтернатива выбору объекта кликом по
// глобусу (G6.11 честно оставил это известным ограничением только для
// континентов; этот компонент — первый реальный шаг для новых Earth
// Science слоёв: обычный список кнопок, полностью доступный с клавиатуры
// и скринридером, БЕЗ попытки сделать сам WebGL-канвас screen-reader-
// нативным — задание прямо просит не пытаться (§41, "impossible").
import { useLocale } from "@/lib/locale-context";
import type { SampleFeature } from "@/lib/geo/maplibre/useEarthScienceLayers";

export interface AccessibleFeatureListProps {
  titleKey: string;
  features: SampleFeature[];
}

export default function AccessibleFeatureList({ titleKey, features }: AccessibleFeatureListProps) {
  const { t } = useLocale();
  if (features.length === 0) return null;

  return (
    <details className="mt-2 rounded-ds-control border border-border/[0.1] bg-surface-elevated p-2">
      <summary className="cursor-pointer text-ds-caption font-medium text-text-secondary">
        {titleKey} ({features.length})
      </summary>
      <div className="mt-2 flex flex-wrap gap-1.5" role="list" aria-label={titleKey}>
        {features.map((f) => (
          <button
            key={f.key}
            type="button"
            role="listitem"
            onClick={f.onSelect}
            className="ds-focus-ring rounded-full border border-border/[0.12] px-2.5 py-1 text-ds-caption text-text-secondary transition-colors hover:text-text-primary"
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-text-muted">{t.geo.maplibre.earthScience.accessibleListHint}</p>
    </details>
  );
}
