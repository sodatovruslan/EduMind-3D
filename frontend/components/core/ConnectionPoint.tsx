"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useWireDrag } from "@/components/core/WireDragProvider";

interface ConnectionPointProps {
  id: string;
  position: [number, number, number];
  color?: string;
}

// терминал компонента: маленькая сфера, которая ловит начало/конец
// перетаскивания провода и заметно подсвечивается (пульс масштаба +
// свечение) при наведении/активном драге. Рядом — невидимый DOM-маркер
// (data-testid) с той же экранной позицией, что и 3D-точка: Playwright
// не умеет искать объекты внутри WebGL-канваса, а drei/Html проецирует
// обычный div точно на экранные координаты 3D-точки каждый кадр — это
// дает стабильные, не зависящие от вращения камеры координаты для тестов.
export default function ConnectionPoint({ id, position, color = "#c9a227" }: ConnectionPointProps) {
  const { draggingFrom, hoveredTerminal, startDrag, setHoveredTerminal, commitDrag, registerTerminalPosition } =
    useWireDrag();
  const meshRef = useRef<THREE.Mesh>(null);
  const visibleRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  useEffect(() => {
    if (meshRef.current) {
      const worldPos = new THREE.Vector3();
      meshRef.current.getWorldPosition(worldPos);
      registerTerminalPosition(id, worldPos);
    }
  }, [id, position, registerTerminalPosition]);

  const isHovered = hoveredTerminal === id;
  const isActive = draggingFrom === id;
  const highlighted = isHovered || isActive;

  useFrame(({ clock: r3fClock }, delta) => {
    if (visibleRef.current) {
      const targetScale = highlighted ? 1.7 : 1;
      const lerpFactor = Math.min(1, delta * 10);
      visibleRef.current.scale.setScalar(THREE.MathUtils.lerp(visibleRef.current.scale.x, targetScale, lerpFactor));
    }
    // мягкое пульсирующее свечение-ореол вокруг терминала при наведении/драге
    if (glowRef.current && glowMaterialRef.current) {
      const pulse = highlighted ? 1.4 + Math.sin(r3fClock.elapsedTime * 6) * 0.2 : 0;
      glowRef.current.scale.setScalar(THREE.MathUtils.lerp(glowRef.current.scale.x, Math.max(pulse, 0.001), Math.min(1, delta * 8)));
      glowMaterialRef.current.opacity = THREE.MathUtils.lerp(glowMaterialRef.current.opacity, highlighted ? 0.35 : 0, Math.min(1, delta * 8));
    }
  });

  return (
    <group position={position}>
      {/* увеличенный невидимый хитбокс — маленькую видимую сферу (0.06) сложно
          поймать курсором даже реальному ученику, не говоря об автотестах */}
      <mesh
        ref={meshRef}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          startDrag(id);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHoveredTerminal(id);
          document.body.style.cursor = "crosshair";
        }}
        onPointerOut={() => {
          setHoveredTerminal(null);
          document.body.style.cursor = "auto";
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          if (draggingFrom && draggingFrom !== id) commitDrag(id);
        }}
      >
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={glowRef} scale={0.001}>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshBasicMaterial ref={glowMaterialRef} color="#22d3ee" transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={visibleRef}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial
          color={highlighted ? "#22d3ee" : color}
          emissive={highlighted ? "#22d3ee" : "#000000"}
          emissiveIntensity={highlighted ? 1.1 : 0}
          metalness={0.85}
          roughness={0.25}
        />
      </mesh>
      <Html center pointerEvents="none" style={{ pointerEvents: "none" }}>
        <div data-testid={`terminal-${id}`} style={{ width: 1, height: 1 }} />
      </Html>
    </group>
  );
}
