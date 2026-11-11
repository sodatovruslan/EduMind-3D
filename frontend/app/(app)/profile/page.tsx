"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { apiFetch, ApiError } from "@/lib/api";
import { getMyProgress } from "@/lib/progress-client";
import type { User } from "@/lib/types";
import { Button, Skeleton, Surface } from "@/components/design-system";
import ProgressDashboard from "@/components/progress/ProgressDashboard";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";

// Должно совпадать с level_for_xp() в backend/app/services/progress_service.py
const XP_PER_LEVEL = 50;

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function LevelRing({ level, xp }: { level: number; xp: number }) {
  const { t } = useLocale();
  const into = xp % XP_PER_LEVEL;
  const ratio = into / XP_PER_LEVEL;
  const r = 34;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="6" className="stroke-border/[0.08]" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - ratio)}
            className="stroke-accent transition-[stroke-dashoffset] duration-700 ease-ds-standard"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-headline text-2xl font-bold tabular-nums text-text-primary">
          {level}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">
          {t.dashboard.progress.level} {level}
        </p>
        <p className="mt-0.5 text-sm tabular-nums text-text-muted">
          {XP_PER_LEVEL - into} XP {t.profile.xpToNext} {level + 1}
        </p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { t, locale } = useLocale();
  const { data: progress } = useSWR(user ? "progress-me" : null, getMyProgress);
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  const isUnchanged = fullName.trim() === user.full_name;
  const initials = initialsOf(user.full_name);
  const joined = new Date(user.created_at).toLocaleDateString(INTL_LOCALE_TAG[locale]);

  async function handleSave() {
    if (!user || isUnchanged || fullName.trim().length === 0) return;
    setError(null);
    setIsSaving(true);
    try {
      await apiFetch<User>(`/api/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName.trim() }),
      });
      await refreshUser();
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.profile.saveError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="sr-only">{t.profile.title}</h1>

      {/* Шапка */}
      <Surface className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-accent/20 via-accent/[0.06] to-transparent"
        />
        <div className="relative flex flex-col gap-6 px-6 pb-6 pt-10 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <div className="flex items-end gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-accent font-headline text-2xl font-bold text-white shadow-ds-md ring-4 ring-surface">
              {initials === "?" ? <UserIcon size={30} /> : initials}
            </div>
            <div className="pb-1">
              <p className="font-headline text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">{user.full_name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
                <span>{t.shell.role[user.role]}</span>
                <span aria-hidden>·</span>
                <span>
                  {t.profile.memberSince} <span>{joined}</span>
                </span>
              </p>
            </div>
          </div>
          {progress && progress.profile.xp > 0 && <LevelRing level={progress.profile.level} xp={progress.profile.xp} />}
        </div>
      </Surface>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ProgressDashboard />

        {/* Аккаунт */}
        <Surface className="p-6 lg:sticky lg:top-24">
          <h2 className="font-headline text-lg font-semibold text-text-primary">{t.profile.accountTitle}</h2>
          <p className="mt-1 text-sm text-text-muted">{t.profile.accountHint}</p>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="profile-full-name" className="mb-1.5 block text-sm font-medium text-text-secondary">
                {t.profile.fullNameLabel}
              </label>
              <input
                id="profile-full-name"
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setSavedAt(null);
                }}
                className="ds-input ds-focus-ring transition-colors focus:border-accent/60"
              />
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-text-secondary">{t.profile.emailLabel}</p>
              <p className="truncate rounded-ds-control bg-border/[0.04] px-3 py-2 text-text-muted">{user.email}</p>
            </div>

            <div role="alert" className="min-h-[1.25rem] text-sm text-danger">
              {error}
              {savedAt && !error && (
                <span className="inline-flex items-center gap-1.5 text-success">
                  <Check size={14} />
                  {t.profile.saved}
                </span>
              )}
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving || isUnchanged || fullName.trim().length === 0}
              variant="primary"
              className="w-full"
            >
              {isSaving ? t.profile.saving : t.profile.save}
            </Button>
          </div>
        </Surface>
      </div>
    </div>
  );
}
