import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX, Waves } from "lucide-react";
import { DataPanel } from "./DataPanel";
import { displayLabel } from "../lib/presentation";
import { localNexusClient, newExecutiveInteractionId } from "../lib/local-client";
import { RealtimeVoiceClient, type RealtimeVoiceState } from "../lib/realtime-voice-client";
import {
  admitApprovedExecutiveInteraction,
  admitExecutiveInteraction,
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

export function VoiceWorkspace() {
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
  const [latestAdmission, setLatestAdmission] = useState<RuntimeInteractionAdmission | null>(null);
  const [pendingApproval, setPendingApproval] = useState<RuntimeInteractionAdmission | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<"approve" | "deny" | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const liveClient = useRef<RealtimeVoiceClient | null>(null);
  const conversationId = useRef(newExecutiveInteractionId());

  const connected = !["idle", "error"].includes(voiceState);
  const supported = RealtimeVoiceClient.supported();
  useEffect(() => {
    void refreshStatus();
    void recoverPendingExecutiveApproval()
      .then((admission) => {
        if (!admission) return;
        setLatestAdmission(admission);
        setPendingApproval(admission);
        setAssistantTranscript(admission.spokenSummary);
        setMessage(`Recovered from the Runtime interaction ledger. ${runtimeInteractionTrace(admission)}`);
      })
      .catch((error) => setMessage(messageFrom(error)));
    return () => liveClient.current?.stop();
  }, []);

  async function refreshStatus() {
    try {
      const response = await fetch("/api/runtime/realtime-voice", { credentials: "same-origin", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
      const body = await response.json() as { ok?: boolean; data?: VoiceStatus; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "Realtime voice status is unavailable.");
      setStatus(body.data);
    } catch (error) {
      setMessage(messageFrom(error));
    }
  }

  function presentAdmission(admission: RuntimeInteractionAdmission, operatorText?: string) {
    setLatestAdmission(admission);
    rememberPendingExecutiveApproval(admission);
    setPendingApproval(pendingExecutiveApprovalId(admission) ? admission : null);
    setAssistantTranscript(admission.spokenSummary);
    setHistory((items) => [
      { speaker: "NEXUS", text: admission.spokenSummary } as TranscriptEntry,
      ...(operatorText ? [{ speaker: "You", text: operatorText } as TranscriptEntry] : []),
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
    const approvalId = pendingExecutiveApprovalId(pendingApproval);
    if (!approvalId || approvalBusy) return;
    setMessage(null);
    setApprovalBusy("deny");
    try {
      const response = await localNexusClient.deny(
        approvalId,
        "Denied by the authenticated operator in NEXUS Command Voice Workspace.",
      );
      validateExecutiveInteractionDenial(response, approvalId);
      clearPendingExecutiveApproval(pendingApproval?.interactionResult.interaction_id);
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
    if (!audio.current) return;
    setMessage(null);
    setAssistantTranscript("");
    setMicrophoneMuted(false);
    setNexusMuted(false);
    audio.current.muted = false;
    const client = new RealtimeVoiceClient(audio.current, {
      onState: setVoiceState,
      onAmplitude: setAmplitude,
      onUserTranscript: async (text, idempotencyKey) => {
        setAssistantTranscript("");
        setTranscript(text);
        setHistory((items) => [{ speaker: "You", text } as TranscriptEntry, ...items].slice(0, 10));
        const admission = await admitRuntimeVoiceTranscript(text, conversationId.current, idempotencyKey);
        presentAdmission(admission);
        return admission;
      },
      onError: setMessage,
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
    liveClient.current?.stop();
    liveClient.current = null;
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

  async function sendText() {
    const request = transcript.trim();
    if (!request) return;
    setBusy(true);
    setMessage(null);
    try {
      const admission = await admitExecutiveInteraction(request, "text", conversationId.current);
      presentAdmission(admission, request);
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="experience-grid local-workspace">
    <audio ref={audio} autoPlay muted={nexusMuted} className="voice-audio" aria-hidden="true" />
    <DataPanel eyebrow="Runtime-managed Realtime voice" title="Speak with NEXUS" icon={<Mic size={18} />} className="span-2">
      <p className="workspace-intro">A natural, full-duplex voice session with server voice detection, streaming audio, and interruption. The Runtime owns the provider session and truth boundaries; this browser owns only microphone capture and playback.</p>
      <div className="realtime-voice-stage">
        <div className={`voice-orb voice-${voiceState}`} style={{ "--voice-amplitude": amplitude } as React.CSSProperties}>
          <span><Waves size={31} /></span>
        </div>
        <div className="voice-stage-copy">
          <small>LIVE VOICE STATE</small>
          <strong>{microphoneMuted && connected ? "Microphone muted" : displayLabel(voiceState)}</strong>
          <p>{microphoneMuted && connected ? "Background audio is not being sent; the live session remains connected." : voiceState === "speaking" ? assistantTranscript || "NEXUS is responding…" : voiceState === "thinking" ? "NEXUS is forming a response…" : connected ? "Listening — speak naturally" : "Start a secure live voice session"}</p>
        </div>
        {connected ? <div className="voice-stage-controls">
          <button data-active={microphoneMuted} aria-pressed={microphoneMuted} onClick={toggleMicrophoneMute}>{microphoneMuted ? <MicOff size={17} /> : <Mic size={17} />}<span>{microphoneMuted ? "Unmute microphone" : "Mute microphone"}</span></button>
          <button data-active={nexusMuted} aria-pressed={nexusMuted} onClick={toggleNexusMute}>{nexusMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}<span>{nexusMuted ? "Unmute NEXUS" : "Mute NEXUS"}</span></button>
          <button className="voice-stop" onClick={stopLiveVoice}><MicOff size={17} /><span>End live voice</span></button>
        </div> : <button className="voice-start" onClick={() => void startLiveVoice()} disabled={!supported || voiceState === "connecting" || status?.state !== "available"}>
          <Mic size={19} /><span>{voiceState === "connecting" ? "Connecting…" : "Start live voice"}</span>
        </button>}
      </div>
      <div className="voice-text-fallback">
        <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Or type a governed request for NEXUS" />
        <button onClick={() => void sendText()} disabled={busy || !transcript.trim()}><Send size={17} /> Send text</button>
      </div>
      {message && <p className="workspace-message" role="status">{message}</p>}
      <ExecutiveInteractionApproval
        admission={pendingApproval}
        busy={approvalBusy}
        onApprove={() => void approvePendingIntent()}
        onDeny={() => void denyPendingIntent()}
      />
      <p className="boundary-note">Realtime conversation may use model-native knowledge. Organization-specific facts, live operational state, completed actions, and authoritative evidence still require registered Runtime context, connectors, proofs, and receipts.</p>
    </DataPanel>

    <DataPanel eyebrow="Voice system" title="Connection contract" icon={<Volume2 size={18} />}>
      <dl className="voice-facts">
        <div><dt>Availability</dt><dd>{displayLabel(status?.state ?? "unknown")}</dd></div>
        <div><dt>Provider / model</dt><dd>{status?.provider && status?.model ? `${status.provider} · ${status.model}` : "Not reported"}</dd></div>
        <div><dt>Voice / transport</dt><dd>{status?.voice && status?.transport ? `${status.voice} · ${status.transport}` : "Not reported"}</dd></div>
        <div><dt>Conversation</dt><dd>{status?.serverVAD ? "Server voice detection" : "Not verified"}{status?.interruptResponse ? " · interruption enabled" : ""}</dd></div>
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
