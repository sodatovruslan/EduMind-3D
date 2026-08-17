// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Call } from "@/lib/call-client";
import type { OutgoingSignal } from "@/lib/useConversationSocket";

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
const replaceVideoTrackMock = vi.fn();
const addVideoTrackMock = vi.fn();
const removeVideoTrackMock = vi.fn();
const rollbackMock = vi.fn();
let mockSignalingState = "stable";
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
    replaceVideoTrack = replaceVideoTrackMock;
    addVideoTrack = addVideoTrackMock;
    removeVideoTrack = removeVideoTrackMock;
    rollback = rollbackMock;
    connectionState = "new";
    get signalingState() {
      return mockSignalingState;
    }
  },
}));

const acquireScreenStreamMock = vi.fn();
class MockScreenShareAcquisitionError extends Error {
  reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.reason = reason;
  }
}
vi.mock("@/lib/webrtc/screenShare", () => ({
  acquireScreenStream: (...args: unknown[]) => acquireScreenStreamMock(...args),
  ScreenShareAcquisitionError: MockScreenShareAcquisitionError,
  isScreenShareSupported: () => true,
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

function fakeStream(withVideoTrack = false): MediaStream {
  const videoTracks = withVideoTrack ? [{ kind: "video", stop: vi.fn(), enabled: true }] : [];
  return { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => videoTracks } as unknown as MediaStream;
}

function fakeScreenStream(): MediaStream {
  const track = { kind: "video", stop: vi.fn(), onended: null as (() => void) | null };
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
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
    replaceVideoTrackMock.mockReset().mockResolvedValue(undefined);
    addVideoTrackMock.mockReset().mockReturnValue({ id: "screen-sender" });
    removeVideoTrackMock.mockReset();
    rollbackMock.mockReset().mockResolvedValue(undefined);
    mockSignalingState = "stable";
    acquireScreenStreamMock.mockReset().mockResolvedValue(fakeScreenStream());
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

async function connectCall(userId: string, sendSignal: (event: OutgoingSignal) => boolean, callOverrides: Partial<Call> = {}) {
  const utils = renderHook(({ call }) => useWebRTCSession(call, userId, sendSignal), {
    initialProps: { call: makeCall({ status: "ringing", ...callOverrides }) as Call | null },
  });
  await act(async () => {});
  utils.rerender({ call: makeCall({ status: "accepted", answered_at: new Date().toISOString(), ...callOverrides }) });
  await act(async () => {});
  act(() => {
    capturedPcOptions?.onConnectionStateChange("connected");
  });
  return utils;
}

describe("useWebRTCSession — screen sharing (T9)", () => {
  beforeEach(() => {
    acquireLocalMediaMock.mockReset().mockResolvedValue(fakeStream(true));
    setAudioEnabledMock.mockReset();
    setVideoEnabledMock.mockReset();
    stopAllTracksMock.mockReset();
    createOfferMock.mockReset().mockResolvedValue({ sdp: "offer-sdp" });
    createAnswerMock.mockReset().mockResolvedValue({ sdp: "answer-sdp" });
    acceptAnswerMock.mockReset().mockResolvedValue(undefined);
    addLocalStreamMock.mockReset();
    addRemoteIceCandidateMock.mockReset();
    restartIceMock.mockReset();
    closeMock.mockReset();
    claimMediaOwnershipMock.mockReset().mockReturnValue(true);
    renewMediaOwnershipMock.mockReset();
    releaseMediaOwnershipMock.mockReset();
    capturedPcOptions = null;
    replaceVideoTrackMock.mockReset().mockResolvedValue(undefined);
    addVideoTrackMock.mockReset().mockReturnValue({ id: "screen-sender" });
    removeVideoTrackMock.mockReset();
    rollbackMock.mockReset().mockResolvedValue(undefined);
    mockSignalingState = "stable";
    acquireScreenStreamMock.mockReset().mockResolvedValue(fakeScreenStream());
  });
  afterEach(() => vi.useRealTimers());

  it("video call: Share Screen swaps the sender's track in place, no renegotiation", async () => {
    const sendSignal = vi.fn();
    const { result } = await connectCall("student-1", sendSignal, { call_type: "video" });
    createOfferMock.mockClear();

    await act(async () => {
      await result.current.toggleScreenShare();
    });

    expect(acquireScreenStreamMock).toHaveBeenCalled();
    expect(replaceVideoTrackMock).toHaveBeenCalled();
    expect(createOfferMock).not.toHaveBeenCalled(); // no renegotiation for the replaceTrack path
    expect(addVideoTrackMock).not.toHaveBeenCalled();
    expect(result.current.isSharingScreen).toBe(true);
    expect(sendSignal).toHaveBeenCalledWith({ type: "screen-share:started", call_id: "call-1" });
  });

  it("video call: Stop Sharing restores the camera track via replaceVideoTrack", async () => {
    const sendSignal = vi.fn();
    const { result } = await connectCall("student-1", sendSignal, { call_type: "video" });
    await act(async () => {
      await result.current.toggleScreenShare();
    });
    replaceVideoTrackMock.mockClear();
    sendSignal.mockClear();

    await act(async () => {
      await result.current.toggleScreenShare();
    });

    expect(replaceVideoTrackMock).toHaveBeenCalled(); // called again, this time with the camera track
    expect(result.current.isSharingScreen).toBe(false);
    expect(sendSignal).toHaveBeenCalledWith({ type: "screen-share:stopped", call_id: "call-1" });
  });

  it("audio call: Share Screen adds a new video track and renegotiates via the normal offer path", async () => {
    const sendSignal = vi.fn();
    const { result } = await connectCall("student-1", sendSignal, { call_type: "audio" });
    createOfferMock.mockClear();

    await act(async () => {
      await result.current.toggleScreenShare();
    });

    expect(addVideoTrackMock).toHaveBeenCalled();
    expect(replaceVideoTrackMock).not.toHaveBeenCalled();
    expect(createOfferMock).toHaveBeenCalled();
    expect(sendSignal).toHaveBeenCalledWith({ type: "webrtc:offer", call_id: "call-1", sdp: "offer-sdp" });
    expect(sendSignal).toHaveBeenCalledWith({ type: "screen-share:started", call_id: "call-1" });
  });

  it("audio call: Stop Sharing removes the video track and renegotiates back to audio-only", async () => {
    const sendSignal = vi.fn();
    const { result } = await connectCall("student-1", sendSignal, { call_type: "audio" });
    await act(async () => {
      await result.current.toggleScreenShare();
    });
    createOfferMock.mockClear();

    await act(async () => {
      await result.current.toggleScreenShare();
    });

    expect(removeVideoTrackMock).toHaveBeenCalledWith({ id: "screen-sender" });
    expect(createOfferMock).toHaveBeenCalled(); // renegotiated back down
    expect(result.current.isSharingScreen).toBe(false);
  });

  it("the browser's native 'Stop sharing' control (track.onended) behaves exactly like clicking Stop Sharing", async () => {
    const screenTrack = { kind: "video", stop: vi.fn(), onended: null as (() => void) | null };
    acquireScreenStreamMock.mockResolvedValue({ getTracks: () => [screenTrack], getVideoTracks: () => [screenTrack] });
    const sendSignal = vi.fn();
    const { result } = await connectCall("student-1", sendSignal, { call_type: "video" });

    await act(async () => {
      await result.current.toggleScreenShare();
    });
    expect(result.current.isSharingScreen).toBe(true);

    await act(async () => {
      screenTrack.onended?.();
    });

    expect(result.current.isSharingScreen).toBe(false);
    expect(sendSignal).toHaveBeenCalledWith({ type: "screen-share:stopped", call_id: "call-1" });
  });

  it("picker Cancel does not end the call or set a fatal media error — just a screen-share error", async () => {
    acquireScreenStreamMock.mockRejectedValue(new MockScreenShareAcquisitionError("cancelled", "Screen sharing cancelled"));
    const sendSignal = vi.fn();
    const { result } = await connectCall("student-1", sendSignal, { call_type: "video" });

    await act(async () => {
      await result.current.toggleScreenShare();
    });

    expect(result.current.isSharingScreen).toBe(false);
    expect(result.current.screenShareError).toBe("cancelled");
    expect(result.current.mediaState).toBe("connected"); // call itself is unaffected
  });

  it("a genuine getDisplayMedia failure is reported without touching the call", async () => {
    acquireScreenStreamMock.mockRejectedValue(new MockScreenShareAcquisitionError("failed", "boom"));
    const sendSignal = vi.fn();
    const { result } = await connectCall("student-1", sendSignal, { call_type: "video" });

    await act(async () => {
      await result.current.toggleScreenShare();
    });

    expect(result.current.screenShareError).toBe("failed");
    expect(result.current.mediaState).toBe("connected");
  });

  it("remote screen-share:started/stopped signals update remoteSharingScreen", async () => {
    const sendSignal = vi.fn();
    const { result } = await connectCall("student-1", sendSignal, { call_type: "video" });

    act(() => {
      result.current.handleSignalEvent({ type: "screen-share:started", call_id: "call-1", user_id: "teacher-1" });
    });
    expect(result.current.remoteSharingScreen).toBe(true);

    act(() => {
      result.current.handleSignalEvent({ type: "screen-share:stopped", call_id: "call-1", user_id: "teacher-1" });
    });
    expect(result.current.remoteSharingScreen).toBe(false);
  });

  it("ownership tie-break: the callee auto-stops its own share if it learns the caller is ALSO sharing", async () => {
    const sendSignal = vi.fn();
    // student-1 is the caller in makeCall() — use the callee (teacher-1) here.
    const { result } = await connectCall("teacher-1", sendSignal, { call_type: "video" });

    await act(async () => {
      await result.current.toggleScreenShare();
    });
    expect(result.current.isSharingScreen).toBe(true);
    sendSignal.mockClear();

    act(() => {
      result.current.handleSignalEvent({ type: "screen-share:started", call_id: "call-1", user_id: "student-1" });
    });
    await act(async () => {});

    expect(result.current.isSharingScreen).toBe(false); // yielded — caller wins
    expect(sendSignal).toHaveBeenCalledWith({ type: "screen-share:stopped", call_id: "call-1" });
  });

  it("Share Screen is a no-op while the remote is already sharing", async () => {
    const sendSignal = vi.fn();
    const { result } = await connectCall("student-1", sendSignal, { call_type: "video" });
    act(() => {
      result.current.handleSignalEvent({ type: "screen-share:started", call_id: "call-1", user_id: "teacher-1" });
    });

    await act(async () => {
      await result.current.toggleScreenShare();
    });

    expect(acquireScreenStreamMock).not.toHaveBeenCalled();
    expect(result.current.isSharingScreen).toBe(false);
  });

  it("End Call cleanup stops the screen stream along with everything else", async () => {
    const sendSignal = vi.fn();
    const { result, rerender } = await connectCall("student-1", sendSignal, { call_type: "video" });
    await act(async () => {
      await result.current.toggleScreenShare();
    });
    stopAllTracksMock.mockClear();

    rerender({ call: makeCall({ call_type: "video", status: "ended", ended_at: new Date().toISOString() }) });

    // stopAllTracks is called for BOTH the local camera/mic stream and the
    // screen stream during a single cleanup() pass.
    expect(stopAllTracksMock).toHaveBeenCalledTimes(2);
  });
});
