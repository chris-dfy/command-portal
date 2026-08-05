import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2 } from "lucide-react";
import { deriveAssistantAvatarState, NexusAvatar } from "./NexusAvatar";
import "./NexusAvatar.css";
import { DataPanel } from "./DataPanel";
import { displayLabel } from "../lib/presentation";
import { localNexusClient, newExecutiveInteractionId } from "../lib/local-client";
import type { CanonicalActionAvailability } from "../lib/portal-client";
import {
  COMMAND_PORTAL_REALTIME_PROFILE,
  COMMAND_PORTAL_REALTIME_QUARANTINE_MESSAGE,
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
  const latestUserTranscript = useRef("");
  const conversationId = useRef(newExecutiveInteractionId());

  const browserSpeech = browserSpeechAvailability();
  const liveProviderReason = COMMAND_PORTAL_REALTIME_QUARANTINE_MESSAGE;
  const resultProofId = latestAdmission?.proofIds[0];
  const resultReceiptId = latestAdmission?.receiptIds[0];

  useEffect(() => {
    setMessage(COMMAND_PORTAL_REALTIME_QUARANTINE_MESSAGE);
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
      const spoken = operation.payload.source === "browser_speech" && speakBrowserResponse(responseText);
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
    <DataPanel eyebrow="Governed voice continuity" title="Speak with NEXUS" icon={<Mic size={18} />} className="span-2">
      <p className="workspace-intro">This Command Portal artifact is continuity-only. Typed input and bounded browser speech recognition submit transcripts through the canonical Runtime interaction path. Full-duplex Realtime activation remains quarantined until this exact deployed adapter proves a governed session and verified audio postconditions.</p>
      <div className="realtime-voice-stage">
        <NexusAvatar state={deriveAssistantAvatarState({ voiceState: "idle", textBusy: busy, hasError: false })} amplitude={0} size="lg" unavailable />
        <div className="voice-stage-copy">
          <small>VOICE PROFILE</small>
          <strong>Continuity only</strong>
          <p>{liveProviderReason}</p>
        </div>
        <button className="voice-start" disabled title={liveProviderReason}>
          <MicOff size={19} /><span>Full-duplex quarantined</span>
        </button>
      </div>
      <div className="voice-text-fallback">
        <textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setPendingRequest((current) => current?.attempts === 0 && current.payload.historyAlreadyRecorded ? current : null); }} disabled={!textAction.available} placeholder={textAction.available ? "Or type a request for the governed Runtime Voice Operator" : "Runtime Voice Operator is unavailable"} autoComplete="off" />
        {browserSpeech.input && <button onClick={() => void useBrowserMicrophone()} disabled={!textAction.available || busy || browserListening} title="Uses this browser's speech recognition, then submits the transcript through the governed Runtime Voice Operator"><Mic size={17} /> {browserListening ? "Listening…" : "Use browser microphone"}</button>}
        {pendingRequest && <button onClick={() => void routeGovernedTranscript("", pendingRequest.payload.source, pendingRequest.payload.fallbackContext, pendingRequest.payload.historyAlreadyRecorded, pendingRequest)} disabled={!textAction.available || busy} title={textAction.available ? undefined : textAction.reason}><Send size={17} /> {pendingRequest.attempts === 0 ? "Send captured transcript through governed Voice" : "Retry exact governed Voice request"}</button>}
        <button onClick={() => void sendText()} disabled={!textAction.available || busy || !transcript.trim()}><Send size={17} /> Send text</button>
      </div>
      <p className="boundary-note">{browserSpeech.input ? "Browser microphone fallback is available and bounded to 8 seconds." : "Browser speech recognition is unavailable; typed governed fallback remains available."} {browserSpeech.output ? "Browser speech playback can read the actual Runtime response aloud." : "Browser speech playback is unavailable; responses remain visible as text."}</p>
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
        <div><dt>Full-duplex adapter</dt><dd>Quarantined</dd></div>
        <div><dt>Voice profile</dt><dd>{COMMAND_PORTAL_REALTIME_PROFILE}</dd></div>
        <div><dt>Provider connection</dt><dd>Not evaluated by this continuity adapter</dd></div>
        <div><dt>Browser continuity</dt><dd>{browserSpeech.input ? "Bounded speech recognition available" : "Typed continuity only"}</dd></div>
        <div><dt>Governed fallback</dt><dd>{textAction.available ? "Typed requests available" : "Unavailable"}</dd></div>
        <div><dt>Full-duplex proof</dt><dd>Not established by this artifact</dd></div>
        <div><dt>Context owner</dt><dd>NEXUS Runtime</dd></div>
        <div><dt>Governed interaction state</dt><dd>{displayLabel(latestAdmission?.status ?? "idle")}</dd></div>
      </dl>
    </DataPanel>

    <DataPanel eyebrow="Conversation record" title="This browser session" icon={<Mic size={18} />}>
      <div className="voice-history">{history.length ? history.map((entry, index) => <article key={`${entry.speaker}-${index}`}><strong>{entry.speaker}</strong><span>{entry.text}</span></article>) : <p>No conversation transcript is held in this browser session.</p>}</div>
    </DataPanel>
  </div>;
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : String(error);
