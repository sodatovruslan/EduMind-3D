// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Call } from "@/lib/call-client";

const acquireLocalMediaMock = vi.fn();
const setAudioEnabledMock = vi.fn();
const setVideoEnabledMock = vi.fn();
const stopAllTracksMock = vi.fn();
class MockMediaAcquisitionError extends Error {
  reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.reason = reason;
  }
}
vi.mock("@/lib/webrtc/media", () => ({
  acquireLocalMedia: (...args: unknown[]) => acquireLocalMediaMock(...args),
  setAudioEnabled: (...args: unknown[]) => setAudioEnabledMock(...args),
  setVideoEnabled: (...args: unknown[]) => setVideoEnabledMock(...args),
  stopAllTracks: (...args: unknown[]) => stopAllTracksMock(...args),
  MediaAcquisitionError: MockMediaAcquisitionError,
}));

const createOfferMock = vi.fn();
const createAnswerMock = vi.fn();
const acceptAnswerMock = vi.fn();
const addLocalStreamMock = vi.fn();
const addRemoteIceCandidateMock = vi.fn();
const restartIceMock = vi.fn();
const closeMock = vi.fn();
let capturedPcOptions: {
  onIceCandidate: (c: unknown) => void;
  onRemoteStream: (s: unknown) => void;
  onConnectionStateChange: (s: string) => void;
} | null = null;

vi.mock("@/lib/webrtc/PeerConnectionManager", () => ({
  PeerConnectionManager: class {
    constructor(options: typeof capturedPcOptions) {
      capturedPcOptions = options;
    }
    createOffer = createOfferMock;
    createAnswer = createAnswerMock;
    acceptAnswer = acceptAnswerMock;
    addLocalStream = addLocalStreamMock;
    addRemoteIceCandidate = addRemoteIceCandidateMock;
    restartIce = restartIceMock;
    close = closeMock;
    connectionState = "new";
  },
}));

const claimMediaOwnershipMock = vi.fn();
const renewMediaOwnershipMock = vi.fn();
const releaseMediaOwnershipMock = vi.fn();
vi.mock("@/lib/webrtc/mediaOwnership", () => ({
  claimMediaOwnership: (...args: unknown[]) => claimMediaOwnershipMock(...args),
  renewMediaOwnership: (...args: unknown[]) => renewMediaOwnershipMock(...args),
  releaseMediaOwnership: (...args: unknown[]) => releaseMediaOwnershipMock(...args),
  createTabId: () => "tab-1",
  LEASE_RENEWAL_INTERVAL_MS: 5000,
}));

vi.mock("@/lib/webrtc/config", () => ({
  getIceServers: () => [],
  ICE_RESTART_DELAY_MS: 50,
  CONNECTION_TIMEOUT_MS: 200,
}));

const { useWebRTCSession } = await import("@/lib/useWebRTCSession");

