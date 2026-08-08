"use client";

import { useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import ProtectedRoute from "@/components/ProtectedRoute";
import Rail from "./Rail";
import TopBar from "./TopBar";
import MobileDrawer from "./MobileDrawer";

const STORAGE_KEY = "edumind:rail-collapsed";

/**
 * D4 — standard authenticated shell (Rail + TopBar + MobileDrawer),
 * mounted by app/(app)/layout.tsx for every non-immersive authenticated
 * route (dashboard/teacher/profile). Replaces the old permanent
 * Sidebar+Navbar+`ml-64 p-8 pt-24` shell. Does NOT wrap the 4 simulation
 * routes — those moved to app/(immersive)/layout.tsx + MinimalShell, so a
 * permanent rail never eats into their 3D viewport (see D4 notes).
 *
 * Plain flex layout (Rail as a normal, `sticky` — not `fixed` — flow
 * child) rather than fixed-positioning + a manually computed margin: the
 * content column reflows for free whenever the rail's width changes
 * (collapsed/expanded), no arbitrary-value Tailwind class needs to track a
 * runtime value (which Tailwind's static class scanner can't see anyway).
 */
export default function StandardAppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <ProtectedRoute>
      <MotionConfig reducedMotion="user">
        <div className="flex min-h-screen bg-background">
          <Rail collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
          <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

          <div className="min-w-0 flex-1">
            <TopBar onOpenMobileMenu={() => setMobileOpen(true)} />
            <main className="p-4 sm:p-6 lg:p-8">{children}</main>
          </div>
        </div>
      </MotionConfig>
    </ProtectedRoute>
  );
}
