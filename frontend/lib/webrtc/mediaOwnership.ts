/**
 * T8 — multi-tab MEDIA ownership (brief §28). T7's call STATE already
 * syncs fine across tabs (every tab gets the same `call:*` broadcasts);
 * this is only about making sure `getUserMedia`/`RTCPeerConnection` are
 * only ever touched by ONE tab per call. A minimal `localStorage` lease
 * — no BroadcastChannel/coordination framework: the tab that starts media
 * negotiation writes `{tabId, ts}`; any other tab checking in sees a
 * fresh lease and never calls getUserMedia itself. `ts` is refreshed
 * periodically by the owner (pure client-side, no network cost) so a
 * lease naturally goes stale (and becomes claimable) if its owning tab
 * closed without cleanly releasing it.
 *
 * Bug fix (found live): the lease key was scoped by `callId` ALONE.
 * `localStorage` is shared per-origin, not per-logged-in-user, so
 * testing a real 1:1 call with both participants' accounts open in two
 * tabs of the SAME browser on one machine — a normal way to solo-test
 * this feature — made the SECOND participant's tab lose a lease race
 * against the FIRST participant's own tab, even though they are two
 * different real people, not two tabs of the same person. That tab then
 * never called getUserMedia/created a PeerConnection at all, so the
 * other side's offer went unanswered and timed out as "connection
 * failed" — misdiagnosable as a media/hardware problem when it was
 * actually this. Scoping the key by (callId, userId) fixes it: each
 * participant's OWN multi-tab dedup stays independent of the other
 * participant's, which is what brief §28 actually asked for.
 */
const LEASE_PREFIX = "edumind:call-media-owner:";
const LEASE_STALE_MS = 15_000;
export const LEASE_RENEWAL_INTERVAL_MS = 5_000;

interface Lease {
  tabId: string;
  ts: number;
}

function leaseKey(callId: string, userId: string): string {
  return `${LEASE_PREFIX}${callId}:${userId}`;
}

function readLease(callId: string, userId: string): Lease | null {
  const raw = localStorage.getItem(leaseKey(callId, userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.tabId === "string" && typeof parsed?.ts === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Returns true if `tabId` now owns (or already owned) the media lease
 * for this call — false if another tab's lease is still fresh. Scoped
 * per (callId, userId): only dedupes multiple tabs of the SAME real
 * participant, never blocks the other participant's own tab. */
export function claimMediaOwnership(callId: string, userId: string, tabId: string): boolean {
  const existing = readLease(callId, userId);
  if (existing && existing.tabId !== tabId && Date.now() - existing.ts < LEASE_STALE_MS) {
    return false;
  }
  localStorage.setItem(leaseKey(callId, userId), JSON.stringify({ tabId, ts: Date.now() } satisfies Lease));
  return true;
}

export function renewMediaOwnership(callId: string, userId: string, tabId: string): void {
  const existing = readLease(callId, userId);
  if (existing && existing.tabId !== tabId) return; // lost the lease somehow — don't steal it back silently
  localStorage.setItem(leaseKey(callId, userId), JSON.stringify({ tabId, ts: Date.now() } satisfies Lease));
}

export function releaseMediaOwnership(callId: string, userId: string, tabId: string): void {
  const existing = readLease(callId, userId);
  if (existing && existing.tabId === tabId) {
    localStorage.removeItem(leaseKey(callId, userId));
  }
}

export function createTabId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
