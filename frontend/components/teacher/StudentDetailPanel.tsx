"use client";

import useSWR from "swr";
import { ArrowLeft, Award, Target, TrendingUp, Zap } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";
import { getStudentDetail } from "@/lib/teacher-client";
import { GlassPanel, Skeleton, Surface } from "@/components/design-system";
import { moduleAccentClass, moduleLabel } from "./module-meta";

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2 text-ds-body text-text-secondary">
        {icon}
        {label}
      </span>
      <span className="text-ds-body font-semibold text-text-primary">{value}</span>
    </div>
  );
}

function TopicTags({ topics, tone }: { topics: string[]; tone: "strong" | "weak" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {topics.map((topic) => (
        <span
          key={topic}
          className={`rounded-full px-2.5 py-1 text-ds-caption ${
            tone === "strong" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
          }`}
        >
          {topic}
        </span>
      ))}
    </div>
  );
}

/**
 * D7 spec G — right-hand analytics panel for the selected student. Reuses
 * the exact same accuracy/weak-topics/streak numbers the student sees on
 * their own profile (GET /api/teacher/student/{id} mirrors
 * progress_service.compute_derived_stats 1:1) — no separate teacher-facing
 * scoring model. `onBack` is only rendered on mobile, where directory and
 * detail can't sit side by side (see TeacherDashboard.tsx).
 */
export default function StudentDetailPanel({
  studentId,
  classId,
  onBack,
  className = "",
}: {
  studentId: string | null;
  classId: string | null;
  onBack: () => void;
  className?: string;
}) {
  const { t, locale } = useLocale();
  const { data: student, isLoading } = useSWR(
    studentId ? ["teacher-student-detail", studentId, classId] : null,
    () => getStudentDetail(studentId as string, classId)
  );

  if (!studentId) {
    return (
      <Surface data-testid="teacher-detail-panel" className={`hidden items-center justify-center p-8 text-center lg:flex ${className}`}>
        <div>
          <h3 className="text-ds-title text-text-primary">{t.teacher.detail.emptyTitle}</h3>
          <p className="mt-1 text-ds-body text-text-muted">{t.teacher.detail.emptyBody}</p>
        </div>
      </Surface>
    );
  }

  return (
    <Surface data-testid="teacher-detail-panel" elevated className={`flex flex-col gap-5 p-5 ${className}`}>
      <button type="button" onClick={onBack} className="ds-focus-ring flex w-fit items-center gap-1.5 text-ds-caption text-text-muted lg:hidden">
        <ArrowLeft size={14} /> {t.teacher.directory.title}
      </button>

      {isLoading || !student ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div>
            <h3 className="text-ds-title text-text-primary">{student.full_name}</h3>
            <p className="text-ds-caption text-text-muted">{student.email}</p>
            <p className="mt-1 text-ds-caption text-text-muted">
              {t.teacher.detail.identityJoined} {new Date(student.created_at).toLocaleDateString(INTL_LOCALE_TAG[locale])}
            </p>
            {student.needs_attention && (
              <span className="mt-2 inline-block rounded-full bg-warning/10 px-2.5 py-1 text-ds-caption font-medium text-warning">
                {t.teacher.directory.attentionBadge}
              </span>
            )}
          </div>

          <GlassPanel className="divide-y divide-border/[0.08] rounded-ds-panel px-4">
            <StatRow icon={<Zap size={15} className="text-accent" />} label={t.dashboard.progress.level} value={String(student.level)} />
            <StatRow icon={<Zap size={15} className="text-accent" />} label={t.dashboard.progress.xp} value={String(student.xp)} />
            <StatRow
              icon={<Award size={15} className="text-accent-chemistry" />}
              label={t.teacher.detail.completedLabsLabel}
              value={String(student.completed_labs)}
            />
            <StatRow
              icon={<Target size={15} className="text-accent-geo" />}
              label={t.dashboard.progress.accuracy}
              value={`${student.accuracy}%`}
            />
            <StatRow
              icon={<TrendingUp size={15} className="text-accent-physics" />}
              label={t.dashboard.progress.streak}
              value={String(student.current_streak)}
            />
          </GlassPanel>

          {(student.strong_topics.length > 0 || student.weak_topics.length > 0) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {student.strong_topics.length > 0 && (
                <div>
                  <p className="mb-1.5 text-ds-caption uppercase tracking-widest text-text-muted">{t.dashboard.progress.strongTopics}</p>
                  <TopicTags topics={student.strong_topics} tone="strong" />
                </div>
              )}
              {student.weak_topics.length > 0 && (
                <div>
                  <p className="mb-1.5 text-ds-caption uppercase tracking-widest text-text-muted">{t.dashboard.progress.weakTopics}</p>
                  <TopicTags topics={student.weak_topics} tone="weak" />
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-ds-caption uppercase tracking-widest text-text-muted">{t.teacher.detail.recentMistakesTitle}</p>
            {student.recent_mistakes.length > 0 ? (
              <ul className="space-y-1 text-ds-body text-text-secondary">
                {student.recent_mistakes.map((code, i) => (
                  <li key={`${code}-${i}`} className="truncate">
                    {code}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ds-body text-text-muted">{t.teacher.detail.recentMistakesEmpty}</p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-ds-caption uppercase tracking-widest text-text-muted">{t.dashboard.progress.achievements}</p>
            {student.achievements.length > 0 ? (
              <TopicTags topics={student.achievements} tone="strong" />
            ) : (
              <p className="text-ds-body text-text-muted">{t.teacher.detail.achievementsEmpty}</p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-ds-caption uppercase tracking-widest text-text-muted">{t.teacher.detail.moduleBreakdownTitle}</p>
            {student.module_breakdown.length > 0 ? (
              <div className="space-y-2">
                {student.module_breakdown.map((row) => (
                  <div key={row.module} className="flex items-center justify-between text-ds-body">
                    <span className={moduleAccentClass(row.module)}>{moduleLabel(t, row.module)}</span>
                    <span className="text-text-secondary">
                      {row.completed_count} · {row.average_score != null ? row.average_score.toFixed(1) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-ds-body text-text-muted">{t.teacher.detail.moduleBreakdownEmpty}</p>
            )}
          </div>
        </>
      )}
    </Surface>
  );
}
