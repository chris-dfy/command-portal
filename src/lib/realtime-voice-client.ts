import { OPERATIONAL_SESSION_INVALID_EVENT, operationalSessionClient } from "./local-client.ts";
import { RealtimeTurnAdmissionLedger } from "./runtime-admission-policy.ts";
import {
  RealtimePcmAppendCoordinator,
  createRealtimePcmCapture,
  type RealtimePcmCapture,
} from "./realtime-pcm-input.ts";

export type RealtimeVoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export const RUNTIME_PROMPT_ECHO_HEADER = "X-NEXUS-Prompt-Echo-Signature";
export const RUNTIME_REALTIME_INPUT_MODE_HEADER = "X-NEXUS-Realtime-Input-Mode";
export const RUNTIME_REALTIME_INPUT_MODE = "client-pcm-append-commit-v1";
export const RUNTIME_REALTIME_CONTRACT_HEADER = "X-NEXUS-Realtime-Contract-Version";
export const RUNTIME_REALTIME_CONTRACT_VERSION = "nexus.realtime-voice@2.0.0";
export const RUNTIME_REALTIME_CLIENT_PROFILE_HEADER = "X-NEXUS-Realtime-Client-Profile";
export const RUNTIME_REALTIME_CLIENT_PROFILE = "trackless-pcm-transcription-v1";
export const RUNTIME_REALTIME_ARTIFACT_IDENTITY_HEADER = "X-NEXUS-Artifact-Identity-Digest";
export const RUNTIME_REALTIME_RECEIPT_DIGEST_HEADER = "X-NEXUS-Realtime-Receipt-Digest";

export type RealtimeActivationStep =
  | "readiness"
  | "get_user_media"
  | "pcm_capture"
  | "analyser_gate"
  | "offer"
  | "gateway_post"
  | "remote_description"
  | "live";

export type RealtimeTranscriptAdmission =
  | { admitted: true; spokenSummary: string }
  | { admitted: false; reason?: string };

export type RealtimeVoiceErrorContext = {
  interactionId?: string;
  retryProhibited?: boolean;
};

export type RealtimeLiveProof = {
  contractVersion: typeof RUNTIME_REALTIME_CONTRACT_VERSION;
  transportProfile: typeof RUNTIME_REALTIME_CLIENT_PROFILE;
  artifactIdentityDigest: string;
  receiptDigest: string;
  connectionState: "live";
  microphoneTrackLive: true;
  pcmCaptureActive: true;
  pcmSamplesObserved: true;
  analyserGateActive: true;
  providerAudioTransceiverDirection: "inactive";
  providerAudioSenderTrackAttached: false;
  remoteAudioTrackObserved: false;
};

export type RealtimeManualCommitStatus = {
  state?: string;
  contractVersion?: string;
  transportProfile?: string;
  supportedClientProfiles?: string[];
  preActivationNegotiationRequired?: boolean;
  serverVAD?: boolean;
  clientAudioAppendRequired?: boolean;
  inputAudioAppendEvent?: string;
  clientAudioCommitRequired?: boolean;
  inputAudioCommitEvent?: string;
  providerOfferAudioDirection?: string;
  providerOfferAudioTrackAttached?: boolean;
  rtpAudioNegotiated?: boolean;
  artifactIdentity?: { identityDigest?: string };
  providerConnected?: boolean;
  providerConnectionVerifiedForCurrentArtifact?: boolean;
};

export function isVerifiedManualCommitStatus(status: RealtimeManualCommitStatus | null | undefined): boolean {
  return status?.state === "available"
    && status.contractVersion === RUNTIME_REALTIME_CONTRACT_VERSION
    && status.transportProfile === RUNTIME_REALTIME_CLIENT_PROFILE
    && Array.isArray(status.supportedClientProfiles)
    && status.supportedClientProfiles.includes(RUNTIME_REALTIME_CLIENT_PROFILE)
    && status.preActivationNegotiationRequired === true
    && status.serverVAD === false
    && status.clientAudioAppendRequired === true
    && status.inputAudioAppendEvent === "input_audio_buffer.append"
    && status.clientAudioCommitRequired === true
    && status.inputAudioCommitEvent === "input_audio_buffer.commit"
    && status.providerOfferAudioDirection === "inactive"
    && status.providerOfferAudioTrackAttached === false
    && status.rtpAudioNegotiated === false
    && /^sha256:[0-9a-f]{64}$/.test(status.artifactIdentity?.identityDigest ?? "");
}

