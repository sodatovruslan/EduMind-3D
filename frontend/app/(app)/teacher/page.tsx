"use client";

import { useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Hero from "@/components/teacher/Hero";
import KpiRow from "@/components/teacher/KpiRow";
import AttentionList from "@/components/teacher/AttentionList";
import StudentDirectory from "@/components/teacher/StudentDirectory";
import StudentDetailPanel from "@/components/teacher/StudentDetailPanel";
import RecentClassResults from "@/components/teacher/RecentClassResults";
import ModuleBreakdown from "@/components/teacher/ModuleBreakdown";
import ClassFilter from "@/components/teacher/ClassFilter";

export default function TeacherPage() {
  return (
    <ProtectedRoute allowedRoles={["teacher", "admin"]}>
      <TeacherDashboard />
    </ProtectedRoute>
  );
}

/**
 * D7 — Teacher Learning Analytics Center. Replaces the old
 * 4-KPI-cards + raw student list + empty-panel layout with a real
 * hierarchy: Hero -> KPIs -> Students needing attention -> Directory +
 * Selected student analytics -> Recent class activity -> World breakdown.
 * Every number traces to a real backend field or a documented deterministic
 * derivation (see backend/app/routers/teacher.py) — no fabricated
 * analytics, no AI risk scores.
 *
 * Directory + detail sit side by side on desktop (`lg:`), but only one is
 * visible at a time below that breakpoint — selecting a student swaps the
 * directory out for a detail view with a "back" control, per the D7 brief's
 * explicit mobile requirement (no squeezed side-by-side columns).
 */
function TeacherDashboard() {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);

  function selectClass(nextClassId: string | null) {
    setClassId(nextClassId);
    setSelectedStudentId(null);
  }

  return (
    <div className="mx-auto max-w-[90rem] space-y-8">
      <Hero />
      <ClassFilter value={classId} onChange={selectClass} />
      <KpiRow classId={classId} />
      <AttentionList classId={classId} onSelect={setSelectedStudentId} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]">
        <div className={selectedStudentId ? "hidden lg:block" : "block"}>
          <StudentDirectory classId={classId} selectedId={selectedStudentId} onSelect={setSelectedStudentId} className="h-full" />
        </div>
        <div className={selectedStudentId ? "block" : "hidden lg:block"}>
          <StudentDetailPanel
            studentId={selectedStudentId}
            classId={classId}
            onBack={() => setSelectedStudentId(null)}
            className="h-full"
          />
        </div>
      </div>

      <RecentClassResults classId={classId} />
      <ModuleBreakdown classId={classId} />
    </div>
  );
}
