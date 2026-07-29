"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useWireDrag } from "@/components/core/WireDragProvider";

interface ConnectionPointProps {
  id: string;
  position: [number, number, number];
  color?: string;
}

// терминал компонента: маленькая сфера, которая ловит начало/конец
// перетаскивания провода и подсвечивается при наведении/активном драге
export default function ConnectionPoint({ id, position, color = "#94a3b8" }: ConnectionPointProps) {
  const { draggingFrom, hoveredTerminal, startDrag, setHoveredTerminal, commitDrag, registerTerminalPosition } =
    useWireDrag();
  const meshRef = useRef<THREE.Mesh>(null);

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
        }}
        onPointerOut={() => setHoveredTerminal(null)}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          if (draggingFrom && draggingFrom !== id) commitDrag(id);
        }}
      >
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial
          color={highlighted ? "#22d3ee" : color}
          emissive={highlighted ? "#22d3ee" : "#000000"}
          emissiveIntensity={highlighted ? 0.7 : 0}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}
