// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CallMediaSurface from "./CallMediaSurface";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import type { Call } from "@/lib/call-client";

// isScreenShareSupported() checks for a real getDisplayMedia — jsdom has
// none by default, so tests that need the Share Screen control enabled
// stub one in; tests that don't care leave it absent (disabled state is
// covered separately below).
function stubScreenShareSupport() {
  Object.defineProperty(navigator, "mediaDevices", {
    value: { ...(navigator as unknown as { mediaDevices?: object }).mediaDevices, getDisplayMedia: vi.fn() },
    configurable: true,
  });
}

function fakeStream(): MediaStream {
  return {} as MediaStream;
}

function makeCall(overrides: Partial<Call> = {}): Call {
  return {
    id: "call-1",
    conversation_id: "conv-1",
    caller: { id: "student-1", full_name: "Student One" },
    callee: { id: "teacher-1", full_name: "Teacher One" },
    call_type: "video",
    status: "accepted",
    created_at: "2026-01-01T10:00:00Z",
    answered_at: "2026-01-01T10:00:05Z",
    ended_at: null,
    ...overrides,
  };
}

function renderSurface(props: Partial<React.ComponentProps<typeof CallMediaSurface>> = {}) {
  const defaults: React.ComponentProps<typeof CallMediaSurface> = {
    call: makeCall(),
    isCaller: true,
    localStream: null,
    remoteStream: null,
    isAudioMuted: false,
    isVideoDisabled: false,
    remoteAudioMuted: false,
    remoteVideoDisabled: false,
    isSharingScreen: false,
    remoteSharingScreen: false,
    screenShareError: null,
    onToggleMute: vi.fn(),
    onToggleCamera: vi.fn(),
    onToggleScreenShare: vi.fn(),
    onEnd: vi.fn(),
  };
  return render(
    <LocaleProvider>
      <CallMediaSurface {...defaults} {...props} />
    </LocaleProvider>
  );
}

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
});
afterEach(() => cleanup());

describe("CallMediaSurface — video calls", () => {
  it("renders the remote video as the primary surface and a local preview", () => {
    renderSurface({ call: makeCall({ call_type: "video" }) });
    expect(screen.getByTestId("video-call-surface")).toBeDefined();
    expect(screen.getByTestId("remote-video")).toBeDefined();
    expect(screen.getByTestId("local-video")).toBeDefined();
  });

  it("binds the given MediaStream objects to the video elements", () => {
    const local = fakeStream();
    const remote = fakeStream();
    renderSurface({ call: makeCall({ call_type: "video" }), localStream: local, remoteStream: remote });
    const localVideo = screen.getByTestId("local-video") as HTMLVideoElement;
    const remoteVideo = screen.getByTestId("remote-video") as HTMLVideoElement;
    expect(localVideo.srcObject).toBe(local);
    expect(remoteVideo.srcObject).toBe(remote);
  });

  it("the local preview is muted (no feedback loop) and the remote is not", () => {
    renderSurface({ call: makeCall({ call_type: "video" }) });
    const localVideo = screen.getByTestId("local-video") as HTMLVideoElement;
    const remoteVideo = screen.getByTestId("remote-video") as HTMLVideoElement;
    expect(localVideo.muted).toBe(true);
    expect(remoteVideo.muted).toBe(false);
  });

  it("shows a camera-off overlay (not a frozen frame) when the remote disabled their camera", () => {
    renderSurface({ call: makeCall({ call_type: "video" }), remoteVideoDisabled: true });
    expect(screen.getByTestId("remote-camera-off-overlay")).toBeDefined();
    expect(screen.getByText(ru.calls.remoteCameraOff)).toBeDefined();
  });

  it("does not show the camera-off overlay when the remote camera is on", () => {
    renderSurface({ call: makeCall({ call_type: "video" }), remoteVideoDisabled: false });
    expect(screen.queryByTestId("remote-camera-off-overlay")).toBeNull();
  });

  it("shows a remote-muted indicator when the remote is muted", () => {
    renderSurface({ call: makeCall({ call_type: "video" }), remoteAudioMuted: true });
    expect(screen.getByLabelText(ru.calls.remoteMuted)).toBeDefined();
  });

  it("shows a camera toggle control for video calls", () => {
    renderSurface({ call: makeCall({ call_type: "video" }) });
    expect(screen.getByTestId("toggle-camera")).toBeDefined();
  });
});

