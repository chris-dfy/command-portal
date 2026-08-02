import { OPERATIONAL_SESSION_INVALID_EVENT, operationalSessionClient } from "./local-client.ts";
import { RealtimeTurnAdmissionLedger } from "./runtime-admission-policy.ts";

export type RealtimeVoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export const RUNTIME_PROMPT_ECHO_HEADER = "X-NEXUS-Prompt-Echo-Signature";

export type RealtimeTranscriptAdmission =
  | { admitted: true; spokenSummary: string }
  | { admitted: false; reason?: string };

export type RealtimeManualCommitStatus = {
  state?: string;
  serverVAD?: boolean;
  clientAudioCommitRequired?: boolean;
  inputAudioCommitEvent?: string;
};

export function isVerifiedManualCommitStatus(status: RealtimeManualCommitStatus | null | undefined): boolean {
  return status?.state === "available"
    && status.serverVAD === false
    && status.clientAudioCommitRequired === true
    && status.inputAudioCommitEvent === "input_audio_buffer.commit";
}

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

export type ClientSpeechTurnPolicy = Readonly<{
  speechStartThreshold: number;
  speechEndThreshold: number;
  speechStartHoldMs: number;
  speechEndSilenceMs: number;
  maximumTurnMs: number;
}>;

/**
 * Browser-side acoustic segmentation is deliberately small and deterministic.
 * It identifies only a bounded speech/silence envelope; Runtime remains the
 * sole owner of intent, policy, Authority, execution, and response truth.
 */
export const CLIENT_SPEECH_TURN_POLICY: ClientSpeechTurnPolicy = Object.freeze({
  speechStartThreshold: 0.055,
  speechEndThreshold: 0.025,
  speechStartHoldMs: 160,
  speechEndSilenceMs: 720,
  maximumTurnMs: 30_000,
});

export type ClientSpeechTurnEvent = "speech_started" | "speech_ended";

type ClientSpeechTurnState = "idle" | "candidate" | "speaking";

/** Pure acoustic state machine used by the AudioContext meter and unit tests. */
export class ClientSpeechTurnSegmenter {
  private readonly policy: ClientSpeechTurnPolicy;
  private state: ClientSpeechTurnState = "idle";
  private candidateStartedAtMs: number | null = null;
  private speechStartedAtMs: number | null = null;
  private silenceStartedAtMs: number | null = null;
  private lastObservedAtMs: number | null = null;

  constructor(policy: ClientSpeechTurnPolicy = CLIENT_SPEECH_TURN_POLICY) {
    if (
      !Number.isFinite(policy.speechStartThreshold)
      || !Number.isFinite(policy.speechEndThreshold)
      || policy.speechStartThreshold <= policy.speechEndThreshold
      || policy.speechEndThreshold < 0
      || policy.speechStartThreshold > 1
      || !Number.isFinite(policy.speechStartHoldMs)
      || policy.speechStartHoldMs <= 0
      || !Number.isFinite(policy.speechEndSilenceMs)
      || policy.speechEndSilenceMs <= 0
      || !Number.isFinite(policy.maximumTurnMs)
      || policy.maximumTurnMs <= policy.speechStartHoldMs + policy.speechEndSilenceMs
    ) {
      throw new Error("Realtime voice speech-turn policy is invalid.");
    }
    this.policy = policy;
  }

  observe(amplitude: number, observedAtMs: number): ClientSpeechTurnEvent | null {
    if (
      !Number.isFinite(amplitude)
      || amplitude < 0
      || amplitude > 1
      || !Number.isFinite(observedAtMs)
      || (this.lastObservedAtMs !== null && observedAtMs < this.lastObservedAtMs)
    ) {
      throw new Error("Realtime voice received an invalid acoustic sample.");
    }
    this.lastObservedAtMs = observedAtMs;

    if (this.state === "idle") {
      if (amplitude >= this.policy.speechStartThreshold) {
        this.state = "candidate";
        this.candidateStartedAtMs = observedAtMs;
      }
      return null;
    }

    if (this.state === "candidate") {
      if (amplitude < this.policy.speechStartThreshold) {
        this.resetState();
        return null;
      }
      if (
        this.candidateStartedAtMs !== null
        && observedAtMs - this.candidateStartedAtMs >= this.policy.speechStartHoldMs
      ) {
        this.state = "speaking";
        this.speechStartedAtMs = this.candidateStartedAtMs;
        this.candidateStartedAtMs = null;
        return "speech_started";
      }
      return null;
    }

    if (
      this.speechStartedAtMs !== null
      && observedAtMs - this.speechStartedAtMs >= this.policy.maximumTurnMs
    ) {
      this.resetState();
      return "speech_ended";
    }
    if (amplitude > this.policy.speechEndThreshold) {
      this.silenceStartedAtMs = null;
      return null;
    }
    if (this.silenceStartedAtMs === null) {
      this.silenceStartedAtMs = observedAtMs;
      return null;
    }
    if (observedAtMs - this.silenceStartedAtMs >= this.policy.speechEndSilenceMs) {
      this.resetState();
      return "speech_ended";
    }
    return null;
  }

