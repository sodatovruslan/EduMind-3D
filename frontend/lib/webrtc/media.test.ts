import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireLocalMedia, MediaAcquisitionError, setAudioEnabled, setVideoEnabled, stopAllTracks } from "./media";

function fakeTrack(): MediaStreamTrack {
  return { enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack;
}

function fakeStream(audioTracks: MediaStreamTrack[], videoTracks: MediaStreamTrack[]): MediaStream {
  return {
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
    getTracks: () => [...audioTracks, ...videoTracks],
  } as unknown as MediaStream;
}

describe("acquireLocalMedia — constraints (brief §4)", () => {
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getUserMediaMock = vi.fn();
    Object.defineProperty(global, "navigator", {
      value: { mediaDevices: { getUserMedia: getUserMediaMock } },
      configurable: true,
    });
  });

  it("requests audio only, and NEVER requests camera, for an audio call", async () => {
    getUserMediaMock.mockResolvedValue(fakeStream([fakeTrack()], []));
    await acquireLocalMedia("audio");
    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it("requests both audio and video (front camera) for a video call", async () => {
    getUserMediaMock.mockResolvedValue(fakeStream([fakeTrack()], [fakeTrack()]));
    await acquireLocalMedia("video");
    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true, video: { facingMode: "user" } });
  });

  it("maps NotAllowedError to permission-denied", async () => {
    getUserMediaMock.mockRejectedValue(Object.assign(new Error("nope"), { name: "NotAllowedError" }));
    await expect(acquireLocalMedia("audio")).rejects.toMatchObject({ reason: "permission-denied" });
  });

  it("maps NotFoundError to device-not-found", async () => {
    getUserMediaMock.mockRejectedValue(Object.assign(new Error("nope"), { name: "NotFoundError" }));
    await expect(acquireLocalMedia("audio")).rejects.toMatchObject({ reason: "device-not-found" });
  });

  it("maps NotReadableError to device-unavailable", async () => {
    getUserMediaMock.mockRejectedValue(Object.assign(new Error("nope"), { name: "NotReadableError" }));
    await expect(acquireLocalMedia("video")).rejects.toMatchObject({ reason: "device-unavailable" });
  });

  it("maps OverconstrainedError to constraints-not-satisfiable", async () => {
    getUserMediaMock.mockRejectedValue(Object.assign(new Error("nope"), { name: "OverconstrainedError" }));
    await expect(acquireLocalMedia("video")).rejects.toMatchObject({ reason: "constraints-not-satisfiable" });
  });

  it("maps an unrecognized error to unknown, not a raw stack trace", async () => {
    getUserMediaMock.mockRejectedValue(new Error("something else"));
    await expect(acquireLocalMedia("audio")).rejects.toMatchObject({ reason: "unknown" });
  });

  it("MediaAcquisitionError carries its reason as a real property, not just a message string", async () => {
    getUserMediaMock.mockRejectedValue(Object.assign(new Error("nope"), { name: "NotAllowedError" }));
    try {
      await acquireLocalMedia("audio");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MediaAcquisitionError);
      expect((err as MediaAcquisitionError).reason).toBe("permission-denied");
    }
  });
});

describe("track helpers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stopAllTracks stops every track on the stream", () => {
    const a = fakeTrack();
    const v = fakeTrack();
    stopAllTracks(fakeStream([a], [v]));
    expect(a.stop).toHaveBeenCalled();
    expect(v.stop).toHaveBeenCalled();
  });

  it("stopAllTracks is a safe no-op for null/undefined", () => {
    expect(() => stopAllTracks(null)).not.toThrow();
    expect(() => stopAllTracks(undefined)).not.toThrow();
  });

  it("setAudioEnabled toggles only audio tracks — mute never renegotiates (brief §17: track.enabled, not stop/remove)", () => {
    const a = fakeTrack();
    const v = fakeTrack();
    const stream = fakeStream([a], [v]);
    setAudioEnabled(stream, false);
    expect(a.enabled).toBe(false);
    expect(v.enabled).toBe(true);
    setAudioEnabled(stream, true);
    expect(a.enabled).toBe(true);
  });

  it("setVideoEnabled toggles only video tracks", () => {
    const a = fakeTrack();
    const v = fakeTrack();
    const stream = fakeStream([a], [v]);
    setVideoEnabled(stream, false);
    expect(v.enabled).toBe(false);
    expect(a.enabled).toBe(true);
  });
});
