import { apiFetch } from "@/lib/api";
import type { SimulationModule } from "@/lib/types";

/**
 * D7 — thin client over the new /api/teacher/* endpoints
 * (backend/app/routers/teacher.py). No logic lives here: accuracy/weak
 * topics/needs_attention are all computed backend-side from real
 * LearningEvent/LabResult rows using the exact same math as the student's
 * own Learning Profile (progress_service.py) — this file only shapes
 * requests/responses, same convention as lib/progress-client.ts.
 */
export interface StudentOverview {
  id: string;
  full_name: string;
  email: string;
  level: number;
  xp: number;
  completed_labs: number;
  accuracy: number;
  weak_topics: string[];
  latest_score: number | null;
  last_activity_at: string | null;
  needs_attention: boolean;
}

export interface ModuleResultSummary {
  module: SimulationModule;
  average_score: number | null;
  completed_count: number;
}

export interface StudentDetail {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  level: number;
  xp: number;
  completed_labs: number;
  accuracy: number;
  average_hints: number;
  average_attempts: number;
  strong_topics: string[];
  weak_topics: string[];
  recent_mistakes: string[];
  achievements: string[];
  current_streak: number;
  last_completed_lab: string | null;
  needs_attention: boolean;
  module_breakdown: ModuleResultSummary[];
}

export interface RecentClassResult {
  id: string;
  student_id: string;
  student_name: string;
  simulation_id: string;
  simulation_title: string;
  module: SimulationModule;
  score: number | null;
  duration_seconds: number;
  completed_at: string;
}

export interface ClassModuleBreakdown {
  module: SimulationModule;
  average_score: number | null;
  completed_count: number;
  active_students: number;
}

export function getStudentsOverview(): Promise<StudentOverview[]> {
  return apiFetch<StudentOverview[]>("/api/teacher/students-overview");
}

export function getStudentDetail(userId: string): Promise<StudentDetail> {
  return apiFetch<StudentDetail>(`/api/teacher/student/${userId}`);
}

export function getClassRecentResults(limit = 20): Promise<RecentClassResult[]> {
  return apiFetch<RecentClassResult[]>(`/api/teacher/recent-results?limit=${limit}`);
}

export function getClassModuleBreakdown(): Promise<ClassModuleBreakdown[]> {
  return apiFetch<ClassModuleBreakdown[]>("/api/teacher/module-breakdown");
}
