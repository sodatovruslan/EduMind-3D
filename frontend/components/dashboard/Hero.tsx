"use client";

import useSWR from "swr";
import { Award, Flame, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { getMyProgress } from "@/lib/progress-client";
import { Skeleton } from "@/components/design-system";

function useGreeting(): "greetingMorning" | "greetingAfternoon" | "greetingEvening" {
  const hour = new Date().getHours();
  if (hour < 12) return "greetingMorning";
  if (hour < 18) return "greetingAfternoon";
  return "greetingEvening";
}

/**
 * D5 — Student Home hero: real name + a restrained inline pulse of
 * level/XP/streak (the fuller breakdown, incl. accuracy, lives in
 * ProgressSnapshot below — see EDUMIND_DESIGN_SYSTEM_V2.md D5 notes for why
 * both exist without being redundant).
 */
export default function Hero() {
  const { user } = useAuth();
  const { t } = useLocale();
  const greetingKey = useGreeting();
  const { data: progress, isLoading } = useSWR("progress-me", getMyProgress);

  return (
    <section>
      <h1 className="text-ds-display text-text-primary">
        {t.dashboard[greetingKey]}
        {user ? `, ${user.full_name}` : ""}
      </h1>
      <p className="mt-1 text-ds-body text-text-secondary">{t.dashboard.subtitle}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {isLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : progress ? (
          <>
            <span className="flex items-center gap-1.5 text-ds-body text-text-secondary">
              <Zap size={16} className="text-accent" />
              {t.dashboard.statLevel} {progress.profile.level} · {progress.profile.xp} {t.dashboard.statXp}
            </span>
            <span className="flex items-center gap-1.5 text-ds-body text-text-secondary">
              <Award size={16} className="text-accent-chemistry" />
              {progress.profile.completed_labs} {t.dashboard.statLabs}
            </span>
            {progress.profile.current_streak > 0 && (
              <span className="flex items-center gap-1.5 text-ds-body text-text-secondary">
                <Flame size={16} className="text-accent-physics" />
                {progress.profile.current_streak} {t.dashboard.statStreak}
              </span>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
