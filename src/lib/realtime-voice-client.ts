import { OPERATIONAL_SESSION_INVALID_EVENT, operationalSessionClient } from "./local-client.ts";
import { RealtimeTurnAdmissionLedger } from "./runtime-admission-policy.ts";

export type RealtimeVoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export const RUNTIME_PROMPT_ECHO_HEADER = "X-NEXUS-Prompt-Echo-Signature";

export type RealtimeTranscriptAdmission =
  | { admitted: true; spokenSummary: string }
  | { admitted: false; reason?: string };

export type RealtimeVoiceCallbacks = {
  onState: (state: RealtimeVoiceState) => void;
  onAmplitude: (amplitude: number) => void;
  /** Submit one finalized provider transcript to the canonical Runtime path. */
  onUserTranscript: (text: string, idempotencyKey: string) => Promise<RealtimeTranscriptAdmission>;
  /** Narrate only the Runtime-returned response after current-turn admission. */
  onRuntimeResponse: (responseText: string) => void;
  onError: (message: string) => void;
};

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  item_id?: string;
  item?: { id?: string };
  error?: { message?: string };
};

const normalizeTranscript = (value: string) => value
  .normalize("NFKD")
  .toLowerCase()
  .replace(/[’']/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const REALTIME_ITEM_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

export function runtimePromptEchoSignatureFromHeaders(headers: Pick<Headers, "get">): string | null {
  const value = headers.get(RUNTIME_PROMPT_ECHO_HEADER)?.trim() ?? "";
  if (!value || value.length > 512 || !/^[\x20-\x7e]+$/.test(value)) return null;
  return value;
}

/**
 * Reject the exact Runtime signature and substantial ordered fragments before
 * they can become user-visible messages, commands, memory, or response input.
 */
export function looksLikeRuntimePromptEcho(candidateText: string, signatureText: string): boolean {
  const neutral = new Set(["and", "the", "of"]);
  const candidate = normalizeTranscript(candidateText).split(" ").filter((word) => word && !neutral.has(word));
  const signature = normalizeTranscript(signatureText).split(" ").filter((word) => word && !neutral.has(word));
  if (candidate.length < 4 || signature.length < 4) return false;
  const signatureWords = new Set(signature);
  if (candidate.some((word) => !signatureWords.has(word))) return false;
  let signatureIndex = 0;
  for (const word of candidate) {
    while (signatureIndex < signature.length && signature[signatureIndex] !== word) signatureIndex += 1;
    if (signatureIndex >= signature.length) return false;
    signatureIndex += 1;
  }
  return true;
}

function isProviderOutputEvent(type: string): boolean {
  return type === "response.create"
    || type === "output_audio_buffer.started"
    || type === "output_audio_buffer.stopped"
    || type === "output_audio_buffer.cleared"
    || type.startsWith("response.");
}

/**
 * WebRTC is a microphone-to-transcript transport only. It never requests,
 * accepts, attaches, or plays provider output. Every final transcript is
 * submitted once to Runtime, and only Runtime response_text may be narrated.
 */
export class RealtimeVoiceClient {
  private readonly callbacks: RealtimeVoiceCallbacks;
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private animationFrame: number | null = null;
  private microphoneMuted = false;
  private promptEchoSignature: string | null = null;
  private admissionQueue: Promise<void> = Promise.resolve();
  private admittedItemIds = new Set<string>();
  private readonly turnKeyByItemId = new Map<string, string>();
  private activeSpeechItemId: string | null = null;
  private readonly turnAdmissions = new RealtimeTurnAdmissionLedger<RealtimeTranscriptAdmission>();

  constructor(callbacks: RealtimeVoiceCallbacks) {
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
      this.startAmplitudeMeter(this.stream);

      const peer = new RTCPeerConnection();
      this.peer = peer;
      peer.ontrack = (event) => {
        event.track.stop();
        event.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
        this.stop();
        this.fail("Realtime provider attempted to attach output media to a transcription-only session.");
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(peer.connectionState)) this.fail("The live voice connection was interrupted.");
      };
      for (const track of this.stream.getAudioTracks()) {
        peer.addTransceiver(track, { direction: "sendonly", streams: [this.stream] });
      }

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
      this.promptEchoSignature = runtimePromptEchoSignatureFromHeaders(response.headers);
      if (!this.promptEchoSignature) throw new Error("NEXUS Runtime omitted the governed Realtime transcript-admission boundary.");
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
    void this.audioContext?.close();
    this.audioContext = null;
    this.promptEchoSignature = null;
    this.admittedItemIds.clear();
    this.turnKeyByItemId.clear();
    this.activeSpeechItemId = null;
    this.turnAdmissions.endTurn();
    this.callbacks.onAmplitude(0);
    this.callbacks.onState("idle");
  }

  setMicrophoneMuted(muted: boolean) {
    this.microphoneMuted = muted;
    this.applyMicrophoneMute();
    if (muted) this.callbacks.onAmplitude(0);
  }

  setOutputMuted(muted: boolean) {
    // Provider output is structurally absent. This control only cancels browser
    // narration of a Runtime response already in progress.
    if (muted && typeof window !== "undefined") window.speechSynthesis?.cancel();
  }

  private applyMicrophoneMute() {
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = !this.microphoneMuted; });
  }

  private handleEvent(raw: unknown) {
    let event: RealtimeEvent;
    try { event = JSON.parse(String(raw)) as RealtimeEvent; }
    catch {
      this.stop();
      this.fail("Realtime provider emitted malformed protocol data.");
      return;
    }
    const type = typeof event.type === "string" ? event.type : "";
    if (!type) {
      this.stop();
      this.fail("Realtime provider emitted malformed protocol data without an event type.");
      return;
    }
    if (isProviderOutputEvent(type)) {
      this.stop();
      this.fail(`Realtime provider emitted forbidden output event ${type || "(missing type)"}.`);
      return;
    }
    switch (type) {
      case "input_audio_buffer.speech_started": {
        const itemId = this.providerItemId(event);
        if (!itemId) {
          this.stop();
          this.fail("Realtime speech start had no valid provider item binding.");
          break;
        }
        const turnIdempotencyKey = this.turnAdmissions.beginTurn();
        const existingTurnKey = this.turnKeyByItemId.get(itemId);
        if (existingTurnKey && existingTurnKey !== turnIdempotencyKey) {
          this.stop();
          this.fail("Realtime reused a provider item across different speech turns.");
          break;
        }
        this.turnKeyByItemId.set(itemId, turnIdempotencyKey);
        this.activeSpeechItemId = itemId;
        this.callbacks.onState("listening");
        break;
      }
      case "input_audio_buffer.speech_stopped": {
        const itemId = this.providerItemId(event);
        const turnIdempotencyKey = this.turnAdmissions.activeTurnKey();
        if (
          !itemId
          || !turnIdempotencyKey
          || itemId !== this.activeSpeechItemId
          || this.turnKeyByItemId.get(itemId) !== turnIdempotencyKey
        ) {
          this.stop();
          this.fail("Realtime speech stop did not match the active provider item binding.");
          break;
        }
        this.callbacks.onState("thinking");
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        this.queueFinalizedTranscript(event);
        break;
      case "conversation.item.input_audio_transcription.failed":
      case "error":
        this.stop();
        this.fail(event.error?.message || "The live transcription provider reported an error.");
        break;
      default:
        // Session, rate-limit, buffer-commit, and transcription-delta events
        // carry no final answer and require no client-side action.
        break;
    }
  }

  private queueFinalizedTranscript(event: RealtimeEvent) {
    const itemId = this.providerItemId(event);
    const turnIdempotencyKey = itemId ? this.turnKeyByItemId.get(itemId) ?? null : null;
    this.admissionQueue = this.admissionQueue
      .then(() => this.admitFinalizedTranscript(event, turnIdempotencyKey))
      .catch((error) => this.fail(error instanceof Error ? error.message : "Realtime transcript admission failed."));
  }

  private async admitFinalizedTranscript(event: RealtimeEvent, turnIdempotencyKey: string | null) {
    const text = event.transcript?.trim() ?? "";
    const itemId = this.providerItemId(event);
    if (!text || !this.promptEchoSignature || looksLikeRuntimePromptEcho(text, this.promptEchoSignature)) {
      this.rejectFinalizedTranscript(itemId, text ? "Runtime prompt echo rejected." : "Empty finalized transcript rejected.");
      return;
    }
    if (!turnIdempotencyKey) {
      this.rejectFinalizedTranscript(itemId, "Finalized transcript had no detected speech-turn binding.");
      return;
    }
    if (this.admittedItemIds.has(itemId)) return;
    if (!this.turnAdmissions.isActiveTurn(turnIdempotencyKey)) {
      this.discardSupersededTranscript(itemId);
      return;
    }

    this.callbacks.onState("thinking");
    let admission: RealtimeTranscriptAdmission;
    try {
      const turnAdmission = await this.turnAdmissions.admit(
        turnIdempotencyKey,
        normalizeTranscript(text),
        (stableIdempotencyKey) => this.callbacks.onUserTranscript(text, stableIdempotencyKey),
      );
      if (turnAdmission.duplicate) return;
      admission = turnAdmission.value;
    } catch (error) {
      if (!this.turnAdmissions.isActiveTurn(turnIdempotencyKey)) {
        this.discardSupersededTranscript(itemId);
        return;
      }
      this.rejectFinalizedTranscript(itemId, error instanceof Error ? error.message : "Runtime transcript admission failed.");
      return;
    }
    if (!this.turnAdmissions.isActiveTurn(turnIdempotencyKey)) {
      this.discardSupersededTranscript(itemId);
      return;
    }
    const responseText = admission.admitted ? admission.spokenSummary.trim() : "";
    if (!admission.admitted || !responseText || responseText.length > 4_000) {
      this.rejectFinalizedTranscript(itemId, admission.admitted ? "Runtime returned no bounded response text." : admission.reason);
      return;
    }
    this.admittedItemIds.add(itemId);
    this.callbacks.onRuntimeResponse(responseText);
    this.callbacks.onState("listening");
  }

  private rejectFinalizedTranscript(itemId: string, reason = "Finalized transcript was not admitted.") {
    if (!itemId || !this.send({ type: "conversation.item.delete", item_id: itemId })) {
      this.stop();
      this.fail(`${reason} Unable to remove it from the Realtime session.`);
      return;
    }
    this.send({ type: "input_audio_buffer.clear" });
    this.callbacks.onState("listening");
  }

  private discardSupersededTranscript(itemId: string): boolean {
    if (!itemId || !this.send({ type: "conversation.item.delete", item_id: itemId })) {
      this.stop();
      this.fail("A superseded Runtime-admitted transcript could not be removed from the Realtime session.");
      return false;
    }
    return true;
  }

  private providerItemId(event: RealtimeEvent): string {
    const itemId = event.item_id?.trim() || event.item?.id?.trim() || "";
    return REALTIME_ITEM_ID_PATTERN.test(itemId) ? itemId : "";
  }

  private send(event: Record<string, unknown>): boolean {
    if (this.channel?.readyState !== "open") return false;
    try {
      this.channel.send(JSON.stringify(event));
      return true;
    } catch {
      return false;
    }
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
      this.callbacks.onAmplitude(this.microphoneMuted ? 0 : Math.min(1, mean * 3.2));
      this.animationFrame = requestAnimationFrame(update);
    };
    update();
  }
}
