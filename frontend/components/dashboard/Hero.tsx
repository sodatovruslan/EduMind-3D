"use client";

import useSWR from "swr";
import { Award, Flame, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { getMyProgress } from "@/lib/progress-client";
import { GlassPanel, Skeleton } from "@/components/design-system";

function useGreeting(): "greetingMorning" | "greetingAfternoon" | "greetingEvening" {
  const hour = new Date().getHours();
  if (hour < 12) return "greetingMorning";
  if (hour < 18) return "greetingAfternoon";
  return "greetingEvening";
}

/**
 * D5.1 — Student Home hero. Reworked with an atmospheric background band
 * (same 3-accent radial-gradient recipe as the AuthShell
 * visual side, kept faint) so the page reads as the same product from the
 * first pixel, and the real level/XP/streak pulse moved into a compact
 * glass badge (§6 of the D5.1 brief explicitly calls a "compact progress
 * HUD" a glass use case) instead of plain inline text.
 */
export default function Hero() {
  const { user } = useAuth();
  const { t } = useLocale();
  const greetingKey = useGreeting();
  const { data: progress, isLoading } = useSWR("progress-me", getMyProgress);

  return (
    <section className="relative overflow-hidden rounded-ds-panel">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(45% 80% at 10% 20%, rgb(var(--ds-accent-physics) / 0.14), transparent 70%), radial-gradient(40% 70% at 90% 30%, rgb(var(--ds-accent-chemistry) / 0.12), transparent 70%), radial-gradient(50% 80% at 50% 100%, rgb(var(--ds-accent-geo) / 0.1), transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-4 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-ds-display text-text-primary">
            {t.dashboard[greetingKey]}
            {user ? `, ${user.full_name}` : ""}
          </h1>
          <p className="mt-1 text-ds-body text-text-secondary">{t.dashboard.subtitle}</p>
        </div>

        {isLoading ? (
          <Skeleton className="h-14 w-full lg:w-80" />
        ) : progress ? (
          <GlassPanel className="flex shrink-0 flex-wrap items-center gap-4 rounded-ds-panel px-5 py-3">
            <span className="flex items-center gap-1.5 text-ds-body text-text-primary">
              <Zap size={16} className="text-accent" />
              {t.dashboard.statLevel} {progress.profile.level} · {progress.profile.xp} {t.dashboard.statXp}
            </span>
            <span className="flex items-center gap-1.5 text-ds-body text-text-primary">
              <Award size={16} className="text-accent-chemistry" />
              {progress.profile.completed_labs} {t.dashboard.statLabs}
            </span>
            {progress.profile.current_streak > 0 && (
              <span className="flex items-center gap-1.5 text-ds-body text-text-primary">
                <Flame size={16} className="text-accent-physics" />
                {progress.profile.current_streak} {t.dashboard.statStreak}
              </span>
            )}
          </GlassPanel>
        ) : null}
      </div>
    </section>
  );
}
