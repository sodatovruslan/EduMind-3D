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
