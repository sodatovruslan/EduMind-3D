"use client";

import useSWR from "swr";
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
 * D5 — Student Learning Hub. Replaces the old flat "Мои симуляции"
 * search+grid (same page, same route, same underlying `/api/simulations/`
 * fetch — only the presentation changes, see EDUMIND_DESIGN_SYSTEM_V2.md D5
 * notes for the full real-data audit behind each section).
 *
 * Teacher/admin visiting `/dashboard` (still reachable — Rail's "Home"
 * points here for every role) get a minimal world-browse view instead of
 * fabricated student identity widgets (no LearningProfile-shaped data
 * belongs to a teacher) — NOT a Teacher Dashboard redesign, which is a
 * later stage; this is just avoiding an honesty gap.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const { data: simulations, isLoading } = useSWR<Simulation[]>("/api/simulations/", swrFetcher);

  const isStudent = user?.role === "student";

  if (!isStudent) {
    return (
      <div className="max-w-6xl space-y-8">
        <div>
          <h1 className="text-ds-title text-text-primary">{t.dashboard.teacherFallback.title}</h1>
          <p className="mt-1 text-ds-body text-text-secondary">{t.dashboard.teacherFallback.subtitle}</p>
        </div>
        <WorldSection simulations={simulations} isLoading={isLoading} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-10">
      <Hero />
      <ContinueLearning simulations={simulations} />
      <WorldSection simulations={simulations} isLoading={isLoading} />
      <ProgressSnapshot />
      <RecentResults />
      <FocusNext />
    </div>
  );
}
