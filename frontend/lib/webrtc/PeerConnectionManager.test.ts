import { beforeEach, describe, expect, it, vi } from "vitest";
import { PeerConnectionManager } from "./PeerConnectionManager";

class FakeSender {
  track: { kind: string; stop: ReturnType<typeof vi.fn> } | null;
  replaceTrack = vi.fn(async (track: unknown) => {
    this.track = track as FakeSender["track"];
  });
  constructor(track: { kind: string; stop: ReturnType<typeof vi.fn> } | null) {
    this.track = track;
  }
}

class FakeRTCPeerConnection {
  static instances: FakeRTCPeerConnection[] = [];
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ontrack: ((event: { track: { onended?: (() => void) | null } & Record<string, unknown>; streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = "new";
  signalingState = "stable";
  addTrack = vi.fn((track: unknown) => {
    const sender = new FakeSender(track as FakeSender["track"]);
    this.senders.push(sender);
    return sender;
  });
  removeTrack = vi.fn((sender: FakeSender) => {
    this.senders = this.senders.filter((s) => s !== sender);
  });
  createOffer = vi.fn(async (_opts?: unknown) => ({ type: "offer", sdp: "offer-sdp" }));
  createAnswer = vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" }));
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => undefined);
  addIceCandidate = vi.fn(async () => undefined);
  restartIce = vi.fn();
  close = vi.fn();
  private senders: FakeSender[] = [];

  constructor(_config: unknown) {
    FakeRTCPeerConnection.instances.push(this);
  }

  getSenders() {
    return this.senders;
  }

  // test helper, not part of the real RTCPeerConnection API
  __setSenders(senders: FakeSender[]) {
    this.senders = senders;
  }
}

class FakeMediaStream {
  private tracks: unknown[] = [];
  getTracks() {
    return this.tracks;
  }
  addTrack(track: unknown) {
    this.tracks.push(track);
  }
  removeTrack(track: unknown) {
    this.tracks = this.tracks.filter((t) => t !== track);
  }
}

beforeEach(() => {
  FakeRTCPeerConnection.instances = [];
  // @ts-expect-error — test stub, not the full RTCPeerConnection surface
  global.RTCPeerConnection = FakeRTCPeerConnection;
  // jsdom (this project's default test environment) doesn't implement
  // MediaStream at all — a minimal stub is enough for what
  // PeerConnectionManager actually uses (getTracks/addTrack).
  // @ts-expect-error — test stub, not the full MediaStream surface
  global.MediaStream = FakeMediaStream;
});

function makeManager() {
  const onIceCandidate = vi.fn();
  const onRemoteStream = vi.fn();
  const onConnectionStateChange = vi.fn();
  const manager = new PeerConnectionManager({ onIceCandidate, onRemoteStream, onConnectionStateChange });
  const pc = FakeRTCPeerConnection.instances[0];
  return { manager, pc, onIceCandidate, onRemoteStream, onConnectionStateChange };
}

describe("PeerConnectionManager — offer/answer flow", () => {
  it("createOffer sets the local description and returns it", async () => {
    const { manager, pc } = makeManager();
    const offer = await manager.createOffer();
    expect(pc.createOffer).toHaveBeenCalled();
    expect(pc.setLocalDescription).toHaveBeenCalledWith(offer);
    expect(offer.sdp).toBe("offer-sdp");
  });

  it("createOffer(true) requests an ICE restart", async () => {
    const { manager, pc } = makeManager();
    await manager.createOffer(true);
    expect(pc.createOffer).toHaveBeenCalledWith({ iceRestart: true });
  });

  it("createAnswer sets the remote offer, then creates+sets a local answer", async () => {
    const { manager, pc } = makeManager();
    const answer = await manager.createAnswer("remote-offer-sdp");
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: "offer", sdp: "remote-offer-sdp" });
    expect(pc.createAnswer).toHaveBeenCalled();
    expect(pc.setLocalDescription).toHaveBeenCalledWith(answer);
  });

  it("acceptAnswer sets the remote description as an answer", async () => {
    const { manager, pc } = makeManager();
    await manager.acceptAnswer("remote-answer-sdp");
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "remote-answer-sdp" });
  });

  it("addLocalStream adds every track from the stream", () => {
    const { manager, pc } = makeManager();
    const tracks = [{ id: "a" }, { id: "b" }];
    const stream = { getTracks: () => tracks } as unknown as MediaStream;
    manager.addLocalStream(stream);
    expect(pc.addTrack).toHaveBeenCalledTimes(2);
  });
});

