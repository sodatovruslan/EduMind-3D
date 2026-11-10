"use client";

import { motion } from "framer-motion";
import { useLocale } from "@/lib/locale-context";
import { LANDING_WORLDS, worldHudCopy, ACCENT_TEXT_CLASS, ACCENT_BORDER_CLASS } from "@/lib/landing-worlds";
import { GlassPanel } from "@/components/design-system";
import SpinningGlobe from "@/components/landing/SpinningGlobe";

/**
 * D2 Hero visual — lightweight CSS/SVG composition standing in for the
 * three real worlds as "one educational universe" (§4/§5 of the D2 brief).
 * Deliberately NOT a mounted R3F Canvas: a decorative hero has no business
 * paying the WebGL/Three.js bundle+runtime cost of a real lab (§17
 * performance). Every shape below is a gradient/stroke/blur — cheap on
 * both bundle size and paint.
 */
const HUD_POSITION_CLASS: Record<(typeof LANDING_WORLDS)[number]["key"], string> = {
  electricity: "left-2 top-6 sm:left-0 sm:top-8",
  chemistry: "right-2 top-1/2 -translate-y-1/2 sm:right-0",
  geo: "bottom-4 left-1/2 -translate-x-1/2",
};

// orbit ellipse (rx 180, ry 70) as a path, so a small satellite can follow it
const ORBIT_PATH = "M20 200 a180 70 0 1 0 360 0 a180 70 0 1 0 -360 0";

export default function HeroVisual() {
  const { t } = useLocale();

  return (
    <div className="relative mx-auto aspect-square w-full max-w-md lg:max-w-lg" aria-hidden="true">
      {/* atmospheric gradient "planet" — the unifying visual core */}
      <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle_at_35%_30%,rgb(var(--ds-accent-geo)/0.35),transparent_60%),radial-gradient(circle_at_65%_70%,rgb(var(--ds-accent-chemistry)/0.28),transparent_55%),radial-gradient(circle_at_50%_50%,rgb(var(--ds-accent-physics)/0.22),transparent_65%)] blur-2xl animate-[spin_40s_linear_infinite]" />
      <div className="absolute inset-[18%] rounded-full border border-border/10 bg-surface/40 backdrop-blur-sm" />

      {/* orbit rings — suggest exploration/rotation without a real 3D globe */}
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
        <SpinningGlobe />
        <ellipse cx="200" cy="200" rx="150" ry="150" className="fill-none stroke-border/15" strokeWidth="1" />
        <g transform="rotate(-18 200 200)">
          <path d={ORBIT_PATH} className="fill-none stroke-border/20" strokeWidth="1" />
          <circle r="4" className="fill-accent">
            <animateMotion dur="14s" repeatCount="indefinite" path={ORBIT_PATH} />
          </circle>
        </g>
        {/* electricity — small circuit-node cluster, upper region */}
        <g className="stroke-accent-physics/50 text-accent-physics" strokeWidth="1.5">
          <path d="M70 90 L110 90 L110 60 L150 60" className="fill-none" />
          <circle cx="70" cy="90" r="3" className="fill-current stroke-none" />
          <circle cx="150" cy="60" r="3" className="fill-current stroke-none" />
        </g>
        {/* chemistry — small molecule dot-cluster, lower-left region */}
        <g className="stroke-accent-chemistry/50 text-accent-chemistry" strokeWidth="1.5">
          <path d="M90 300 L120 320 L120 350" className="fill-none" />
          <circle cx="90" cy="300" r="4" className="fill-current stroke-none" />
          <circle cx="120" cy="320" r="3" className="fill-current stroke-none" />
          <circle cx="120" cy="350" r="4" className="fill-current stroke-none" />
        </g>
      </svg>

      {/* Hero Glass HUD — floating labels for the three real worlds (§5) */}
      {LANDING_WORLDS.map((world, i) => {
        const copy = worldHudCopy(t, world.key);
        const Icon = world.icon;
        return (
          <motion.div
            key={world.key}
            className={`absolute ${HUD_POSITION_CLASS[world.key]}`}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.6 }}
          >
            <GlassPanel className={`flex items-center gap-2 rounded-ds-control border px-3 py-2 shadow-ds-sm ${ACCENT_BORDER_CLASS[world.accent]}`}>
              <Icon size={16} className={ACCENT_TEXT_CLASS[world.accent]} />
              <div className="leading-tight">
                <p className="text-ds-caption font-semibold text-text-primary">{copy.title}</p>
                <p className="text-ds-caption text-text-muted">{copy.subtitle}</p>
              </div>
            </GlassPanel>
          </motion.div>
        );
      })}
    </div>
  );
}
