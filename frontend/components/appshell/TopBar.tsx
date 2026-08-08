"use client";

import Link from "next/link";
import { Box, Menu } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { LocaleSwitcher, ThemeToggle } from "@/components/design-system";
import AccountMenu from "./AccountMenu";

/**
 * D4 — lightweight contextual top bar. No per-page title (every existing
 * page already renders its own `<h1>` — a shell-level title would just
 * duplicate it, see EDUMIND_DESIGN_SYSTEM_V2.md D4 notes). Carries the
 * mobile nav trigger, brand mark on mobile only (rail carries it on
 * desktop), and Locale/Theme/Account. Replaces the old
 * `components/ui/Navbar.tsx`.
 */
export default function TopBar({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const { t } = useLocale();

  return (
    <header className="ds-glass sticky top-0 z-30 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        aria-label={t.shell.mobile.openMenu}
        className="ds-focus-ring rounded-ds-control p-2 text-text-primary lg:hidden"
      >
        <Menu size={22} />
      </button>

      <Link href="/dashboard" className="ds-focus-ring flex items-center gap-2 font-headline text-base font-bold text-text-primary lg:hidden">
        <Box className="text-accent" size={20} />
        EduMind 3D
      </Link>

      <div className="flex-1" />

      <div className="hidden items-center gap-2 sm:flex">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
      <AccountMenu />
    </header>
  );
}