describe("PeerConnectionManager — trickle ICE and early-candidate queueing (brief §10)", () => {
  it("queues a remote candidate that arrives BEFORE the remote description is set", async () => {
    const { manager, pc } = makeManager();
    const candidate = { candidate: "cand1", sdpMid: "0", sdpMLineIndex: 0 };
    await manager.addRemoteIceCandidate(candidate);
    expect(pc.addIceCandidate).not.toHaveBeenCalled();
  });

  it("flushes queued candidates right after setRemoteDescription resolves", async () => {
    const { manager, pc } = makeManager();
    const c1 = { candidate: "cand1", sdpMid: "0", sdpMLineIndex: 0 };
    const c2 = { candidate: "cand2", sdpMid: "0", sdpMLineIndex: 0 };
    await manager.addRemoteIceCandidate(c1);
    await manager.addRemoteIceCandidate(c2);
    expect(pc.addIceCandidate).not.toHaveBeenCalled();

    await manager.createAnswer("offer-sdp"); // this is what sets the remote description
    expect(pc.addIceCandidate).toHaveBeenCalledTimes(2);
    expect(pc.addIceCandidate).toHaveBeenNthCalledWith(1, c1);
    expect(pc.addIceCandidate).toHaveBeenNthCalledWith(2, c2);
  });

  it("adds a candidate immediately once the remote description is already set", async () => {
    const { manager, pc } = makeManager();
    await manager.createAnswer("offer-sdp");
    pc.addIceCandidate.mockClear();

    const candidate = { candidate: "cand3", sdpMid: "0", sdpMLineIndex: 0 };
    await manager.addRemoteIceCandidate(candidate);
    expect(pc.addIceCandidate).toHaveBeenCalledWith(candidate);
  });

  it("forwards each locally-gathered candidate as soon as it arrives (trickle, not waiting for gathering to complete)", () => {
    const { pc, onIceCandidate } = makeManager();
    const iceCandidate = { candidate: "local-cand", sdpMid: "0", sdpMLineIndex: 0 } as unknown as RTCIceCandidate;
    pc.onicecandidate?.({ candidate: iceCandidate });
    expect(onIceCandidate).toHaveBeenCalledWith({ candidate: "local-cand", sdpMid: "0", sdpMLineIndex: 0 });
  });

  it("does not forward anything on the end-of-gathering null candidate", () => {
    const { pc, onIceCandidate } = makeManager();
    pc.onicecandidate?.({ candidate: null });
    expect(onIceCandidate).not.toHaveBeenCalled();
  });
});

describe("PeerConnectionManager — remote track / connection state", () => {
  it("accumulates remote tracks into one MediaStream and reports it", () => {
    const { pc, onRemoteStream } = makeManager();
    const track = { id: "remote-audio" };
    pc.ontrack?.({ track, streams: [] });
    expect(onRemoteStream).toHaveBeenCalled();
    const stream = onRemoteStream.mock.calls[0][0] as MediaStream;
    expect(stream.getTracks()).toContain(track);
  });

  it("reports connection state changes", () => {
    const { pc, onConnectionStateChange } = makeManager();
    pc.connectionState = "connected";
    pc.onconnectionstatechange?.();
    expect(onConnectionStateChange).toHaveBeenCalledWith("connected");
  });
});

