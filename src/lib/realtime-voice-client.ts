import { OPERATIONAL_SESSION_INVALID_EVENT, operationalSessionClient } from "./local-client.ts";

export type RealtimeVoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export type RealtimeVoiceCallbacks = {
  onState: (state: RealtimeVoiceState) => void;
  onAmplitude: (amplitude: number) => void;
  onUserTranscript: (text: string) => void;
  onAssistantTranscript: (text: string) => void;
  onError: (message: string, code?: "response_timeout") => void;
};

const REALTIME_RESPONSE_TIMEOUT_MS = 10_000;

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  response?: { id?: string };
  response_id?: string;
  error?: { message?: string; code?: string };
};

export class RealtimeVoiceClient {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private animationFrame: number | null = null;
  private assistantTranscript = "";
  private speaking = false;
  /** A response has been requested or created and has not yet reached response.done. */
  private responseActive = false;
  /** A response.cancel was sent and its terminal response.done has not arrived yet. */
  private cancelling = false;
  /** A finalized transcript arrived while cancelling; create its response after response.done. */
  private queuedCreate = false;
  /** id of the response currently in flight; used to target cancellation and ignore stale events. */
  private activeResponseId: string | null = null;
  private microphoneMuted = false;
  private outputMuted = false;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly audio: HTMLAudioElement;
  private readonly callbacks: RealtimeVoiceCallbacks;

  constructor(audio: HTMLAudioElement, callbacks: RealtimeVoiceCallbacks) {
    this.audio = audio;
    this.callbacks = callbacks;
  }

  static supported() {
    return typeof window !== "undefined" && "RTCPeerConnection" in window && Boolean(navigator.mediaDevices?.getUserMedia);
  }

