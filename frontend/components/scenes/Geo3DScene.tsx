"use client";

import { useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import CanvasShell from "@/components/scenes/CanvasShell";
import AIAssistantChat from "@/components/ai/AIAssistantChat";
import { apiFetch, ApiError } from "@/lib/api";
import { computeShapeMetrics, type ShapeKind } from "@/lib/geo3d-formulas";
import type { Simulation } from "@/lib/types";

const SHAPE_LABELS: Record<ShapeKind, string> = {
  cube: "Куб",
  sphere: "Сфера",
  cylinder: "Цилиндр",
  cone: "Конус",
  pyramid: "Пирамида",
};

interface DimensionField {
  key: string;
  label: string;
  min: number;
  max: number;
}

const SHAPE_FIELDS: Record<ShapeKind, DimensionField[]> = {
  cube: [{ key: "side", label: "Сторона", min: 0.5, max: 3 }],
  sphere: [{ key: "radius", label: "Радиус", min: 0.5, max: 3 }],
  cylinder: [
    { key: "radius", label: "Радиус", min: 0.5, max: 2.5 },
    { key: "height", label: "Высота", min: 0.5, max: 3.5 },
  ],
  cone: [
    { key: "radius", label: "Радиус основания", min: 0.5, max: 2.5 },
    { key: "height", label: "Высота", min: 0.5, max: 3.5 },
  ],
  pyramid: [
    { key: "base_side", label: "Сторона основания", min: 0.5, max: 3 },
    { key: "height", label: "Высота", min: 0.5, max: 3.5 },
  ],
};

const DEFAULT_DIMENSIONS: Record<string, number> = {
  side: 1.5,
  radius: 1.2,
  height: 2,
  base_side: 1.5,
};

function ShapeMesh({ shape, dimensions }: { shape: ShapeKind; dimensions: Record<string, number> }) {
  const meshRef = useRef<THREE.Mesh>(null);

  // фигура вращается непрерывно — так видно объем со всех сторон без ручного вращения
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.6;
  });

  const material = <meshStandardMaterial color="#6366F1" />;

  switch (shape) {
    case "cube":
      return (
        <mesh ref={meshRef}>
          <boxGeometry args={[dimensions.side, dimensions.side, dimensions.side]} />
          {material}
        </mesh>
      );
    case "sphere":
      return (
        <mesh ref={meshRef}>
          <sphereGeometry args={[dimensions.radius, 32, 32]} />
          {material}
        </mesh>
      );
    case "cylinder":
      return (
        <mesh ref={meshRef}>
          <cylinderGeometry args={[dimensions.radius, dimensions.radius, dimensions.height, 32]} />
          {material}
        </mesh>
      );
    case "cone":
      return (
        <mesh ref={meshRef}>
          <coneGeometry args={[dimensions.radius, dimensions.height, 32]} />
          {material}
        </mesh>
      );
    case "pyramid":
      // coneGeometry с 4 радиальными сегментами дает четырехугольную пирамиду;
      // radius здесь — описанная окружность квадрата (сторона / √2)
      return (
        <mesh ref={meshRef}>
          <coneGeometry args={[dimensions.base_side / Math.SQRT2, dimensions.height, 4]} />
          {material}
        </mesh>
      );
  }
}

interface Geo3DSceneProps {
  simulation: Simulation;
}

export default function Geo3DScene({ simulation }: Geo3DSceneProps) {
  const [shape, setShape] = useState<ShapeKind>("cube");
  const [dimensions, setDimensions] = useState<Record<string, number>>(DEFAULT_DIMENSIONS);
  const [actionsLog, setActionsLog] = useState<Record<string, unknown>[]>([]);
  const [completionScore, setCompletionScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedAtRef = useRef(Date.now());

  const fields = SHAPE_FIELDS[shape];
  const metrics = computeShapeMetrics(shape, dimensions);

  function updateDimension(key: string, value: number) {
    setDimensions((prev) => ({ ...prev, [key]: value }));
  }

  async function handleRecordStep() {
    setError(null);
    try {
      const payload: Record<string, unknown> = { shape };
      fields.forEach((field) => (payload[field.key] = dimensions[field.key]));

      await apiFetch(`/api/simulations/${simulation.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action_type: "compute_metrics", payload }),
      });
      setActionsLog((prev) => [...prev, { action_type: "compute_metrics", shape }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось записать шаг");
    }
  }

  async function handleComplete() {
    setError(null);
    try {
      const result = await apiFetch<{ score: number | null }>(`/api/simulations/${simulation.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          actions_log: actionsLog,
          duration_seconds: Math.round((Date.now() - mountedAtRef.current) / 1000),
        }),
      });
      setCompletionScore(result.score);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось завершить попытку");
    }
  }

  const sceneStateDescription = `Ученик изучает фигуру: ${SHAPE_LABELS[shape]}. Параметры: ${fields
    .map((f) => `${f.label}=${dimensions[f.key].toFixed(2)}`)
    .join(", ")}. Площадь=${metrics.area.toFixed(2)}, объем=${metrics.volume.toFixed(2)}.`;

  return (
    <div className="relative">
      <CanvasShell cameraPosition={[3, 2, 4]}>
        <ShapeMesh shape={shape} dimensions={dimensions} />
      </CanvasShell>

      <AIAssistantChat simulationId={simulation.id} sceneStateDescription={sceneStateDescription} />

      <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">Фигура</label>
          <select
            value={shape}
            onChange={(e) => setShape(e.target.value as ShapeKind)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((key) => (
              <option key={key} value={key}>
                {SHAPE_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        {fields.map((field) => (
          <div key={field.key}>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {field.label}: {dimensions[field.key].toFixed(2)}
            </label>
            <input
              type="range"
              min={field.min}
              max={field.max}
              step={0.1}
              value={dimensions[field.key]}
              onChange={(e) => updateDimension(field.key, Number(e.target.value))}
              className="w-full"
            />
          </div>
        ))}

        <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-600 sm:col-span-2">
          Площадь поверхности: <span className="font-semibold text-gray-900">{metrics.area.toFixed(2)}</span> ·
          Объем: <span className="font-semibold text-gray-900">{metrics.volume.toFixed(2)}</span>
        </div>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            onClick={handleRecordStep}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Записать шаг
          </button>
          <button
            onClick={handleComplete}
            disabled={actionsLog.length === 0}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Завершить попытку
          </button>
          {completionScore !== null && (
            <span className="text-sm font-medium text-gray-900">Оценка: {completionScore}/100</span>
          )}
        </div>
      </div>
    </div>
  );
}
