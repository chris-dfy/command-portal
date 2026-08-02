import { OPERATIONAL_SESSION_INVALID_EVENT, operationalSessionClient } from "./local-client.ts";
import {
  NEXUS_NARRATION_CORRELATION_METADATA_KEY,
  RealtimeNarrationResponseGate,
} from "./realtime-narration-response-gate.ts";
import { RealtimeTurnAdmissionLedger } from "./runtime-admission-policy.ts";

export type RealtimeVoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export const RUNTIME_PROMPT_ECHO_HEADER = "X-NEXUS-Prompt-Echo-Signature";

export type RealtimeTranscriptAdmission =
  | { admitted: true; spokenSummary: string }
  | { admitted: false; reason?: string };

export type RealtimeVoiceCallbacks = {
  onState: (state: RealtimeVoiceState) => void;
  onAmplitude: (amplitude: number) => void;
  /**
   * Admit one finalized transcript through a Runtime-owned interaction path.
   * The provider remains silent until this callback returns an authoritative
   * spoken summary; rejected or failed admissions are deleted fail-closed.
   */
  onUserTranscript: (text: string, idempotencyKey: string) => Promise<RealtimeTranscriptAdmission>;
  onError: (message: string) => void;
};

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  item_id?: string;
  response_id?: string;
  item?: { id?: string };
  response?: { id?: string; metadata?: Record<string, unknown> };
  error?: { message?: string };
};

