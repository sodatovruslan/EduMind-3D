"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Call } from "@/lib/call-client";
import type { OutgoingSignal, WebRTCSignalEvent } from "@/lib/useConversationSocket";
import { acquireLocalMedia, MediaAcquisitionError, setAudioEnabled, setVideoEnabled, stopAllTracks } from "@/lib/webrtc/media";
import { PeerConnectionManager, type PeerConnectionState } from "@/lib/webrtc/PeerConnectionManager";
import { claimMediaOwnership, createTabId, LEASE_RENEWAL_INTERVAL_MS, releaseMediaOwnership, renewMediaOwnership } from "@/lib/webrtc/mediaOwnership";
import { CONNECTION_TIMEOUT_MS, ICE_RESTART_DELAY_MS } from "@/lib/webrtc/config";

export type MediaConnectionState = "idle" | "needs-reconnect" | "acquiring-media" | "connecting" | "connected" | "failed" | "closed";

export type MediaErrorReason =
  | "permission-denied"
  | "device-not-found"
  | "device-unavailable"
  | "constraints-not-satisfiable"
  | "connection-timeout"
  | "connection-failed"
  | "remote-media-failed"
  | "unknown";

/**
 * T8 — REAL WebRTC media for ONE active call, layered on top of T7's
 * `useCallSession` (which stays the single source of truth for call
 * LIFECYCLE — this hook only reacts to `activeCall`, it never mutates
 * call status itself). Deliberately distinguishes T7's "call accepted"
 * from THIS hook's own `mediaState` (brief §23) — a call can be
 * `accepted` while media is still `connecting`, `failed`, or (after a
 * page refresh) waiting for an explicit `reconnectToCall()`.
 *
 * Sequencing (brief §5/§6): media is acquired and a peer connection
 * created ONLY after the call is actually ACCEPTED — never during
 * ringing. The caller creates the offer; the callee answers whichever
 * arrives first, its own media or the offer (both are raced safely via
 * `pendingOfferRef`).
 */
