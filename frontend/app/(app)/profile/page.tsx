"use client";

import { useState } from "react";
import { User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { apiFetch, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { Button, Skeleton, Surface } from "@/components/design-system";
import ProgressDashboard from "@/components/progress/ProgressDashboard";

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { t, locale } = useLocale();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  if (!user) {
    return (
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full max-w-lg" />
      </div>
    );
  }

  const isUnchanged = fullName.trim() === user.full_name;

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
    <div className="max-w-3xl space-y-6">
      <h1 className="text-ds-display text-text-primary">{t.profile.title}</h1>

      <div className="max-w-lg">
        <Surface elevated className="p-6">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/15 text-ds-title font-semibold text-accent">
              {initialsOf(user.full_name) === "?" ? <UserIcon size={24} /> : initialsOf(user.full_name)}
            </div>
            <div>
              <p className="font-headline font-semibold text-text-primary">{user.full_name}</p>
              <p className="text-ds-caption uppercase tracking-widest text-text-muted">{t.shell.role[user.role]}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-ds-caption font-semibold uppercase tracking-widest text-text-muted">
                {t.profile.emailLabel}
              </label>
              <div className="ds-input text-text-muted">{user.email}</div>
            </div>

            <div>
              <label htmlFor="profile-full-name" className="mb-1 block text-ds-caption font-semibold uppercase tracking-widest text-text-muted">
                {t.profile.fullNameLabel}
              </label>
              <input
                id="profile-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="ds-input ds-focus-ring"
              />
            </div>

            <div>
              <label className="mb-1 block text-ds-caption font-semibold uppercase tracking-widest text-text-muted">
                {t.profile.joinedLabel}
              </label>
              <div className="ds-input text-text-muted">{new Date(user.created_at).toLocaleDateString(locale)}</div>
            </div>

            <div role="alert" className="min-h-[1.25rem] text-ds-caption text-danger">
              {error}
            </div>
            {savedAt && !error && <p className="text-ds-caption text-success">{t.profile.saved}</p>}

            <Button onClick={handleSave} disabled={isSaving || isUnchanged || fullName.trim().length === 0} variant="primary" className="w-full">
              {isSaving ? t.profile.saving : t.profile.save}
            </Button>
          </div>
        </Surface>
      </div>

      <ProgressDashboard />
    </div>
  );
}
