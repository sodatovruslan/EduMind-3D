import { ACCENT_TEXT_CLASS, getWorldByModule, worldCopy } from "@/lib/landing-worlds";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { SimulationModule } from "@/lib/types";

/**
 * D7 — teacher analytics shows LabResults grouped by `module`, which can be
 * "simlab" (the one module with no LandingWorld entry — see
 * lib/landing-worlds.ts's doc comment on why SimLab isn't a promoted
 * world). Reuses the same name/accent as the student-facing world cards for
 * the three promoted worlds so a module always reads the same everywhere;
 * simlab falls back to a neutral label/color instead of crashing.
 */
export function moduleLabel(t: Dictionary, module: SimulationModule): string {
  const world = getWorldByModule(module);
  return world ? worldCopy(t, world.key).name : t.teacher.moduleFallback;
}

export function moduleAccentClass(module: SimulationModule): string {
  const world = getWorldByModule(module);
  return world ? ACCENT_TEXT_CLASS[world.accent] : "text-text-muted";
}
