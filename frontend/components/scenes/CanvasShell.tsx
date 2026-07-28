"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

interface CanvasShellProps {
  children: React.ReactNode;
  cameraPosition?: [number, number, number];
  target?: [number, number, number];
}

/**
 * Общий контейнер для всех 3D-сцен: Canvas, камера, орбитальное управление
 * (полное вращение на 360°) и свет.
 *
 * Освещение собрано вручную (ambient + 2 directional), а не через
 * drei <Environment> — тот тянет HDR-текстуру с внешнего CDN на каждую
 * загрузку сцены, а платформа должна одинаково надежно работать в школах
 * с нестабильным интернетом (и не зависеть от доступности стороннего хоста).
 */
export default function CanvasShell({ children, cameraPosition = [4, 3, 5], target = [0, 0, 0] }: CanvasShellProps) {
  return (
    <div className="relative h-[32rem] w-full overflow-hidden rounded-lg border border-gray-200 bg-slate-900">
      <Canvas camera={{ position: cameraPosition, fov: 45 }} shadows>
        <color attach="background" args={["#0f172a"]} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[5, 8, 5]} intensity={1.1} castShadow />
        <directionalLight position={[-5, 3, -4]} intensity={0.35} />
        <Suspense fallback={null}>{children}</Suspense>
        <OrbitControls enableDamping dampingFactor={0.08} minDistance={2} maxDistance={14} target={target} />
      </Canvas>
    </div>
  );
}
