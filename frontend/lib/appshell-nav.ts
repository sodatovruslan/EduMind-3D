import { GraduationCap, LayoutDashboard, MessageCircle, Users } from "lucide-react";
import type { UserRole } from "@/lib/types";

/**
 * D4 — role-aware navigation destinations for the authenticated standard
 * shell (Rail + MobileDrawer share this single source of truth). Only real
 * routes: `/dashboard` (all roles — it's still the "Мои симуляции" catalog,
 * unchanged in D4) and `/teacher` (teacher/admin only, matches the existing
 * role gate already enforced inside `teacher/page.tsx`'s own
 * `ProtectedRoute allowedRoles`). No invented destinations.
 *
 * T5 — `/messages` added for students and teachers (the two roles human
 * messaging is actually built for — see backend/app/routers/messaging.py's
 * own "admin is not auto-granted messaging" rule); admin doesn't get this
 * item, matching that same backend decision instead of silently disagreeing
 * with it in the UI.
 */
export type NavItemKey = "home" | "teacherArea" | "classes" | "messages";

export interface NavItem {
  key: NavItemKey;
  href: string;
  icon: typeof LayoutDashboard;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { key: "home", href: "/dashboard", icon: LayoutDashboard },
  { key: "messages", href: "/messages", icon: MessageCircle },
  { key: "teacherArea", href: "/teacher", icon: Users },
  { key: "classes", href: "/teacher/classes", icon: GraduationCap },
];

export function getNavItems(role: UserRole | undefined): NavItem[] {
  const isTeacher = role === "teacher" || role === "admin";
  return ALL_NAV_ITEMS.filter((item) => {
    if (["teacherArea", "classes"].includes(item.key)) return isTeacher;
    if (item.key === "messages") return role === "teacher" || role === "student";
    return true;
  });
}

export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/teacher") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
