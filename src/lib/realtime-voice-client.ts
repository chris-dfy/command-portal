export type RealtimeVoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export type RealtimeVoiceCallbacks = {
  onState: (state: RealtimeVoiceState) => void;
  onAmplitude: (amplitude: number) => void;
  onUserTranscript: (text: string) => void;
  onAssistantTranscript: (text: string) => void;
  onError: (message: string) => void;
};

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
        headers: { Accept: "application/sdp", "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!response.ok) {
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
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.channel?.close();
    this.channel = null;
    this.peer?.close();
    this.peer = null;
    this.audio.pause();
    this.audio.srcObject = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.speaking = false;
    this.callbacks.onAmplitude(0);
    this.callbacks.onState("idle");
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
        this.callbacks.onState("thinking");
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) this.callbacks.onUserTranscript(event.transcript);
        break;
      case "response.output_audio.delta":
      case "response.audio.delta":
        this.speaking = true;
        this.callbacks.onState("speaking");
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        this.speaking = true;
        this.assistantTranscript += event.delta ?? "";
        this.callbacks.onAssistantTranscript(this.assistantTranscript);
        this.callbacks.onState("speaking");
        break;
      case "response.done":
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

  private fail(message: string) {
    this.callbacks.onState("error");
    this.callbacks.onError(message);
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
      this.callbacks.onAmplitude(Math.min(1, mean * 3.2));
      this.animationFrame = requestAnimationFrame(update);
    };
    update();
  }
}
