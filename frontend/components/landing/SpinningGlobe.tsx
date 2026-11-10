"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight "rotating globe" for the Landing hero: a wireframe of a few
 * SVG ellipses. Rotation is faked by changing each meridian's width
 * (rx = R·|sin(longitude)|) every frame through refs — no React re-renders,
 * no WebGL, no extra dependencies. Runs even with OS "reduce motion" on: it is a
 * slow, small decorative rotation (one turn per 36s), not a large movement.
 */
const CX = 200;
const CY = 200;
const R = 128; // matches the inset-[18%] glass sphere in HeroVisual (400·0.64/2)
const MERIDIANS = 6;
const LATITUDES_DEG = [-60, -30, 0, 30, 60];
const SECONDS_PER_TURN = 36;

export default function SpinningGlobe() {
  const meridianRefs = useRef<Array<SVGEllipseElement | null>>([]);

  useEffect(() => {
    const setFrame = (angle: number) => {
      meridianRefs.current.forEach((el, i) => {
        if (!el) return;
        const lon = angle + (i * Math.PI) / MERIDIANS;
        el.setAttribute("rx", (R * Math.abs(Math.sin(lon))).toFixed(2));
      });
    };

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setFrame((((now - start) / 1000) * 2 * Math.PI) / SECONDS_PER_TURN);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <g transform={`rotate(15 ${CX} ${CY})`} className="fill-none stroke-accent-geo/25" strokeWidth="1">
      {LATITUDES_DEG.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const halfWidth = R * Math.cos(rad);
        const y = CY - R * Math.sin(rad);
        return <line key={deg} x1={CX - halfWidth} y1={y} x2={CX + halfWidth} y2={y} />;
      })}
      {Array.from({ length: MERIDIANS }, (_, i) => (
        <ellipse
          key={i}
          ref={(el) => {
            meridianRefs.current[i] = el;
          }}
          cx={CX}
          cy={CY}
          rx={0}
          ry={R}
        />
      ))}
    </g>
  );
}
