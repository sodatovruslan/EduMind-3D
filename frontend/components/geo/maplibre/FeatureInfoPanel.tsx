"use client";

// G6.12 §37 — ЕДИНАЯ панель информации о выбранном объекте (граница плит /
// вулкан / землетрясение / слой Земли / континент), использующая общий
// renderer-independent `GeoFeatureInfo` (lib/geo/education/featureInfo.ts) —
// вместо 4 отдельных info-card компонентов на каждый тип объекта.
import { X } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import type { GeoFeatureInfo } from "@/lib/geo/education/featureInfo";

export interface FeatureInfoPanelProps {
  info: GeoFeatureInfo | null;
  onClose: () => void;
}

export default function FeatureInfoPanel({ info, onClose }: FeatureInfoPanelProps) {
  const { t } = useLocale();
  if (!info) return null;

  return (
    <div className="ds-glass mt-4 rounded-ds-panel p-4" role="status" data-testid="geo-feature-info-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-text-primary">{info.title}</p>
          {info.subtitle && <p className="text-ds-caption text-text-muted">{info.subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ds-focus-ring shrink-0 rounded-full p-1.5 text-text-muted transition-colors hover:text-text-primary"
          aria-label={t.geo.maplibre.earthScience.closeFeatureInfo}
        >
          <X size={16} />
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {info.lines.map((line, i) => (
          <li key={i} className="text-ds-body text-text-secondary">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
