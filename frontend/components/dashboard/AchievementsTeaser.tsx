"use client";

import useSWR from "swr";
import { getMyProgress } from "@/lib/progress-client";
import { ACHIEVEMENT_EMOJI, ALL_ACHIEVEMENT_CODES } from "@/lib/achievements";
import { useLocale } from "@/lib/locale-context";
import { ButtonLink, Skeleton, Surface } from "@/components/design-system";

const MAX_VISIBLE = 4;

/**
 * D8 — compact achievements preview for the Dashboard (brief §11: "not a
 * separate giant trophy wall"). Shows unlocked achievements first (most
 * recently unlocked last per `profile.achievements` order — real backend
 * order, not re-sorted), padded with a few locked ones so the section
 * isn't empty for a new student, plus a real "All achievements" CTA to
 * `/profile`, where the full grid (`ProgressDashboard`) already lives —
 * deliberately not duplicated here.
 */
export default function AchievementsTeaser() {
  const { t } = useLocale();
  const { data: progress, isLoading } = useSWR("progress-me", getMyProgress);
  const unlocked = progress?.profile.achievements ?? [];

  if (isLoading) {
    return (
      <section>
        <h2 className="mb-3 text-ds-title text-text-primary">{t.dashboard.achievementsTeaser.title}</h2>
        <Skeleton className="h-24 w-full" />
      </section>
    );
  }

  const lockedCodes = ALL_ACHIEVEMENT_CODES.filter((code) => !unlocked.includes(code));
  const visibleCodes = [...unlocked, ...lockedCodes].slice(0, MAX_VISIBLE);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-ds-title text-text-primary">{t.dashboard.achievementsTeaser.title}</h2>
        <ButtonLink href="/profile" variant="ghost">
          {t.dashboard.achievementsTeaser.viewAllCta}
        </ButtonLink>
      </div>

      {unlocked.length === 0 ? (
        <Surface className="p-6 text-center text-ds-body text-text-muted">{t.dashboard.achievementsTeaser.empty}</Surface>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {visibleCodes.map((code) => {
            const isUnlocked = unlocked.includes(code);
            const info = t.achievements[code as keyof typeof t.achievements];
            return (
              <Surface
                key={code}
                elevated
                data-testid={`achievement-teaser-${code}`}
                data-unlocked={isUnlocked}
                title={info.description}
                className={`p-3 text-center ${isUnlocked ? "border-warning/50" : "opacity-50"}`}
              >
                <div className="text-2xl">{ACHIEVEMENT_EMOJI[code]}</div>
                <div className="mt-1 text-ds-caption font-medium text-text-primary">{info.title}</div>
              </Surface>
            );
          })}
        </div>
      )}
    </section>
  );
}
