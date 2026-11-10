"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";

/**
 * School-style analog meter (ammeter / voltmeter): dark housing, cream dial
 * with a printed scale, red needle, red/black terminal knobs and a small
 * digital readout below the dial. Everything is procedural (one CanvasTexture
 * for the dial), so it costs no model download.
 *
 * The readout keeps data-testid / data-value / data-placement-status, so the
 * exact solver value stays readable for tests regardless of the needle.
 */
export const METER_SIZE = { width: 0.95, height: 0.8, depth: 0.3 } as const;

// local positions of the two terminals (left = red "+", right = black "−")
export const METER_TERMINALS: [[number, number, number], [number, number, number]] = [
  [-0.3, -0.3, METER_SIZE.depth / 2 + 0.07],
  [0.3, -0.3, METER_SIZE.depth / 2 + 0.07],
];

const DIAL_W = 0.78;
const DIAL_H = 0.5;
const DIAL_Y = 0.1;
const CANVAS_W = 512;
const CANVAS_H = 328;
const PIVOT_PX = { x: 256, y: 300 };
const SCALE_RADIUS_PX = 230;
const SWEEP = (50 * Math.PI) / 180; // needle swings ±50° around vertical
const MINOR_PER_MAJOR = 5;

// pivot of the needle in dial-plane units (dial center = 0,0)
const PIVOT_Y = DIAL_H / 2 - (PIVOT_PX.y / CANVAS_H) * DIAL_H;
const NEEDLE_LENGTH = ((SCALE_RADIUS_PX - 12) / CANVAS_W) * DIAL_W;

function valueToAngle(value: number, max: number): number {
  const frac = THREE.MathUtils.clamp(value / max, 0, 1.06);
  return -SWEEP + frac * 2 * SWEEP;
}

function useDialTexture(symbol: string, max: number, majorStep: number) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#f6f1e3";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const { x: cx, y: cy } = PIVOT_PX;
      const r = SCALE_RADIUS_PX;
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2 - SWEEP, -Math.PI / 2 + SWEEP);
      ctx.stroke();

      const majors = Math.round(max / majorStep);
      const steps = majors * MINOR_PER_MAJOR;
      ctx.fillStyle = "#111827";
      ctx.font = "bold 30px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= steps; i++) {
        const angle = -SWEEP + (i / steps) * 2 * SWEEP;
        const isMajor = i % MINOR_PER_MAJOR === 0;
        const len = isMajor ? 28 : 14;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        ctx.lineWidth = isMajor ? 4 : 2;
        ctx.beginPath();
        ctx.moveTo(cx + r * sin, cy - r * cos);
        ctx.lineTo(cx + (r - len) * sin, cy - (r - len) * cos);
        ctx.stroke();
        if (isMajor) {
          const label = String((i / MINOR_PER_MAJOR) * majorStep);
          ctx.fillText(label, cx + (r - 56) * sin, cy - (r - 56) * cos);
        }
      }

      ctx.font = "bold 70px Georgia, serif";
      ctx.fillText(symbol, cx, cy - 95);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [symbol, max, majorStep]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export interface AnalogMeterProps {
  symbol: string;
  max: number;
  majorStep: number;
  value: number;
  unit: string;
  testId: string;
  placementStatus?: string;
  warningMessage?: string | null;
  wrongLabel: string;
}

export default function AnalogMeter({
  symbol,
  max,
  majorStep,
  value,
  unit,
  testId,
  placementStatus = "valid",
  warningMessage = null,
  wrongLabel,
}: AnalogMeterProps) {
  const dial = useDialTexture(symbol, max, majorStep);
  const needleRef = useRef<THREE.Group>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const shownValueRef = useRef(0);
  const { width, height, depth } = METER_SIZE;
  const front = depth / 2;

  useFrame((_, delta) => {
    const target = warningMessage ? 0 : value;
    shownValueRef.current = THREE.MathUtils.lerp(shownValueRef.current, target, Math.min(1, delta * 4));
    if (needleRef.current) needleRef.current.rotation.z = -valueToAngle(shownValueRef.current, max);
    if (readoutRef.current) {
      readoutRef.current.textContent = warningMessage ? `⚠ ${wrongLabel}` : `${shownValueRef.current.toFixed(2)} ${unit}`;
    }
  });

  return (
    <group>
      {/* housing — glows faintly red when the meter is wired wrong */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color="#2b3440"
          roughness={0.55}
          metalness={0.15}
          emissive={warningMessage ? "#7f1d1d" : "#000000"}
          emissiveIntensity={warningMessage ? 0.7 : 0}
        />
      </mesh>
      {/* dial bezel + printed dial */}
      <mesh position={[0, DIAL_Y, front + 0.002]}>
        <planeGeometry args={[DIAL_W + 0.05, DIAL_H + 0.05]} />
        <meshStandardMaterial color="#111827" roughness={0.4} />
      </mesh>
      <mesh position={[0, DIAL_Y, front + 0.004]}>
        <planeGeometry args={[DIAL_W, DIAL_H]} />
        <meshStandardMaterial map={dial} roughness={0.8} />
      </mesh>
      {/* needle */}
      <group ref={needleRef} position={[0, DIAL_Y + PIVOT_Y, front + 0.008]} rotation={[0, 0, SWEEP]}>
        <mesh position={[0, NEEDLE_LENGTH / 2, 0]}>
          <boxGeometry args={[0.01, NEEDLE_LENGTH, 0.003]} />
          <meshStandardMaterial color="#dc2626" roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[0, DIAL_Y + PIVOT_Y, front + 0.01]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.01, 16]} />
        <meshStandardMaterial color="#111827" metalness={0.4} roughness={0.4} />
      </mesh>
      {/* glass */}
      <mesh position={[0, DIAL_Y, front + 0.014]}>
        <planeGeometry args={[DIAL_W, DIAL_H]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.08} roughness={0.05} metalness={0} depthWrite={false} />
      </mesh>
      {/* terminal knobs */}
      {METER_TERMINALS.map((pos, i) => (
        <mesh key={i} position={[pos[0], pos[1], front + 0.03]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.06, 20]} />
          <meshStandardMaterial color={i === 0 ? "#dc2626" : "#111827"} roughness={0.35} metalness={0.2} />
        </mesh>
      ))}
      {/* digital readout */}
      <Html position={[0, -0.3, front + 0.02]} center distanceFactor={6} style={{ pointerEvents: "none" }}>
        <div
          data-testid={testId}
          data-value={value}
          data-placement-status={placementStatus}
          title={warningMessage ?? undefined}
          className={`pointer-events-none whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
            warningMessage ? "bg-red-950/90 text-red-300" : "bg-black/80 text-emerald-300"
          }`}
        >
          <span ref={readoutRef}>{warningMessage ? `⚠ ${wrongLabel}` : `${value.toFixed(2)} ${unit}`}</span>
        </div>
      </Html>
    </group>
  );
}
