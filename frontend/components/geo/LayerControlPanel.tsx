"use client";

/**
 * LayerControlPanel — G6: компактная плавающая кнопка "Слои" → попап со
 * списком образовательных геослоёв (реестр в lib/geo/layer-registry.ts),
 * сгруппированных по категориям, с легендами. Заменяет отдельный тогл
 * "Скрыть границы/города" из G5 — по прямому указанию не плодить второй
 * контрол для стран/городов (см. GEOWORLD_ROADMAP.md, раздел G6).
 */

import { useState } from "react";
import { Layers } from "lucide-react";
import { LAYER_CATEGORY_LABELS, layersByCategory } from "@/lib/geo/layer-registry";

export interface LayerControlPanelProps {
  visibility: Record<string, boolean>;
  onToggle: (layerId: string) => void;
}

export default function LayerControlPanel({ visibility, onToggle }: LayerControlPanelProps) {
  const [open, setOpen] = useState(false);
  const groups = layersByCategory();

  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-10">
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid="layer-panel-toggle"
        className="flex items-center gap-1.5 rounded-full border border-glass-border bg-surface-deep/80 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition hover:bg-surface-deep/95"
      >
        <Layers size={14} />
        Слои
      </button>

      {open && (
        <div
          data-testid="layer-panel"
          className="glass-panel mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-glass-border p-3 text-xs shadow-2xl"
        >
          {groups.map((group) => (
            <div key={group.category} className="mb-3 last:mb-0">
              <p className="mb-1.5 font-headline text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {LAYER_CATEGORY_LABELS[group.category]}
              </p>
              <div className="space-y-2">
                {group.layers.map((layer) => (
                  <div key={layer.id}>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(visibility[layer.id])}
                        onChange={() => onToggle(layer.id)}
                        data-testid={`layer-checkbox-${layer.id}`}
                        className="mt-0.5 accent-neon-violet"
                      />
                      <span>
                        <span className="block font-medium text-slate-200">{layer.title}</span>
                        <span className="block text-[11px] text-slate-400">{layer.description}</span>
                      </span>
                    </label>
                    {visibility[layer.id] && layer.legend && (
                      <div className="ml-6 mt-1 space-y-0.5">
                        {layer.legend.map((item) => (
                          <div key={item.label} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                            {item.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