describe("CallMediaSurface — audio calls", () => {
  it("shows the audio call surface with an avatar, not a video rectangle", () => {
    renderSurface({ call: makeCall({ call_type: "audio" }) });
    expect(screen.getByTestId("audio-call-surface")).toBeDefined();
    expect(screen.queryByTestId("video-call-surface")).toBeNull();
    expect(screen.queryByTestId("local-video")).toBeNull();
  });

  it("plays real remote audio via an <audio> element bound to the remote stream", () => {
    const remote = fakeStream();
    renderSurface({ call: makeCall({ call_type: "audio" }), remoteStream: remote });
    const audioEl = screen.getByTestId("remote-audio") as HTMLAudioElement;
    expect(audioEl.srcObject).toBe(remote);
  });

  it("does NOT show a camera toggle control for audio calls", () => {
    renderSurface({ call: makeCall({ call_type: "audio" }) });
    expect(screen.queryByTestId("toggle-camera")).toBeNull();
  });

  it("shows the counterpart's initials as an avatar", () => {
    renderSurface({ call: makeCall({ call_type: "audio" }), isCaller: true });
    expect(screen.getByText("TO")).toBeDefined(); // isCaller=true -> other party is the callee, "Teacher One"
  });
});

describe("CallMediaSurface — controls (shared)", () => {
  it("mute button toggles and reports state accessibly (not color alone)", () => {
    const onToggleMute = vi.fn();
    renderSurface({ isAudioMuted: false, onToggleMute });
    const button = screen.getByTestId("toggle-mute");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe(ru.calls.mute);
    fireEvent.click(button);
    expect(onToggleMute).toHaveBeenCalled();
  });

  it("mute button reflects the muted state via aria-pressed and label", () => {
    renderSurface({ isAudioMuted: true });
    const button = screen.getByTestId("toggle-mute");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe(ru.calls.unmute);
  });

  it("camera button toggles and reports state accessibly", () => {
    const onToggleCamera = vi.fn();
    renderSurface({ call: makeCall({ call_type: "video" }), isVideoDisabled: false, onToggleCamera });
    const button = screen.getByTestId("toggle-camera");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(onToggleCamera).toHaveBeenCalled();
  });

  it("end call button is always present and calls onEnd", () => {
    const onEnd = vi.fn();
    renderSurface({ onEnd });
    fireEvent.click(screen.getByTestId("call-end"));
    expect(onEnd).toHaveBeenCalled();
  });

  it("controls are grouped under an accessible label", () => {
    renderSurface();
    expect(screen.getByRole("group", { name: ru.calls.mediaControlsLabel })).toBeDefined();
  });
});

