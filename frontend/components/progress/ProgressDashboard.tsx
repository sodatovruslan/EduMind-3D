"use client";

import useSWR from "swr";
import {
  Brain,
  Cable,
  Cog,
  Gem,
  Lock,
  Rocket,
  Trophy,
  Wrench,
  Hammer,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { getMyProgress } from "@/lib/progress-client";
import { ALL_ACHIEVEMENT_CODES } from "@/lib/achievements";
import { useLocale } from "@/lib/locale-context";
import { ButtonLink, Skeleton, Surface } from "@/components/design-system";

/**
 * Прогресс ученика на странице профиля. Все числа приходят готовыми из
 * GET /api/progress/me (progress_service.py) — здесь только отображение.
 * Ключ SWR общий с шапкой профиля и AchievementsTeaser, так что запрос один.
 */

const ACHIEVEMENT_ICON: Record<string, LucideIcon> = {
  first_circuit: Cable,
  first_perfect_lab: Gem,
  five_labs_completed: Trophy,
  no_hints_used: Brain,
  fast_learner: Rocket,
  electrician_beginner: Wrench,
  electrician_intermediate: Hammer,
  electrician_advanced: Cog,
};

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="py-3 sm:px-6 sm:py-0 sm:first:pl-0">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 font-headline text-3xl font-semibold tabular-nums tracking-tight text-text-primary">
        {value}
        {suffix && <span className="ml-0.5 text-lg font-medium text-text-muted">{suffix}</span>}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-right text-sm font-medium text-text-primary">{children}</span>
    </div>
  );
}

export default function ProgressDashboard() {
  const { t } = useLocale();
  const { data, error, isLoading } = useSWR("progress-me", getMyProgress);
  const profile = data?.profile;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Только что созданный профиль приходит с нулями — вместо стены нулей
  // показываем понятный первый шаг.
  const isFreshProfile = profile && profile.completed_labs === 0 && profile.xp === 0;

  if (error || !profile || isFreshProfile) {
    return (
      <Surface className="flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center" data-testid="progress-dashboard-empty">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <FlaskConical size={22} strokeWidth={1.75} />
        </div>
        <p className="flex-1 text-ds-body text-text-secondary">{t.dashboard.progress.empty}</p>
        <ButtonLink href="/dashboard" variant="primary">
          {t.profile.emptyCta}
        </ButtonLink>
      </Surface>
    );
  }

  const DIFFICULTY_LABEL: Record<string, string> = {
    easy: t.dashboard.progress.difficultyEasy,
    medium: t.dashboard.progress.difficultyMedium,
    hard: t.dashboard.progress.difficultyHard,
  };
  const unlockedCount = ALL_ACHIEVEMENT_CODES.filter((c) => profile.achievements.includes(c)).length;

  return (
    <div className="space-y-6" data-testid="progress-dashboard">
      {/* Основные цифры — одна строка с разделителями, без коробок */}
      <Surface className="p-6">
        <h2 className="mb-4 font-headline text-lg font-semibold text-text-primary">{t.profile.statsTitle}</h2>
        <div className="grid grid-cols-2 gap-x-6 divide-border/[0.08] sm:grid-cols-4 sm:gap-x-0 sm:divide-x">
          <Stat label={t.dashboard.progress.xp} value={String(profile.xp)} />
          <Stat label={t.dashboard.progress.completedLabs} value={String(profile.completed_labs)} />
          <Stat label={t.dashboard.progress.accuracy} value={String(profile.accuracy)} suffix="%" />
          <Stat label={t.dashboard.progress.streak} value={String(profile.current_streak)} />
        </div>
      </Surface>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Детали решения */}
        <Surface className="p-6">
          <h2 className="mb-2 font-headline text-lg font-semibold text-text-primary">{t.profile.detailsTitle}</h2>
          <div className="divide-y divide-border/[0.08]">
            <Row label={t.dashboard.progress.avgHints}>{profile.average_hints.toFixed(1)}</Row>
            <Row label={t.dashboard.progress.avgAttempts}>{profile.average_attempts.toFixed(1)}</Row>
            <Row label={t.dashboard.progress.recommendedNext}>
              <span className="text-accent">
                {DIFFICULTY_LABEL[profile.recommended_difficulty] ?? profile.recommended_difficulty}
              </span>
            </Row>
          </div>

          {(profile.strong_topics.length > 0 || profile.weak_topics.length > 0) && (
            <div className="mt-4 space-y-3">
              {profile.strong_topics.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm text-text-muted">{t.dashboard.progress.strongTopics}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.strong_topics.map((topic) => (
                      <span key={topic} className="rounded-md bg-success/10 px-2 py-0.5 text-sm text-success">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {profile.weak_topics.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm text-text-muted">{t.dashboard.progress.weakTopics}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.weak_topics.map((topic) => (
                      <span key={topic} className="rounded-md bg-warning/10 px-2 py-0.5 text-sm text-warning">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Surface>

        {/* Достижения */}
        <Surface className="p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-headline text-lg font-semibold text-text-primary">{t.dashboard.progress.achievements}</h2>
            <span className="text-sm tabular-nums text-text-muted">
              {unlockedCount} {t.profile.unlockedOf} {ALL_ACHIEVEMENT_CODES.length}
            </span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2" data-testid="achievements-grid">
            {ALL_ACHIEVEMENT_CODES.map((code) => {
              const unlocked = profile.achievements.includes(code);
              const info = t.achievements[code as keyof typeof t.achievements];
              const Icon = unlocked ? ACHIEVEMENT_ICON[code] ?? Trophy : Lock;
              return (
                <li
                  key={code}
                  data-testid={`achievement-${code}`}
                  data-unlocked={unlocked}
                  title={info.description}
                  className={`flex items-center gap-3 rounded-xl p-2.5 transition-colors ${
                    unlocked ? "bg-warning/[0.07]" : "hover:bg-border/[0.03]"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      unlocked ? "bg-warning/15 text-warning" : "bg-border/[0.05] text-text-muted"
                    }`}
                  >
                    <Icon size={17} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-medium ${unlocked ? "text-text-primary" : "text-text-muted"}`}>
                      {info.title}
                    </span>
                    <span className="block truncate text-xs text-text-muted">{info.description}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Surface>
      </div>
    </div>
  );
}
