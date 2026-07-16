import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, Waves } from "lucide-react";
import { DataPanel } from "./DataPanel";
import { displayLabel } from "../lib/presentation";
import { hifClient, initialHifPresentationState, presentHifEvents, type HifInteraction } from "../lib/hif-client";
import { RealtimeVoiceClient, type RealtimeVoiceState } from "../lib/realtime-voice-client";

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
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [amplitude, setAmplitude] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [assistantTranscript, setAssistantTranscript] = useState("");
  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [interaction, setInteraction] = useState<HifInteraction | null>(null);
  const [presentation, setPresentation] = useState(initialHifPresentationState);
  const audio = useRef<HTMLAudioElement | null>(null);
  const liveClient = useRef<RealtimeVoiceClient | null>(null);

  const connected = !["idle", "error"].includes(voiceState);
  const supported = RealtimeVoiceClient.supported();

  useEffect(() => {
    void refreshStatus();
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

  async function startLiveVoice() {
    if (!audio.current) return;
    setMessage(null);
    setAssistantTranscript("");
    const client = new RealtimeVoiceClient(audio.current, {
      onState: setVoiceState,
      onAmplitude: setAmplitude,
      onUserTranscript: (text) => {
        setTranscript(text);
        setHistory((items) => [{ speaker: "You", text } as TranscriptEntry, ...items].slice(0, 10));
      },
      onAssistantTranscript: (text) => setAssistantTranscript(text),
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
    if (assistantTranscript.trim()) setHistory((items) => [{ speaker: "NEXUS", text: assistantTranscript.trim() } as TranscriptEntry, ...items].slice(0, 10));
    liveClient.current?.stop();
    liveClient.current = null;
    setMessage("Live voice session ended. No provider credential was stored in the browser.");
  }

  async function sendText() {
    if (!transcript.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await hifClient.start(transcript.trim(), "text", {});
      setPresentation(presentHifEvents(response.events));
      setInteraction(response.interaction);
      setAssistantTranscript(response.interaction.responseText);
      setHistory((items) => [
        { speaker: "NEXUS", text: response.interaction.responseText } as TranscriptEntry,
        { speaker: "You", text: transcript.trim() } as TranscriptEntry,
        ...items,
      ].slice(0, 10));
      setMessage("Text request was processed by the shared Runtime Human Interaction Framework.");
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="experience-grid local-workspace">
    <audio ref={audio} autoPlay className="voice-audio" aria-hidden="true" />
    <DataPanel eyebrow="Runtime-managed Realtime voice" title="Speak with NEXUS" icon={<Mic size={18} />} className="span-2">
      <p className="workspace-intro">A natural, full-duplex voice session with server voice detection, streaming audio, and interruption. The Runtime owns the provider session and truth boundaries; this browser owns only microphone capture and playback.</p>
      <div className="realtime-voice-stage">
        <div className={`voice-orb voice-${voiceState}`} style={{ "--voice-amplitude": amplitude } as React.CSSProperties}>
          <span><Waves size={31} /></span>
        </div>
        <div className="voice-stage-copy">
          <small>LIVE VOICE STATE</small>
          <strong>{displayLabel(voiceState)}</strong>
          <p>{voiceState === "speaking" ? assistantTranscript || "NEXUS is responding…" : voiceState === "thinking" ? "NEXUS is forming a response…" : connected ? "Listening — speak naturally" : "Start a secure live voice session"}</p>
        </div>
        <button className={connected ? "voice-stop" : "voice-start"} onClick={connected ? stopLiveVoice : () => void startLiveVoice()} disabled={!supported || voiceState === "connecting" || status?.state !== "available"}>
          {connected ? <MicOff size={19} /> : <Mic size={19} />}
          <span>{connected ? "End live voice" : voiceState === "connecting" ? "Connecting…" : "Start live voice"}</span>
        </button>
      </div>
      <div className="voice-text-fallback">
        <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Or type a request for the governed Runtime interaction framework" />
        <button onClick={() => void sendText()} disabled={busy || !transcript.trim()}><Send size={17} /> Send text</button>
      </div>
      {message && <p className="workspace-message" role="status">{message}</p>}
      <p className="boundary-note">Realtime conversation may use model-native knowledge. Organization-specific facts, live operational state, completed actions, and authoritative evidence still require registered Runtime context, connectors, proofs, and receipts.</p>
    </DataPanel>

    <DataPanel eyebrow="Voice system" title="Connection contract" icon={<Volume2 size={18} />}>
      <dl className="voice-facts">
        <div><dt>Availability</dt><dd>{displayLabel(status?.state ?? "unknown")}</dd></div>
        <div><dt>Provider / model</dt><dd>{status?.provider && status?.model ? `${status.provider} · ${status.model}` : "Not reported"}</dd></div>
        <div><dt>Voice / transport</dt><dd>{status?.voice && status?.transport ? `${status.voice} · ${status.transport}` : "Not reported"}</dd></div>
        <div><dt>Conversation</dt><dd>{status?.serverVAD ? "Server voice detection" : "Not verified"}{status?.interruptResponse ? " · interruption enabled" : ""}</dd></div>
        <div><dt>Context owner</dt><dd>{status?.contextAssemblyOwner ?? "NEXUS Runtime"}</dd></div>
        <div><dt>Governed text state</dt><dd>{displayLabel(interaction?.state ?? `${presentation.avatarMode} · ${presentation.speech}`)}</dd></div>
      </dl>
    </DataPanel>

    <DataPanel eyebrow="Conversation record" title="This browser session" icon={<Mic size={18} />}>
      <div className="voice-history">{history.length ? history.map((entry, index) => <article key={`${entry.speaker}-${index}`}><strong>{entry.speaker}</strong><span>{entry.text}</span></article>) : <p>No conversation transcript is held in this browser session.</p>}</div>
    </DataPanel>
  </div>;
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : String(error);
