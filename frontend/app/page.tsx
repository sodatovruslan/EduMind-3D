"use client";

import { MotionConfig } from "framer-motion";
import {
  LandingNavbar,
  Hero,
  WorldsShowcase,
  HowItWorks,
  ForStudents,
  ForTeachers,
  AITeacherHighlight,
  FinalCta,
  Footer,
} from "@/components/landing";

/**
 * Public Landing (D2 — EDUMIND_DESIGN_SYSTEM_V2.md D2 notes). `/` now
 * renders the real product landing instead of redirect-only logic — an
 * authenticated user visiting `/` still sees it (CTAs adapt to "Open
 * Dashboard" instead of "Get Started"/"Sign In", see LandingNavbar/Hero/
 * FinalCta). No authenticated sidebar/navbar here: this route lives
 * outside app/(app)/layout.tsx, so components/ui/Sidebar+Navbar (the
 * legacy shell) never mount on it.
 *
 * MotionConfig reducedMotion="user" makes every framer-motion animation in
 * the tree below respect prefers-reduced-motion automatically (§13).
 */
export default function HomePage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background text-text-primary">
        <LandingNavbar />
        <main>
          <Hero />
          <WorldsShowcase />
          <HowItWorks />
          <ForStudents />
          <ForTeachers />
          <AITeacherHighlight />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
