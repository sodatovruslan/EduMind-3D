"use client";

import { useState } from "react";
import { MotionConfig } from "framer-motion";
import ProtectedRoute from "@/components/ProtectedRoute";
import TopBar from "./TopBar";
import MobileDrawer from "./MobileDrawer";

/**
 * Стандартная оболочка аутентифицированных (не immersive) маршрутов —
 * dashboard/teacher/profile/messages: TopBar + MobileDrawer.
 *
 * D4 ставил сюда ещё и постоянный вертикальный Rail; он убран вместе с
 * состоянием collapsed и его localStorage-ключом `edumind:rail-collapsed`
 * (ключ просто перестаёт читаться — чистить ничего не нужно). Навигация
 * целиком переехала в TopBar, см. комментарий там. Вертикальной колонки
 * больше нет, поэтому контент сам занимает всю ширину, а его центровку,
 * как и раньше, задают сами страницы (`mx-auto max-w-[90rem]`).
 *
 * Симуляции сюда по-прежнему не попадают — у них app/(immersive)/layout.tsx
 * + MinimalShell.
 */
export default function StandardAppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ProtectedRoute>
      <MotionConfig reducedMotion="user">
        <div className="min-h-screen bg-background">
          <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />
          <TopBar onOpenMobileMenu={() => setMobileOpen(true)} />
          <main className="p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </MotionConfig>
    </ProtectedRoute>
  );
}