describe("CallMediaSurface — screen sharing (T9)", () => {
  it("the Share Screen control is disabled when the browser has no getDisplayMedia", () => {
    renderSurface({ call: makeCall({ call_type: "video" }) });
    expect(screen.getByTestId("toggle-screen-share")).toHaveProperty("disabled", true);
  });

  it("clicking Share Screen calls onToggleScreenShare", () => {
    stubScreenShareSupport();
    const onToggleScreenShare = vi.fn();
    renderSurface({ call: makeCall({ call_type: "video" }), onToggleScreenShare });
    fireEvent.click(screen.getByTestId("toggle-screen-share"));
    expect(onToggleScreenShare).toHaveBeenCalled();
  });

  it("shows a prominent 'you are sharing' banner with its own Stop Sharing button while sharing", () => {
    stubScreenShareSupport();
    const onToggleScreenShare = vi.fn();
    renderSurface({ call: makeCall({ call_type: "video" }), isSharingScreen: true, onToggleScreenShare });
    expect(screen.getByTestId("local-sharing-banner").textContent).toContain(ru.calls.youAreSharingScreen);
    fireEvent.click(screen.getByTestId("stop-sharing-prominent"));
    expect(onToggleScreenShare).toHaveBeenCalled();
  });

  it("disables Share Screen and explains why when the remote is already sharing", () => {
    stubScreenShareSupport();
    renderSurface({ call: makeCall({ call_type: "video" }), remoteSharingScreen: true });
    const button = screen.getByTestId("toggle-screen-share");
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-label")).toBe(ru.calls.anotherParticipantSharing);
  });

  it("renders the remote's shared screen as the primary surface with a named banner (video call)", () => {
    const remote = fakeStream();
    renderSurface({ call: makeCall({ call_type: "video" }), remoteStream: remote, remoteSharingScreen: true });
    const video = screen.getByTestId("remote-video") as HTMLVideoElement;
    expect(video.srcObject).toBe(remote);
    expect(screen.getByTestId("remote-sharing-banner").textContent).toContain("Teacher One");
  });

  it("suppresses the camera-off overlay while the remote is sharing their screen instead of camera", () => {
    renderSurface({ call: makeCall({ call_type: "video" }), remoteVideoDisabled: true, remoteSharingScreen: true });
    expect(screen.queryByTestId("remote-camera-off-overlay")).toBeNull();
  });

  it("shows a screen-share error message (cancelled) without treating it as a fatal call error", () => {
    renderSurface({ call: makeCall({ call_type: "video" }), screenShareError: "cancelled" });
    expect(screen.getByTestId("screen-share-error").textContent).toContain(ru.calls.screenShareCancelled);
    // Call surface itself is still fully rendered — not replaced by an error state.
    expect(screen.getByTestId("video-call-surface")).toBeDefined();
  });

  it("shows a screen-share error message (failed) for a real getDisplayMedia failure", () => {
    renderSurface({ call: makeCall({ call_type: "video" }), screenShareError: "failed" });
    expect(screen.getByTestId("screen-share-error").textContent).toContain(ru.calls.screenShareFailed);
  });

  it("audio calls: switches from the avatar surface to a real remote <video> surface once the remote starts sharing", () => {
    const remote = fakeStream();
    renderSurface({ call: makeCall({ call_type: "audio" }), remoteStream: remote, remoteSharingScreen: true });
    expect(screen.queryByTestId("audio-call-surface")).toBeNull();
    const video = screen.getByTestId("remote-video") as HTMLVideoElement;
    expect(video.srcObject).toBe(remote);
    expect(screen.getByTestId("audio-call-screen-share-surface")).toBeDefined();
  });

  it("audio calls: shows the sharer's own 'you are sharing' banner without a giant empty video box", () => {
    renderSurface({ call: makeCall({ call_type: "audio" }), isSharingScreen: true });
    expect(screen.getByTestId("local-sharing-banner").textContent).toContain(ru.calls.youAreSharingScreen);
    expect(screen.queryByTestId("remote-video")).toBeNull();
  });

  it("audio calls: reverts to the avatar surface once sharing ends on both sides", () => {
    renderSurface({ call: makeCall({ call_type: "audio" }), isSharingScreen: false, remoteSharingScreen: false });
    expect(screen.getByTestId("audio-call-surface")).toBeDefined();
  });

  it("Share Screen is offered from audio calls too, not only video calls", () => {
    stubScreenShareSupport();
    renderSurface({ call: makeCall({ call_type: "audio" }) });
    expect(screen.getByTestId("toggle-screen-share")).toBeDefined();
  });
});
