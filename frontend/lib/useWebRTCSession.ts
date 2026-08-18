"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, CallType } from "@/lib/call-client";
import type { OutgoingSignal, WebRTCSignalEvent } from "@/lib/useConversationSocket";
import { acquireLocalMedia, MediaAcquisitionError, setAudioEnabled, setVideoEnabled, stopAllTracks } from "@/lib/webrtc/media";
import { PeerConnectionManager, type PeerConnectionState } from "@/lib/webrtc/PeerConnectionManager";
import { claimMediaOwnership, createTabId, LEASE_RENEWAL_INTERVAL_MS, releaseMediaOwnership, renewMediaOwnership } from "@/lib/webrtc/mediaOwnership";
import { CONNECTION_TIMEOUT_MS, ICE_RESTART_DELAY_MS } from "@/lib/webrtc/config";
import { acquireScreenStream, ScreenShareAcquisitionError, type ScreenShareFailureReason } from "@/lib/webrtc/screenShare";

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
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [remoteSharingScreen, setRemoteSharingScreen] = useState(false);
  const [screenShareError, setScreenShareError] = useState<ScreenShareFailureReason | null>(null);

  const pcRef = useRef<PeerConnectionManager | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const callTypeRef = useRef<CallType | null>(null);
  const isCallerRef = useRef(false);
  const tabIdRef = useRef(createTabId());
  const sawRingingRef = useRef<Set<string>>(new Set());
  const startedForCallIdRef = useRef<Set<string>>(new Set());
  const iceRestartAttemptedRef = useRef<Set<string>>(new Set());
  const pendingOfferRef = useRef<{ sdp: string } | null>(null);
  const ownershipRenewalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMediaOwnerRef = useRef(false);
  // The userId a media lease was actually claimed under — read back by
  // cleanup() for release, independent of whatever `currentUserId` the
  // hook happens to be called with by the time cleanup runs.
  const ownedForUserIdRef = useRef<string | null>(null);
  // T9 — screen sharing (extends T8's PeerConnectionManager, never a
  // second RTCPeerConnection). `screenStreamRef` is the local capture;
  // `screenSenderRef` is only used for the audio-call add/removeTrack
  // path (video calls swap the existing sender in place via
  // replaceVideoTrack, no sender bookkeeping needed).
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenSenderRef = useRef<RTCRtpSender | null>(null);
  // Perfect-negotiation-lite (brief §8/§30): only ever exercised by two
  // audio-call renegotiation offers colliding (video-call sharing uses
  // replaceTrack, which never renegotiates and so never collides). The
  // caller is impolite (wins collisions) — the SAME stable, call-derived
  // rule also used as the ephemeral screen-share ownership tie-break.
  const politeRef = useRef(false);
  const makingOfferRef = useRef(false);

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
    if (isMediaOwnerRef.current && activeCallIdRef.current && ownedForUserIdRef.current) {
      releaseMediaOwnership(activeCallIdRef.current, ownedForUserIdRef.current, tabIdRef.current);
    }
    ownedForUserIdRef.current = null;
    isMediaOwnerRef.current = false;
    setIsMediaOwner(false);
    setIsAudioMuted(false);
    setIsVideoDisabled(false);
    setRemoteAudioMuted(false);
    setRemoteVideoDisabled(false);
    // T9 — screen capture must be included in every cleanup path (brief
    // §24/§25/§26/§29): End Call, remote-driven terminal status, and
    // unmount all funnel through this single function already.
    stopAllTracks(screenStreamRef.current);
    screenStreamRef.current = null;
    screenSenderRef.current = null;
    makingOfferRef.current = false;
    setIsSharingScreen(false);
    setRemoteSharingScreen(false);
    setScreenShareError(null);
    callTypeRef.current = null;
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

  // T9 — the SAME offer/answer path T8 already uses for the initial
  // connection and for ICE-restart recovery, reused a third time for
  // screen-share renegotiation (brief §8: "не строить гигантский
  // signaling framework"). `makingOfferRef` feeds the glare check in
  // handleSignalEvent's "webrtc:offer" case below.
  const renegotiate = useCallback(
    async (callId: string) => {
      const pc = pcRef.current;
      if (!pc || activeCallIdRef.current !== callId) return;
      makingOfferRef.current = true;
      try {
        const offer = await pc.createOffer();
        if (activeCallIdRef.current !== callId) return;
        sendSignal({ type: "webrtc:offer", call_id: callId, sdp: offer.sdp ?? "" });
      } finally {
        makingOfferRef.current = false;
      }
    },
    [sendSignal]
  );

  const startMediaFlow = useCallback(
    async (call: Call) => {
      if (!currentUserId) return;
      activeCallIdRef.current = call.id;
      const isCaller = call.caller.id === currentUserId;
      isCallerRef.current = isCaller;
      callTypeRef.current = call.call_type;
      politeRef.current = !isCaller;

      const owns = claimMediaOwnership(call.id, currentUserId, tabIdRef.current);
      isMediaOwnerRef.current = owns;
      ownedForUserIdRef.current = owns ? currentUserId : null;
      setIsMediaOwner(owns);
      if (!owns) {
        // Another tab already owns media for this call — this tab just
        // reflects the accepted state, never touches getUserMedia.
        setMediaState("connected");
        return;
      }
      ownershipRenewalIntervalRef.current = setInterval(
        () => renewMediaOwnership(call.id, currentUserId, tabIdRef.current),
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

  // T9 — brief §12: stop always fully restores state, whether triggered
  // by the user's own "Stop Sharing" click, the browser's native "Stop
  // sharing" bar (via `track.onended`, wired below), losing an ownership
  // tie-break, or being folded into `cleanup()`. Deliberately reads
  // everything through refs (never `activeCall`/react state) so a
  // `track.onended` callback captured once at share-start time is never
  // stale.
  const stopScreenShare = useCallback(
    async (notifyRemote = true) => {
      const stream = screenStreamRef.current;
      if (!stream) return;
      stopAllTracks(stream);
      screenStreamRef.current = null;
      const pc = pcRef.current;
      const callId = activeCallIdRef.current;
      if (pc && callId) {
        try {
          if (callTypeRef.current === "video") {
            // Camera track was never stopped (brief §5/§29 — kept alive
            // in the background so Stop Sharing is instant, no repeat
            // getUserMedia/permission prompt); its `.enabled` already
            // reflects whatever the user's mute/camera-off toggle set
            // most recently, DURING sharing included, so simply putting
            // it back on the wire is already the correct, deterministic
            // "current intended state" (brief §29), not a stale snapshot.
            const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
            if (cameraTrack) await pc.replaceVideoTrack(cameraTrack);
          } else if (screenSenderRef.current) {
            pc.removeVideoTrack(screenSenderRef.current);
            await renegotiate(callId);
          }
        } catch {
          // Best-effort restore — a genuine connection-level failure is
          // surfaced through the existing WebRTC failure/timeout path,
          // not duplicated here.
        }
      }
      screenSenderRef.current = null;
      setIsSharingScreen(false);
      setScreenShareError(null);
      if (notifyRemote && callId) {
        sendSignal({ type: "screen-share:stopped", call_id: callId });
      }
    },
    [renegotiate, sendSignal]
  );

  // T9 — explicit "Share Screen" click only (brief §2/§3). Video calls
  // swap the existing video sender in place (no renegotiation, brief
  // §4); audio calls add a new video track, which does require
  // renegotiation (brief §7) via the same offer/answer path as everything
  // else in this hook.
  const startScreenShare = useCallback(async () => {
    const call = activeCall;
    if (!call || mediaState !== "connected" || !isMediaOwnerRef.current) return;
    if (screenStreamRef.current || remoteSharingScreen) return;
    setScreenShareError(null);
    let stream: MediaStream;
    try {
      stream = await acquireScreenStream();
    } catch (err) {
      const reason = err instanceof ScreenShareAcquisitionError ? err.reason : "failed";
      setScreenShareError(reason);
      return;
    }
    if (activeCallIdRef.current !== call.id || !pcRef.current) {
      // Call ended/changed while the picker was open.
      stopAllTracks(stream);
      return;
    }
    const track = stream.getVideoTracks()[0];
    // Browser-native "Stop sharing" bar (brief §12) — must behave
    // identically to clicking our own Stop Sharing button.
    track.onended = () => {
      stopScreenShare();
    };
    screenStreamRef.current = stream;
    try {
      if (call.call_type === "video") {
        await pcRef.current.replaceVideoTrack(track);
      } else {
        screenSenderRef.current = pcRef.current.addVideoTrack(track);
        await renegotiate(call.id);
      }
    } catch {
      stopAllTracks(stream);
      screenStreamRef.current = null;
      screenSenderRef.current = null;
      setScreenShareError("failed");
      return;
    }
    setIsSharingScreen(true);
    sendSignal({ type: "screen-share:started", call_id: call.id });
  }, [activeCall, mediaState, remoteSharingScreen, renegotiate, sendSignal, stopScreenShare]);

  const toggleScreenShare = useCallback(() => {
    if (isSharingScreen) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  }, [isSharingScreen, startScreenShare, stopScreenShare]);

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
          // T9 — perfect-negotiation-lite glare guard (brief §8/§30). A
          // true collision only happens when a renegotiation offer we
          // just sent (screen-share start/stop on an audio call) crosses
          // one arriving from the other side. The impolite peer (caller)
          // just ignores the incoming offer and keeps its own in flight;
          // the polite peer (callee) rolls its own back and accepts the
          // incoming one instead. For every other case (the very first
          // offer, an offerer-only ICE restart) `stable` is already true
          // here and this is a no-op passthrough to the existing flow.
          const collision = makingOfferRef.current || pc.signalingState !== "stable";
          if (collision && !politeRef.current) return;
          const accept = collision
            ? pc.rollback().then(() => pc.createAnswer(event.sdp))
            : pc.createAnswer(event.sdp);
          accept
            .then((answer) => {
              if (activeCallIdRef.current !== event.call_id) return;
              sendSignal({ type: "webrtc:answer", call_id: event.call_id, sdp: answer.sdp ?? "" });
            })
            .catch(() => undefined);
          return;
        }
        case "webrtc:answer":
          // A rolled-back local offer can make an in-flight answer land
          // in the wrong signaling state — harmless, matches the same
          // "ignore, the other side already reconciled" pattern used for
          // ICE candidates.
          pcRef.current?.acceptAnswer(event.sdp).catch(() => undefined);
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
        case "screen-share:started":
          setRemoteSharingScreen(true);
          // Ownership tie-break for the video-call case (no SDP-level
          // negotiation to resolve it for us there): if I'm ALSO sharing
          // and I'm not the priority side, yield.
          if (screenStreamRef.current && !isCallerRef.current) {
            stopScreenShare();
          }
          return;
        case "screen-share:stopped":
          setRemoteSharingScreen(false);
          return;
      }
    },
    [sendSignal, stopScreenShare]
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
    isSharingScreen,
    remoteSharingScreen,
    screenShareError,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    reconnectToCall,
    handleSignalEvent,
  };
}
