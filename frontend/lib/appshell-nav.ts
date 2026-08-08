import { LayoutDashboard, Users } from "lucide-react";
import type { UserRole } from "@/lib/types";

/**
 * D4 — role-aware navigation destinations for the authenticated standard
 * shell (Rail + MobileDrawer share this single source of truth). Only real
 * routes: `/dashboard` (all roles — it's still the "Мои симуляции" catalog,
 * unchanged in D4) and `/teacher` (teacher/admin only, matches the existing
 * role gate already enforced inside `teacher/page.tsx`'s own
 * `ProtectedRoute allowedRoles`). No invented destinations.
 */
export type NavItemKey = "home" | "teacherArea";

export interface NavItem {
  key: NavItemKey;
  href: string;
  icon: typeof LayoutDashboard;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { key: "home", href: "/dashboard", icon: LayoutDashboard },
  { key: "teacherArea", href: "/teacher", icon: Users },
];

export function getNavItems(role: UserRole | undefined): NavItem[] {
  const isTeacher = role === "teacher" || role === "admin";
  return ALL_NAV_ITEMS.filter((item) => item.key !== "teacherArea" || isTeacher);
}