function fakeStream(): MediaStream {
  return { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream;
}

function makeCall(overrides: Partial<Call> = {}): Call {
  return {
    id: "call-1",
    conversation_id: "conv-1",
    caller: { id: "student-1", full_name: "Student One" },
    callee: { id: "teacher-1", full_name: "Teacher One" },
    call_type: "video",
    status: "ringing",
    created_at: new Date().toISOString(),
    answered_at: null,
    ended_at: null,
    ...overrides,
  };
}

describe("useWebRTCSession", () => {
  beforeEach(() => {
    acquireLocalMediaMock.mockReset().mockResolvedValue(fakeStream());
    setAudioEnabledMock.mockReset();
    setVideoEnabledMock.mockReset();
    stopAllTracksMock.mockReset();
    createOfferMock.mockReset().mockResolvedValue({ sdp: "offer-sdp" });
    createAnswerMock.mockReset().mockResolvedValue({ sdp: "answer-sdp" });
    acceptAnswerMock.mockReset();
    addLocalStreamMock.mockReset();
    addRemoteIceCandidateMock.mockReset();
    restartIceMock.mockReset();
    closeMock.mockReset();
    claimMediaOwnershipMock.mockReset().mockReturnValue(true);
    renewMediaOwnershipMock.mockReset();
    releaseMediaOwnershipMock.mockReset();
    capturedPcOptions = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not acquire media while the call is only ringing", async () => {
    const sendSignal = vi.fn();
    renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    expect(acquireLocalMediaMock).not.toHaveBeenCalled();
  });

  it("caller: acquires media and creates an offer once the call transitions ringing -> accepted", async () => {
    const sendSignal = vi.fn();
    const { rerender } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});

    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    expect(acquireLocalMediaMock).toHaveBeenCalledWith("video");
    expect(addLocalStreamMock).toHaveBeenCalled();
    expect(createOfferMock).toHaveBeenCalled();
    expect(sendSignal).toHaveBeenCalledWith({ type: "webrtc:offer", call_id: "call-1", sdp: "offer-sdp" });
  });

  it("callee: creates an answer once the offer arrives after the call is accepted", async () => {
    const sendSignal = vi.fn();
    const { result, rerender } = renderHook(({ call }) => useWebRTCSession(call, "teacher-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    expect(acquireLocalMediaMock).toHaveBeenCalledWith("video");
    expect(createOfferMock).not.toHaveBeenCalled(); // callee never offers

    act(() => {
      result.current.handleSignalEvent({ type: "webrtc:offer", call_id: "call-1", user_id: "student-1", sdp: "remote-offer" });
    });
    await act(async () => {});

    expect(createAnswerMock).toHaveBeenCalledWith("remote-offer");
    expect(sendSignal).toHaveBeenCalledWith({ type: "webrtc:answer", call_id: "call-1", sdp: "answer-sdp" });
  });

  it("callee: an offer that arrives BEFORE local media is ready is queued and answered once ready", async () => {
    let resolveMedia!: (stream: MediaStream) => void;
    acquireLocalMediaMock.mockReset().mockReturnValue(
      new Promise<MediaStream>((resolve) => {
        resolveMedia = resolve;
      })
    );
    const sendSignal = vi.fn();
    const { result, rerender } = renderHook(({ call }) => useWebRTCSession(call, "teacher-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {}); // media acquisition now in flight, not yet resolved

    act(() => {
      result.current.handleSignalEvent({ type: "webrtc:offer", call_id: "call-1", user_id: "student-1", sdp: "remote-offer" });
    });
    expect(createAnswerMock).not.toHaveBeenCalled(); // no peer connection yet

    await act(async () => {
      resolveMedia(fakeStream());
    });

    expect(createAnswerMock).toHaveBeenCalledWith("remote-offer");
  });

  it("refresh restoration: an already-accepted call found on mount needs an explicit reconnect, never auto-acquires media", async () => {
    const sendSignal = vi.fn();
    const { result } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) as Call | null },
    });
    await act(async () => {});

    expect(acquireLocalMediaMock).not.toHaveBeenCalled();
    expect(result.current.mediaState).toBe("needs-reconnect");
  });

  it("reconnectToCall() is the only thing that starts media after a needs-reconnect state", async () => {
    const sendSignal = vi.fn();
    const call = makeCall({ status: "accepted", answered_at: new Date().toISOString() });
    const { result } = renderHook(({ c }) => useWebRTCSession(c, "student-1", sendSignal), { initialProps: { c: call as Call | null } });
    await act(async () => {});
    expect(result.current.mediaState).toBe("needs-reconnect");

    await act(async () => {
      result.current.reconnectToCall();
    });

    expect(acquireLocalMediaMock).toHaveBeenCalledWith("video");
  });

  it("permission denied: reports a failed state with the right reason and notifies the other side", async () => {
    acquireLocalMediaMock.mockReset().mockRejectedValue(new MockMediaAcquisitionError("permission-denied", "nope"));
    const sendSignal = vi.fn();
    const { result, rerender } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    expect(result.current.mediaState).toBe("failed");
    expect(result.current.mediaError).toBe("permission-denied");
    expect(sendSignal).toHaveBeenCalledWith({ type: "webrtc:media-failed", call_id: "call-1", reason: "permission-denied" });
  });

  it("multi-tab: a non-owning tab never calls acquireLocalMedia", async () => {
    claimMediaOwnershipMock.mockReturnValue(false);
    const sendSignal = vi.fn();
    const { result, rerender } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    expect(acquireLocalMediaMock).not.toHaveBeenCalled();
    expect(result.current.isMediaOwner).toBe(false);
  });

  it("toggleMute updates the local track and notifies the other side, without touching the peer connection", async () => {
    const sendSignal = vi.fn();
    const { result, rerender } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    act(() => {
      result.current.toggleMute();
    });

    expect(setAudioEnabledMock).toHaveBeenCalledWith(expect.anything(), false);
    expect(sendSignal).toHaveBeenCalledWith({ type: "media:state", call_id: "call-1", audio_muted: true, video_disabled: false });
    expect(result.current.isAudioMuted).toBe(true);
  });

  it("toggleCamera updates the local track and notifies the other side", async () => {
    const sendSignal = vi.fn();
    const { result, rerender } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    act(() => {
      result.current.toggleCamera();
    });

    expect(setVideoEnabledMock).toHaveBeenCalledWith(expect.anything(), false);
    expect(result.current.isVideoDisabled).toBe(true);
  });

  it("incoming media:state updates the remote party's mute/camera flags", async () => {
    const sendSignal = vi.fn();
    const { result, rerender } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    act(() => {
      result.current.handleSignalEvent({ type: "media:state", call_id: "call-1", user_id: "teacher-1", audio_muted: true, video_disabled: true });
    });

    expect(result.current.remoteAudioMuted).toBe(true);
    expect(result.current.remoteVideoDisabled).toBe(true);
  });

  it("cleans up local tracks and the peer connection once the call ends", async () => {
    const sendSignal = vi.fn();
    const { rerender } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    rerender({ call: makeCall({ status: "ended", ended_at: new Date().toISOString() }) });

    expect(stopAllTracksMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();
    expect(releaseMediaOwnershipMock).toHaveBeenCalledWith("call-1", "tab-1");
  });

  it("cleans up on unmount even if the call is still active (brief §31)", async () => {
    const sendSignal = vi.fn();
    const { rerender, unmount } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    unmount();

    expect(stopAllTracksMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();
  });

  it("declined/cancelled before accept never touches media at all (nothing to clean up)", async () => {
    const sendSignal = vi.fn();
    const { rerender } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "cancelled", ended_at: new Date().toISOString() }) });
    await act(async () => {});

    expect(acquireLocalMediaMock).not.toHaveBeenCalled();
    // cleanup() unconditionally calls stopAllTracks(localStreamRef.current)
    // as part of its single-path guarantee — but since media was never
    // acquired, that ref is still null, and stopAllTracks(null) is a
    // documented no-op (see webrtc/media.test.ts), never a real track stop.
    expect(stopAllTracksMock).toHaveBeenCalledWith(null);
    expect(closeMock).not.toHaveBeenCalled();
  });

  it("a connection that never reaches 'connected' within the timeout is reported as failed", async () => {
    vi.useFakeTimers();
    const sendSignal = vi.fn();
    const { result, rerender } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    await act(async () => {
      vi.advanceTimersByTime(250); // past the mocked 200ms CONNECTION_TIMEOUT_MS
    });

    expect(result.current.mediaState).toBe("failed");
    expect(result.current.mediaError).toBe("connection-timeout");
  });

  it("reaching 'connected' clears the timeout and reports the connected state", async () => {
    const sendSignal = vi.fn();
    const { result, rerender } = renderHook(({ call }) => useWebRTCSession(call, "student-1", sendSignal), {
      initialProps: { call: makeCall({ status: "ringing" }) as Call | null },
    });
    await act(async () => {});
    rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString() }) });
    await act(async () => {});

    act(() => {
      capturedPcOptions?.onConnectionStateChange("connected");
    });

    expect(result.current.mediaState).toBe("connected");
  });
});
