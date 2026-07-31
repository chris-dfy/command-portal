import { useEffect, useRef, useState } from "react";
import { ChevronRight, Maximize2, Mic, MicOff, Minimize2, Send, ShieldCheck, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { hifClient } from "../lib/hif-client";
import { localNexusClient } from "../lib/local-client";
import type { CanonicalActionAvailability } from "../lib/portal-client";
import { RealtimeVoiceClient, type RealtimeVoiceState } from "../lib/realtime-voice-client";
import { browserSpeechAvailability, recognizeBrowserSpeech, speakBrowserResponse } from "../lib/browser-speech";
import { runBoundedTask } from "../lib/request-coordination.mjs";
import { assistantPresence } from "../lib/assistant-presence";
import { deriveAssistantAvatarState, NexusAvatar, NEXUS_AVATAR_STATE_LABELS } from "./NexusAvatar";
import "./NexusAvatar.css";

type Message = { speaker: "operator" | "nexus"; text: string; limitation?: string };
type AreaId = "center" | "intake" | "projects" | "voice" | "operations" | "replay" | "missions" | "knowledge" | "edge" | "conclave" | "information" | "health" | "topology" | "providers" | "evidence";

const SKILLS: Array<{ label: string; prompt: string; area: AreaId }> = [
  { label: "Summarize operational readiness", prompt: "Summarize operational readiness and identify the highest-priority constraint.", area: "center" },
  { label: "Show the highest-priority recommendations", prompt: "What are the highest-priority recommendations, and why do they matter?", area: "center" },
  { label: "Explain the Runtime topology", prompt: "Explain the current Runtime topology and any unverified connection boundaries.", area: "topology" },
  { label: "Help plan a NEXUS project", prompt: "Help me plan, scope, and price a NEXUS project. Begin with the essential discovery questions.", area: "projects" },
  { label: "Review governance and evidence", prompt: "Review the current governance, proof, and receipt posture without claiming evidence that is not registered.", area: "evidence" },
  { label: "Challenge a decision in Conclave", prompt: "Help me frame the decision I should pressure-test in Conclave, including the evidence and authority it would require.", area: "conclave" },
  { label: "Generate an executive briefing", prompt: "Generate a concise executive briefing from the registered Operational Context.", area: "center" },
];

const introductionKey = "nexus-copilot-introduced-v1";
const messageFrom = (error: unknown) => error instanceof Error ? error.message : String(error);

export function NexusCopilot({ activeArea, activeLabel, runtimeState, onNavigate, interactionAction, realtimeAction, textAction, open, expanded, onOpenChange, onExpandedChange }: {
  activeArea: AreaId;
  activeLabel: string;
  runtimeState: string;
  onNavigate: (area: AreaId) => void;
  interactionAction: CanonicalActionAvailability;
  realtimeAction: CanonicalActionAvailability;
  textAction: CanonicalActionAvailability;
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
  const [browserListening, setBrowserListening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { speaker: "nexus", text: "NEXUS is online. I can help you understand registered operational context, frame decisions, govern bounded work, and identify what evidence is still missing." },
  ]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const liveClient = useRef<RealtimeVoiceClient | null>(null);
  const latestUserTranscript = useRef("");
  const conversationId = useRef(`CONV-WEB-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`);
  const scroll = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIntroduced(window.localStorage.getItem(introductionKey) !== "complete");
    if (!realtimeAction.available) {
      setVoiceAvailable(false);
      liveClient.current?.stop();
      assistantPresence.reset();
      return () => { liveClient.current?.stop(); assistantPresence.reset(); };
    }
    void fetch("/api/runtime/realtime-voice", { credentials: "same-origin", headers: { Accept: "application/json", "Cache-Control": "no-cache" } })
      .then(async (response) => ({ response, body: await response.json() as { ok?: boolean; data?: { state?: string } } }))
      .then(({ response, body }) => setVoiceAvailable(response.ok && Boolean(body.ok) && body.data?.state === "available"))
      .catch(() => setVoiceAvailable(false));
    return () => { liveClient.current?.stop(); assistantPresence.reset(); };
  }, [realtimeAction.available]);

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
    if (!interactionAction.available) {
      setError(interactionAction.reason);
      return;
    }
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
    if (!audio.current || !voiceAvailable || !realtimeAction.available) {
      setError(realtimeAction.reason);
      return;
    }
    setError(null);
    setLiveAssistant("");
    setMicrophoneMuted(false);
    setNexusMuted(false);
    audio.current.muted = false;
    const client = new RealtimeVoiceClient(audio.current, {
      onState: setVoiceState,
      onAmplitude: setAmplitude,
      onUserTranscript: (text) => {
        latestUserTranscript.current = text;
        setMessages((items) => [...items, { speaker: "operator", text }]);
      },
      onAssistantTranscript: setLiveAssistant,
      onError: (message, code) => {
        setError(message);
        const captured = latestUserTranscript.current.trim();
        if (code === "response_timeout" && captured && textAction.available) {
          void routeGovernedVoice(captured, true);
        }
      },
    });
    liveClient.current = client;
    try { await client.connect(); }
    catch (caught) { setVoiceState("error"); setError(messageFrom(caught)); }
  }

  async function routeGovernedVoice(request: string, operatorAlreadyVisible = false) {
    if (!request.trim() || !textAction.available) {
      setError(textAction.reason);
      return;
    }
    setBusy(true);
    setError(null);
    if (!operatorAlreadyVisible) {
      setMessages((items) => [...items, { speaker: "operator", text: request.trim() }]);
    }
    try {
      const result = await runBoundedTask(
        (signal) => localNexusClient.routeTranscript(request.trim(), "browser_speech", signal),
        { timeoutMs: 12_000 },
      );
      const responseText = result.spokenSummary?.trim()
        || result.event?.failureReason?.trim()
        || "NEXUS recorded the request without a spoken summary.";
      setMessages((items) => [...items, { speaker: "nexus", text: responseText }]);
      if (!nexusMuted) speakBrowserResponse(responseText);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
      setBrowserListening(false);
      setVoiceState("idle");
    }
  }

  async function askByVoice() {
    if (!textAction.available) {
      setError(textAction.reason);
      return;
    }
    setBrowserListening(true);
    setError(null);
    try {
      const captured = await recognizeBrowserSpeech();
      latestUserTranscript.current = captured;
      await routeGovernedVoice(captured);
    } catch (caught) {
      setBrowserListening(false);
      setVoiceState("idle");
      setError(messageFrom(caught));
    }
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

  const voiceConnected = !browserListening && !["idle", "error"].includes(voiceState);
  const browserSpeech = browserSpeechAvailability();
  const avatarState = deriveAssistantAvatarState({ voiceState, textBusy: busy || browserListening, hasError: Boolean(error) });
  const runtimeHealthy = runtimeState === "Healthy";

  useEffect(() => {
    assistantPresence.set({ state: avatarState, amplitude, voiceConnected });
  }, [avatarState, amplitude, voiceConnected]);

  if (!open) return null;

  return <>
    <aside id="nexus-copilot" className={`nexus-copilot${expanded ? " is-expanded" : ""}`} aria-label="NEXUS executive copilot">
      <audio ref={audio} autoPlay muted={nexusMuted} className="voice-audio" aria-hidden="true" />
      <header className="nexus-copilot__header">
        <div className="nexus-copilot__mark"><NexusAvatar state={avatarState} amplitude={amplitude} size="sm" micMuted={microphoneMuted && voiceConnected} unavailable={!runtimeHealthy && !voiceConnected && !busy} /></div>
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
        <button disabled={!interactionAction.available} onClick={() => void ask("Assess what NEXUS currently observes and understands, then recommend the next action that best improves the Executive Operating Loop.")}>Run assessment <ChevronRight size={16} /></button>
      </section>

      <div className="nexus-copilot__voice">
        <div><NexusAvatar state={avatarState} amplitude={amplitude} size="xs" micMuted={microphoneMuted && voiceConnected} unavailable={(!voiceAvailable || !realtimeAction.available) && !voiceConnected} label={voiceConnected ? NEXUS_AVATAR_STATE_LABELS[avatarState] : voiceAvailable && realtimeAction.available ? "Voice ready" : "Voice unavailable"} /><strong>{voiceConnected ? microphoneMuted ? "Microphone muted" : voiceState : voiceAvailable && realtimeAction.available ? "Voice ready" : "Voice unavailable — Runtime voice cannot be established"}</strong></div>
        <div className="nexus-copilot__voice-controls">
          {voiceConnected && <>
            <button type="button" data-active={microphoneMuted} aria-pressed={microphoneMuted} onClick={toggleMicrophoneMute}>{microphoneMuted ? <MicOff size={15} /> : <Mic size={15} />}{microphoneMuted ? "Unmute mic" : "Mute mic"}</button>
            <button type="button" data-active={nexusMuted} aria-pressed={nexusMuted} onClick={toggleNexusMute}>{nexusMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}{nexusMuted ? "Unmute NEXUS" : "Mute NEXUS"}</button>
          </>}
          {voiceConnected ? <button onClick={stopVoice}><MicOff size={15} />End</button> : <>
            {browserSpeech.input && <button onClick={() => void askByVoice()} disabled={!textAction.available || browserListening || busy}><Mic size={15} />{browserListening ? "Listening…" : "Ask by voice"}</button>}
            <button onClick={() => void startVoice()} disabled={!voiceAvailable || !realtimeAction.available || voiceState === "connecting"}><Mic size={15} />Start live</button>
          </>}
        </div>
      </div>
      {(!interactionAction.available || !realtimeAction.available) && <p className="nexus-copilot__error" role="status">{!interactionAction.available ? interactionAction.reason : realtimeAction.reason}</p>}

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
        <div>{SKILLS.map((skill) => <button key={skill.label} disabled={!interactionAction.available} onClick={() => useSkill(skill)}>{skill.label}<ChevronRight size={13} /></button>)}</div>
      </section>

      <form className="nexus-copilot__composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} disabled={!interactionAction.available} placeholder={interactionAction.available ? "Ask NEXUS…" : "NEXUS interaction is unavailable"} aria-label="Ask NEXUS" autoComplete="off" />
        <button type="button" onClick={voiceConnected ? toggleMicrophoneMute : () => void askByVoice()} disabled={voiceConnected ? !realtimeAction.available : !browserSpeech.input || !textAction.available || browserListening} aria-label={voiceConnected ? microphoneMuted ? "Unmute microphone" : "Mute microphone" : "Ask NEXUS by voice"}>{microphoneMuted ? <MicOff size={17} /> : <Mic size={17} />}</button>
        <button type="submit" disabled={!interactionAction.available || !input.trim() || busy} aria-label="Send message"><Send size={17} /></button>
      </form>
      <footer>Model-native reasoning is labeled. Runtime evidence remains authoritative.</footer>
    </aside>

    {introduced && <div className="nexus-introduction" role="dialog" aria-modal="true" aria-labelledby="nexus-introduction-title">
      <section>
        <button className="nexus-introduction__close" onClick={dismissIntroduction} aria-label="Dismiss introduction"><X size={20} /></button>
        <div className="nexus-introduction__avatar"><NexusAvatar state="idle" size="lg" label="NEXUS assistant avatar" /></div>
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
