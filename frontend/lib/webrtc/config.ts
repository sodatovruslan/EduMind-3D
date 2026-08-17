/**
 * T8 — centralized WebRTC ICE server configuration. One place, not
 * hardcoded STUN URLs scattered across components (brief §11).
 *
 * STUN: `NEXT_PUBLIC_WEBRTC_STUN_URL`, defaulting to a well-known public
 * Google STUN server for local development ONLY — explicitly not a
 * production NAT-traversal strategy on its own (see TURN note below).
 *
 * TURN: `NEXT_PUBLIC_WEBRTC_TURN_URL` / `NEXT_PUBLIC_WEBRTC_TURN_USERNAME`
 * / `NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL` — all optional, all unset by
 * default. Deliberately NOT configured out of the box: this project has
 * no TURN service, and long-lived TURN credentials baked into a public
 * `NEXT_PUBLIC_*` env var are not a safe production pattern (anyone can
 * read them from the shipped JS bundle) — a real deployment needs
 * short-lived, server-minted TURN credentials, which is out of scope for
 * T8. Documented, known limitation: without TURN, calls between peers on
 * restrictive/symmetric NATs or many mobile networks may fail to connect
 * P2P. That's real NAT-traversal work for a future stage, not something
 * T8 pretends to solve.
 */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];

  const stunUrl = process.env.NEXT_PUBLIC_WEBRTC_STUN_URL || "stun:stun.l.google.com:19302";
  servers.push({ urls: stunUrl });

  const turnUrl = process.env.NEXT_PUBLIC_WEBRTC_TURN_URL;
  const turnUsername = process.env.NEXT_PUBLIC_WEBRTC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL;
  if (turnUrl && turnUsername && turnCredential) {
    servers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
  }

  return servers;
}

// Bounded, single-attempt ICE restart window (brief §25) — not a retry
// subsystem, just enough to recover from a transient network blip.
export const ICE_RESTART_DELAY_MS = 2000;

// How long to wait, after a call is ACCEPTED and media negotiation has
// started, before treating "still not connected" as a real failure
// (brief §24) — chosen generously (real P2P/TURN negotiation can take a
// few seconds on slower networks) while still bounded.
export const CONNECTION_TIMEOUT_MS = 20_000;
