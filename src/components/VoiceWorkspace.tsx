import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { deriveAssistantAvatarState, NexusAvatar } from "./NexusAvatar";
import "./NexusAvatar.css";
import { DataPanel } from "./DataPanel";
import { displayLabel } from "../lib/presentation";
import { localNexusClient, newExecutiveInteractionId } from "../lib/local-client";
import type { CanonicalActionAvailability } from "../lib/portal-client";
import {
  isVerifiedManualCommitStatus,
  RealtimeVoiceClient,
  RUNTIME_REALTIME_CLIENT_PROFILE,
  RUNTIME_REALTIME_CLIENT_PROFILE_HEADER,
  RUNTIME_REALTIME_CONTRACT_HEADER,
  RUNTIME_REALTIME_CONTRACT_VERSION,
  type RealtimeActivationStep,
  type RealtimeLiveProof,
  type RealtimeManualCommitStatus,
  type RealtimeVoiceState,
} from "../lib/realtime-voice-client";
import { browserSpeechAvailability, recognizeBrowserSpeech, speakBrowserResponse } from "../lib/browser-speech";
import {
  beginPrivateDraftAttempt,
  clearPrivateDraftAfterSuccess,
  executeExplicitPrivateDraftAction,
  retainPrivateDraftAfterFailure,
  shouldPresentPrivateDraft,
  snapshotPrivateDraftOperation,
  type PrivateDraftOperation,
} from "../lib/private-draft-operation";
import {
  admitApprovedExecutiveInteraction,
  admitRuntimeVoiceTranscript,
  clearPendingExecutiveApproval,
  pendingExecutiveApprovalId,
  recoverPendingExecutiveApproval,
  rememberPendingExecutiveApproval,
  runtimeInteractionTrace,
  type RuntimeInteractionAdmission,
  validateExecutiveInteractionDenial,
} from "../lib/runtime-voice-admission";
import { ExecutiveInteractionApproval } from "./ExecutiveInteractionApproval";
import { OperationalResultLineage, type OpenOperationalReplay } from "./OperationalResultLineage";

type VoiceStatus = RealtimeManualCommitStatus & {
  state?: string;
  provider?: string;
  model?: string;
  voice?: string;
  transport?: string;
  serverVAD?: boolean;
  clientAudioAppendRequired?: boolean;
  inputAudioAppendEvent?: string;
  clientAudioCommitRequired?: boolean;
  inputAudioCommitEvent?: string;
  providerOfferAudioDirection?: string;
  providerOfferAudioTrackAttached?: boolean;
  rtpAudioNegotiated?: boolean;
  interruptResponse?: boolean;
  contextAssemblyOwner?: string;
  limitations?: string[];
};

type TranscriptEntry = { speaker: "You" | "NEXUS"; text: string };
type VoiceRequestPayload = {
  transcript: string;
  source: "browser_speech" | "text_fallback";
  fallbackContext: string;
  historyAlreadyRecorded: boolean;
};
type PendingVoiceRequest = PrivateDraftOperation<VoiceRequestPayload>;