const normalizeTranscript = (value: string) => value
  .normalize("NFKD")
  .toLowerCase()
  .replace(/[’']/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const REALTIME_RESPONSE_TIMEOUT_MS = 10_000;
const REALTIME_ITEM_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

type QueuedNarration = {
  spokenSummary: string;
  turnIdempotencyKey: string;
  itemId: string;
};

export function runtimePromptEchoSignatureFromHeaders(headers: Pick<Headers, "get">): string | null {
  const value = headers.get(RUNTIME_PROMPT_ECHO_HEADER)?.trim() ?? "";
  if (!value || value.length > 512 || !/^[\x20-\x7e]+$/.test(value)) return null;
  return value;
}

/**
 * Reject the exact Runtime signature and substantial ordered fragments before
 * they can become user-visible messages, commands, memory, or response input.
 * A candidate must contain only signature vocabulary, so real requests such as
 * "NEXUS, explain enterprise operations" remain admissible.
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

export class RealtimeVoiceClient {
  private readonly audio: HTMLAudioElement;
  private readonly callbacks: RealtimeVoiceCallbacks;
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private animationFrame: number | null = null;
  private speaking = false;
  private microphoneMuted = false;
  private outputMuted = false;
  private promptEchoSignature: string | null = null;
  private admissionQueue: Promise<void> = Promise.resolve();
  private admittedItemIds = new Set<string>();
  private readonly turnKeyByItemId = new Map<string, string>();
  private activeSpeechItemId: string | null = null;
  private readonly turnAdmissions: RealtimeTurnAdmissionLedger<RealtimeTranscriptAdmission>;
  private readonly narrationResponseGate = new RealtimeNarrationResponseGate();
  private cancellingResponseId: string | null = null;
  private discardNextCreatedResponse = false;
  private queuedNarration: QueuedNarration | null = null;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(audio: HTMLAudioElement, callbacks: RealtimeVoiceCallbacks) {
    this.audio = audio;
    this.callbacks = callbacks;
    this.turnAdmissions = new RealtimeTurnAdmissionLedger();
    this.applyOutputMuteGate();
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
      this.applyOutputMuteGate();
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
      this.promptEchoSignature = runtimePromptEchoSignatureFromHeaders(response.headers);
      if (!this.promptEchoSignature) throw new Error("NEXUS Runtime omitted the governed Realtime transcript-admission boundary.");
      await peer.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop() {
    this.clearResponseBoundary();
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
    this.audio.muted = false;
    void this.audioContext?.close();
    this.audioContext = null;
    this.speaking = false;
    this.promptEchoSignature = null;
    this.narrationResponseGate.reset();
    this.cancellingResponseId = null;
    this.discardNextCreatedResponse = false;
    this.queuedNarration = null;
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
    this.outputMuted = muted;
    this.applyOutputMuteGate();
  }

  private applyMicrophoneMute() {
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = !this.microphoneMuted; });
  }

  private applyOutputMuteGate() {
    this.audio.muted = this.outputMuted || this.narrationResponseGate.activeResponse() === null;
  }

  private handleEvent(raw: unknown) {
    let event: RealtimeEvent;
    try { event = JSON.parse(String(raw)) as RealtimeEvent; }
    catch { return; }
    switch (event.type) {
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
        const queued = this.queuedNarration;
        if (queued && queued.turnIdempotencyKey !== turnIdempotencyKey) {
          this.queuedNarration = null;
          if (!this.discardSupersededTranscript(queued.itemId)) break;
        }
        if (this.speaking || this.narrationResponseGate.hasPendingResponse() || this.narrationResponseGate.activeResponse()) {
          const activeResponseId = this.narrationResponseGate.reset();
          this.clearResponseBoundary();
          this.applyOutputMuteGate();
          if (activeResponseId && !this.cancellingResponseId) {
            this.cancellingResponseId = activeResponseId;
            this.send({ type: "response.cancel", response_id: activeResponseId });
          } else if (!activeResponseId && !this.cancellingResponseId) {
            // response.create was sent but response.created has not supplied an
            // exact response id yet. Cancel that response immediately when its
            // first event arrives; never issue an untargeted cancellation.
            this.discardNextCreatedResponse = true;
          }
          this.send({ type: "output_audio_buffer.clear" });
          this.speaking = false;
          this.callbacks.onState("interrupted");
        } else this.callbacks.onState("listening");
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
      case "response.created":
        // The server's response.created event is the first event for a response
        // and echoes response metadata. Only the exact high-entropy correlation
        // created after Runtime admission may open the remote-audio gate.
        {
          const authorization = this.narrationResponseGate.authorize(event.response);
          if (!authorization.authorized) {
            this.narrationResponseGate.reset();
            this.applyOutputMuteGate();
            if (authorization.responseId) {
              this.send({ type: "response.cancel", response_id: authorization.responseId });
            }
            this.send({ type: "output_audio_buffer.clear" });
            if (this.discardNextCreatedResponse && authorization.responseId) {
              this.discardNextCreatedResponse = false;
              this.cancellingResponseId = authorization.responseId;
              this.callbacks.onState("interrupted");
              break;
            }
            this.fail("Realtime attempted an unbound response before Runtime-authorized narration.");
            break;
          }
          this.startResponseBoundary();
          this.applyOutputMuteGate();
          this.callbacks.onState("thinking");
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.queueFinalizedTranscript(event);
        break;
      case "response.output_audio.delta":
      case "response.audio.delta":
        if (event.response_id && event.response_id === this.cancellingResponseId) break;
        if (!this.narrationResponseGate.allows(event.response_id)) {
          this.narrationResponseGate.reset();
          this.applyOutputMuteGate();
          if (event.response_id) this.send({ type: "response.cancel", response_id: event.response_id });
          this.send({ type: "output_audio_buffer.clear" });
          this.fail("Realtime emitted audio for a response not bound to Runtime authorization.");
          break;
        }
        this.clearResponseBoundary();
        this.speaking = true;
        this.callbacks.onState("speaking");
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        // The provider is an audio renderer. Its transcript is never rendered
        // as a second assistant result; the canonical Runtime response already
        // supplied the one authoritative text for this turn.
        if (event.response_id && event.response_id === this.cancellingResponseId) break;
        if (!this.narrationResponseGate.allows(event.response_id)) break;
        this.clearResponseBoundary();
        this.speaking = true;
        this.callbacks.onState("speaking");
        break;
      case "response.done":
        if ((event.response?.id ?? event.response_id) === this.cancellingResponseId) {
          this.settleCancellation();
          break;
        }
        if (this.narrationResponseGate.complete(event.response?.id ?? event.response_id)) {
          this.clearResponseBoundary();
          this.speaking = false;
          this.applyOutputMuteGate();
          this.callbacks.onState("listening");
        }
        break;
      case "error": {
        const message = event.error?.message ?? "";
        if (this.cancellingResponseId && /cancell?ation failed|no active response/i.test(message)) {
          this.settleCancellation();
          break;
        }
        this.fail(message || "The live voice provider reported an error.");
        break;
      }
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
    const itemId = event.item_id?.trim() || event.item?.id?.trim() || "";
    if (!text || !this.promptEchoSignature || looksLikeRuntimePromptEcho(text, this.promptEchoSignature)) {
      this.rejectFinalizedTranscript(itemId, text ? "Runtime prompt echo rejected." : "Empty finalized transcript rejected.");
      return;
    }
    if (!turnIdempotencyKey) {
      this.rejectFinalizedTranscript(itemId, "Finalized transcript had no detected speech-turn binding.");
      return;
    }
    if (itemId && this.admittedItemIds.has(itemId)) return;
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
      if (turnAdmission.duplicate) {
        this.rejectFinalizedTranscript(itemId, "Duplicate finalized transcript suppressed.");
        return;
      }
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
      // A later speech_started event owns the microphone now. The completed
      // Runtime result remains authoritative text, but it must never open an
      // audio response after the operator has superseded this turn.
      this.discardSupersededTranscript(itemId);
      return;
    }
    const spokenSummary = admission.admitted ? admission.spokenSummary.trim() : "";
    if (!admission.admitted || !spokenSummary || spokenSummary.length > 4_000) {
      this.rejectFinalizedTranscript(itemId, admission.admitted ? "Runtime returned no bounded spoken summary." : admission.reason);
      return;
    }
    if (itemId) this.admittedItemIds.add(itemId);

    if (this.cancellingResponseId || this.discardNextCreatedResponse) {
      this.queuedNarration = { spokenSummary, turnIdempotencyKey, itemId };
      return;
    }
    this.requestNarration(spokenSummary);
  }

  private requestNarration(spokenSummary: string) {
    // The provider is an audio renderer for the already-governed Runtime result,
    // not an independent decision-maker for this turn. JSON quoting preserves
    // the summary as data while the instruction requires exact narration.
    const narrationInstruction = [
      "NEXUS Runtime has already governed this admitted voice turn.",
      "Speak exactly the JSON spokenSummary string below, with no additions, omissions, contradiction, inference, or action claim.",
      JSON.stringify({ spokenSummary }),
    ].join("\n");
    const narrationCorrelationId = this.createNarrationCorrelationId();
    try {
      this.narrationResponseGate.begin(narrationCorrelationId);
      this.applyOutputMuteGate();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Realtime narration gate could not be established.");
      return;
    }
    if (!this.send({
      type: "response.create",
      response: {
        // Out-of-band narration prevents the provider from consulting the raw
        // user conversation item as a second, ungoverned reasoning input.
        conversation: "none",
        instructions: narrationInstruction,
        output_modalities: ["audio"],
        metadata: {
          [NEXUS_NARRATION_CORRELATION_METADATA_KEY]: narrationCorrelationId,
        },
      },
    })) {
      this.narrationResponseGate.reset();
      this.applyOutputMuteGate();
      this.fail("Realtime could not request narration of the admitted Runtime result.");
      return;
    }
    this.startResponseBoundary();
  }

  private settleCancellation() {
    this.cancellingResponseId = null;
    this.discardNextCreatedResponse = false;
    this.speaking = false;
    const queued = this.queuedNarration;
    this.queuedNarration = null;
    if (queued && this.turnAdmissions.isActiveTurn(queued.turnIdempotencyKey)) {
      this.requestNarration(queued.spokenSummary);
      return;
    }
    if (queued && !this.discardSupersededTranscript(queued.itemId)) return;
    this.callbacks.onState("listening");
  }

  private createNarrationCorrelationId(): string {
    if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
      throw new Error("Secure narration correlation is unavailable in this browser.");
    }
    return `nexus-narration-${crypto.randomUUID()}`;
  }

  private rejectFinalizedTranscript(itemId: string, reason = "Finalized transcript was not admitted.") {
    const validItemId = REALTIME_ITEM_ID_PATTERN.test(itemId);
    if (!validItemId || !this.send({ type: "conversation.item.delete", item_id: itemId })) {
      // A rejected item must not remain in provider conversation context where a
      // later admitted response could observe it. Close on ambiguous deletion.
      this.stop();
      this.fail(`${reason} Unable to remove it from the Realtime session.`);
      return;
    }
    this.send({ type: "input_audio_buffer.clear" });
    this.callbacks.onState("listening");
  }

  private discardSupersededTranscript(itemId: string): boolean {
    const validItemId = REALTIME_ITEM_ID_PATTERN.test(itemId);
    if (!validItemId || !this.send({ type: "conversation.item.delete", item_id: itemId })) {
      // Never retain a superseded raw utterance where a later provider event
      // could observe it. Do not clear the input buffer here: it now belongs to
      // the newer active speech turn.
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

  private startResponseBoundary() {
    this.clearResponseBoundary();
    this.responseTimer = setTimeout(() => {
      this.responseTimer = null;
      const activeResponseId = this.narrationResponseGate.reset();
      this.applyOutputMuteGate();
      if (activeResponseId) this.send({ type: "response.cancel", response_id: activeResponseId });
      this.send({ type: "output_audio_buffer.clear" });
      this.fail("Live voice did not narrate the admitted Runtime response within 10 seconds. The canonical result remains visible as text.");
    }, REALTIME_RESPONSE_TIMEOUT_MS);
  }

  private clearResponseBoundary() {
    if (this.responseTimer !== null) clearTimeout(this.responseTimer);
    this.responseTimer = null;
  }

  private fail(message: string) {
    this.clearResponseBoundary();
    this.narrationResponseGate.reset();
    this.applyOutputMuteGate();
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
