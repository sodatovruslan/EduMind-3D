"use client";

import { useLocale } from "@/lib/locale-context";
import { BRIGHTNESS_TARGET_MAX, BRIGHTNESS_TARGET_MIN } from "@/lib/task-engine";

/**
 * Controls for the "lamp brightness" task, drawn over the 3D scene so the
 * student watches the lamp while moving the sliders: a gauge with the green
 * target zone plus the source-voltage and resistor sliders. Displays values
 * it is given — the power ratio itself comes from the Circuit Engine.
 */

// the gauge runs from 0 to 150% of the rated power of the lamp
const GAUGE_MAX = 1.5;
const toPercent = (ratio: number) => `${(Math.min(Math.max(ratio, 0), GAUGE_MAX) / GAUGE_MAX) * 100}%`;

type Zone = "off" | "dim" | "good" | "hot";

function zoneOf(ratio: number): Zone {
  if (ratio <= 0) return "off";
  if (ratio < BRIGHTNESS_TARGET_MIN - 0.005) return "dim";
  if (ratio > BRIGHTNESS_TARGET_MAX + 0.005) return "hot";
  return "good";
}

const ZONE_TEXT: Record<Zone, string> = {
  off: "text-slate-400",
  dim: "text-amber-300",
  good: "text-emerald-300",
  hot: "text-red-400",
};

const ZONE_MARKER: Record<Zone, string> = {
  off: "bg-slate-400",
  dim: "bg-amber-300",
  good: "bg-emerald-300",
  hot: "bg-red-400",
};

export default function BrightnessHud({
  ratio,
  voltageV,
  resistanceOhm,
  resistorInLoop,
  onVoltageChange,
  onResistanceChange,
}: {
  /** Lamp power as a fraction of its rated power (1 = 100%). */
  ratio: number;
  voltageV: number;
  resistanceOhm: number;
  resistorInLoop: boolean;
  onVoltageChange: (value: number) => void;
  onResistanceChange: (value: number) => void;
}) {
  const { t } = useLocale();
  const h = t.electricity.hud;
  const zone = zoneOf(ratio);
  const zoneLabel = { off: "", dim: h.brightnessDim, good: h.brightnessGood, hot: h.brightnessHot }[zone];
  const percent = Math.round(ratio * 100);

  return (
    <div
      data-testid="brightness-hud"
      data-zone={zone}
      className="pointer-events-auto w-[min(92%,34rem)] rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-slate-100 shadow-xl backdrop-blur-md sm:p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{h.brightnessLabel}</span>
        <span className={`font-mono text-lg font-semibold tabular-nums ${ZONE_TEXT[zone]}`} data-testid="brightness-value">
          {percent}%{zoneLabel && <span className="ml-2 text-xs font-medium">{zoneLabel}</span>}
        </span>
      </div>

      <div className="relative mt-2 h-3 rounded-full bg-slate-800" role="img" aria-label={`${h.brightnessLabel}: ${percent}%`}>
        <div
          className="absolute inset-y-0 rounded-full bg-emerald-500/35 ring-1 ring-emerald-400/60"
          style={{ left: toPercent(BRIGHTNESS_TARGET_MIN), right: `calc(100% - ${toPercent(BRIGHTNESS_TARGET_MAX)})` }}
        />
        <div
          className={`absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow transition-[left] duration-200 ${ZONE_MARKER[zone]}`}
          style={{ left: toPercent(ratio) }}
        />
      </div>
      <p className="mt-1.5 text-xs text-slate-400">{zone === "off" ? h.brightnessOff : h.brightnessZone}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-300">
          <span className="flex justify-between">
            <span>{h.voltageLabel}</span>
            <span className="font-mono tabular-nums text-slate-100">
              {voltageV.toFixed(1)} {h.unitV}
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={24}
            step={0.5}
            value={voltageV}
            onChange={(e) => onVoltageChange(Number(e.target.value))}
            data-testid="voltage-slider"
            className="mt-1 w-full accent-amber-400"
          />
        </label>
        <label className={`block text-xs ${resistorInLoop ? "text-slate-300" : "text-slate-500"}`}>
          <span className="flex justify-between">
            <span>{h.resistanceLabel}</span>
            <span className="font-mono tabular-nums">
              {resistorInLoop ? `${resistanceOhm.toFixed(1)} ${h.unitOhm}` : h.resistorNotInLoop}
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={40}
            step={0.5}
            value={resistanceOhm}
            disabled={!resistorInLoop}
            onChange={(e) => onResistanceChange(Number(e.target.value))}
            data-testid="resistance-slider"
            className="mt-1 w-full accent-sky-400 disabled:opacity-40"
          />
        </label>
      </div>
    </div>
  );
}
