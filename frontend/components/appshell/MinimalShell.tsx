"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { QualityProvider } from "@/lib/quality-context";

/**
 * D4 — minimal shell for immersive/simulation routes (Chemistry World,
 * Electricity Lab, GeoWorld, SimLab). No Rail, no TopBar: a permanent
 * navigation chrome would eat into the 3D viewport, which is exactly the
 * "SaaS dashboard containing a 3D iframe" anti-pattern this whole redesign
 * targets (see §2/§9 of EDUMIND_DESIGN_SYSTEM_V2.md). Still enforces the
 * same auth guard as the standard shell (`ProtectedRoute`, no role
 * restriction — matches today's unrestricted simulation access) and
 * provides `QualityProvider`, which only Chemistry/Electricity actually
 * consume (`useQuality()`) but which must be in the ancestry either way.
 *
 * This is intentionally NOT the full floating-chrome SimulationShell from
 * §9/§27 D6 — that's a later, larger stage that redesigns each scene's own
 * internal panel layout. D4 only guarantees the *shell* stops squeezing
 * the canvas; the scenes' internal composition is untouched.
 */
export default function MinimalShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <QualityProvider>{children}</QualityProvider>
    </ProtectedRoute>
  );
}