  async connect() {
    if (!RealtimeVoiceClient.supported()) throw new Error("This browser does not support secure live voice sessions.");
    this.callbacks.onState("connecting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      this.applyMicrophoneMute();
      this.audio.muted = this.outputMuted;
      this.startAmplitudeMeter(this.stream);

      const peer = new RTCPeerConnection();
      this.peer = peer;
      peer.ontrack = (event) => {
        this.audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void this.audio.play().catch(() => this.callbacks.onError("Browser audio playback is blocked. Allow audio for this site and reconnect."));
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(peer.connectionState)) this.fail("The live voice connection was interrupted.");
      };
      for (const track of this.stream.getTracks()) peer.addTrack(track, this.stream);

      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      channel.addEventListener("message", (event) => this.handleEvent(event.data));
      channel.addEventListener("open", () => this.callbacks.onState("listening"));
      channel.addEventListener("close", () => {
        if (this.peer) this.callbacks.onState("idle");
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("/api/runtime/realtime/call", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/sdp",
          "Content-Type": "application/sdp",
          ...operationalSessionClient.hostedMutationHeaders(),
        },
        body: offer.sdp,
      });
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event(OPERATIONAL_SESSION_INVALID_EVENT));
        let message = `Live voice session could not start (${response.status}).`;
        try {
          const body = await response.json() as { error?: { message?: string } };
          if (body.error?.message) message = body.error.message;
        } catch { /* retain the bounded message */ }
        throw new Error(message);
      }
      const answer = await response.text();
      if (!answer.trimStart().startsWith("v=0")) throw new Error("Live voice session returned an invalid connection response.");
      await peer.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop() {
    this.disposeTransport();
    this.callbacks.onState("idle");
  }

  private disposeTransport() {
    this.clearResponseBoundary();
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    const channel = this.channel;
    this.channel = null;
    const peer = this.peer;
    this.peer = null;
    channel?.close();
    peer?.close();
    this.audio.pause();
    this.audio.srcObject = null;
    this.audio.muted = false;
    void this.audioContext?.close();
    this.audioContext = null;
    this.speaking = false;
    this.responseActive = false;
    this.cancelling = false;
    this.queuedCreate = false;
    this.activeResponseId = null;
    this.callbacks.onAmplitude(0);
  }

  setMicrophoneMuted(muted: boolean) {
    this.microphoneMuted = muted;
    this.applyMicrophoneMute();
    if (muted) this.callbacks.onAmplitude(0);
  }

  setOutputMuted(muted: boolean) {
    this.outputMuted = muted;
    this.audio.muted = muted;
  }

  private applyMicrophoneMute() {
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = !this.microphoneMuted; });
  }

  private handleEvent(raw: unknown) {
    let event: RealtimeEvent;
    try { event = JSON.parse(String(raw)) as RealtimeEvent; }
    catch { return; }
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        if (this.responseActive && !this.cancelling) {
          this.send(this.activeResponseId
            ? { type: "response.cancel", response_id: this.activeResponseId }
            : { type: "response.cancel" });
          this.send({ type: "output_audio_buffer.clear" });
          this.cancelling = true;
          this.callbacks.onState("interrupted");
        } else if (!this.responseActive) this.callbacks.onState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        // Liveness guard: something (finalized transcript -> creation, or a
        // provider-created response) must move the turn forward within the boundary.
        this.startResponseBoundary();
        this.callbacks.onState("thinking");
        break;
      case "response.created":
        this.responseActive = true;
        this.activeResponseId = event.response?.id ?? null;
        this.startResponseBoundary();
        this.callbacks.onState("thinking");
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) this.callbacks.onUserTranscript(event.transcript);
        // The Runtime provider contract sets automaticResponseCreation=false:
        // a response is created only after the Experience admits the finalized
        // transcript. Admit it here and explicitly request exactly one response.
        if (event.transcript && event.transcript.trim().length > 0) {
          if (this.cancelling) this.queuedCreate = true;
          else if (!this.responseActive) this.createResponse();
        }
        break;
      case "response.output_audio.delta":
      case "response.audio.delta":
        if (this.cancelling || this.isStaleResponseEvent(event)) break;
        this.clearResponseBoundary();
        this.speaking = true;
        this.callbacks.onState("speaking");
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
      case "response.output_text.delta":
      case "response.text.delta":
        if (this.cancelling || this.isStaleResponseEvent(event)) break;
        this.clearResponseBoundary();
        this.speaking = true;
        this.assistantTranscript += event.delta ?? "";
        this.callbacks.onAssistantTranscript(this.assistantTranscript);
        this.callbacks.onState("speaking");
        break;
      case "response.done":
        if (this.isStaleResponseEvent(event)) break;
        this.settleResponse();
        break;
      case "error": {
        // A cancellation race is benign: the response finished before our
        // response.cancel arrived. Settle locally instead of failing the session.
        const message = event.error?.message ?? "";
        if (this.cancelling && /cancell?ation failed|no active response/i.test(message)) {
          this.settleResponse();
          break;
        }
        this.fail(event.error?.message ?? "The live voice provider reported an error.");
        break;
      }
    }
  }

  /** True when the event carries a response id that is not the active response. */
  private isStaleResponseEvent(event: RealtimeEvent) {
    const id = event.response?.id ?? event.response_id;
    return Boolean(id && this.activeResponseId && id !== this.activeResponseId);
  }

  /** Terminal handling for the active response (done, cancelled, or cancel race). */
  private settleResponse() {
    this.clearResponseBoundary();
    this.speaking = false;
    this.responseActive = false;
    this.cancelling = false;
    this.activeResponseId = null;
    this.assistantTranscript = "";
    if (this.queuedCreate) {
      this.queuedCreate = false;
      this.createResponse();
    } else this.callbacks.onState("listening");
  }

  private createResponse() {
    this.responseActive = true;
    this.send({ type: "response.create" });
    this.startResponseBoundary();
    this.callbacks.onState("thinking");
  }

  private send(event: Record<string, unknown>) {
    if (this.channel?.readyState === "open") this.channel.send(JSON.stringify(event));
  }

  private startResponseBoundary() {
    this.clearResponseBoundary();
    this.responseTimer = setTimeout(() => {
      this.responseTimer = null;
      this.fail(
        "Live voice did not return a response within 10 seconds. The session was closed so the governed browser fallback can be used.",
        "response_timeout",
      );
    }, REALTIME_RESPONSE_TIMEOUT_MS);
  }

  private clearResponseBoundary() {
    if (this.responseTimer !== null) clearTimeout(this.responseTimer);
    this.responseTimer = null;
  }

  private fail(message: string, code?: "response_timeout") {
    this.disposeTransport();
    this.callbacks.onState("error");
    this.callbacks.onError(message, code);
  }

  private startAmplitudeMeter(stream: MediaStream) {
    const Context = window.AudioContext;
    if (!Context) return;
    const context = new Context();
    this.audioContext = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    context.createMediaStreamSource(stream).connect(analyser);
    const values = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(values);
      const mean = values.reduce((sum, value) => sum + value, 0) / (values.length * 255);
      this.callbacks.onAmplitude(this.microphoneMuted ? 0 : Math.min(1, mean * 3.2));
      this.animationFrame = requestAnimationFrame(update);
    };
    update();
  }
}