export function VoiceWorkspace({
  onReplay,
  realtimeAction,
  textAction,
}: {
  onReplay?: OpenOperationalReplay;
  realtimeAction: CanonicalActionAvailability;
  textAction: CanonicalActionAvailability;
}) {
  const [voiceState, setVoiceState] = useState<RealtimeVoiceState>("idle");
  const [activationStep, setActivationStep] = useState<RealtimeActivationStep>("readiness");
  const [liveProof, setLiveProof] = useState<RealtimeLiveProof | null>(null);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [nexusMuted, setNexusMuted] = useState(false);
  const nexusMutedRef = useRef(false);
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [amplitude, setAmplitude] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [assistantTranscript, setAssistantTranscript] = useState("");
  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [browserListening, setBrowserListening] = useState(false);
  const [latestAdmission, setLatestAdmission] = useState<RuntimeInteractionAdmission | null>(null);
  const [pendingApproval, setPendingApproval] = useState<RuntimeInteractionAdmission | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<"approve" | "deny" | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingVoiceRequest | null>(null);
  const liveClient = useRef<RealtimeVoiceClient | null>(null);
  const latestUserTranscript = useRef("");
  const conversationId = useRef(newExecutiveInteractionId());

  const connected = ["listening", "thinking", "speaking", "interrupted"].includes(voiceState);
  const supported = RealtimeVoiceClient.supported();
  const browserSpeech = browserSpeechAvailability();
  const manualCommitVerified = isVerifiedManualCommitStatus(status);
  const liveProviderAvailable = realtimeAction.available
    && supported
    && manualCommitVerified;
  const liveProviderReason = !realtimeAction.available
    ? realtimeAction.reason
    : !supported
      ? "This browser does not support secure WebRTC microphone capture."
      : !manualCommitVerified
        ? status?.limitations?.[0] ?? "The Runtime has not verified the required ordered PCM append/commit contract."
        : "The exact Realtime voice action, provider contract, and browser capture path are available.";
  const resultProofId = latestAdmission?.proofIds[0];
  const resultReceiptId = latestAdmission?.receiptIds[0];

  useEffect(() => {
    if (realtimeAction.available) void refreshStatus();
    else setMessage(realtimeAction.reason);
    return () => liveClient.current?.stop();
  }, [realtimeAction.available, realtimeAction.reason]);

  useEffect(() => {
    void recoverPendingExecutiveApproval()
      .then((admission) => {
        if (!admission) return;
        setLatestAdmission(admission);
        setPendingApproval(admission);
        setAssistantTranscript(admission.spokenSummary);
        setMessage(`Recovered from the Runtime interaction ledger. ${runtimeInteractionTrace(admission)}`);
      })
      .catch((error) => setMessage(messageFrom(error)));
  }, []);

  async function refreshStatus() {
    try {
      const response = await fetch("/api/runtime/realtime-voice", {
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
          [RUNTIME_REALTIME_CONTRACT_HEADER]: RUNTIME_REALTIME_CONTRACT_VERSION,
          [RUNTIME_REALTIME_CLIENT_PROFILE_HEADER]: RUNTIME_REALTIME_CLIENT_PROFILE,
        },
      });
      const body = await response.json() as { ok?: boolean; data?: VoiceStatus; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "Realtime voice status is unavailable.");
      setStatus(body.data);
    } catch (error) {
      setStatus(null);
      setMessage(messageFrom(error));
    }
  }

  function presentAdmission(admission: RuntimeInteractionAdmission) {
    setLatestAdmission(admission);
    rememberPendingExecutiveApproval(admission);
    setPendingApproval(pendingExecutiveApprovalId(admission) ? admission : null);
    setAssistantTranscript(admission.spokenSummary);
    setHistory((items) => [
      { speaker: "NEXUS", text: admission.spokenSummary } as TranscriptEntry,
      ...items,
    ].slice(0, 10));
    setMessage(["Runtime returned the canonical governed interaction result.", runtimeInteractionTrace(admission)].join(" "));
  }

  async function approvePendingIntent() {
    const pending = pendingApproval;
    const approvalId = pendingExecutiveApprovalId(pending);
    if (!pending || !approvalId || approvalBusy) return;
    setMessage(null);
    setApprovalBusy("approve");
    try {
      const response = await localNexusClient.approve(approvalId);
      presentAdmission(await admitApprovedExecutiveInteraction(response, pending));
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setApprovalBusy(null);
    }
  }

  async function denyPendingIntent() {
    const pending = pendingApproval;
    const approvalId = pendingExecutiveApprovalId(pending);
    if (!pending || !approvalId || approvalBusy) return;
    setMessage(null);
    setApprovalBusy("deny");
    try {
      const response = await localNexusClient.deny(
        approvalId,
        "Denied by the authenticated operator in NEXUS Command Voice Workspace.",
      );
      validateExecutiveInteractionDenial(
        response,
        approvalId,
        pending.interactionResult.interaction_id,
      );
      clearPendingExecutiveApproval(pending.interactionResult.interaction_id);
      setPendingApproval(null);
      const denial = `Runtime recorded the denial for approval ${approvalId}. No approval continuation was admitted.`;
      setAssistantTranscript(denial);
      setHistory((items) => [{ speaker: "NEXUS", text: denial } as TranscriptEntry, ...items].slice(0, 10));
      setMessage(denial);
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setApprovalBusy(null);
    }
  }

  async function startLiveVoice() {
    if (!liveProviderAvailable) {
      setMessage(liveProviderReason);
      return;
    }
    setMessage(null);
    setAssistantTranscript("");
    latestUserTranscript.current = "";
    setLiveProof(null);
    setActivationStep("readiness");
    setMicrophoneMuted(false);
    setNexusMuted(false);
    nexusMutedRef.current = false;
    const client = new RealtimeVoiceClient({
      onState: (nextState) => {
        setVoiceState(nextState);
        if (nextState === "idle" || nextState === "error") setLiveProof(null);
        if (nextState === "listening") {
          setMessage("Live voice is connected with verified microphone, PCM capture, analyser, Gateway, and current-artifact receipt postconditions.");
        }
      },
      onActivationStep: setActivationStep,
      onLiveProof: setLiveProof,
      onAmplitude: setAmplitude,
      onUserTranscript: async (text, idempotencyKey) => {
        latestUserTranscript.current = text;
        setHistory((items) => [{ speaker: "You", text } as TranscriptEntry, ...items].slice(0, 10));
        const admission = await admitRuntimeVoiceTranscript(text, conversationId.current, idempotencyKey);
        presentAdmission(admission);
        latestUserTranscript.current = "";
        return admission;
      },
      onRuntimeResponse: (responseText) => {
        if (!nexusMutedRef.current) speakBrowserResponse(responseText);
      },
      onError: (errorMessage, context) => {
        setMessage(errorMessage);
        if (context?.retryProhibited) return;
        const captured = latestUserTranscript.current.trim();
        if (captured) {
          const staged = snapshotPrivateDraftOperation(
            {
              transcript: captured,
              source: "browser_speech" as const,
              fallbackContext: "Live voice timed out; the captured utterance was sent only after your explicit governed Voice action.",
              historyAlreadyRecorded: true,
            },
            newExecutiveInteractionId(),
          );
          setPendingRequest((current) => (
            current
            && current.payload.transcript === staged.payload.transcript
            && current.payload.source === staged.payload.source
            && current.payload.fallbackContext === staged.payload.fallbackContext
            && current.payload.historyAlreadyRecorded === staged.payload.historyAlreadyRecorded
              ? current
              : staged
          ));
          setMessage(`${errorMessage} The captured transcript has not been sent. Use the explicit governed Voice action to send it.`);
        }
      },
    });
    liveClient.current = client;
    try {
      await client.connect();
    } catch (error) {
      setVoiceState("error");
      setMessage(messageFrom(error));
    }
  }

  function stopLiveVoice() {
    liveClient.current?.stop();
    liveClient.current = null;
    latestUserTranscript.current = "";
    setMicrophoneMuted(false);
    setNexusMuted(false);
    nexusMutedRef.current = false;
    setLiveProof(null);
    setMessage("Live voice session ended. No provider credential was stored in the browser.");
  }

  function toggleMicrophoneMute() {
    const muted = !microphoneMuted;
    liveClient.current?.setMicrophoneMuted(muted);
    setMicrophoneMuted(muted);
    setMessage(muted ? "Your microphone is muted. The live session remains connected." : "Your microphone is live. The session remains connected.");
  }

  function toggleNexusMute() {
    const muted = !nexusMuted;
    liveClient.current?.setOutputMuted(muted);
    setNexusMuted(muted);
    nexusMutedRef.current = muted;
    setMessage(muted ? "NEXUS audio is muted. Responses remain visible as text." : "NEXUS audio playback is restored.");
  }

  async function routeGovernedTranscript(
    requestedTranscript: string,
    source: "browser_speech" | "text_fallback",
    fallbackContext = "",
    historyAlreadyRecorded = false,
    retryRequest: PendingVoiceRequest | null = null,
  ) {
    const submittedTranscript = requestedTranscript.trim();
    if (!submittedTranscript && !retryRequest) return;
    if (!textAction.available) {
      setMessage(textAction.reason);
      return;
    }
    const staged = retryRequest ?? snapshotPrivateDraftOperation(
      {
        transcript: submittedTranscript,
        source,
        fallbackContext,
        historyAlreadyRecorded,
      },
      newExecutiveInteractionId(),
    );
    const presentOperatorTranscript = shouldPresentPrivateDraft(
      staged,
      staged.payload.historyAlreadyRecorded,
    );
    const operation = beginPrivateDraftAttempt(staged);
    setPendingRequest(operation);
    if (!retryRequest) setTranscript("");
    if (presentOperatorTranscript) {
      setHistory((items) => [
        { speaker: "You", text: operation.payload.transcript } as TranscriptEntry,
        ...items,
      ].slice(0, 10));
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await executeExplicitPrivateDraftAction(
        operation,
        (explicitOperation) => admitRuntimeVoiceTranscript(
          explicitOperation.payload.transcript,
          conversationId.current,
          explicitOperation.idempotencyKey,
        ),
      );
      const responseText = response.spokenSummary;
      const spoken = operation.payload.source === "browser_speech" && !nexusMuted && speakBrowserResponse(responseText);
      setLatestAdmission(response);
      rememberPendingExecutiveApproval(response);
      setPendingApproval(pendingExecutiveApprovalId(response) ? response : null);
      setPendingRequest(clearPrivateDraftAfterSuccess());
      setAssistantTranscript(responseText);
      setHistory((items) => [
        { speaker: "NEXUS", text: responseText } as TranscriptEntry,
        ...items,
      ].slice(0, 10));
      setMessage([
        operation.payload.fallbackContext,
        "Text request was processed by the canonical NEXUS Runtime interaction coordinator.",
        runtimeInteractionTrace(response),
        operation.payload.source === "browser_speech"
          ? spoken
            ? "The browser is playing the actual Runtime response locally."
            : "Browser speech output is unavailable; the actual Runtime response remains visible as text."
          : "",
      ].filter(Boolean).join(" "));
    } catch (error) {
      setPendingRequest(retainPrivateDraftAfterFailure(operation));
      setMessage(messageFrom(error));
    } finally {
      if (latestUserTranscript.current.trim() === operation.payload.transcript) latestUserTranscript.current = "";
      setBusy(false);
    }
  }

  async function sendText() {
    await routeGovernedTranscript(transcript, "text_fallback");
  }

  async function useBrowserMicrophone() {
    if (!textAction.available) {
      setMessage(textAction.reason);
      return;
    }
    setBrowserListening(true);
    setMessage("Listening through the browser microphone for up to 8 seconds…");
    try {
      const captured = await recognizeBrowserSpeech();
      latestUserTranscript.current = captured;
      await routeGovernedTranscript(captured, "browser_speech");
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBrowserListening(false);
    }
  }

  return <div className="experience-grid local-workspace">
    <DataPanel eyebrow="Runtime-managed Realtime voice" title="Speak with NEXUS" icon={<Mic size={18} />} className="span-2">
      <p className="workspace-intro">A governed voice session with bounded browser speech-turn detection and provider transcription. WebRTC carries ordered microphone PCM on its data channel only; one manual commit follows the appended audio for each detected turn, each final transcript enters the canonical Runtime once, and browser narration speaks only Runtime response text.</p>
      <div className="realtime-voice-stage">
        <NexusAvatar state={deriveAssistantAvatarState({ voiceState, textBusy: busy, hasError: false })} amplitude={amplitude} size="lg" micMuted={microphoneMuted && connected} unavailable={!connected && !liveProviderAvailable} />
        <div className="voice-stage-copy">
          <small>LIVE VOICE STATE</small>
          <strong>{microphoneMuted && connected ? "Microphone muted" : connected ? displayLabel(voiceState) : liveProviderAvailable ? "Available" : "Unavailable"}</strong>
          <p>{microphoneMuted && connected ? "Background audio is not being sent; the live session remains connected." : voiceState === "speaking" ? assistantTranscript || "NEXUS is responding…" : voiceState === "thinking" ? "NEXUS is forming a response…" : connected ? "Listening — speak naturally" : liveProviderAvailable ? "Start a secure live voice session" : liveProviderReason}</p>
        </div>
        {connected ? <div className="voice-stage-controls">
          <button data-active={microphoneMuted} aria-pressed={microphoneMuted} onClick={toggleMicrophoneMute}>{microphoneMuted ? <MicOff size={17} /> : <Mic size={17} />}<span>{microphoneMuted ? "Unmute microphone" : "Mute microphone"}</span></button>
          <button data-active={nexusMuted} aria-pressed={nexusMuted} onClick={toggleNexusMute}>{nexusMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}<span>{nexusMuted ? "Unmute NEXUS" : "Mute NEXUS"}</span></button>
          <button className="voice-stop" onClick={stopLiveVoice}><MicOff size={17} /><span>End live voice</span></button>
        </div> : <button className="voice-start" onClick={() => void startLiveVoice()} disabled={!liveProviderAvailable || voiceState === "connecting"} title={liveProviderAvailable ? undefined : liveProviderReason}>
          <Mic size={19} /><span>{voiceState === "connecting" ? "Connecting…" : liveProviderAvailable ? "Start live voice" : "Live voice unavailable"}</span>
        </button>}
      </div>
      <div className="voice-text-fallback">
        <textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setPendingRequest((current) => current?.attempts === 0 && current.payload.historyAlreadyRecorded ? current : null); }} disabled={!textAction.available} placeholder={textAction.available ? "Or type a request for the governed Runtime Voice Operator" : "Runtime Voice Operator is unavailable"} autoComplete="off" />
        {browserSpeech.input && <button onClick={() => void useBrowserMicrophone()} disabled={!textAction.available || busy || browserListening} title="Continuity input only; this does not prove governed Realtime live voice readiness."><Mic size={17} /> {browserListening ? "Listening…" : "Use browser microphone (continuity)"}</button>}
        {pendingRequest && <button onClick={() => void routeGovernedTranscript("", pendingRequest.payload.source, pendingRequest.payload.fallbackContext, pendingRequest.payload.historyAlreadyRecorded, pendingRequest)} disabled={!textAction.available || busy} title={textAction.available ? undefined : textAction.reason}><Send size={17} /> {pendingRequest.attempts === 0 ? "Send captured transcript through governed Voice" : "Retry exact governed Voice request"}</button>}
        <button onClick={() => void sendText()} disabled={!textAction.available || busy || !transcript.trim()}><Send size={17} /> Send text</button>
      </div>
      <p className="boundary-note">{browserSpeech.input ? "Browser microphone fallback is continuity-only, bounded to 8 seconds, and never proves governed Realtime live voice readiness." : "Browser speech recognition is unavailable; typed governed continuity remains available and does not prove live voice readiness."} {browserSpeech.output ? "Browser speech playback can read the actual Runtime response aloud." : "Browser speech playback is unavailable; responses remain visible as text."}</p>
      {voiceState === "connecting" && <p className="workspace-message" role="status">Voice activation step: {displayLabel(activationStep)}</p>}
      {message && <p className="workspace-message" role="status">{message}</p>}
      <ExecutiveInteractionApproval
        admission={pendingApproval}
        busy={approvalBusy}
        onApprove={() => void approvePendingIntent()}
        onDeny={() => void denyPendingIntent()}
      />
      {latestAdmission && <OperationalResultLineage proofId={resultProofId} receiptId={resultReceiptId} onOpenReplay={onReplay} />}
      <p className="boundary-note">Realtime conversation may use model-native knowledge. Organization-specific facts, live operational state, completed actions, and authoritative evidence still require registered Runtime context, connectors, proofs, and receipts.</p>
    </DataPanel>

    <DataPanel eyebrow="Voice system" title="Connection contract" icon={<Volume2 size={18} />}>
      <dl className="voice-facts">
        <div><dt>Runtime reachable</dt><dd>{status ? "Yes" : "No current proof"}</dd></div>
        <div><dt>Runtime ready</dt><dd>Evaluated separately; not inferred from voice status</dd></div>
        <div><dt>Voice contract ready</dt><dd>{manualCommitVerified ? `${RUNTIME_REALTIME_CONTRACT_VERSION} verified` : "No"}</dd></div>
        <div><dt>Provider connected</dt><dd>{status?.providerConnected === true ? "Yes — Runtime reported" : status?.providerConnected === false ? "No — Runtime reported" : "Not reported"}</dd></div>
        <div><dt>Production ready</dt><dd>Evaluated separately; not inferred from voice status</dd></div>
        <div><dt>Live connection established</dt><dd>{connected && liveProof?.connectionState === "live" ? "Yes" : "No"}</dd></div>
        <div><dt>Current artifact receipt</dt><dd>{liveProof ? "Verified for this session" : status?.providerConnectionVerifiedForCurrentArtifact ? "Historical current-artifact proof only" : "No proof"}</dd></div>
        <div><dt>Realtime provider</dt><dd>{liveProviderAvailable ? "Available for activation" : "Unavailable"}</dd></div>
        <div><dt>Provider / model</dt><dd>{status?.provider && status?.model ? `${status.provider} · ${status.model}` : "Not reported"}</dd></div>
        <div><dt>Voice / transport</dt><dd>{status?.voice && status?.transport ? `${status.voice} · ${status.transport}` : "Not reported"}</dd></div>
        <div><dt>Browser capture</dt><dd>{supported ? "Secure WebRTC capture supported" : "Unavailable in this browser"}</dd></div>
        <div><dt>Governed fallback</dt><dd>{textAction.available ? "Typed requests available" : "Unavailable"}</dd></div>
        <div><dt>Conversation</dt><dd>{manualCommitVerified ? "Client turn detection · manual audio commit" : "Manual commit contract not verified"}{status?.interruptResponse ? " · interruption enabled" : ""}</dd></div>
        <div><dt>Context owner</dt><dd>{status?.contextAssemblyOwner ?? "NEXUS Runtime"}</dd></div>
        <div><dt>Governed interaction state</dt><dd>{displayLabel(latestAdmission?.status ?? "idle")}</dd></div>
      </dl>
    </DataPanel>

    <DataPanel eyebrow="Conversation record" title="This browser session" icon={<Mic size={18} />}>
      <div className="voice-history">{history.length ? history.map((entry, index) => <article key={`${entry.speaker}-${index}`}><strong>{entry.speaker}</strong><span>{entry.text}</span></article>) : <p>No conversation transcript is held in this browser session.</p>}</div>
    </DataPanel>
  </div>;
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : String(error);