  reset(): boolean {
    const discardedBufferedSpeech = this.state !== "idle";
    this.resetState();
    return discardedBufferedSpeech;
  }

  isIdle(): boolean {
    return this.state === "idle";
  }

  private resetState() {
    this.state = "idle";
    this.candidateStartedAtMs = null;
    this.speechStartedAtMs = null;
    this.silenceStartedAtMs = null;
  }
}

const normalizeTranscript = (value: string) => value
  .normalize("NFKD")
  .toLowerCase()
  .replace(/[’']/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const REALTIME_ITEM_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const MAXIMUM_SESSION_TURNS = 128;
const MAXIMUM_PENDING_COMMIT_BINDINGS = 4;
const MAXIMUM_IDLE_BUFFER_MS = 4_000;

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
  private transportReady = false;
  private promptEchoSignature: string | null = null;
  private admissionQueue: Promise<void> = Promise.resolve();
  private admittedItemIds = new Set<string>();
  private readonly turnKeyByItemId = new Map<string, string>();
  private readonly pendingCommitTurnKeys: string[] = [];
  private uncommittedTurnKey: string | null = null;
  private sessionTurnCount = 0;
  private idleBufferClearedAtMs: number | null = null;
  private readonly speechTurnSegmenter = new ClientSpeechTurnSegmenter();
  private readonly turnAdmissions = new RealtimeTurnAdmissionLedger<RealtimeTranscriptAdmission>();

  constructor(callbacks: RealtimeVoiceCallbacks) {
    this.callbacks = callbacks;
  }

  static supported() {
    return typeof window !== "undefined"
      && "RTCPeerConnection" in window
      && Boolean(window.AudioContext)
      && Boolean(navigator.mediaDevices?.getUserMedia);
  }

  async connect() {
    if (!RealtimeVoiceClient.supported()) throw new Error("This browser does not support secure live voice sessions.");
    this.callbacks.onState("connecting");
    try {
      const statusResponse = await fetch("/api/runtime/realtime-voice", {
        credentials: "same-origin",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      });
      if (statusResponse.status === 401) window.dispatchEvent(new Event(OPERATIONAL_SESSION_INVALID_EVENT));
      let statusBody: {
        ok?: boolean;
        data?: RealtimeManualCommitStatus;
        error?: { message?: string };
      };
      try {
        statusBody = await statusResponse.json() as typeof statusBody;
      } catch {
        throw new Error("NEXUS Runtime returned an invalid Realtime voice status contract.");
      }
      if (!statusResponse.ok || !statusBody.ok || !isVerifiedManualCommitStatus(statusBody.data)) {
        throw new Error(
          statusBody.error?.message
          ?? "NEXUS Runtime has not verified the required manual Realtime audio-commit contract.",
        );
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      this.applyMicrophoneMute();
      await this.startAmplitudeMeter(this.stream);

      const peer = new RTCPeerConnection();
      this.peer = peer;
      peer.ontrack = (event) => {
        event.track.stop();
        event.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
        this.stop();
        this.fail("Realtime provider attempted to attach output media to a transcription-only session.");
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(peer.connectionState)) {
          this.stop();
          this.fail("The live voice connection was interrupted.");
        }
      };
      for (const track of this.stream.getAudioTracks()) {
        peer.addTransceiver(track, { direction: "sendonly", streams: [this.stream] });
      }

      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      channel.addEventListener("message", (event) => this.handleEvent(event.data));
      channel.addEventListener("open", () => {
        if (!this.promptEchoSignature) {
          this.stop();
          this.fail("Realtime transport opened without the governed transcript-admission boundary.");
          return;
        }
        this.transportReady = true;
        this.idleBufferClearedAtMs = null;
        this.speechTurnSegmenter.reset();
        this.callbacks.onState("listening");
      });
      channel.addEventListener("close", () => {
        this.transportReady = false;
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
    this.transportReady = false;
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
    this.pendingCommitTurnKeys.splice(0);
    this.uncommittedTurnKey = null;
    this.sessionTurnCount = 0;
    this.idleBufferClearedAtMs = null;
    this.speechTurnSegmenter.reset();
    this.turnAdmissions.endTurn();
    this.callbacks.onAmplitude(0);
    this.callbacks.onState("idle");
  }

  setMicrophoneMuted(muted: boolean) {
    if (muted === this.microphoneMuted) return;
    this.microphoneMuted = muted;
    this.applyMicrophoneMute();
    if (muted) {
      const abandonedBufferedSpeech = this.speechTurnSegmenter.reset();
      this.idleBufferClearedAtMs = null;
      const abandonedTurnKey = this.uncommittedTurnKey;
      this.uncommittedTurnKey = null;
      if (abandonedTurnKey && this.turnAdmissions.isActiveTurn(abandonedTurnKey)) {
        this.turnAdmissions.endTurn();
      }
      if (abandonedBufferedSpeech && this.transportReady && !this.send({ type: "input_audio_buffer.clear" })) {
        this.stop();
        this.fail("Realtime voice could not discard the muted partial speech turn.");
        return;
      }
      this.callbacks.onAmplitude(0);
      return;
    }
    this.speechTurnSegmenter.reset();
    this.idleBufferClearedAtMs = null;
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
      case "input_audio_buffer.speech_started":
      case "input_audio_buffer.speech_stopped": {
        this.stop();
        this.fail("Realtime provider emitted a server-VAD event during a manual speech-turn session.");
        break;
      }
      case "input_audio_buffer.committed": {
        this.bindCommittedProviderItem(event);
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

  private bindCommittedProviderItem(event: RealtimeEvent) {
    const itemId = this.providerItemId(event);
    const turnIdempotencyKey = this.pendingCommitTurnKeys.shift() ?? null;
    if (!itemId || !turnIdempotencyKey || this.turnKeyByItemId.has(itemId)) {
      this.stop();
      this.fail("Realtime buffer commit did not match exactly one detected speech turn.");
      return;
    }
    this.turnKeyByItemId.set(itemId, turnIdempotencyKey);
  }

  private queueFinalizedTranscript(event: RealtimeEvent) {
    const itemId = this.providerItemId(event);
    const turnIdempotencyKey = itemId ? this.turnKeyByItemId.get(itemId) ?? null : null;
    this.admissionQueue = this.admissionQueue
      .then(() => this.admitFinalizedTranscript(event, turnIdempotencyKey))
      .catch((error) => {
        this.stop();
        this.fail(error instanceof Error ? error.message : "Realtime transcript admission failed.");
      });
  }

  private async admitFinalizedTranscript(event: RealtimeEvent, turnIdempotencyKey: string | null) {
    const text = event.transcript?.trim() ?? "";
    const itemId = this.providerItemId(event);
    if (!itemId || !turnIdempotencyKey) {
      this.stop();
      this.fail("Finalized transcript had no detected speech-turn binding.");
      return;
    }
    if (this.admittedItemIds.has(itemId)) return;
    if (!this.turnAdmissions.isActiveTurn(turnIdempotencyKey)) {
      this.discardSupersededTranscript(itemId);
      return;
    }
    if (!text || !this.promptEchoSignature || looksLikeRuntimePromptEcho(text, this.promptEchoSignature)) {
      this.rejectFinalizedTranscript(
        itemId,
        text ? "Runtime prompt echo rejected." : "Empty finalized transcript rejected.",
        turnIdempotencyKey,
      );
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
      this.rejectFinalizedTranscript(
        itemId,
        error instanceof Error ? error.message : "Runtime transcript admission failed.",
        turnIdempotencyKey,
      );
      return;
    }
    if (!this.turnAdmissions.isActiveTurn(turnIdempotencyKey)) {
      this.discardSupersededTranscript(itemId);
      return;
    }
    const responseText = admission.admitted ? admission.spokenSummary.trim() : "";
    if (!admission.admitted || !responseText || responseText.length > 4_000) {
      this.rejectFinalizedTranscript(
        itemId,
        admission.admitted ? "Runtime returned no bounded response text." : admission.reason,
        turnIdempotencyKey,
      );
      return;
    }
    this.admittedItemIds.add(itemId);
    this.callbacks.onRuntimeResponse(responseText);
    if (this.turnAdmissions.isActiveTurn(turnIdempotencyKey)) this.turnAdmissions.endTurn();
    this.callbacks.onState("listening");
  }

  private rejectFinalizedTranscript(
    itemId: string,
    reason = "Finalized transcript was not admitted.",
    turnIdempotencyKey: string | null = null,
  ) {
    if (!itemId || !this.send({ type: "conversation.item.delete", item_id: itemId })) {
      this.stop();
      this.fail(`${reason} Unable to remove it from the Realtime session.`);
      return;
    }
    if (!this.send({ type: "input_audio_buffer.clear" })) {
      this.stop();
      this.fail(`${reason} Unable to clear the Realtime input buffer.`);
      return;
    }
    if (turnIdempotencyKey && this.turnAdmissions.isActiveTurn(turnIdempotencyKey)) {
      this.turnAdmissions.endTurn();
    }
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

  private processAmplitudeSample(amplitude: number, observedAtMs: number) {
    this.callbacks.onAmplitude(this.microphoneMuted ? 0 : amplitude);
    if (!this.transportReady || this.microphoneMuted) {
      this.speechTurnSegmenter.reset();
      this.idleBufferClearedAtMs = null;
      return;
    }

    let turnEvent: ClientSpeechTurnEvent | null;
    try {
      turnEvent = this.speechTurnSegmenter.observe(amplitude, observedAtMs);
    } catch (error) {
      this.stop();
      this.fail(error instanceof Error ? error.message : "Realtime voice acoustic segmentation failed.");
      return;
    }
    if (turnEvent === "speech_started") {
      if (this.uncommittedTurnKey || this.sessionTurnCount >= MAXIMUM_SESSION_TURNS) {
        this.stop();
        this.fail("Realtime voice exceeded its bounded speech-turn session state.");
        return;
      }
      this.sessionTurnCount += 1;
      try {
        this.uncommittedTurnKey = this.turnAdmissions.beginTurn();
      } catch (error) {
        this.stop();
        this.fail(error instanceof Error ? error.message : "Realtime voice could not bind the detected speech turn.");
        return;
      }
      this.callbacks.onState("listening");
      return;
    }
    if (turnEvent !== "speech_ended") {
      if (!this.speechTurnSegmenter.isIdle()) return;
      if (this.idleBufferClearedAtMs === null) {
        this.idleBufferClearedAtMs = observedAtMs;
        return;
      }
      if (observedAtMs - this.idleBufferClearedAtMs < MAXIMUM_IDLE_BUFFER_MS) return;
      if (!this.send({ type: "input_audio_buffer.clear" })) {
        this.stop();
        this.fail("Realtime voice could not bound its idle provider audio buffer.");
        return;
      }
      this.idleBufferClearedAtMs = observedAtMs;
      return;
    }

    const turnIdempotencyKey = this.uncommittedTurnKey;
    this.uncommittedTurnKey = null;
    if (!turnIdempotencyKey || this.pendingCommitTurnKeys.length >= MAXIMUM_PENDING_COMMIT_BINDINGS) {
      this.stop();
      this.fail("Realtime voice could not preserve a bounded speech-turn commit binding.");
      return;
    }
    if (!this.send({ type: "input_audio_buffer.commit" })) {
      this.stop();
      this.fail("Realtime voice could not commit the detected speech turn.");
      return;
    }
    this.pendingCommitTurnKeys.push(turnIdempotencyKey);
    this.idleBufferClearedAtMs = observedAtMs;
    this.callbacks.onState("thinking");
  }

  private async startAmplitudeMeter(stream: MediaStream) {
    const Context = window.AudioContext;
    if (!Context) throw new Error("This browser cannot verify client-side speech-turn detection.");
    const context = new Context();
    this.audioContext = context;
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") {
      throw new Error("Browser audio analysis is not running; no Realtime voice turn can be committed safely.");
    }
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    context.createMediaStreamSource(stream).connect(analyser);
    const values = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(values);
      const mean = values.reduce((sum, value) => sum + value, 0) / (values.length * 255);
      const amplitude = Math.min(1, mean * 3.2);
      this.processAmplitudeSample(amplitude, performance.now());
      this.animationFrame = requestAnimationFrame(update);
    };
    update();
  }
}