export function useWebRTCSession(
  activeCall: Call | null,
  currentUserId: string | undefined,
  sendSignal: (event: OutgoingSignal) => boolean
) {
  const [mediaState, setMediaState] = useState<MediaConnectionState>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [remoteAudioMuted, setRemoteAudioMuted] = useState(false);
  const [remoteVideoDisabled, setRemoteVideoDisabled] = useState(false);
  const [mediaError, setMediaError] = useState<MediaErrorReason | null>(null);
  const [isMediaOwner, setIsMediaOwner] = useState(false);

  const pcRef = useRef<PeerConnectionManager | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const tabIdRef = useRef(createTabId());
  const sawRingingRef = useRef<Set<string>>(new Set());
  const startedForCallIdRef = useRef<Set<string>>(new Set());
  const iceRestartAttemptedRef = useRef<Set<string>>(new Set());
  const pendingOfferRef = useRef<{ sdp: string } | null>(null);
  const ownershipRenewalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMediaOwnerRef = useRef(false);

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  // Single cleanup path (brief §29/§30/§31) — stops local tracks (the
  // critical "browser camera indicator disappears" acceptance criterion),
  // closes the peer connection, releases the multi-tab media lease if we
  // held it, clears every timer. Called on End Call, on a remote-driven
  // terminal status, on decline/cancel-before-media (a no-op there, since
  // nothing was ever acquired), and on unmount.
  const cleanup = useCallback((nextState: MediaConnectionState) => {
    pcRef.current?.close();
    pcRef.current = null;
    stopAllTracks(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    clearConnectionTimeout();
    pendingOfferRef.current = null;
    if (ownershipRenewalIntervalRef.current) {
      clearInterval(ownershipRenewalIntervalRef.current);
      ownershipRenewalIntervalRef.current = null;
    }
    if (isMediaOwnerRef.current && activeCallIdRef.current) {
      releaseMediaOwnership(activeCallIdRef.current, tabIdRef.current);
    }
    isMediaOwnerRef.current = false;
    setIsMediaOwner(false);
    setIsAudioMuted(false);
    setIsVideoDisabled(false);
    setRemoteAudioMuted(false);
    setRemoteVideoDisabled(false);
    setMediaState(nextState);
  }, [clearConnectionTimeout]);

  const startConnectionTimeout = useCallback(
    (callId: string) => {
      clearConnectionTimeout();
      connectionTimeoutRef.current = setTimeout(() => {
        if (activeCallIdRef.current === callId && pcRef.current?.connectionState !== "connected") {
          setMediaState("failed");
          setMediaError("connection-timeout");
        }
      }, CONNECTION_TIMEOUT_MS);
    },
    [clearConnectionTimeout]
  );

  const restartConnection = useCallback(
    async (callId: string) => {
      const pc = pcRef.current;
      if (!pc || activeCallIdRef.current !== callId) return;
      pc.restartIce();
      const offer = await pc.createOffer(true);
      if (activeCallIdRef.current !== callId) return;
      sendSignal({ type: "webrtc:offer", call_id: callId, sdp: offer.sdp ?? "" });
      startConnectionTimeout(callId);
    },
    [sendSignal, startConnectionTimeout]
  );

  const handleConnectionStateChange = useCallback(
    (callId: string, isCaller: boolean, state: PeerConnectionState) => {
      if (activeCallIdRef.current !== callId) return; // stale callback from an already-cleaned-up session
      if (state === "connected") {
        clearConnectionTimeout();
        setMediaState("connected");
        setMediaError(null);
        return;
      }
      if (state === "failed") {
        // ONE bounded recovery attempt (brief §25), offerer-driven only —
        // the answerer just receives the renegotiated offer normally
        // through the same webrtc:offer handling path.
        if (isCaller && !iceRestartAttemptedRef.current.has(callId)) {
          iceRestartAttemptedRef.current.add(callId);
          setTimeout(() => restartConnection(callId), ICE_RESTART_DELAY_MS);
          return;
        }
        setMediaState("failed");
        setMediaError("connection-failed");
      }
    },
    [clearConnectionTimeout, restartConnection]
  );

  const startMediaFlow = useCallback(
    async (call: Call) => {
      if (!currentUserId) return;
      activeCallIdRef.current = call.id;
      const isCaller = call.caller.id === currentUserId;

      const owns = claimMediaOwnership(call.id, tabIdRef.current);
      isMediaOwnerRef.current = owns;
      setIsMediaOwner(owns);
      if (!owns) {
        // Another tab already owns media for this call — this tab just
        // reflects the accepted state, never touches getUserMedia.
        setMediaState("connected");
        return;
      }
      ownershipRenewalIntervalRef.current = setInterval(
        () => renewMediaOwnership(call.id, tabIdRef.current),
        LEASE_RENEWAL_INTERVAL_MS
      );

      setMediaState("acquiring-media");
      setMediaError(null);
      let stream: MediaStream;
      try {
        stream = await acquireLocalMedia(call.call_type);
      } catch (err) {
        const reason = err instanceof MediaAcquisitionError ? err.reason : "unknown";
        if (activeCallIdRef.current === call.id) {
          setMediaError(reason);
          setMediaState("failed");
        }
        sendSignal({ type: "webrtc:media-failed", call_id: call.id, reason });
        return;
      }
      if (activeCallIdRef.current !== call.id) {
        // Call ended/changed while permission prompt was pending — don't
        // resurrect cleaned-up state, just release what we just acquired.
        stopAllTracks(stream);
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = new PeerConnectionManager({
        onIceCandidate: (candidate) => sendSignal({ type: "webrtc:ice-candidate", call_id: call.id, candidate }),
        onRemoteStream: (remote) => setRemoteStream(remote),
        onConnectionStateChange: (state) => handleConnectionStateChange(call.id, isCaller, state),
      });
      pcRef.current = pc;
      pc.addLocalStream(stream);

      setMediaState("connecting");
      startConnectionTimeout(call.id);

      if (isCaller) {
        const offer = await pc.createOffer();
        if (activeCallIdRef.current !== call.id) return;
        sendSignal({ type: "webrtc:offer", call_id: call.id, sdp: offer.sdp ?? "" });
      } else if (pendingOfferRef.current) {
        const sdp = pendingOfferRef.current.sdp;
        pendingOfferRef.current = null;
        const answer = await pc.createAnswer(sdp);
        if (activeCallIdRef.current !== call.id) return;
        sendSignal({ type: "webrtc:answer", call_id: call.id, sdp: answer.sdp ?? "" });
      }
      // else: callee, offer hasn't arrived yet — handleSignalEvent answers
      // it as soon as it does.
    },
    [currentUserId, sendSignal, handleConnectionStateChange, startConnectionTimeout]
  );

  // Drives the whole flow purely off T7's own call state — never
  // duplicates or second-guesses it (brief §2).
  useEffect(() => {
    if (!activeCall) {
      if (activeCallIdRef.current) cleanup("idle");
      activeCallIdRef.current = null;
      return;
    }
    if (activeCall.status === "ringing") {
      sawRingingRef.current.add(activeCall.id);
      return;
    }
    if (activeCall.status === "accepted") {
      if (startedForCallIdRef.current.has(activeCall.id)) return;
      startedForCallIdRef.current.add(activeCall.id);
      activeCallIdRef.current = activeCall.id;
      if (sawRingingRef.current.has(activeCall.id)) {
        startMediaFlow(activeCall);
      } else {
        // Found an already-accepted call on mount/restore (refresh or a
        // reconnect that skipped straight past ringing) — brief §27
        // explicitly forbids auto-acquiring camera/mic here.
        setMediaState("needs-reconnect");
      }
      return;
    }
    // Terminal status (declined/cancelled/missed/ended)
    cleanup("closed");
    activeCallIdRef.current = null;
  }, [activeCall, cleanup, startMediaFlow]);

  // Unmount-only cleanup — independent of activeCall's own lifecycle, so
  // navigating away mid-call can never leave camera/mic silently running
  // (brief §31).
  useEffect(() => {
    return () => {
      cleanup("closed");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignalEvent = useCallback(
    (event: WebRTCSignalEvent) => {
      if (!activeCallIdRef.current || event.call_id !== activeCallIdRef.current) return;
      switch (event.type) {
        case "webrtc:offer": {
          const pc = pcRef.current;
          if (!pc) {
            pendingOfferRef.current = { sdp: event.sdp };
            return;
          }
          pc.createAnswer(event.sdp).then((answer) => {
            if (activeCallIdRef.current !== event.call_id) return;
            sendSignal({ type: "webrtc:answer", call_id: event.call_id, sdp: answer.sdp ?? "" });
          });
          return;
        }
        case "webrtc:answer":
          pcRef.current?.acceptAnswer(event.sdp);
          return;
        case "webrtc:ice-candidate":
          pcRef.current?.addRemoteIceCandidate(event.candidate);
          return;
        case "webrtc:media-failed":
          setMediaState("failed");
          setMediaError("remote-media-failed");
          return;
        case "media:state":
          setRemoteAudioMuted(event.audio_muted);
          setRemoteVideoDisabled(event.video_disabled);
          return;
      }
    },
    [sendSignal]
  );

  const toggleMute = useCallback(() => {
    const next = !isAudioMuted;
    setAudioEnabled(localStreamRef.current, !next);
    setIsAudioMuted(next);
    if (activeCallIdRef.current) {
      sendSignal({ type: "media:state", call_id: activeCallIdRef.current, audio_muted: next, video_disabled: isVideoDisabled });
    }
  }, [isAudioMuted, isVideoDisabled, sendSignal]);

  const toggleCamera = useCallback(() => {
    const next = !isVideoDisabled;
    setVideoEnabled(localStreamRef.current, !next);
    setIsVideoDisabled(next);
    if (activeCallIdRef.current) {
      sendSignal({ type: "media:state", call_id: activeCallIdRef.current, audio_muted: isAudioMuted, video_disabled: next });
    }
  }, [isAudioMuted, isVideoDisabled, sendSignal]);

  // Explicit user action after a refresh finds an already-accepted call
  // (brief §27) — never automatic.
  const reconnectToCall = useCallback(() => {
    if (activeCall && activeCall.status === "accepted") {
      sawRingingRef.current.add(activeCall.id);
      startMediaFlow(activeCall);
    }
  }, [activeCall, startMediaFlow]);

  return {
    mediaState,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoDisabled,
    remoteAudioMuted,
    remoteVideoDisabled,
    mediaError,
    isMediaOwner,
    toggleMute,
    toggleCamera,
    reconnectToCall,
    handleSignalEvent,
  };
}
