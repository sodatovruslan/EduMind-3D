"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";

/**
 * Electricity Lab table: a wooden tabletop with a dark rubber work mat on
 * top (light centimetre grid, like a real electronics mat). Both textures are
 * drawn on a canvas once — no image files. The tabletop's upper surface is y=0.
 */
function useCanvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) draw(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
    // draw functions below are static
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function drawWood(ctx: CanvasRenderingContext2D) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = "#9a6b42";
  ctx.fillRect(0, 0, w, h);
  const plank = h / 6;
  for (let p = 0; p < 6; p++) {
    const tone = 0.9 + ((p * 37) % 10) / 50;
    ctx.fillStyle = `rgba(${Math.round(150 * tone)},${Math.round(104 * tone)},${Math.round(64 * tone)},1)`;
    ctx.fillRect(0, p * plank, w, plank - 2);
    ctx.strokeStyle = "rgba(70,40,20,0.18)";
    ctx.lineWidth = 1;
    for (let g = 0; g < 14; g++) {
      const y = p * plank + ((g * 53) % plank);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin((x + g * 40) / 90) * 3);
      ctx.stroke();
    }
  }
}

function drawMat(ctx: CanvasRenderingContext2D) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = "#1d3b3f";
  ctx.fillRect(0, 0, w, h);
  const cell = 32;
  for (let x = 0; x <= w; x += cell) {
    ctx.strokeStyle = x % (cell * 5) === 0 ? "rgba(190,230,225,0.22)" : "rgba(190,230,225,0.09)";
    ctx.lineWidth = x % (cell * 5) === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += cell) {
    ctx.strokeStyle = y % (cell * 5) === 0 ? "rgba(190,230,225,0.22)" : "rgba(190,230,225,0.09)";
    ctx.lineWidth = y % (cell * 5) === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

export function LabBench() {
  const wood = useCanvasTexture(1024, 512, drawWood);
  const mat = useCanvasTexture(1024, 528, drawMat);
  return (
    <group>
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[8.8, 0.12, 4.9]} />
        <meshStandardMaterial map={wood} roughness={0.65} metalness={0} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8.0, 4.1]} />
        <meshStandardMaterial map={mat} roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}

/** Always-visible name plate lying in front of a component. */
export function NameTag({ text, position }: { text: string; position: [number, number, number] }) {
  return (
    <Html position={position} center distanceFactor={7} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
      <div className="pointer-events-none select-none whitespace-nowrap rounded-md bg-slate-900/85 px-2 py-0.5 text-[11px] font-medium text-slate-100 shadow">
        {text}
      </div>
    </Html>
  );
}
