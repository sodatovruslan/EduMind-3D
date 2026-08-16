"use client";

import { useEffect, useState } from "react";
import { Award, Flame, Target, TrendingUp, Zap } from "lucide-react";
import { getMyProgress, type LearningProfile } from "@/lib/progress-client";
import { ACHIEVEMENT_EMOJI, ALL_ACHIEVEMENT_CODES } from "@/lib/achievements";
import { useLocale } from "@/lib/locale-context";
import { Skeleton, Surface } from "@/components/design-system";

/**
 * Progress Dashboard (Stage 4, restyled to Design V2 in D5) — читает уже
 * посчитанный backend'ом (progress_service.py) Learning Profile через
 * GET /api/progress/me. Ничего не считает сам — только отображает реальные
 * числа. Логика/фетч не менялись в D5, только токены/i18n.
 */
function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Surface elevated className="p-4">
      <div className="mb-1 flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-ds-caption uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-ds-title text-text-primary">{value}</p>
    </Surface>
  );
}

export default function ProgressDashboard() {
  const { t } = useLocale();
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyProgress()
      .then((history) => setProfile(history.profile))
      .catch(() => setError(t.dashboard.progress.empty))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const DIFFICULTY_LABEL: Record<string, string> = {
    easy: t.dashboard.progress.difficultyEasy,
    medium: t.dashboard.progress.difficultyMedium,
    hard: t.dashboard.progress.difficultyHard,
  };

  if (loading) {
    return (
      <Surface elevated className="p-6">
        <Skeleton className="h-6 w-40" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </Surface>
    );
  }

  // "нет данных" и "реальный, но ещё пустой профиль" — один и тот же
  // честный empty-state для студента: только что созданный профиль
  // возвращается backend'ом успешно (не ошибка), просто со всеми нулями —
  // показывать стену нулей вместо приветливого empty-состояния было бы
  // технически честно, но не полезно (см. D5-бриф §16/§17)
  const isFreshProfile = profile && profile.completed_labs === 0 && profile.xp === 0;

  if (error || !profile || isFreshProfile) {
    return (
      <Surface elevated className="p-6 text-ds-body text-text-muted" data-testid="progress-dashboard-empty">
        {error ?? t.dashboard.progress.empty}
      </Surface>
    );
  }

  return (
    <Surface elevated className="p-6" data-testid="progress-dashboard">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-ds-title text-text-primary">{t.dashboard.progress.title}</h2>
        <span className="rounded-full bg-accent/15 px-3 py-1 text-ds-caption text-accent">
          {t.dashboard.progress.level} {profile.level}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<Zap size={14} />} label={t.dashboard.progress.xp} value={String(profile.xp)} />
        <StatCard icon={<Award size={14} />} label={t.dashboard.progress.completedLabs} value={String(profile.completed_labs)} />
        <StatCard icon={<Target size={14} />} label={t.dashboard.progress.accuracy} value={`${profile.accuracy}%`} />
        <StatCard icon={<Flame size={14} />} label={t.dashboard.progress.streak} value={String(profile.current_streak)} />
        <StatCard icon={<TrendingUp size={14} />} label={t.dashboard.progress.avgHints} value={profile.average_hints.toFixed(1)} />
        <StatCard icon={<TrendingUp size={14} />} label={t.dashboard.progress.avgAttempts} value={profile.average_attempts.toFixed(1)} />
      </div>

      <div className="mt-4 rounded-ds-control border border-border/[0.08] bg-background p-3 text-ds-body text-text-secondary">
        {t.dashboard.progress.recommendedNext}:{" "}
        <span className="font-semibold text-accent">{DIFFICULTY_LABEL[profile.recommended_difficulty] ?? profile.recommended_difficulty}</span>
      </div>

      {(profile.strong_topics.length > 0 || profile.weak_topics.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {profile.strong_topics.length > 0 && (
            <div className="rounded-ds-control border border-success/30 bg-success/10 p-3 text-ds-body text-text-primary">
              <p className="mb-1 text-ds-caption uppercase tracking-widest text-success">{t.dashboard.progress.strongTopics}</p>
              {profile.strong_topics.join(", ")}
            </div>
          )}
          {profile.weak_topics.length > 0 && (
            <div className="rounded-ds-control border border-warning/30 bg-warning/10 p-3 text-ds-body text-text-primary">
              <p className="mb-1 text-ds-caption uppercase tracking-widest text-warning">{t.dashboard.progress.weakTopics}</p>
              {profile.weak_topics.join(", ")}
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-ds-caption uppercase tracking-widest text-text-muted">{t.dashboard.progress.achievements}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="achievements-grid">
          {ALL_ACHIEVEMENT_CODES.map((code) => {
            const unlocked = profile.achievements.includes(code);
            const info = t.achievements[code as keyof typeof t.achievements];
            return (
              <div
                key={code}
                data-testid={`achievement-${code}`}
                data-unlocked={unlocked}
                title={info.description}
                className={`rounded-ds-control border p-3 text-center text-ds-caption transition-colors ${
                  unlocked ? "border-warning/50 bg-warning/10 text-warning" : "border-border/[0.08] bg-background text-text-muted opacity-50"
                }`}
              >
                <div className="text-2xl">{ACHIEVEMENT_EMOJI[code]}</div>
                <div className="mt-1 font-medium">{info.title}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Surface>
  );
}