export type RealtimeVoiceCallbacks = {
  onState: (state: RealtimeVoiceState) => void;
  onAmplitude: (amplitude: number) => void;
  /** Submit one finalized provider transcript to the canonical Runtime path. */
  onUserTranscript: (text: string, idempotencyKey: string) => Promise<RealtimeTranscriptAdmission>;
  /** Narrate only the Runtime-returned response after current-turn admission. */
  onRuntimeResponse: (responseText: string) => void;
  onError: (message: string, context?: RealtimeVoiceErrorContext) => void;
  /** Bounded, non-secret pre-activation diagnostics for release and support proof. */
  onActivationStep?: (step: RealtimeActivationStep) => void;
  /** Emitted only after every governed transport and audio postcondition is true. */
  onLiveProof?: (proof: RealtimeLiveProof) => void;
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
const MAXIMUM_IDLE_BUFFER_MS = 4_000;
const ACTIVATION_TIMEOUT_MS = 15_000;
const SAFE_REALTIME_REASON_CODE = /^[a-z][a-z0-9_]{0,79}$/;
const SAFE_REALTIME_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function tracklessRealtimeOfferIsValid(sdp: string): boolean {
  const normalized = sdp.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trimStart().startsWith("v=0")) return false;
  const sections = normalized.split(/\nm=/).slice(1).map((section) => `m=${section}`);
  const audio = sections.filter((section) => section.startsWith("m=audio "));
  const application = sections.filter((section) => section.startsWith("m=application "));
  if (sections.length !== 2 || audio.length !== 1 || application.length !== 1) return false;
  const audioPort = audio[0].split(/\s+/, 2)[1] ?? "";
  const directions = audio[0].match(/^a=(?:inactive|sendrecv|sendonly|recvonly)$/gm) ?? [];
  return audioPort !== "" && audioPort !== "0"
    && directions.length === 1
    && directions[0] === "a=inactive"
    && !/^a=(?:msid|ssrc):/m.test(audio[0]);
}

export function runtimePromptEchoSignatureFromHeaders(headers: Pick<Headers, "get">): string | null {
  const value = headers.get(RUNTIME_PROMPT_ECHO_HEADER)?.trim() ?? "";
  if (!value || value.length > 512 || !/^[\x20-\x7e]+$/.test(value)) return null;
  return value;
}

