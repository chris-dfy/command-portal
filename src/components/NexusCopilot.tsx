import { useEffect, useRef, useState } from "react";
import { Bot, ChevronRight, Maximize2, Mic, MicOff, Minimize2, Send, ShieldCheck, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { hifClient } from "../lib/hif-client";
import { RealtimeVoiceClient, type RealtimeVoiceState } from "../lib/realtime-voice-client";

type Message = { speaker: "operator" | "nexus"; text: string; limitation?: string };
type AreaId = "center" | "intake" | "projects" | "voice" | "operations" | "replay" | "missions" | "knowledge" | "edge" | "conclave" | "information" | "health" | "topology" | "providers" | "evidence";

const SKILLS: Array<{ label: string; prompt: string; area: AreaId }> = [
  { label: "Summarize operational readiness", prompt: "Summarize operational readiness and identify the highest-priority constraint.", area: "center" },
  { label: "Show the highest-priority recommendations", prompt: "What are the highest-priority recommendations, and why do they matter?", area: "center" },
  { label: "Explain the Runtime topology", prompt: "Explain the current Runtime topology and any unverified connection boundaries.", area: "topology" },
  { label: "Help plan a Nexicron project", prompt: "Help me plan, scope, and price a Nexicron project. Begin with the essential discovery questions.", area: "projects" },
  { label: "Review governance and evidence", prompt: "Review the current governance, proof, and receipt posture without claiming evidence that is not registered.", area: "evidence" },
  { label: "Challenge a decision in Conclave", prompt: "Help me frame the decision I should pressure-test in Conclave, including the evidence and authority it would require.", area: "conclave" },
  { label: "Generate an executive briefing", prompt: "Generate a concise executive briefing from the registered Operational Context.", area: "center" },
];

const introductionKey = "nexus-copilot-introduced-v1";
const messageFrom = (error: unknown) => error instanceof Error ? error.message : String(error);

export function NexusCopilot({ activeArea, activeLabel, runtimeState, onNavigate, open, expanded, onOpenChange, onExpandedChange }: {
  activeArea: AreaId;
  activeLabel: string;
  runtimeState: string;
  onNavigate: (area: AreaId) => void;
  open: boolean;
  expanded: boolean;
  onOpenChange: (open: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const [introduced, setIntroduced] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceState, setVoiceState] = useState<RealtimeVoiceState>("idle");
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [nexusMuted, setNexusMuted] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [liveAssistant, setLiveAssistant] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { speaker: "nexus", text: "NEXUS is online. I can help you understand registered operational context, frame decisions, govern bounded work, and identify what evidence is still missing." },
  ]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const liveClient = useRef<RealtimeVoiceClient | null>(null);
  const conversationId = useRef(`CONV-WEB-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`);
  const scroll = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIntroduced(window.localStorage.getItem(introductionKey) !== "complete");
    void fetch("/api/runtime/realtime-voice", { credentials: "same-origin", headers: { Accept: "application/json", "Cache-Control": "no-cache" } })
      .then(async (response) => ({ response, body: await response.json() as { ok?: boolean; data?: { state?: string } } }))
      .then(({ response, body }) => setVoiceAvailable(response.ok && Boolean(body.ok) && body.data?.state === "available"))
      .catch(() => setVoiceAvailable(false));
    return () => { liveClient.current?.stop(); };
  }, []);

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [messages, liveAssistant, busy]);

  function dismissIntroduction() {
    window.localStorage.setItem(introductionKey, "complete");
    setIntroduced(false);
  }

  async function ask(text = input) {
    const request = text.trim();
    if (!request || busy) return;
    setInput("");
    setError(null);
    setMessages((items) => [...items, { speaker: "operator", text: request }]);
    setBusy(true);
    try {
      const result = await hifClient.start(request, "text", {}, conversationId.current);
      const limitation = result.interaction.limitations.find((item) => item.includes("model_native"));
      setMessages((items) => [...items, { speaker: "nexus", text: result.interaction.responseText, limitation }]);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  async function startVoice() {
    if (!audio.current || !voiceAvailable) return;
    setError(null);
    setLiveAssistant("");
    setMicrophoneMuted(false);
    setNexusMuted(false);
    audio.current.muted = false;
    const client = new RealtimeVoiceClient(audio.current, {
      onState: setVoiceState,
      onAmplitude: setAmplitude,
      onUserTranscript: (text) => setMessages((items) => [...items, { speaker: "operator", text }]),
      onAssistantTranscript: setLiveAssistant,
      onError: setError,
    });
    liveClient.current = client;
    try { await client.connect(); }
    catch (caught) { setVoiceState("error"); setError(messageFrom(caught)); }
  }

  function stopVoice() {
    if (liveAssistant.trim()) setMessages((items) => [...items, { speaker: "nexus", text: liveAssistant.trim(), limitation: "Realtime response may include model_native reasoning; operational claims still require Runtime evidence." }]);
    liveClient.current?.stop();
    liveClient.current = null;
    setLiveAssistant("");
    setMicrophoneMuted(false);
    setNexusMuted(false);
  }

  function toggleMicrophoneMute() {
    const muted = !microphoneMuted;
    liveClient.current?.setMicrophoneMuted(muted);
    setMicrophoneMuted(muted);
  }

  function toggleNexusMute() {
    const muted = !nexusMuted;
    liveClient.current?.setOutputMuted(muted);
    setNexusMuted(muted);
  }

  function useSkill(skill: typeof SKILLS[number]) {
    onNavigate(skill.area);
    void ask(skill.prompt);
  }

  if (!open) return <button className="nexus-copilot-launcher" onClick={() => onOpenChange(true)}><Sparkles size={20} /><span>Open NEXUS</span></button>;

  const voiceConnected = !["idle", "error"].includes(voiceState);
  return <>
    <aside className={`nexus-copilot${expanded ? " is-expanded" : ""}`} aria-label="NEXUS executive copilot">
      <audio ref={audio} autoPlay muted={nexusMuted} className="voice-audio" aria-hidden="true" />
      <header className="nexus-copilot__header">
        <div className="nexus-copilot__mark"><Bot size={23} /></div>
        <div><strong>NEXUS</strong><span>Enterprise executive operating intelligence</span></div>
        <button onClick={() => onExpandedChange(!expanded)} aria-label={expanded ? "Restore NEXUS panel" : "Expand NEXUS panel"}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
        <button onClick={() => { if (voiceConnected) stopVoice(); onExpandedChange(false); onOpenChange(false); }} aria-label="Close NEXUS panel"><X size={18} /></button>
      </header>

      <div className="nexus-copilot__signals">
        <span data-online={runtimeState === "Healthy"}><i />{runtimeState === "Healthy" ? "Online" : runtimeState}</span>
        <span><ShieldCheck size={13} /> Runtime context</span>
        <span><Sparkles size={13} /> {activeLabel}</span>
      </div>

      <section className="nexus-copilot__recommendation">
        <span>Recommended orientation</span>
        <strong>Strengthen operational understanding</strong>
        <p>Ask NEXUS to assess registered context before authorizing new capability or execution.</p>
        <button onClick={() => void ask("Assess what NEXUS currently observes and understands, then recommend the next action that best improves the Executive Operating Loop.")}>Run assessment <ChevronRight size={16} /></button>
      </section>

      <div className="nexus-copilot__voice">
        <div><span className="voice-dot" style={{ transform: `scale(${1 + amplitude * 1.8})` }} /><strong>{voiceConnected ? microphoneMuted ? "Microphone muted" : voiceState : voiceAvailable ? "Voice ready" : "Voice unavailable"}</strong></div>
        <div className="nexus-copilot__voice-controls">
          {voiceConnected && <>
            <button type="button" data-active={microphoneMuted} aria-pressed={microphoneMuted} onClick={toggleMicrophoneMute}>{microphoneMuted ? <MicOff size={15} /> : <Mic size={15} />}{microphoneMuted ? "Unmute mic" : "Mute mic"}</button>
            <button type="button" data-active={nexusMuted} aria-pressed={nexusMuted} onClick={toggleNexusMute}>{nexusMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}{nexusMuted ? "Unmute NEXUS" : "Mute NEXUS"}</button>
          </>}
          <button onClick={voiceConnected ? stopVoice : () => void startVoice()} disabled={!voiceAvailable || voiceState === "connecting"}>
            {voiceConnected ? <MicOff size={15} /> : <Mic size={15} />}{voiceConnected ? "End" : "Start conversation"}
          </button>
        </div>
      </div>

      <div className="nexus-copilot__conversation" ref={scroll} aria-live="polite">
        {messages.map((message, index) => <article key={`${message.speaker}-${index}`} data-speaker={message.speaker}>
          <span>{message.speaker === "nexus" ? "NEXUS" : "You"}</span><p>{message.text}</p>{message.limitation && <small>{message.limitation}</small>}
        </article>)}
        {liveAssistant && <article data-speaker="nexus"><span>NEXUS · LIVE</span><p>{liveAssistant}</p></article>}
        {busy && <div className="nexus-copilot__thinking"><i /><i /><i /><span>Reasoning over registered context</span></div>}
        {error && <p className="nexus-copilot__error">{error}</p>}
      </div>

      <section className="nexus-copilot__skills">
        <header><span>Executive skills</span><b>{SKILLS.length}</b></header>
        <div>{SKILLS.map((skill) => <button key={skill.label} onClick={() => useSkill(skill)}>{skill.label}<ChevronRight size={13} /></button>)}</div>
      </section>

      <form className="nexus-copilot__composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask NEXUS…" aria-label="Ask NEXUS" />
        <button type="button" onClick={voiceConnected ? toggleMicrophoneMute : () => void startVoice()} disabled={!voiceAvailable} aria-label={voiceConnected ? microphoneMuted ? "Unmute microphone" : "Mute microphone" : "Start voice conversation"}>{microphoneMuted ? <MicOff size={17} /> : <Mic size={17} />}</button>
        <button type="submit" disabled={!input.trim() || busy} aria-label="Send message"><Send size={17} /></button>
      </form>
      <footer>Model-native reasoning is labeled. Runtime evidence remains authoritative.</footer>
    </aside>

    {introduced && <div className="nexus-introduction" role="dialog" aria-modal="true" aria-labelledby="nexus-introduction-title">
      <section>
        <button className="nexus-introduction__close" onClick={dismissIntroduction} aria-label="Dismiss introduction"><X size={20} /></button>
        <span>Meet NEXUS</span>
        <h2 id="nexus-introduction-title">Your enterprise executive operating intelligence</h2>
        <p>NEXUS observes registered operational context, explains what it understands, recommends governed next steps, and coordinates bounded work across the platform.</p>
        <ul><li>Natural text and full-duplex voice conversation</li><li>Runtime-owned context shared across web, desktop, mobile, and edge clients</li><li>Project planning, document intelligence, executive briefing, and governed orchestration</li><li>Explicit truth boundaries, approvals, proofs, and receipts</li></ul>
        <div className="nexus-introduction__boundary">NEXUS will not fabricate tenant facts, live state, capabilities, or completed actions. Model-native knowledge is reasoning—not operational evidence.</div>
        <button className="nexus-introduction__start" onClick={dismissIntroduction}>Start using NEXUS</button>
      </section>
    </div>}
  </>;
}
