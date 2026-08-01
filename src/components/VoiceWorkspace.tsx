import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { deriveAssistantAvatarState, NexusAvatar } from "./NexusAvatar";
import "./NexusAvatar.css";
import { DataPanel } from "./DataPanel";
import { displayLabel } from "../lib/presentation";
import { localNexusClient, type VoiceRouteResult } from "../lib/local-client";
import type { CanonicalActionAvailability } from "../lib/portal-client";
import { RealtimeVoiceClient, type RealtimeVoiceState } from "../lib/realtime-voice-client";
import { browserSpeechAvailability, recognizeBrowserSpeech, speakBrowserResponse } from "../lib/browser-speech";
import { runBoundedTask } from "../lib/request-coordination.mjs";
import {
  beginPrivateDraftAttempt,
  clearPrivateDraftAfterSuccess,
  executeExplicitPrivateDraftAction,
  retainPrivateDraftAfterFailure,
  shouldPresentPrivateDraft,
  snapshotPrivateDraftOperation,
  type PrivateDraftOperation,
} from "../lib/private-draft-operation";
import { OperationalResultLineage, type OpenOperationalReplay } from "./OperationalResultLineage";

type VoiceStatus = {
  state?: string;
  provider?: string;
  model?: string;
  voice?: string;
  transport?: string;
  serverVAD?: boolean;
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
const GOVERNED_VOICE_RESPONSE_TIMEOUT_MS = 12_000;

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
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [nexusMuted, setNexusMuted] = useState(false);
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [amplitude, setAmplitude] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [assistantTranscript, setAssistantTranscript] = useState("");
  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [browserListening, setBrowserListening] = useState(false);
  const [routeResult, setRouteResult] = useState<VoiceRouteResult | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingVoiceRequest | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const liveClient = useRef<RealtimeVoiceClient | null>(null);
  const latestUserTranscript = useRef("");

  const connected = ["listening", "thinking", "speaking", "interrupted"].includes(voiceState);
  const supported = RealtimeVoiceClient.supported();
  const browserSpeech = browserSpeechAvailability();
  const liveProviderAvailable = realtimeAction.available
    && supported
    && status?.state === "available";
  const liveProviderReason = !realtimeAction.available
    ? realtimeAction.reason
    : !supported
      ? "This browser does not support secure WebRTC microphone capture."
      : status?.state !== "available"
        ? status?.limitations?.[0] ?? "The Runtime has not verified an available Realtime voice provider contract."
        : "The exact Realtime voice action, provider contract, and browser capture path are available.";
  const resultProofId = routeResult?.proof?.proofId ?? routeResult?.event?.proofId;
  const resultReceiptId = routeResult?.receipt?.receiptId ?? routeResult?.event?.receiptId;

  useEffect(() => {
    if (realtimeAction.available) void refreshStatus();
    else setMessage(realtimeAction.reason);
    return () => liveClient.current?.stop();
  }, [realtimeAction.available, realtimeAction.reason]);

  async function refreshStatus() {
    try {
      const response = await fetch("/api/runtime/realtime-voice", { credentials: "same-origin", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
      const body = await response.json() as { ok?: boolean; data?: VoiceStatus; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "Realtime voice status is unavailable.");
      setStatus(body.data);
    } catch (error) {
      setStatus(null);
      setMessage(messageFrom(error));
    }
  }

  async function startLiveVoice() {
    if (!audio.current || !liveProviderAvailable) {
      setMessage(liveProviderReason);
      return;
    }
    setMessage(null);
    setAssistantTranscript("");
    latestUserTranscript.current = "";
    setMicrophoneMuted(false);
    setNexusMuted(false);
    audio.current.muted = false;
    const client = new RealtimeVoiceClient(audio.current, {
      onState: setVoiceState,
      onAmplitude: setAmplitude,
      onUserTranscript: (text) => {
        latestUserTranscript.current = text;
        setHistory((items) => [{ speaker: "You", text } as TranscriptEntry, ...items].slice(0, 10));
      },
      onAssistantTranscript: (text) => {
        if (text.trim()) latestUserTranscript.current = "";
        setAssistantTranscript(text);
      },
      onError: (errorMessage, code) => {
        setMessage(errorMessage);
        const captured = latestUserTranscript.current.trim();
        if (code === "response_timeout" && captured) {
          const staged = snapshotPrivateDraftOperation(
            {
              transcript: captured,
              source: "browser_speech" as const,
              fallbackContext: "Live voice timed out; the captured utterance was sent only after your explicit governed Voice action.",
              historyAlreadyRecorded: true,
            },
            `voice-transcript:${globalThis.crypto.randomUUID()}`,
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
      setMessage("Live voice is connected. Speak naturally; you can interrupt NEXUS at any time.");
    } catch (error) {
      setVoiceState("error");
      setMessage(messageFrom(error));
    }
  }

  function stopLiveVoice() {
    if (assistantTranscript.trim()) setHistory((items) => [{ speaker: "NEXUS", text: assistantTranscript.trim() } as TranscriptEntry, ...items].slice(0, 10));
    liveClient.current?.stop();
    liveClient.current = null;
    latestUserTranscript.current = "";
    setMicrophoneMuted(false);
    setNexusMuted(false);
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
      `voice-transcript:${globalThis.crypto.randomUUID()}`,
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
        (explicitOperation) => runBoundedTask(
          (signal) => localNexusClient.routeTranscript(
            explicitOperation.payload.transcript,
            explicitOperation.payload.source,
            signal,
            explicitOperation.idempotencyKey,
          ),
          { timeoutMs: GOVERNED_VOICE_RESPONSE_TIMEOUT_MS },
        ),
      );
      const responseText = response.spokenSummary?.trim()
        || response.event?.failureReason?.trim()
        || "NEXUS recorded the request without a spoken summary.";
      const proofId = response.proof?.proofId ?? response.event?.proofId;
      const receiptId = response.receipt?.receiptId ?? response.event?.receiptId;
      const spoken = operation.payload.source === "browser_speech" && !nexusMuted && speakBrowserResponse(responseText);
      setRouteResult(response);
      setPendingRequest(clearPrivateDraftAfterSuccess());
      setAssistantTranscript(responseText);
      setHistory((items) => [
        { speaker: "NEXUS", text: responseText } as TranscriptEntry,
        ...items,
      ].slice(0, 10));
      setMessage([
        operation.payload.fallbackContext,
        "Text request was processed by the governed NEXUS Runtime Voice Operator.",
        operation.payload.source === "browser_speech"
          ? spoken
            ? "The browser is playing the actual Runtime response locally."
            : "Browser speech output is unavailable; the actual Runtime response remains visible as text."
          : "",
        proofId ? `Proof ${proofId}.` : "",
        receiptId ? `Receipt ${receiptId}.` : "",
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
    <audio ref={audio} autoPlay muted={nexusMuted} className="voice-audio" aria-hidden="true" />
    <DataPanel eyebrow="Runtime-managed Realtime voice" title="Speak with NEXUS" icon={<Mic size={18} />} className="span-2">
      <p className="workspace-intro">A natural, full-duplex voice session with server voice detection, streaming audio, and interruption. The Runtime owns the provider session and truth boundaries; this browser owns only microphone capture and playback.</p>
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
        {browserSpeech.input && <button onClick={() => void useBrowserMicrophone()} disabled={!textAction.available || busy || browserListening} title="Uses this browser's speech recognition, then submits the transcript through the governed Runtime Voice Operator"><Mic size={17} /> {browserListening ? "Listening…" : "Use browser microphone"}</button>}
        {pendingRequest && <button onClick={() => void routeGovernedTranscript("", pendingRequest.payload.source, pendingRequest.payload.fallbackContext, pendingRequest.payload.historyAlreadyRecorded, pendingRequest)} disabled={!textAction.available || busy} title={textAction.available ? undefined : textAction.reason}><Send size={17} /> {pendingRequest.attempts === 0 ? "Send captured transcript through governed Voice" : "Retry exact governed Voice request"}</button>}
        <button onClick={() => void sendText()} disabled={!textAction.available || busy || !transcript.trim()}><Send size={17} /> Send text</button>
      </div>
      <p className="boundary-note">{browserSpeech.input ? "Browser microphone fallback is available and bounded to 8 seconds." : "Browser speech recognition is unavailable; typed governed fallback remains available."} {browserSpeech.output ? "Browser speech playback can read the actual Runtime response aloud." : "Browser speech playback is unavailable; responses remain visible as text."}</p>
      {message && <p className="workspace-message" role="status">{message}</p>}
      {routeResult && <OperationalResultLineage proofId={resultProofId} receiptId={resultReceiptId} onOpenReplay={onReplay} />}
      <p className="boundary-note">Realtime conversation may use model-native knowledge. Organization-specific facts, live operational state, completed actions, and authoritative evidence still require registered Runtime context, connectors, proofs, and receipts.</p>
    </DataPanel>

    <DataPanel eyebrow="Voice system" title="Connection contract" icon={<Volume2 size={18} />}>
      <dl className="voice-facts">
        <div><dt>Realtime provider</dt><dd>{liveProviderAvailable ? "Available" : "Unavailable"}</dd></div>
        <div><dt>Provider / model</dt><dd>{status?.provider && status?.model ? `${status.provider} · ${status.model}` : "Not reported"}</dd></div>
        <div><dt>Voice / transport</dt><dd>{status?.voice && status?.transport ? `${status.voice} · ${status.transport}` : "Not reported"}</dd></div>
        <div><dt>Browser capture</dt><dd>{supported ? "Secure WebRTC capture supported" : "Unavailable in this browser"}</dd></div>
        <div><dt>Governed fallback</dt><dd>{textAction.available ? "Typed requests available" : "Unavailable"}</dd></div>
        <div><dt>Conversation</dt><dd>{status?.serverVAD ? "Server voice detection" : "Not verified"}{status?.interruptResponse ? " · interruption enabled" : ""}</dd></div>
        <div><dt>Context owner</dt><dd>{status?.contextAssemblyOwner ?? "NEXUS Runtime"}</dd></div>
        <div><dt>Governed text state</dt><dd>{displayLabel(routeResult?.status ?? "idle")}</dd></div>
      </dl>
    </DataPanel>

    <DataPanel eyebrow="Conversation record" title="This browser session" icon={<Mic size={18} />}>
      <div className="voice-history">{history.length ? history.map((entry, index) => <article key={`${entry.speaker}-${index}`}><strong>{entry.speaker}</strong><span>{entry.text}</span></article>) : <p>No conversation transcript is held in this browser session.</p>}</div>
    </DataPanel>
  </div>;
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : String(error);
