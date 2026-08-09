"use client";

/**
 * VolcanoesLayer — G6: вулканы со значимыми историческими извержениями
 * (NOAA/NCEI). ~100-300 объектов после дедупликации — обычные меши с
 * onClick, не DOM-маркеры (см. GEOWORLD_ROADMAP.md, раздел G6,
 * "Performance").
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { latLngToVector3 } from "@/lib/geo/coordinates";
import { VolcanoProvider, type VolcanoRecord } from "@/lib/geo/providers/volcanoes";
import { isFacingCamera } from "@/lib/geo/geo-vector-lod";
import type { GeoFeatureInfo } from "./GeoFeatureInfoCard";

const MARKER_RADIUS = 1.012;

export interface VolcanoesLayerProps {
  onSelect: (info: GeoFeatureInfo) => void;
}

export default function VolcanoesLayer({ onSelect }: VolcanoesLayerProps) {
  const providerRef = useRef(new VolcanoProvider());
  const [volcanoes, setVolcanoes] = useState<VolcanoRecord[]>([]);
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set());
  const lastTickRef = useRef(0);

  useEffect(() => {
    const provider = providerRef.current;
    return () => provider.dispose();
  }, []);

  useEffect(() => {
    let cancelled = false;
    providerRef.current
      .load()
      .then((records) => {
        if (!cancelled) setVolcanoes(records);
      })
      .catch(() => {
        // Отказоустойчиво — глобус остаётся рабочим без вулканов, если провайдер недоступен.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const positioned = useMemo(
    () =>
      volcanoes.map((v) => {
        const point = latLngToVector3(v.latitude, v.longitude, MARKER_RADIUS);
        const up = point.clone().normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        return { volcano: v, point, quaternion };
      }),
    [volcanoes]
  );

  useFrame((state) => {
    if (state.clock.elapsedTime - lastTickRef.current < 0.5) return;
    lastTickRef.current = state.clock.elapsedTime;
    const camPos = state.camera.position;
    const cam: [number, number, number] = [camPos.x, camPos.y, camPos.z];
    const next = new Set<number>();
    for (const { volcano } of positioned) {
      if (isFacingCamera(volcano.latitude, volcano.longitude, cam)) next.add(volcano.id);
    }
    setVisibleIds(next);
  });

  function handleClick(e: ThreeEvent<MouseEvent>, v: VolcanoRecord) {
    e.stopPropagation();
    const lines: string[] = [];
    if (v.elevation !== null) lines.push(`Высота: ${v.elevation} м`);
    if (v.morphology) lines.push(`Тип: ${v.morphology}`);
    if (v.lastEruptionYear !== null) {
      lines.push(`Последнее значимое извержение: ${v.lastEruptionYear > 0 ? v.lastEruptionYear : Math.abs(v.lastEruptionYear) + " до н.э."}`);
    }
    if (v.deathsTotal) lines.push(`Погибших (по данным NCEI): ${v.deathsTotal}`);
    onSelect({
      title: v.name,
      subtitle: v.country,
      lines,
      position: [e.point.x, e.point.y, e.point.z],
    });
  }

  const visible = positioned.filter((p) => visibleIds.has(p.volcano.id));

  return (
    <>
      {visible.map(({ volcano, point, quaternion }) => (
        <mesh key={volcano.id} position={point} quaternion={quaternion} onClick={(e) => handleClick(e, volcano)}>
          <coneGeometry args={[0.012, 0.024, 8]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
        </mesh>
      ))}
    </>
  );
}
