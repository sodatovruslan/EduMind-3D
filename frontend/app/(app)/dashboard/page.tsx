"use client";

import useSWR from "swr";
import { MotionConfig } from "framer-motion";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { Simulation } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import Hero from "@/components/dashboard/Hero";
import ContinueLearning from "@/components/dashboard/ContinueLearning";
import NextStep from "@/components/dashboard/NextStep";
import WorldSection from "@/components/dashboard/WorldSection";
import ProgressSnapshot from "@/components/dashboard/ProgressSnapshot";
import RecentResults from "@/components/dashboard/RecentResults";
import StrengthsAndPractice from "@/components/dashboard/StrengthsAndPractice";
import AchievementsTeaser from "@/components/dashboard/AchievementsTeaser";

/**
 * D5.1 — Student Learning Hub, visual rework of D5 (same route, same
 * underlying `/api/simulations/` fetch, all D5 data logic preserved — see
 * EDUMIND_DESIGN_SYSTEM_V2.md D5.1 notes). D5's composition stacked every
 * section full-width in a single `max-w-6xl` column, which read as an
 * admin list rather than a hub.
 *
 * D5.2 — the content column here (inside StandardAppShell's `<main>`, which
 * spans the FULL viewport width — the shell has no side rail) previously had a
 * `max-width` with no `mx-auto`, so on wide desktops it sat flush against
 * the left edge of that column instead of being centered within it — the
 * root cause of the "left-heavy" composition. `mx-auto` centers it; the
 * cap moved from `max-w-7xl` (1280px) to `max-w-[90rem]` (1440px) so the
 * composition reads as a wide command center rather than a narrow column
 * with large side margins on very wide (1600–1920px) displays, without
 * stretching individual cards to absurd widths (see D5.2 notes).
 *
 * D8 — "Student Learning Center". Hero → (Continue Learning + Progress) →
 * NextStep (one deterministic "what's next" suggestion, distinct from
 * Continue Learning's "resume what's in progress" — see NextStep.tsx) →
 * Worlds (now with real per-world stats) → Strengths/Needs Practice (both
 * strong AND weak topics, replacing the old weak-only "Focus next") →
 * Recent Results (now world-badged) → Achievements teaser (links to the
 * full grid on /profile, deliberately not duplicated here — see
 * EDUMIND_DESIGN_SYSTEM_V2.md D8 notes for the full data audit).
 *
 * Teacher/admin visiting `/dashboard` (TopBar's "Home" is role-agnostic)
 * still get a minimal world-browse fallback instead of fabricated student
 * widgets — but the D5 explanatory dev-copy about which panel teachers
 * should use instead was removed (§11 of the D5.1 brief); the heading
 * alone is enough, without addressing the reader as an implementation
 * detail.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const { data: simulations, isLoading } = useSWR<Simulation[]>("/api/simulations/", swrFetcher);

  const isStudent = user?.role === "student";

  if (!isStudent) {
    return (
      <div className="mx-auto max-w-[90rem] space-y-8">
        <h1 className="text-ds-title text-text-primary">{t.dashboard.teacherFallback.title}</h1>
        <WorldSection simulations={simulations} isLoading={isLoading} />
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto max-w-[90rem] space-y-10">
        <Hero />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <ContinueLearning simulations={simulations} />
          <ProgressSnapshot />
        </div>

        <NextStep simulations={simulations} />

        <WorldSection simulations={simulations} isLoading={isLoading} />

        <StrengthsAndPractice />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RecentResults />
          <AchievementsTeaser />
        </div>
      </div>
    </MotionConfig>
  );
}