describe("PeerConnectionManager — cleanup (brief §29: camera indicator must disappear)", () => {
  it("close() stops every sender's track and closes the connection", () => {
    const { manager, pc } = makeManager();
    const trackA = { kind: "audio", stop: vi.fn() };
    const trackB = { kind: "video", stop: vi.fn() };
    pc.__setSenders([new FakeSender(trackA), new FakeSender(trackB)]);

    manager.close();
    expect(trackA.stop).toHaveBeenCalled();
    expect(trackB.stop).toHaveBeenCalled();
    expect(pc.close).toHaveBeenCalled();
  });

  it("close() is idempotent — calling it twice does not throw or double-close", () => {
    const { manager, pc } = makeManager();
    manager.close();
    manager.close();
    expect(pc.close).toHaveBeenCalledTimes(1);
  });

  it("restartIce() delegates to the underlying connection when available", () => {
    const { manager, pc } = makeManager();
    manager.restartIce();
    expect(pc.restartIce).toHaveBeenCalled();
  });
});

describe("PeerConnectionManager — screen sharing (T9)", () => {
  it("replaceVideoTrack swaps the existing video sender's track in place, no renegotiation", async () => {
    const { manager, pc } = makeManager();
    const cameraTrack = { kind: "video", stop: vi.fn() };
    const sender = new FakeSender(cameraTrack);
    pc.__setSenders([sender]);

    const screenTrack = { kind: "video", stop: vi.fn() };
    await manager.replaceVideoTrack(screenTrack as unknown as MediaStreamTrack);

    expect(sender.replaceTrack).toHaveBeenCalledWith(screenTrack);
    expect(pc.createOffer).not.toHaveBeenCalled();
  });

  it("replaceVideoTrack is a safe no-op when there is no existing video sender", async () => {
    const { manager } = makeManager();
    const screenTrack = { kind: "video", stop: vi.fn() };
    await expect(manager.replaceVideoTrack(screenTrack as unknown as MediaStreamTrack)).resolves.toBeUndefined();
  });

  it("addVideoTrack adds a new sender for a call that had no video sender (audio call + share)", () => {
    const { manager, pc } = makeManager();
    const screenTrack = { kind: "video", stop: vi.fn() };
    const sender = manager.addVideoTrack(screenTrack as unknown as MediaStreamTrack);
    expect(pc.addTrack).toHaveBeenCalledWith(screenTrack);
    expect(pc.getSenders()).toContain(sender);
  });

  it("removeVideoTrack removes the sender previously returned by addVideoTrack", () => {
    const { manager, pc } = makeManager();
    const screenTrack = { kind: "video", stop: vi.fn() };
    const sender = manager.addVideoTrack(screenTrack as unknown as MediaStreamTrack);
    manager.removeVideoTrack(sender);
    expect(pc.removeTrack).toHaveBeenCalledWith(sender);
    expect(pc.getSenders()).not.toContain(sender);
  });

  it("exposes the underlying signalingState for glare detection", () => {
    const { manager, pc } = makeManager();
    pc.signalingState = "have-local-offer";
    expect(manager.signalingState).toBe("have-local-offer");
  });

  it("rollback() discards the pending local description", async () => {
    const { manager, pc } = makeManager();
    await manager.rollback();
    expect(pc.setLocalDescription).toHaveBeenCalledWith({ type: "rollback" });
  });

  it("removes a track from remoteStream and re-reports it once the receiver's track ends (renegotiated-away screen share)", () => {
    const { pc, onRemoteStream } = makeManager();
    const track: { onended: (() => void) | null } = { onended: null };
    pc.ontrack?.({ track, streams: [] });
    const streamAfterAdd = onRemoteStream.mock.calls[0][0] as MediaStream;
    expect(streamAfterAdd.getTracks()).toContain(track);

    onRemoteStream.mockClear();
    track.onended?.();
    expect(onRemoteStream).toHaveBeenCalled();
    const streamAfterEnd = onRemoteStream.mock.calls[0][0] as MediaStream;
    expect(streamAfterEnd.getTracks()).not.toContain(track);
  });
});
