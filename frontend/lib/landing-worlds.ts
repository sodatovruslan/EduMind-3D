import { FlaskConical, Globe, Zap } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * D2 Landing — structural metadata for the three real, working worlds.
 * Copy itself lives in the i18n dictionaries (t.worlds.items.*); this file
 * only pairs each world with its route, icon and accent token so the
 * Hero HUD and Worlds Showcase stay in sync without duplicating literals.
 * Deliberately three worlds only (Electricity Lab, Chemistry World,
 * GeoWorld) — matches app/(app)/dashboard's real module set used for the
 * Landing; SimLab/Physics is intentionally not promoted here per the D2
 * brief.
 */
export type WorldAccent = "physics" | "chemistry" | "geo";

export interface LandingWorld {
  key: "electricity" | "chemistry" | "geo";
  /** Route prefix under (app) — the actual [id] is chosen from the catalog after auth, see CTA routing note in EDUMIND_DESIGN_SYSTEM_V2.md D2 notes. */
  routeBase: "/electricity_lab" | "/chemistry_world" | "/geo3d";
  accent: WorldAccent;
  icon: typeof Zap;
}

export const LANDING_WORLDS: LandingWorld[] = [
  { key: "electricity", routeBase: "/electricity_lab", accent: "physics", icon: Zap },
  { key: "chemistry", routeBase: "/chemistry_world", accent: "chemistry", icon: FlaskConical },
  { key: "geo", routeBase: "/geo3d", accent: "geo", icon: Globe },
];

export function worldCopy(t: Dictionary, key: LandingWorld["key"]) {
  return t.worlds.items[key];
}

export function worldHudCopy(t: Dictionary, key: LandingWorld["key"]) {
  return t.heroHud[key];
}

export const ACCENT_TEXT_CLASS: Record<WorldAccent, string> = {
  physics: "text-accent-physics",
  chemistry: "text-accent-chemistry",
  geo: "text-accent-geo",
};

export const ACCENT_BG_CLASS: Record<WorldAccent, string> = {
  physics: "bg-accent-physics",
  chemistry: "bg-accent-chemistry",
  geo: "bg-accent-geo",
};

export const ACCENT_BORDER_CLASS: Record<WorldAccent, string> = {
  physics: "border-accent-physics/40",
  chemistry: "border-accent-chemistry/40",
  geo: "border-accent-geo/40",
};
