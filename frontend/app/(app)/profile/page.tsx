"use client";

import { useState } from "react";
import { User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import Loader from "@/components/ui/Loader";
import ProtectedRoute from "@/components/ProtectedRoute";

const ROLE_LABEL = {
  student: "Ученик",
  teacher: "Учитель",
  admin: "Администратор",
} as const;

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}

function ProfileContent() {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  if (!user) return <Loader />;

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
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить изменения");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 font-headline text-2xl font-bold text-slate-100">Профиль</h1>

      <div className="glass-panel rim-light rounded-2xl p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="neon-glow-indigo flex h-14 w-14 items-center justify-center rounded-full bg-brand/20 text-brand">
            <UserIcon size={24} />
          </div>
          <div>
            <p className="font-headline font-semibold text-slate-100">{user.full_name}</p>
            <p className="font-mono text-xs uppercase tracking-widest text-slate-500">
              {ROLE_LABEL[user.role]}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">Email</label>
            <div className="rounded-md border border-glass-border bg-surface-container-lowest/40 px-3 py-2 text-sm text-slate-400">
              {user.email}
            </div>
          </div>

          <div>
            <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
              Полное имя
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-glass-border bg-surface-container-lowest/60 px-3 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
              Дата регистрации
            </label>
            <div className="rounded-md border border-glass-border bg-surface-container-lowest/40 px-3 py-2 text-sm text-slate-400">
              {new Date(user.created_at).toLocaleDateString("ru-RU")}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {savedAt && !error && <p className="text-sm text-neon-cyan">Изменения сохранены.</p>}

          <button
            onClick={handleSave}
            disabled={isSaving || isUnchanged || fullName.trim().length === 0}
            className="neon-glow-indigo w-full rounded-full bg-brand py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {isSaving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
