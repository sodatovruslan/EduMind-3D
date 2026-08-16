import { request as playwrightRequest } from "@playwright/test";

// Every E2E spec registers throwaway users via POST /api/auth/register
// (see e2e/helpers/chemistry-isolated.ts and friends) and never deletes
// them — that's how 407 junk student accounts accumulated in the dev DB
// before D7. Convention: any account an E2E spec creates MUST use an
// @example.com email (all current specs already do) so this stays a safe,
// real-account-proof cleanup signal. This runs once after the full
// Playwright run and purges them from the dev backend.
export default async function globalTeardown() {
  const api = await playwrightRequest.newContext({ baseURL: "http://localhost:8000" });
  try {
    await api.post("/api/auth/dev/cleanup-test-users");
  } catch {
    // best-effort — backend may not be running; must not fail the test run
  } finally {
    await api.dispose();
  }
}
