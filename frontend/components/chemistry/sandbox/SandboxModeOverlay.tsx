"use client";

import React, { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { CameraMode } from "@/lib/chemistry-lab-modes";
import { RoomInteriorBounds } from "@/lib/sandbox-locomotion";

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
 */
export function SandboxModeOverlay({
  cameraMode,
  onToggleMode,
  disabled = false,
  disabledReason = "Переключение недоступно во время активного взаимодействия",
  diagnostics,
  isFullscreen = false,
  onToggleFullscreen,
}: SandboxModeOverlayProps) {
  // По умолчанию dev-диагностика скрыта
  const [showDiag, setShowDiag] = useState(false);

  // Горячая клавиша [F2] для переключения режимов и [F3] для вкл/выкл оверлея диагностики (только в dev)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "F2" && !e.repeat && !disabled) {
        const target = e.target;
        if (target instanceof HTMLElement) {
          const tag = target.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
            return;
          }
        }
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
        <div className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/85 px-3 py-1.5 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-200">
            Режим:{" "}
            <span className={isSandbox ? "text-emerald-400 font-mono" : "text-cyan-400 font-mono"}>
              {isSandbox ? "Свободный (Sandbox S-7)" : "Обзор стола (Orbit S-6)"}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Кнопка Полноэкранного режима */}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
              title={isFullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
              className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/85 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur transition hover:border-slate-500 hover:bg-slate-800 hover:text-white active:scale-95 shadow-lg shadow-cyan-950/40"
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
              <span>{isFullscreen ? "Свернуть" : "На весь экран"}</span>
            </button>
          )}

          {/* Кнопка переключения режимов */}
          <button
            type="button"
            disabled={disabled}
            onClick={onToggleMode}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold backdrop-blur transition shadow-lg shadow-cyan-950/50 ${
              disabled
                ? "border-slate-700 bg-slate-900/60 text-slate-500 cursor-not-allowed opacity-60"
                : "border-cyan-500/50 bg-cyan-950/80 text-cyan-200 hover:border-cyan-400 hover:bg-cyan-900 hover:text-white active:scale-95"
            }`}
            title={disabled ? disabledReason : "Нажмите F2 для переключения"}
          >
            <span>{isSandbox ? "🎥 Включить Обзор (Orbit)" : "🚶 Включить Ходьбу (Sandbox)"}</span>
            <span className="rounded bg-cyan-900/90 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 border border-cyan-700/60">
              F2
            </span>
          </button>
        </div>
      </div>

      {/* Центральный прицел в Sandbox-режиме */}
      {isSandbox && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <div className="h-2.5 w-0.5 bg-cyan-300/80 shadow-sm" />
            <div className="absolute h-0.5 w-2.5 bg-cyan-300/80 shadow-sm" />
          </div>
        </div>
      )}

      {/* Диагностическая панель реальных стен (Dev Diagnostics Overlay — доступна строго в dev-режиме) */}
      {isDev && isSandbox && showDiag && (
        <div className="pointer-events-none self-start max-w-md rounded-xl border border-cyan-500/40 bg-slate-950/90 p-3.5 text-xs backdrop-blur space-y-2 shadow-2xl">
          <div className="flex items-center justify-between border-b border-cyan-900/60 pb-1.5">
            <span className="font-bold text-cyan-300">📊 Dev Diagnostics: Real Wall Collision Registry</span>
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
        <div className="pointer-events-none self-start rounded-xl border border-slate-700/80 bg-slate-900/85 p-3 text-xs backdrop-blur space-y-1">
          <p className="font-semibold text-emerald-400">Управление Sandbox (S7-V2.13):</p>
          <ul className="space-y-0.5 text-slate-300 font-mono text-[11px]">
            <li>• <span className="text-amber-300">W / A / S / D (ЦФЫВ)</span> — Перемещение</li>
            <li>• <span className="text-amber-300">Зажатый ПКМ / СКМ</span> — Обзор мышью</li>
            <li>• <span className="text-cyan-300">[F2]</span> — Режим камеры{isDev ? " · [F3] — Диагностика" : ""}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
