"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Eye, EyeOff } from "lucide-react";
import CanvasShell from "@/components/scenes/CanvasShell";
import AIAssistantChat from "@/components/ai/AIAssistantChat";
import type { Simulation } from "@/lib/types";

type OrganKey = "heart" | "lungs" | "stomach";

const ORGAN_INFO: Record<OrganKey, { name: string; description: string }> = {
  heart: {
    name: "Сердце",
    description: "Перекачивает кровь по организму, сокращаясь около 60–100 раз в минуту.",
  },
  lungs: {
    name: "Лёгкие",
    description: "Обеспечивают газообмен: кислород поступает в кровь, углекислый газ выводится наружу.",
  },
  stomach: {
    name: "Желудок",
    description: "Расщепляет пищу желудочным соком и ферментами перед всасыванием в кишечнике.",
  },
};

interface BodyProps {
  isXray: boolean;
  onSelectOrgan: (organ: OrganKey) => void;
}

// Настоящей GLTF-модели тела в MVP нет — тело собрано из примитивов
// (capsule/sphere), но X-Ray сделан честно: не instant-toggle, а плавный
// lerp прозрачности "кожи" в useFrame, органы всегда на месте под ней.
function Body({ isXray, onSelectOrgan }: BodyProps) {
  const skinMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#eab89a",
        transparent: true,
        opacity: 1,
        roughness: 0.6,
      }),
    []
  );

  const heartRef = useRef<THREE.Mesh>(null);
  const lungsRef = useRef<THREE.Group>(null);
  const skinOpacityTarget = isXray ? 0.12 : 1;

  useFrame((state, delta) => {
    skinMaterial.opacity = THREE.MathUtils.lerp(skinMaterial.opacity, skinOpacityTarget, Math.min(1, delta * 3));

    const t = state.clock.elapsedTime;
    if (heartRef.current) {
      heartRef.current.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    }
    if (lungsRef.current) {
      lungsRef.current.scale.set(1 + Math.sin(t * 1.2) * 0.06, 1, 1);
    }
  });

  function handleOrganClick(e: ThreeEvent<MouseEvent>, organ: OrganKey) {
    e.stopPropagation();
    if (!isXray) return; // орган нельзя выбрать, пока не включен рентген
    onSelectOrgan(organ);
  }

  return (
    <group position={[0, -0.5, 0]}>
      <mesh position={[0, 1.55, 0]} material={skinMaterial}>
        <sphereGeometry args={[0.32, 24, 24]} />
      </mesh>
      <mesh position={[0, 0.7, 0]} material={skinMaterial}>
        <capsuleGeometry args={[0.42, 0.9, 8, 16]} />
      </mesh>
      <mesh position={[-0.62, 0.75, 0]} rotation={[0, 0, Math.PI / 10]} material={skinMaterial}>
        <capsuleGeometry args={[0.12, 0.85, 6, 12]} />
      </mesh>
      <mesh position={[0.62, 0.75, 0]} rotation={[0, 0, -Math.PI / 10]} material={skinMaterial}>
        <capsuleGeometry args={[0.12, 0.85, 6, 12]} />
      </mesh>
      <mesh position={[-0.2, -0.55, 0]} material={skinMaterial}>
        <capsuleGeometry args={[0.15, 1.0, 6, 12]} />
      </mesh>
      <mesh position={[0.2, -0.55, 0]} material={skinMaterial}>
        <capsuleGeometry args={[0.15, 1.0, 6, 12]} />
      </mesh>

      <mesh ref={heartRef} position={[-0.1, 0.9, 0.15]} onClick={(e) => handleOrganClick(e, "heart")}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>

      <group ref={lungsRef}>
        <mesh position={[-0.2, 0.85, 0]} onClick={(e) => handleOrganClick(e, "lungs")}>
          <sphereGeometry args={[0.13, 14, 14]} />
          <meshStandardMaterial color="#f9a8d4" />
        </mesh>
        <mesh position={[0.2, 0.85, 0]} onClick={(e) => handleOrganClick(e, "lungs")}>
          <sphereGeometry args={[0.13, 14, 14]} />
          <meshStandardMaterial color="#f9a8d4" />
        </mesh>
      </group>

      <mesh position={[0.1, 0.55, 0.1]} onClick={(e) => handleOrganClick(e, "stomach")}>
        <sphereGeometry args={[0.15, 14, 14]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
    </group>
  );
}

interface BioBodySceneProps {
  simulation: Simulation;
}

export default function BioBodyScene({ simulation }: BioBodySceneProps) {
  const [isXray, setIsXray] = useState(false);
  const [selectedOrgan, setSelectedOrgan] = useState<OrganKey | null>(null);

  const sceneStateDescription = `Режим X-Ray: ${isXray ? "включен" : "выключен"}. ${
    selectedOrgan ? `Ученик рассматривает орган: ${ORGAN_INFO[selectedOrgan].name}.` : "Орган не выбран."
  }`;

  return (
    <div className="relative">
      <CanvasShell cameraPosition={[0, 0.2, 3.4]} target={[0, 0.1, 0]}>
        <Body isXray={isXray} onSelectOrgan={setSelectedOrgan} />
      </CanvasShell>

      <AIAssistantChat simulationId={simulation.id} sceneStateDescription={sceneStateDescription} />

      <div className="mt-4 flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          onClick={() => setIsXray((prev) => !prev)}
          className="flex shrink-0 items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          {isXray ? <EyeOff size={18} /> : <Eye size={18} />}
          {isXray ? "Выключить X-Ray" : "Включить X-Ray"}
        </button>

        <div className="flex-1 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
          {selectedOrgan ? (
            <>
              <p className="font-medium text-gray-900">{ORGAN_INFO[selectedOrgan].name}</p>
              <p className="text-gray-500">{ORGAN_INFO[selectedOrgan].description}</p>
            </>
          ) : (
            <p className="text-gray-500">Включи X-Ray и кликни по органу, чтобы узнать о нем больше.</p>
          )}
        </div>
      </div>
    </div>
  );
}
