import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2 } from "lucide-react";
import { DataPanel } from "./DataPanel";
import { localNexusClient } from "../lib/local-client";
import { displayLabel } from "../lib/presentation";
import { hifClient, initialHifPresentationState, presentHifEvents, type HifEvent, type HifInteraction } from "../lib/hif-client";

type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type SpeechErrorEvent = { error: string };
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export function VoiceWorkspace() {
  const [transcript, setTranscript] = useState("");
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [listening, setListening] = useState(false);
  const [capturedBySpeech, setCapturedBySpeech] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<HifInteraction | null>(null);
  const [interactionEvents, setInteractionEvents] = useState<HifEvent[]>([]);
  const [presentation, setPresentation] = useState(initialHifPresentationState);
  const recognition = useRef<BrowserSpeechRecognition | null>(null);

  const SpeechRecognition = typeof window === "undefined" ? undefined : (window as unknown as { SpeechRecognition?: new () => BrowserSpeechRecognition; webkitSpeechRecognition?: new () => BrowserSpeechRecognition }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => BrowserSpeechRecognition }).webkitSpeechRecognition;

  async function refresh() {
    const [nextStatus, nextHistory] = await Promise.all([localNexusClient.voiceStatus(), localNexusClient.voiceHistory()]);
    setStatus(nextStatus); setHistory(nextHistory.events ?? []);
  }
  useEffect(() => { void refresh().catch((error) => setMessage(messageFrom(error))); return () => recognition.current?.stop(); }, []);

  async function route(source: "browser_speech" | "text_fallback") {
    if (!transcript.trim()) return;
    setBusy(true); setMessage(null);
    try {
      const response = await hifClient.start(transcript.trim(), source, {});
      setPresentation(presentHifEvents(response.events));
      setInteraction(response.interaction); setInteractionEvents(response.events);
      setMessage(response.interaction.responseText || `Runtime returned ${response.interaction.state}.`);
      const speech = response.events.find((event) => event.type === "SpeechStarted")?.payload.text;
      if (speech) speak(String(speech));
      await refresh();
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  }

  function toggleListening() {
    if (!SpeechRecognition) { setMessage("Browser speech recognition is unavailable. Use the text transcript control."); return; }
    if (listening) { recognition.current?.stop(); return; }
    const next = new SpeechRecognition();
    next.continuous = false; next.interimResults = false; next.lang = "en-US";
    next.onresult = (event) => { const spoken = event.results[0]?.[0]?.transcript ?? ""; setTranscript(spoken); setCapturedBySpeech(true); setMessage("Speech captured by the browser. Review, then send it to the governed Runtime."); };
    next.onerror = (event) => setMessage(`Speech capture error: ${event.error}`);
    next.onend = () => setListening(false);
    recognition.current = next; setListening(true); next.start();
  }

  return <div className="experience-grid local-workspace">
    <DataPanel eyebrow="Shared Runtime voice operator" title="Speak with NEXUS" icon={<Mic size={18} />} className="span-2">
      <p className="workspace-intro">Speech is captured by the browser Experience Layer and routed as a transcript to the same governed Runtime voice operator used by Desktop NEXUS Command.</p>
      <div className="voice-composer">
        <button className={listening ? "is-listening" : ""} onClick={toggleListening} disabled={busy}>{listening ? <MicOff size={19} /> : <Mic size={19} />}<span>{listening ? "Stop listening" : "Start listening"}</span></button>
        <textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setCapturedBySpeech(false); }} placeholder="Speak or type a governed NEXUS request" />
        <button onClick={() => void route(capturedBySpeech ? "browser_speech" : "text_fallback")} disabled={busy || !transcript.trim()}><Send size={17} /> Send</button>
      </div>
      {message && <p className="workspace-message" role="status">{message}</p>}
      <p className="boundary-note">Browser speech support is capability-detected; its provider and processing location depend on the browser and are not verified by NEXUS Runtime. High-risk voice actions remain approval-gated and cannot self-approve.</p>
    </DataPanel>

    <DataPanel eyebrow="Voice state" title="Runtime operator" icon={<Volume2 size={18} />}>
      <dl className="voice-facts"><div><dt>Status</dt><dd>{displayLabel(interaction?.state ?? String(status?.currentMode ?? "unknown"))}</dd></div><div><dt>Intent Resolution</dt><dd>{displayLabel(interaction?.intentResolution?.name ?? String(status?.lastResolvedIntent ?? "none"))}</dd></div><div><dt>Presentation</dt><dd>{displayLabel(`${presentation.avatarMode} · ${presentation.speech}`)}</dd></div><div><dt>Proof</dt><dd>{interaction?.proofIds?.[0] ?? String(status?.lastProofId ?? "unavailable")}</dd></div></dl>
    </DataPanel>

    <DataPanel eyebrow="Governed history" title="Recent voice events" icon={<Mic size={18} />}>
      <div className="voice-history">{history.length ? history.slice(0, 8).map((event, index) => <article key={String(event.eventId ?? index)}><strong>{String(event.transcript ?? "Voice event")}</strong><span>{displayLabel(String(event.status ?? "unknown"))} · {displayLabel(String(event.resolvedIntent ?? "unknown"))}</span><code>{String(event.receiptId ?? event.proofId ?? "Evidence unavailable")}</code></article>) : <p>No voice-operator events are recorded.</p>}</div>
    </DataPanel>
  </div>;
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1; utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : String(error);
