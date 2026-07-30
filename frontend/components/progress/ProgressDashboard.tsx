"use client";

import { useEffect, useState } from "react";
import { Award, Flame, Target, TrendingUp, Zap } from "lucide-react";
import { getMyProgress, type LearningProfile } from "@/lib/progress-client";
import { ACHIEVEMENTS, ALL_ACHIEVEMENT_CODES } from "@/lib/achievements";
import Loader from "@/components/ui/Loader";

/**
 * Progress Dashboard (Stage 4) — читает уже посчитанный backend'ом
 * (progress_service.py) Learning Profile через GET /api/progress/me.
 * Ничего не считает сам — только отображает реальные числа.
 */
const DIFFICULTY_LABEL: Record<string, string> = { easy: "Лёгкая", medium: "Средняя", hard: "Сложная" };

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-glass-border bg-surface-container-lowest/40 p-4">
      <div className="mb-1 flex items-center gap-2 text-slate-400">
        {icon}
        <span className="font-mono text-xs uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}

export default function ProgressDashboard() {
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyProgress()
      .then((history) => setProfile(history.profile))
      .catch(() => setError("Пока нет данных о прогрессе — пройди хотя бы одно задание в лаборатории."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

  if (error || !profile) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-sm text-slate-400" data-testid="progress-dashboard-empty">
        {error ?? "Нет данных о прогрессе."}
      </div>
    );
  }

  return (
    <div className="glass-panel rim-light rounded-2xl p-6" data-testid="progress-dashboard">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-headline text-lg font-bold text-slate-100">Прогресс обучения</h2>
        <span className="rounded-full bg-neon-violet/20 px-3 py-1 font-mono text-xs text-neon-violet">
          Уровень {profile.level}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<Zap size={14} />} label="XP" value={String(profile.xp)} />
        <StatCard icon={<Award size={14} />} label="Лабораторных" value={String(profile.completed_labs)} />
        <StatCard icon={<Target size={14} />} label="Точность" value={`${profile.accuracy}%`} />
        <StatCard icon={<Flame size={14} />} label="Серия без ошибок" value={String(profile.current_streak)} />
        <StatCard icon={<TrendingUp size={14} />} label="Подсказок в среднем" value={profile.average_hints.toFixed(1)} />
        <StatCard icon={<TrendingUp size={14} />} label="Попыток в среднем" value={profile.average_attempts.toFixed(1)} />
      </div>

      <div className="mt-4 rounded-xl border border-glass-border bg-surface-container-lowest/40 p-3 text-sm text-slate-300">
        Рекомендованная сложность следующего задания:{" "}
        <span className="font-semibold text-neon-violet">{DIFFICULTY_LABEL[profile.recommended_difficulty] ?? profile.recommended_difficulty}</span>
      </div>

      {(profile.strong_topics.length > 0 || profile.weak_topics.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {profile.strong_topics.length > 0 && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <p className="mb-1 font-mono text-xs uppercase tracking-widest text-emerald-400">Сильные темы</p>
              {profile.strong_topics.join(", ")}
            </div>
          )}
          {profile.weak_topics.length > 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <p className="mb-1 font-mono text-xs uppercase tracking-widest text-amber-400">Стоит повторить</p>
              {profile.weak_topics.join(", ")}
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-400">Достижения</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="achievements-grid">
          {ALL_ACHIEVEMENT_CODES.map((code) => {
            const unlocked = profile.achievements.includes(code);
            const info = ACHIEVEMENTS[code];
            return (
              <div
                key={code}
                data-testid={`achievement-${code}`}
                data-unlocked={unlocked}
                title={info.description}
                className={`rounded-xl border p-3 text-center text-xs transition ${
                  unlocked
                    ? "border-amber-400/50 bg-amber-500/10 text-amber-200"
                    : "border-glass-border bg-surface-container-lowest/30 text-slate-600 opacity-50"
                }`}
              >
                <div className="text-2xl">{info.emoji}</div>
                <div className="mt-1 font-medium">{info.title}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
