"use client";

/**
 * GeoFeatureInfoCard — G6: компактная плавающая карточка при клике по
 * образовательному объекту (вулкан/граница плиты/землетрясение). Одна
 * карточка на весь GeoWorld одновременно (состояние поднято в
 * GeoWorldScene) — не плодим несколько всплывающих окон разом.
 *
 * ДАННЫЕ (реальные поля источника) отделены от текста — сам компонент
 * ничего не выдумывает и не объясняет, просто показывает переданные
 * строки; вызывающий код формирует их из реальных полей провайдера.
 */

import { Html } from "@react-three/drei";
import { useLocale } from "@/lib/locale-context";

export interface GeoFeatureInfo {
  title: string;
  subtitle?: string;
  lines: string[];
  position: [number, number, number];
}

export interface GeoFeatureInfoCardProps {
  info: GeoFeatureInfo;
  onClose: () => void;
}

export default function GeoFeatureInfoCard({ info, onClose }: GeoFeatureInfoCardProps) {
  const { t } = useLocale();
  return (
    <Html position={info.position} center distanceFactor={3} zIndexRange={[100, 0]}>
      <div className="glass-panel w-56 rounded-xl border border-glass-border p-3 text-xs text-slate-200 shadow-2xl" data-testid="geo-feature-info-card">
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="font-headline font-semibold text-slate-100">{info.title}</p>
          <button
            onClick={onClose}
            aria-label={t.common.close}
            className="shrink-0 rounded-full px-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
          >
            ×
          </button>
        </div>
        {info.subtitle && <p className="mb-1 text-[11px] uppercase tracking-wider text-slate-400">{info.subtitle}</p>}
        {info.lines.map((line) => (
          <p key={line} className="text-slate-300">
            {line}
          </p>
        ))}
      </div>
    </Html>
  );
}
