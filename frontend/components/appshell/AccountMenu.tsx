"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { GlassPanel } from "@/components/design-system";

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * D4 — account entry point in TopBar. Replaces the old
 * `components/ui/Navbar.tsx` (plain name+logout text row). Shows only real
 * user data (name/role/initials) — nothing invented.
 */
export default function AccountMenu() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!user) return null;
  const roleLabel = t.shell.role[user.role];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.shell.account.menuLabel}
        className="ds-focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-ds-caption font-semibold text-accent transition-opacity hover:opacity-80"
      >
        {initialsOf(user.full_name)}
      </button>

      {open && (
        <GlassPanel role="menu" className="absolute right-0 top-11 z-50 w-56 rounded-ds-panel p-2 shadow-ds-lg">
          <div className="flex items-center gap-3 rounded-ds-control p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-ds-caption font-semibold text-accent">
              {initialsOf(user.full_name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-ds-body font-medium text-text-primary">{user.full_name}</p>
              <p className="text-ds-caption text-text-muted">{roleLabel}</p>
            </div>
          </div>

          <div className="my-1 h-px bg-border/[0.08]" />

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="ds-focus-ring flex items-center gap-2 rounded-ds-control px-2 py-2 text-ds-body text-text-secondary transition-colors hover:bg-text-primary/5 hover:text-text-primary"
          >
            <UserIcon size={16} />
            {t.shell.account.profile}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="ds-focus-ring flex w-full items-center gap-2 rounded-ds-control px-2 py-2 text-left text-ds-body text-danger transition-colors hover:bg-danger/10"
          >
            <LogOut size={16} />
            {t.shell.account.logout}
          </button>
        </GlassPanel>
      )}
    </div>
  );
}