export function runtimeRealtimeInputModeFromHeaders(headers: Pick<Headers, "get">): string | null {
  const value = headers.get(RUNTIME_REALTIME_INPUT_MODE_HEADER) ?? "";
  return value === RUNTIME_REALTIME_INPUT_MODE ? value : null;
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
  private providerAudioTransceiver: RTCRtpTransceiver | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private pcmCapture: RealtimePcmCapture | null = null;
  private animationFrame: number | null = null;
  private activationTimer: ReturnType<typeof setTimeout> | null = null;
  private activationAttempt = 0;
  private microphoneMuted = false;
  private transportReady = false;
  private promptEchoSignature: string | null = null;
  private realtimeInputModeAttested = false;
  private contractAttested = false;
  private artifactIdentityDigest: string | null = null;
  private receiptDigest: string | null = null;
  private channelOpen = false;
  private pcmSamplesObserved = false;
  private analyserFrameObserved = false;
  private remoteAudioTrackObserved = false;
  private activationStep: RealtimeActivationStep = "readiness";
  private turnProcessing = false;
  private canonicalAdmissionInFlight = false;
  private stoppedDuringCanonicalAdmission = false;
  private admissionQueue: Promise<void> = Promise.resolve();
  private admittedItemIds = new Set<string>();
  private readonly turnKeyByItemId = new Map<string, string>();
  private pendingCommitTurnKey: string | null = null;
  private uncommittedTurnKey: string | null = null;
  private sessionTurnCount = 0;
  private idleBufferClearedAtMs: number | null = null;
  private readonly speechTurnSegmenter = new ClientSpeechTurnSegmenter();
  private readonly turnAdmissions = new RealtimeTurnAdmissionLedger<RealtimeTranscriptAdmission>();
  private readonly pcmTurns = new RealtimePcmAppendCoordinator((event) => this.send(event));

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
    const activationAttempt = ++this.activationAttempt;
    this.callbacks.onState("connecting");
    this.markActivationStep("readiness");
    this.activationTimer = globalThis.setTimeout(() => {
      if (activationAttempt !== this.activationAttempt || this.transportReady) return;
      const step = this.activationStep;
      this.stop();
      this.fail(`Realtime activation timed out at ${step}.`);
    }, ACTIVATION_TIMEOUT_MS);
    try {
      const statusResponse = await fetch("/api/runtime/realtime-voice", {
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
          [RUNTIME_REALTIME_CONTRACT_HEADER]: RUNTIME_REALTIME_CONTRACT_VERSION,
          [RUNTIME_REALTIME_CLIENT_PROFILE_HEADER]: RUNTIME_REALTIME_CLIENT_PROFILE,
        },
      });
      this.assertActivationCurrent(activationAttempt);
      if (statusResponse.status === 401) window.dispatchEvent(new Event(OPERATIONAL_SESSION_INVALID_EVENT));
      let statusBody: {
        ok?: boolean;
        data?: RealtimeManualCommitStatus;
        error?: { message?: string };
      };
      try {
        statusBody = await statusResponse.json() as typeof statusBody;
        this.assertActivationCurrent(activationAttempt);
      } catch {
        throw new Error("NEXUS Runtime returned an invalid Realtime voice status contract.");
      }
      if (!statusResponse.ok || !statusBody.ok || !isVerifiedManualCommitStatus(statusBody.data)) {
        throw new Error(
          statusBody.error?.message
          ?? "NEXUS Runtime has not verified the required ordered PCM append/commit contract.",
        );
      }
      this.markActivationStep("get_user_media");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      if (activationAttempt !== this.activationAttempt) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Realtime activation was superseded before microphone admission.");
      }
      this.stream = stream;
      const microphoneTrack = stream.getAudioTracks()[0];
      if (
        !microphoneTrack
        || microphoneTrack.readyState !== "live"
        || stream.getAudioTracks().length !== 1
      ) {
        throw new Error("Browser microphone capture did not produce exactly one live audio track.");
      }
      this.applyMicrophoneMute();
      this.markActivationStep("pcm_capture");
      const pcmCapture = await createRealtimePcmCapture(stream, (samples) => {
        this.pcmSamplesObserved = true;
        this.maybeActivateLive();
        if (this.microphoneMuted || this.turnProcessing) return;
        if (this.pcmTurns.acceptSamples(samples)) return;
        this.stop();
        this.fail("Realtime PCM audio could not be appended to the governed provider turn.");
      });
      if (activationAttempt !== this.activationAttempt) {
        pcmCapture.stop();
        throw new Error("Realtime activation was superseded during PCM capture.");
      }
      this.pcmCapture = pcmCapture;
      this.markActivationStep("analyser_gate");
      await this.startAmplitudeMeter(stream);
      this.assertActivationCurrent(activationAttempt);

      const peer = new RTCPeerConnection();
      this.peer = peer;
      peer.ontrack = (event) => {
        if (event.track.kind !== "audio") return;
        this.remoteAudioTrackObserved = true;
        event.track.stop();
        event.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
        this.stop();
        this.fail("Realtime provider attempted to attach forbidden output audio.");
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(peer.connectionState)) {
          this.stop();
          this.fail("The live voice connection was interrupted.");
          return;
        }
        this.maybeActivateLive();
      };
      const inactiveAudioTransceiver = peer.addTransceiver("audio", { direction: "inactive" });
      this.providerAudioTransceiver = inactiveAudioTransceiver;
      if (inactiveAudioTransceiver.direction !== "inactive" || inactiveAudioTransceiver.sender.track !== null) {
        throw new Error("Realtime provider compatibility media must remain inactive and trackless.");
      }
      const channel = peer.createDataChannel("oai-events", { ordered: true });
      this.channel = channel;
      channel.addEventListener("message", (event) => this.handleEvent(event.data));
      channel.addEventListener("open", () => {
        if (!this.promptEchoSignature || !this.realtimeInputModeAttested || !this.contractAttested) {
          this.stop();
          this.fail("Realtime transport opened without the governed negotiated admission boundary.");
          return;
        }
        this.channelOpen = true;
        this.maybeActivateLive();
      });
      channel.addEventListener("close", () => {
        this.channelOpen = false;
        this.transportReady = false;
        if (this.peer) this.callbacks.onState("idle");
      });

      this.markActivationStep("offer");
      const offer = await peer.createOffer();
      this.assertActivationCurrent(activationAttempt);
      if (!offer.sdp || !tracklessRealtimeOfferIsValid(offer.sdp)) {
        throw new Error("Browser WebRTC offer violated the inactive trackless audio contract.");
      }
      await peer.setLocalDescription(offer);
      this.assertActivationCurrent(activationAttempt);
      this.markActivationStep("gateway_post");
      const response = await fetch("/api/runtime/realtime/call", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/sdp",
          "Content-Type": "application/sdp",
          [RUNTIME_REALTIME_CONTRACT_HEADER]: RUNTIME_REALTIME_CONTRACT_VERSION,
          [RUNTIME_REALTIME_CLIENT_PROFILE_HEADER]: RUNTIME_REALTIME_CLIENT_PROFILE,
          ...operationalSessionClient.hostedMutationHeaders(),
        },
        body: offer.sdp,
      });
      this.assertActivationCurrent(activationAttempt);
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event(OPERATIONAL_SESSION_INVALID_EVENT));
        let reasonCode = "realtime_call_failed";
        let requestId = response.headers.get("x-request-id") ?? "";
        try {
          const body = await response.json() as {
            error?: { code?: string; reasonCode?: string; requestId?: string };
          };
          const candidateReason = body.error?.reasonCode || body.error?.code || "";
          if (SAFE_REALTIME_REASON_CODE.test(candidateReason)) reasonCode = candidateReason;
          if (body.error?.requestId) requestId = body.error.requestId;
        } catch { /* retain the bounded diagnostics */ }
        const request = SAFE_REALTIME_REQUEST_ID.test(requestId)
          ? ` Request ID: ${requestId}.`
          : "";
        throw new Error(`Live voice session could not start. Reason: ${reasonCode}.${request}`);
      }
      const answer = await response.text();
      this.assertActivationCurrent(activationAttempt);
      if (!answer.trimStart().startsWith("v=0")) throw new Error("Live voice session returned an invalid connection response.");
      const promptEchoSignature = runtimePromptEchoSignatureFromHeaders(response.headers);
      if (!promptEchoSignature) throw new Error("NEXUS Runtime omitted the governed Realtime transcript-admission boundary.");
      const realtimeInputMode = runtimeRealtimeInputModeFromHeaders(response.headers);
      if (!realtimeInputMode) throw new Error("NEXUS Runtime did not attest the exact ordered PCM append/commit mode for this call.");
      const negotiatedContract = response.headers.get(RUNTIME_REALTIME_CONTRACT_HEADER) ?? "";
      const negotiatedProfile = response.headers.get(RUNTIME_REALTIME_CLIENT_PROFILE_HEADER) ?? "";
      const artifactIdentityDigest = response.headers.get(RUNTIME_REALTIME_ARTIFACT_IDENTITY_HEADER) ?? "";
      const receiptDigest = response.headers.get(RUNTIME_REALTIME_RECEIPT_DIGEST_HEADER) ?? "";
      if (
        negotiatedContract !== RUNTIME_REALTIME_CONTRACT_VERSION
        || negotiatedProfile !== RUNTIME_REALTIME_CLIENT_PROFILE
      ) {
        throw new Error("NEXUS Runtime did not attest the negotiated Realtime client contract.");
      }
      if (
        !/^sha256:[0-9a-f]{64}$/.test(artifactIdentityDigest)
        || !/^sha256:[0-9a-f]{64}$/.test(receiptDigest)
      ) {
        throw new Error("NEXUS Runtime omitted the current-artifact Realtime receipt binding.");
      }
      this.promptEchoSignature = promptEchoSignature;
      this.realtimeInputModeAttested = true;
      this.contractAttested = true;
      this.artifactIdentityDigest = artifactIdentityDigest;
      this.receiptDigest = receiptDigest;
      this.markActivationStep("remote_description");
      await peer.setRemoteDescription({ type: "answer", sdp: answer });
      this.assertActivationCurrent(activationAttempt);
      this.maybeActivateLive();
    } catch (error) {
      this.stop();
      const message = error instanceof Error
        ? error.message
        : "NEXUS Runtime could not establish the governed Realtime session.";
      throw new Error(`${message} Activation step: ${this.activationStep}.`);
    }
  }

  stop() {
    this.activationAttempt += 1;
    const preserveCanonicalAdmission = this.canonicalAdmissionInFlight
      && this.turnAdmissions.activeTurnKey() !== null;
    this.transportReady = false;
    this.channelOpen = false;
    this.pcmSamplesObserved = false;
    this.analyserFrameObserved = false;
    this.remoteAudioTrackObserved = false;
    if (this.activationTimer !== null) globalThis.clearTimeout(this.activationTimer);
    this.activationTimer = null;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.pcmCapture?.stop();
    this.pcmCapture = null;
    this.pcmTurns.reset();
    this.channel?.close();
    this.channel = null;
    this.peer?.close();
    this.peer = null;
    this.providerAudioTransceiver = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.promptEchoSignature = null;
    this.realtimeInputModeAttested = false;
    this.contractAttested = false;
    this.artifactIdentityDigest = null;
    this.receiptDigest = null;
    if (preserveCanonicalAdmission) {
      this.stoppedDuringCanonicalAdmission = true;
    } else {
      this.turnProcessing = false;
      this.admittedItemIds.clear();
      this.turnKeyByItemId.clear();
      this.pendingCommitTurnKey = null;
      this.uncommittedTurnKey = null;
      this.sessionTurnCount = 0;
      this.turnAdmissions.endTurn();
    }
    this.idleBufferClearedAtMs = null;
    this.speechTurnSegmenter.reset();
    this.callbacks.onAmplitude(0);
    this.callbacks.onState("idle");
  }

  setMicrophoneMuted(muted: boolean) {
    if (muted === this.microphoneMuted) return;
    this.microphoneMuted = muted;
    this.applyMicrophoneMute();
    if (muted) {
      if (this.turnProcessing) {
        this.callbacks.onAmplitude(0);
        return;
      }
      const abandonedBufferedSpeech = this.speechTurnSegmenter.reset();
      this.idleBufferClearedAtMs = null;
      const abandonedTurnKey = this.uncommittedTurnKey;
      this.uncommittedTurnKey = null;
      if (abandonedTurnKey && this.turnAdmissions.isActiveTurn(abandonedTurnKey)) {
        this.turnAdmissions.endTurn();
      }
      if (abandonedBufferedSpeech && this.transportReady && !this.pcmTurns.clearProviderBuffer()) {
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
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !this.microphoneMuted && !this.turnProcessing;
    });
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
      this.fail("Realtime provider emitted a forbidden output event.");
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
        this.fail("The live transcription provider reported a bounded protocol failure. Reason: realtime_provider_error.");
        break;
      default:
        // Session, rate-limit, buffer-commit, and transcription-delta events
        // carry no final answer and require no client-side action.
        break;
    }
  }

  private bindCommittedProviderItem(event: RealtimeEvent) {
    const itemId = this.providerItemId(event);
    const turnIdempotencyKey = this.pendingCommitTurnKey;
    if (!itemId || !turnIdempotencyKey || this.turnKeyByItemId.has(itemId)) {
      this.stop();
      this.fail("Realtime buffer commit did not match exactly one detected speech turn.");
      return;
    }
    this.pendingCommitTurnKey = null;
    this.turnKeyByItemId.set(itemId, turnIdempotencyKey);
  }

  private queueFinalizedTranscript(event: RealtimeEvent) {
    const itemId = this.providerItemId(event);
    const turnIdempotencyKey = itemId ? this.turnKeyByItemId.get(itemId) ?? null : null;
    this.admissionQueue = this.admissionQueue
      .then(() => this.admitFinalizedTranscript(event, turnIdempotencyKey))
      .catch((error) => {
        this.canonicalAdmissionInFlight = false;
        this.stoppedDuringCanonicalAdmission = false;
        this.turnProcessing = false;
        this.turnAdmissions.endTurn();
        this.stop();
        const context = error && typeof error === "object"
          ? {
              interactionId: typeof (error as { interactionId?: unknown }).interactionId === "string"
                ? (error as { interactionId: string }).interactionId
                : undefined,
              retryProhibited: (error as { retryProhibited?: unknown }).retryProhibited === true,
            }
          : undefined;
        this.fail(
          error instanceof Error ? error.message : "Realtime transcript admission failed.",
          context,
        );
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
      if (!this.transportReady) return;
      this.stop();
      this.fail("Finalized transcript did not match the one active serialized speech turn.");
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
    this.canonicalAdmissionInFlight = true;
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
      throw error instanceof Error ? error : new Error("Runtime transcript admission failed.");
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
    if (!this.stoppedDuringCanonicalAdmission) {
      this.callbacks.onRuntimeResponse(responseText);
    }
    this.releaseTurn(turnIdempotencyKey);
    if (this.transportReady) this.callbacks.onState("listening");
  }

  private rejectFinalizedTranscript(
    itemId: string,
    reason = "Finalized transcript was not admitted.",
    turnIdempotencyKey: string | null = null,
  ) {
    if (this.stoppedDuringCanonicalAdmission && !this.transportReady) {
      if (turnIdempotencyKey) this.releaseTurn(turnIdempotencyKey);
      return;
    }
    if (!itemId || !this.send({ type: "conversation.item.delete", item_id: itemId })) {
      this.stop();
      this.fail(`${reason} Unable to remove it from the Realtime session.`);
      return;
    }
    if (!this.pcmTurns.clearProviderBuffer()) {
      this.stop();
      this.fail(`${reason} Unable to clear the Realtime input buffer.`);
      return;
    }
    if (turnIdempotencyKey && this.turnAdmissions.isActiveTurn(turnIdempotencyKey)) {
      this.releaseTurn(turnIdempotencyKey);
    }
    if (this.transportReady) this.callbacks.onState("listening");
  }

  private releaseTurn(turnIdempotencyKey: string) {
    if (this.turnAdmissions.isActiveTurn(turnIdempotencyKey)) {
      this.turnAdmissions.endTurn();
    }
    this.canonicalAdmissionInFlight = false;
    this.stoppedDuringCanonicalAdmission = false;
    this.turnProcessing = false;
    this.pendingCommitTurnKey = null;
    this.speechTurnSegmenter.reset();
    this.idleBufferClearedAtMs = null;
    this.applyMicrophoneMute();
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

  private fail(message: string, context?: RealtimeVoiceErrorContext) {
    const activeInteractionId = this.canonicalAdmissionInFlight
      ? this.turnAdmissions.activeTurnKey()
      : null;
    const protectedContext = activeInteractionId
      ? { interactionId: activeInteractionId, retryProhibited: true }
      : context;
    const protectedMessage = activeInteractionId && context?.retryProhibited !== true
      ? `${message} Canonical interaction ${activeInteractionId} remains in flight; do not retry it under a new identifier.`
      : message;
    this.callbacks.onState("error");
    this.callbacks.onError(protectedMessage, protectedContext);
  }

  private markActivationStep(step: RealtimeActivationStep) {
    this.activationStep = step;
    this.callbacks.onActivationStep?.(step);
  }

  private assertActivationCurrent(attempt: number) {
    if (attempt !== this.activationAttempt) {
      throw new Error("Realtime activation was superseded or stopped before live admission.");
    }
  }

  private maybeActivateLive() {
    if (this.transportReady) return;
    const track = this.stream?.getAudioTracks()[0];
    if (
      this.peer?.connectionState !== "connected"
      || !this.channelOpen
      || this.channel?.readyState !== "open"
      || track?.readyState !== "live"
      || !this.pcmCapture
      || !this.pcmSamplesObserved
      || !this.analyserFrameObserved
      || this.providerAudioTransceiver?.currentDirection !== "inactive"
      || this.providerAudioTransceiver.sender.track !== null
      || this.remoteAudioTrackObserved
      || !this.promptEchoSignature
      || !this.realtimeInputModeAttested
      || !this.contractAttested
      || !this.artifactIdentityDigest
      || !this.receiptDigest
    ) return;
    this.transportReady = true;
    if (this.activationTimer !== null) globalThis.clearTimeout(this.activationTimer);
    this.activationTimer = null;
    this.idleBufferClearedAtMs = null;
    this.speechTurnSegmenter.reset();
    if (!this.pcmTurns.clearProviderBuffer()) {
      this.stop();
      this.fail("Realtime ordered PCM transport could not initialize.");
      return;
    }
    this.markActivationStep("live");
    this.callbacks.onLiveProof?.({
      contractVersion: RUNTIME_REALTIME_CONTRACT_VERSION,
      transportProfile: RUNTIME_REALTIME_CLIENT_PROFILE,
      artifactIdentityDigest: this.artifactIdentityDigest,
      receiptDigest: this.receiptDigest,
      connectionState: "live",
      microphoneTrackLive: true,
      pcmCaptureActive: true,
      pcmSamplesObserved: true,
      analyserGateActive: true,
      providerAudioTransceiverDirection: "inactive",
      providerAudioSenderTrackAttached: false,
      remoteAudioTrackObserved: false,
    });
    this.callbacks.onState("listening");
  }

  private processAmplitudeSample(amplitude: number, observedAtMs: number) {
    this.callbacks.onAmplitude(this.microphoneMuted || this.turnProcessing ? 0 : amplitude);
    if (!this.transportReady || this.microphoneMuted || this.turnProcessing) {
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
      if (!this.pcmTurns.beginTurn()) {
        const abandonedTurnKey = this.uncommittedTurnKey;
        this.uncommittedTurnKey = null;
        if (abandonedTurnKey && this.turnAdmissions.isActiveTurn(abandonedTurnKey)) {
          this.turnAdmissions.endTurn();
        }
        this.stop();
        this.fail("Realtime PCM audio turn could not start.");
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
      if (!this.pcmTurns.clearProviderBuffer()) {
        this.stop();
        this.fail("Realtime voice could not bound its idle provider audio buffer.");
        return;
      }
      this.idleBufferClearedAtMs = observedAtMs;
      return;
    }

    const turnIdempotencyKey = this.uncommittedTurnKey;
    this.uncommittedTurnKey = null;
    if (!turnIdempotencyKey || this.pendingCommitTurnKey || this.turnProcessing) {
      this.stop();
      this.fail("Realtime voice could not preserve a bounded speech-turn commit binding.");
      return;
    }
    if (!this.pcmTurns.commitTurn()) {
      this.stop();
      this.fail("Realtime voice could not commit the detected speech turn.");
      return;
    }
    this.pendingCommitTurnKey = turnIdempotencyKey;
    this.turnProcessing = true;
    this.applyMicrophoneMute();
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
      this.analyserFrameObserved = true;
      this.maybeActivateLive();
      this.processAmplitudeSample(amplitude, performance.now());
      this.animationFrame = requestAnimationFrame(update);
    };
    update();
  }
}
