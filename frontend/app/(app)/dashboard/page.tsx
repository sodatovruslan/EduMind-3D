"use client";

import useSWR from "swr";
import { MotionConfig } from "framer-motion";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { Simulation } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import Hero from "@/components/dashboard/Hero";
import ContinueLearning from "@/components/dashboard/ContinueLearning";
import WorldSection from "@/components/dashboard/WorldSection";
import ProgressSnapshot from "@/components/dashboard/ProgressSnapshot";
import RecentResults from "@/components/dashboard/RecentResults";
import FocusNext from "@/components/dashboard/FocusNext";

/**
 * D5.1 — Student Learning Hub, visual rework of D5 (same route, same
 * underlying `/api/simulations/` fetch, all D5 data logic preserved — see
 * EDUMIND_DESIGN_SYSTEM_V2.md D5.1 notes). D5's composition stacked every
 * section full-width in a single `max-w-6xl` column, which read as an
 * admin list rather than a hub. Reworked into a real hierarchy: Hero →
 * (Continue Learning + Progress side by side) → Worlds (3 big portals,
 * full width) → (Recent Results + Focus Next side by side).
 *
 * Teacher/admin visiting `/dashboard` (Rail's "Home" is role-agnostic)
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
      <div className="max-w-7xl space-y-8">
        <h1 className="text-ds-title text-text-primary">{t.dashboard.teacherFallback.title}</h1>
        <WorldSection simulations={simulations} isLoading={isLoading} />
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="max-w-7xl space-y-10">
        <Hero />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <ContinueLearning simulations={simulations} />
          <ProgressSnapshot />
        </div>

        <WorldSection simulations={simulations} isLoading={isLoading} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RecentResults />
          <FocusNext />
        </div>
      </div>
    </MotionConfig>
  );
}
