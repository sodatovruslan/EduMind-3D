import { GraduationCap, MessageCircle, Users } from "lucide-react";
import type { UserRole } from "@/lib/types";

/**
 * D4 — role-aware navigation destinations for the authenticated standard
 * shell (TopBar + MobileDrawer share this single source of truth). Only real
 * routes: `/teacher` (teacher/admin only, matches the existing role gate
 * already enforced inside `teacher/page.tsx`'s own `ProtectedRoute
 * allowedRoles`) and `/messages`. No invented destinations.
 *
 * `/dashboard` сознательно НЕ в этом списке: для ученика он был
 * единственным пунктом, то есть панель навигации состояла из одной ссылки
 * «Главная» рядом с логотипом — дублирующий шум. Попасть в кабинет можно
 * из меню аккаунта (AccountMenu / нижний блок MobileDrawer), откуда бы ни
 * шёл пользователь; логотип ведёт на лендинг.
 *
 * T5 — `/messages` added for students and teachers (the two roles human
 * messaging is actually built for — see backend/app/routers/messaging.py's
 * own "admin is not auto-granted messaging" rule); admin doesn't get this
 * item, matching that same backend decision instead of silently disagreeing
 * with it in the UI.
 */
export type NavItemKey = "teacherArea" | "classes" | "messages";

export interface NavItem {
  key: NavItemKey;
  href: string;
  icon: typeof MessageCircle;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { key: "messages", href: "/messages", icon: MessageCircle },
  { key: "teacherArea", href: "/teacher", icon: Users },
  { key: "classes", href: "/teacher/classes", icon: GraduationCap },
];

// `canSeeMessages` — see useCanSeeMessages: students only get Messages once
// they actually have a teacher (or an existing conversation).
export function getNavItems(role: UserRole | undefined, canSeeMessages = role === "teacher"): NavItem[] {
  const isTeacher = role === "teacher" || role === "admin";
  return ALL_NAV_ITEMS.filter((item) => {
    if (item.key === "messages") return (role === "teacher" || role === "student") && canSeeMessages;
    return isTeacher;
  });
}

export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/teacher") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
