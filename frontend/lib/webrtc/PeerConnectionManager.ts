import { getIceServers } from "./config";

export type PeerConnectionState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

export interface PeerConnectionManagerOptions {
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: PeerConnectionState) => void;
}

/**
 * T8 — the ONLY place `new RTCPeerConnection()` is constructed (brief
 * §39/§3: not scattered across React components, exactly one logical
 * peer connection per active call on this tab). Owns:
 *  - trickle ICE (candidates sent as gathered, never waiting for
 *    gathering to complete — brief §10);
 *  - queueing remote ICE candidates that arrive before
 *    `setRemoteDescription` has run, flushing them right after (brief
 *    §10 — explicitly required to be handled and tested);
 *  - renegotiation reuses the SAME offer/answer path as the initial
 *    connection (createAnswer() is valid to call again on an existing,
 *    already-connected RTCPeerConnection) — used for the single bounded
 *    ICE-restart recovery attempt (see useWebRTCSession.ts), no separate
 *    "renegotiate" code path.
 */
export class PeerConnectionManager {
  private pc: RTCPeerConnection;
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private remoteStream: MediaStream;
  private closed = false;

  constructor(private options: PeerConnectionManagerOptions) {
    this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.remoteStream = new MediaStream();

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.options.onIceCandidate({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };
    this.pc.ontrack = (event) => {
      const track = event.track;
      if (!this.remoteStream.getTracks().includes(track)) {
        this.remoteStream.addTrack(track);
      }
      // T9 — a renegotiated-away track (e.g. the remote side stopped
      // screen-sharing in an audio call, removing its video track) fires
      // `ended` on the receiver's track rather than a fresh `ontrack`;
      // without this the stale track would linger in `remoteStream`
      // forever pointing at dead media.
      track.onended = () => {
        this.remoteStream.removeTrack(track);
        this.options.onRemoteStream(this.remoteStream);
      };
      this.options.onRemoteStream(this.remoteStream);
    };
    this.pc.onconnectionstatechange = () => {
      this.options.onConnectionStateChange(this.pc.connectionState as PeerConnectionState);
    };
  }

  addLocalStream(stream: MediaStream): void {
    stream.getTracks().forEach((track) => this.pc.addTrack(track, stream));
  }

  async createOffer(iceRestart = false): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(offerSdp: string): Promise<RTCSessionDescriptionInit> {
    await this.setRemoteDescription({ type: "offer", sdp: offerSdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async acceptAnswer(answerSdp: string): Promise<void> {
    await this.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }

  private async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(desc);
    this.remoteDescriptionSet = true;
    const queued = this.pendingRemoteCandidates;
    this.pendingRemoteCandidates = [];
    for (const candidate of queued) {
      await this.pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  async addRemoteIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescriptionSet) {
      this.pendingRemoteCandidates.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(candidate).catch(() => undefined);
  }

  /** Single bounded recovery attempt (brief §25) — the caller decides
   * whether/when to invoke this; this class just performs it. */
  restartIce(): void {
    if (typeof this.pc.restartIce === "function") {
      this.pc.restartIce();
    }
  }

  get connectionState(): PeerConnectionState {
    return this.pc.connectionState as PeerConnectionState;
  }

  get signalingState(): RTCSignalingState {
    return this.pc.signalingState;
  }

  /** T9 — glare recovery for the perfect-negotiation-lite pattern used by
   * screen-share renegotiation (see useWebRTCSession's offer handling):
   * discards our own not-yet-answered local offer so an incoming
   * colliding offer can be accepted instead. */
  async rollback(): Promise<void> {
    await this.pc.setLocalDescription({ type: "rollback" });
  }

  /** T9 — video calls only: swap the existing video sender's outgoing
   * track (camera <-> screen) with NO renegotiation (brief §4 — the
   * preferred, simpler path; same m-line, same track kind). A no-op if
   * this call never had a video sender (e.g. called on an audio call by
   * mistake) — audio calls use addVideoTrack/removeVideoTrack instead. */
  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    const sender = this.pc.getSenders().find((s) => s.track && s.track.kind === "video");
    await sender?.replaceTrack(track);
  }

  /** T9 — audio calls only: adding a video track where none existed
   * requires renegotiation (brief §7). Returns the sender so the caller
   * can remove it again on Stop Sharing. */
  addVideoTrack(track: MediaStreamTrack): RTCRtpSender {
    return this.pc.addTrack(track);
  }

  removeVideoTrack(sender: RTCRtpSender): void {
    this.pc.removeTrack(sender);
  }

  /** Cleanup (brief §29 — critical acceptance criterion: the browser's
   * camera/mic indicator must disappear). Stops sender tracks directly as
   * defense in depth alongside the caller's own `stopAllTracks(localStream)`
   * — redundant calls to `track.stop()` are harmless. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.getSenders().forEach((sender) => {
      try {
        sender.track?.stop();
      } catch {
        // already stopped / not supported — fine either way
      }
    });
    this.pc.close();
    this.pendingRemoteCandidates = [];
  }
}
