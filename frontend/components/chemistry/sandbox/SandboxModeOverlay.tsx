"use client";

import React, { useEffect, useState } from "react";
import { BarChart3, Camera, Footprints, Maximize, Minimize } from "lucide-react";
import { CameraMode } from "@/lib/chemistry-lab-modes";
import { RoomInteriorBounds } from "@/lib/sandbox-locomotion";
import { isTypingTarget } from "@/lib/dom-input-utils";
import { useLocale } from "@/lib/locale-context";

export interface WallDiagnosticsInfo {
  wallBoxes?: Record<string, { minX: number; maxX: number; minZ: number; maxZ: number; innerPlane: number }>;
  registryReady?: boolean;
  dynamicRoomBounds?: RoomInteriorBounds;
  cameraXZ?: [number, number];
  playerXZ?: [number, number];
  playerRadius?: number;
  skinWidth?: number;
}

interface SandboxModeOverlayProps {
  cameraMode: CameraMode;
  onToggleMode: () => void;
  disabled?: boolean;
  disabledReason?: string;
  diagnostics?: WallDiagnosticsInfo;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const isDev = process.env.NODE_ENV !== "production";

/**
 * DOM-оверлей управления режимом камеры (Orbit S-6 ↔ Sandbox S-7).
 * Переключается по кнопке в UI или по клавише [F2].
 * Содержит UI-кнопку полноэкранного режима и опциональную dev-диагностическую панель (F3).
 *
 * D6.1 — shared by Chemistry AND Electricity (this file, unchanged
 * behavior), which makes it the single highest-leverage place to unify the
 * "top HUD" feel across both worlds: restyled from legacy `slate-*`/
 * hardcoded-dark classes to the D1 `.ds-glass`/semantic-token language, and
 * moved onto `useLocale()` (was 100% hardcoded Russian before). Every
 * caller (`ChemistryWorldScene.tsx`'s `ChemistryCanvas`,
 * `ElectricityLabScene.tsx`'s `ElectricitySandboxOverlay`) still passes the
 * exact same props with the exact same meaning — only the render output
 * changed. The dev-only F3 diagnostics panel is intentionally left in its
 * existing dark/mono debug styling and NOT localized — it's a developer
 * tool, not part of the student-facing product surface.
 */
export function SandboxModeOverlay({
  cameraMode,
  onToggleMode,
  disabled = false,
  disabledReason,
  diagnostics,
  isFullscreen = false,
  onToggleFullscreen,
}: SandboxModeOverlayProps) {
  const { t } = useLocale();
  const hud = t.sandboxHud;
  // По умолчанию dev-диагностика скрыта
  const [showDiag, setShowDiag] = useState(false);

  // Горячая клавиша [F2] для переключения режимов и [F3] для вкл/выкл оверлея диагностики (только в dev)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "F2" && !e.repeat && !disabled) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        onToggleMode();
      }
      if (e.code === "F3" && !e.repeat && isDev) {
        e.preventDefault();
        setShowDiag((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggleMode, disabled]);

  const isSandbox = cameraMode === "sandbox";

  // Динамические расчёты для оверлея
  const radius = diagnostics?.playerRadius ?? 0.20;
  const skin = diagnostics?.skinWidth ?? 0.01;
  const expectedGap = radius + skin; // 0.21m

  const camX = diagnostics?.cameraXZ?.[0] ?? diagnostics?.playerXZ?.[0] ?? 0;
  const camZ = diagnostics?.cameraXZ?.[1] ?? diagnostics?.playerXZ?.[1] ?? 0;
  const plrX = diagnostics?.playerXZ?.[0] ?? camX;
  const plrZ = diagnostics?.playerXZ?.[1] ?? camZ;

  const coordDelta = Math.sqrt((camX - plrX) ** 2 + (camZ - plrZ) ** 2);

  // Внутренние плоскости стен
  const leftInner = diagnostics?.wallBoxes?.["wall-left"]?.innerPlane ?? -7.0;
  const rightInner = diagnostics?.wallBoxes?.["wall-right"]?.innerPlane ?? 7.0;
  const backInner = diagnostics?.wallBoxes?.["wall-back"]?.innerPlane ?? -3.2;
  const frontInner = diagnostics?.wallBoxes?.["wall-front"]?.innerPlane ?? 8.0;

  // Фактические математические расстояния от камеры до плоскостей
  const leftActual = Math.abs(camX - leftInner);
  const rightActual = Math.abs(rightInner - camX);
  const backActual = Math.abs(camZ - backInner);
  const frontActual = Math.abs(frontInner - camZ);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 select-none">
      {/* Верхняя панель управления режимом и экраном */}
      <div className="flex items-center justify-between">
        <div className="ds-glass pointer-events-auto flex items-center gap-2 rounded-ds-control px-3 py-1.5 shadow-ds-sm">
          <span className={`h-2 w-2 rounded-full animate-pulse ${isSandbox ? "bg-success" : "bg-accent-geo"}`} />
          <span className="text-ds-caption font-semibold text-text-primary">
            {hud.modeLabel}{" "}
            <span className={`font-mono ${isSandbox ? "text-success" : "text-accent-geo"}`}>
              {isSandbox ? hud.modeSandbox : hud.modeOrbit}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Кнопка Полноэкранного режима */}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? hud.fullscreenExitAria : hud.fullscreenEnterAria}
              title={isFullscreen ? hud.fullscreenExitAria : hud.fullscreenEnterAria}
              className="ds-glass ds-focus-ring pointer-events-auto flex items-center gap-1.5 rounded-ds-control px-3 py-1.5 text-ds-caption font-semibold text-text-primary shadow-ds-sm transition-colors hover:bg-text-primary/5"
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
              <span>{isFullscreen ? hud.fullscreenExit : hud.fullscreenEnter}</span>
            </button>
          )}

          {/* Кнопка переключения режимов */}
          <button
            type="button"
            disabled={disabled}
            onClick={onToggleMode}
            className={`ds-glass ds-focus-ring pointer-events-auto flex items-center gap-2 rounded-ds-control px-3.5 py-1.5 text-ds-caption font-semibold shadow-ds-sm transition-colors ${
              disabled ? "cursor-not-allowed text-text-muted opacity-60" : "text-accent hover:bg-accent/10"
            }`}
            title={disabled ? disabledReason ?? hud.disabledDefault : hud.toggleHint}
          >
            {isSandbox ? <Camera size={14} /> : <Footprints size={14} />}
            <span>{isSandbox ? hud.toggleToOrbit : hud.toggleToSandbox}</span>
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent">F2</span>
          </button>
        </div>
      </div>

      {/* Центральный прицел в Sandbox-режиме */}
      {isSandbox && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <div className="h-2.5 w-0.5 bg-white/80 shadow-sm" />
            <div className="absolute h-0.5 w-2.5 bg-white/80 shadow-sm" />
          </div>
        </div>
      )}

      {/* Диагностическая панель реальных стен (Dev Diagnostics Overlay — доступна строго в dev-режиме,
          намеренно НЕ переведена и НЕ ресталирована под Design V2 — это инструмент разработчика,
          не часть продуктовой поверхности, см. D6.1-заметки) */}
      {isDev && isSandbox && showDiag && (
        <div className="pointer-events-none self-start max-w-md rounded-xl border border-cyan-500/40 bg-slate-950/90 p-3.5 text-xs backdrop-blur space-y-2 shadow-2xl">
          <div className="flex items-center justify-between border-b border-cyan-900/60 pb-1.5">
            <span className="flex items-center gap-1.5 font-bold text-cyan-300">
              <BarChart3 size={13} />
              Dev Diagnostics: Real Wall Collision Registry
            </span>
            <span className="text-[10px] font-mono text-slate-400">[F3 для скрыть]</span>
          </div>

          {/* 1. Visual Wall Bounds */}
          <div className="space-y-0.5 font-mono text-[11px]">
            <p className="font-semibold text-amber-300">A. Visual Wall Mesh Inner Planes (Box3):</p>
            <div className="grid grid-cols-2 gap-x-2 text-slate-300 text-[10px]">
              <div>• Left (X=-7.00): <span className="text-cyan-200">{leftInner.toFixed(2)}m</span></div>
              <div>• Right (X=+7.00): <span className="text-cyan-200">{rightInner.toFixed(2)}m</span></div>
              <div>• Back (Z=-3.20): <span className="text-cyan-200">{backInner.toFixed(2)}m</span></div>
              <div>• Front (Z=+8.00): <span className="text-cyan-200">{frontInner.toFixed(2)}m</span></div>
            </div>
          </div>

          {/* 2. Active Locomotion Bounds */}
          <div className="space-y-0.5 font-mono text-[11px]">
            <p className="font-semibold text-amber-300">B. Active Locomotion Bounds:</p>
            <div className="text-[10px] text-slate-300">
              <div>• Bounds: X[{diagnostics?.dynamicRoomBounds?.minX.toFixed(2) ?? "N/A"} .. {diagnostics?.dynamicRoomBounds?.maxX.toFixed(2) ?? "N/A"}] Z[{diagnostics?.dynamicRoomBounds?.minZ.toFixed(2) ?? "N/A"} .. {diagnostics?.dynamicRoomBounds?.maxZ.toFixed(2) ?? "N/A"}]</div>
              <div>• Registry Status: <span className={diagnostics?.registryReady ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>{diagnostics?.registryReady ? "READY (4/4 walls)" : "NOT READY (0/4 walls)"}</span></div>
              <div>• Source: <span className="text-slate-400">Real Scene Wall Mesh Box3 (updateWorldMatrix)</span></div>
            </div>
          </div>

          {/* 3. Coordinate System Invariant */}
          <div className="space-y-0.5 font-mono text-[11px]">
            <p className="font-semibold text-amber-300">C. Coordinate System Invariant Check:</p>
            <div className="text-[10px] text-slate-300">
              <div>• Camera XZ: [{camX.toFixed(2)}, {camZ.toFixed(2)}]</div>
              <div>• Player XZ: [{plrX.toFixed(2)}, {plrZ.toFixed(2)}]</div>
              <div>• Delta: <span className={coordDelta < 0.001 ? "text-emerald-400" : "text-rose-400"}>{coordDelta.toFixed(3)}m (Match)</span></div>
            </div>
          </div>

          {/* 4. Gap Analysis for All 4 Sides */}
          <div className="space-y-0.5 font-mono text-[11px]">
            <p className="font-semibold text-amber-300">D. Gap Measurements (Expected {expectedGap.toFixed(2)}m):</p>
            <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-300">
              <div data-testid="gap-left">• LEFT: actual <span className="text-emerald-300">{leftActual.toFixed(2)}m</span> (diff <span className="text-cyan-300">{(leftActual - expectedGap).toFixed(2)}m</span>)</div>
              <div data-testid="gap-right">• RIGHT: actual <span className="text-emerald-300">{rightActual.toFixed(2)}m</span> (diff <span className="text-cyan-300">{(rightActual - expectedGap).toFixed(2)}m</span>)</div>
              <div data-testid="gap-back">• BACK: actual <span className="text-emerald-300">{backActual.toFixed(2)}m</span> (diff <span className="text-cyan-300">{(backActual - expectedGap).toFixed(2)}m</span>)</div>
              <div data-testid="gap-front">• FRONT: actual <span className="text-emerald-300">{frontActual.toFixed(2)}m</span> (diff <span className="text-cyan-300">{(frontActual - expectedGap).toFixed(2)}m</span>)</div>
            </div>
          </div>
        </div>
      )}

      {/* Нижняя панель подсказок управления в Sandbox-режиме */}
      {isSandbox && (
        <div className="ds-glass pointer-events-none self-start rounded-ds-control p-3 text-ds-caption shadow-ds-sm space-y-1">
          <p className="font-semibold text-success">{hud.controlsTitle}</p>
          <ul className="space-y-0.5 font-mono text-[11px] text-text-secondary">
            <li>• <span className="text-accent">W / A / S / D</span> — {hud.controlsMove}</li>
            <li>• <span className="text-accent">{hud.controlsLookKeys}</span> — {hud.controlsLook}</li>
            <li>• <span className="text-accent-geo">[F2]</span> — {hud.controlsMode}{isDev ? " · [F3]" : ""}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
