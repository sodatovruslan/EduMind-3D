import { apiFetch } from "@/lib/api";
import type { SaveBackendResponse } from "@/lib/autosave-engine";

/**
 * D5 — thin client over the already-existing (backend, unchanged)
 * `GET /api/chemistry/saves` (see backend/app/routers/chemistry_saves.py —
 * lists ALL of the current user's saves across every experiment, ordered
 * by `updated_at desc`). `lib/autosave-engine.ts` only ever POSTs/PATCHes
 * a save for the experiment it's currently running inside; this is the
 * first frontend consumer of the list endpoint, used by the dashboard's
 * "Continue Learning" widget to find a resumable Chemistry save without
 * already knowing its id. No electricity equivalent exists on the backend
 * (grep-confirmed — Electricity Lab has no server-side saves router), so
 * "Continue Learning" can only ever surface a Chemistry World resume.
 */
export function getMyChemistrySaves(): Promise<SaveBackendResponse[]> {
  return apiFetch<SaveBackendResponse[]>("/api/chemistry/saves");
}
