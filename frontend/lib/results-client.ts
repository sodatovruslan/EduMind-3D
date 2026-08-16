import { apiFetch } from "@/lib/api";
import type { LabResult } from "@/lib/types";

/**
 * D5 — thin client over the already-existing (backend, unchanged)
 * `GET /api/results/me` (see backend/app/routers/results.py — self-access
 * for any authenticated user, not just teachers). Not previously called
 * from the frontend; teacher/page.tsx only used the teacher-only sibling
 * endpoints. No backend change, no new logic — same shape as
 * lib/progress-client.ts.
 */
export function getMyResults(): Promise<LabResult[]> {
  return apiFetch<LabResult[]>("/api/results/me");
}
