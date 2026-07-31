import { OPERATIONAL_SESSION_INVALID_EVENT, operationalSessionClient } from "./local-client";

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
  error?: { message?: string };
};

export class RealtimeVoiceClient {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private animationFrame: number | null = null;
  private assistantTranscript = "";
  private speaking = false;
  private microphoneMuted = false;
  private outputMuted = false;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly audio: HTMLAudioElement, private readonly callbacks: RealtimeVoiceCallbacks) {}

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
        if (this.speaking) {
          this.send({ type: "response.cancel" });
          this.send({ type: "output_audio_buffer.clear" });
          this.callbacks.onState("interrupted");
        } else this.callbacks.onState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
      case "response.created":
        this.startResponseBoundary();
        this.callbacks.onState("thinking");
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) this.callbacks.onUserTranscript(event.transcript);
        break;
      case "response.output_audio.delta":
      case "response.audio.delta":
        this.clearResponseBoundary();
        this.speaking = true;
        this.callbacks.onState("speaking");
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
      case "response.output_text.delta":
      case "response.text.delta":
        this.clearResponseBoundary();
        this.speaking = true;
        this.assistantTranscript += event.delta ?? "";
        this.callbacks.onAssistantTranscript(this.assistantTranscript);
        this.callbacks.onState("speaking");
        break;
      case "response.done":
        this.clearResponseBoundary();
        this.speaking = false;
        this.assistantTranscript = "";
        this.callbacks.onState("listening");
        break;
      case "error":
        this.fail(event.error?.message ?? "The live voice provider reported an error.");
        break;
    }
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
