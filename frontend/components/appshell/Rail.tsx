"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { getNavItems, isNavItemActive } from "@/lib/appshell-nav";

export const RAIL_WIDTH_EXPANDED = "15rem";
export const RAIL_WIDTH_COLLAPSED = "4.5rem";

/**
 * D4 — desktop navigation rail. Pure navigation (destinations only); Theme/
 * Locale/Account live in TopBar, not here (see EDUMIND_DESIGN_SYSTEM_V2.md
 * D4 notes for why — avoids squeezing 6 toggle buttons into a 72px column).
 * Replaces the old permanent 256px `components/ui/Sidebar.tsx`.
 */
export default function Rail({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const pathname = usePathname();
  const items = getNavItems(user?.role);

  return (
    <aside
      style={{ width: collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH_EXPANDED }}
      className="sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-border/[0.08] bg-surface transition-[width] duration-200 ease-ds-standard motion-reduce:transition-none lg:flex"
    >
      <div className="flex h-16 items-center gap-2 px-4">
        <Link href="/dashboard" className="ds-focus-ring flex shrink-0 items-center gap-2 rounded-ds-control">
          <Box className="text-accent" size={22} />
          {!collapsed && <span className="font-headline text-base font-bold text-text-primary">EduMind 3D</span>}
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map(({ key, href, icon: Icon }) => {
          const isActive = isNavItemActive(pathname, href);
          const label = t.shell.nav[key];
          return (
            <Link
              key={key}
              href={href}
              title={collapsed ? label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={`ds-focus-ring flex items-center gap-3 rounded-ds-control px-3 py-2.5 text-ds-body transition-colors ${
                isActive ? "bg-accent/10 font-medium text-accent" : "text-text-secondary hover:bg-text-primary/5 hover:text-text-primary"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t.shell.rail.expand : t.shell.rail.collapse}
          className="ds-focus-ring flex w-full items-center justify-center rounded-ds-control p-2 text-text-muted transition-colors hover:bg-text-primary/5 hover:text-text-primary"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  );
}
