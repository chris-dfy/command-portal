import { useEffect, useRef, useState } from "react";
import { ChevronRight, Maximize2, Mic, MicOff, Minimize2, Send, ShieldCheck, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { localNexusClient, newExecutiveInteractionId } from "../lib/local-client";
import type { CanonicalActionAvailability } from "../lib/portal-client";
import { RealtimeVoiceClient, type RealtimeVoiceState } from "../lib/realtime-voice-client";
import { browserSpeechAvailability, recognizeBrowserSpeech, speakBrowserResponse } from "../lib/browser-speech";
import { assistantPresence } from "../lib/assistant-presence";
import {
  beginAcceptanceBoundDraft,
  clearDraftAfterAcceptance,
  retainDraftAfterUnacceptedFailure,
  type AcceptanceBoundDraft,
} from "../lib/acceptance-bound-draft";
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
  admitExecutiveInteraction,
  admitRuntimeVoiceTranscript,
  clearPendingExecutiveApproval,
  pendingExecutiveApprovalId,
  recoverPendingExecutiveApproval,
  rememberPendingExecutiveApproval,
  runtimeInteractionTrace,
  runtimePresentationNavigation,
  type RuntimeInteractionAdmission,
  validateExecutiveInteractionDenial,
} from "../lib/runtime-voice-admission";
import { deriveAssistantAvatarState, NexusAvatar, NEXUS_AVATAR_STATE_LABELS } from "./NexusAvatar";
import { ExecutiveInteractionApproval } from "./ExecutiveInteractionApproval";
import "./NexusAvatar.css";

type Message = { speaker: "operator" | "nexus"; text: string; limitation?: string };
type AreaId = "center" | "intake" | "projects" | "voice" | "operations" | "replay" | "missions" | "knowledge" | "edge" | "conclave" | "information" | "health" | "topology" | "providers" | "evidence";
type CopilotVoicePayload = {
  transcript: string;
  operatorAlreadyVisible: boolean;
};
type PendingCopilotVoiceRequest = PrivateDraftOperation<CopilotVoicePayload>;

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
const AREA_IDS = new Set<AreaId>(["center", "intake", "projects", "voice", "operations", "replay", "missions", "knowledge", "edge", "conclave", "information", "health", "topology", "providers", "evidence"]);
const isAreaId = (value: string): value is AreaId => AREA_IDS.has(value as AreaId);

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
  const [pendingAskDraft, setPendingAskDraft] = useState<AcceptanceBoundDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceState, setVoiceState] = useState<RealtimeVoiceState>("idle");
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [nexusMuted, setNexusMuted] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [pendingApproval, setPendingApproval] = useState<RuntimeInteractionAdmission | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<"approve" | "deny" | null>(null);
  const [browserListening, setBrowserListening] = useState(false);
  const [pendingVoiceRequest, setPendingVoiceRequest] = useState<PendingCopilotVoiceRequest | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { speaker: "nexus", text: "NEXUS is online. I can help you understand registered operational context, frame decisions, govern bounded work, and identify what evidence is still missing." },
  ]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const liveClient = useRef<RealtimeVoiceClient | null>(null);
  const latestUserTranscript = useRef("");
  const conversationId = useRef(newExecutiveInteractionId());
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
  }, [messages, busy]);

  useEffect(() => {
    void recoverPendingExecutiveApproval()
      .then((admission) => {
        if (!admission) return;
        setPendingApproval(admission);
        setMessages((items) => [...items, {
          speaker: "nexus",
          text: admission.spokenSummary,
          limitation: `Recovered from the Runtime interaction ledger · ${runtimeInteractionTrace(admission)}`,
        }]);
      })
      .catch((caught) => setError(messageFrom(caught)));
  }, []);

  function dismissIntroduction() {
    window.localStorage.setItem(introductionKey, "complete");
    setIntroduced(false);
  }

  function presentAdmission(admission: RuntimeInteractionAdmission) {
    setMessages((items) => [...items, {
      speaker: "nexus",
      text: admission.spokenSummary,
      limitation: runtimeInteractionTrace(admission),
    }]);
    rememberPendingExecutiveApproval(admission);
    setPendingApproval(pendingExecutiveApprovalId(admission) ? admission : null);
    const navigation = runtimePresentationNavigation(admission);
    if (navigation && isAreaId(navigation)) onNavigate(navigation);
  }

  async function approvePendingIntent() {
    const pending = pendingApproval;
    const approvalId = pendingExecutiveApprovalId(pending);
    if (!pending || !approvalId || approvalBusy) return;
    setError(null);
    setApprovalBusy("approve");
    try {
      const response = await localNexusClient.approve(approvalId);
      const admission = await admitApprovedExecutiveInteraction(response, pending);
      presentAdmission(admission);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setApprovalBusy(null);
    }
  }

  async function denyPendingIntent() {
    const pending = pendingApproval;
    const approvalId = pendingExecutiveApprovalId(pending);
    if (!pending || !approvalId || approvalBusy) return;
    setError(null);
    setApprovalBusy("deny");
    try {
      const response = await localNexusClient.deny(
        approvalId,
        "Denied by the authenticated operator in NEXUS Command.",
      );
      validateExecutiveInteractionDenial(
        response,
        approvalId,
        pending.interactionResult.interaction_id,
      );
      clearPendingExecutiveApproval(pending.interactionResult.interaction_id);
      setPendingApproval(null);
      setMessages((items) => [...items, {
        speaker: "nexus",
        text: `Runtime recorded the denial for approval ${approvalId}. No approval continuation was admitted.`,
      }]);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setApprovalBusy(null);
    }
  }

  async function ask(text?: string) {
    const fromComposer = text === undefined;
    const request = (text ?? input).trim();
    if (!request || busy) return;
    if (!interactionAction.available) {
      setError(interactionAction.reason);
      return;
    }
    const draftOperation = fromComposer ? beginAcceptanceBoundDraft(input) : null;
    if (draftOperation) setPendingAskDraft(draftOperation);
    setError(null);
    setBusy(true);
    try {
      const result = await admitExecutiveInteraction(request, "text", conversationId.current);
      setMessages((items) => [...items, { speaker: "operator", text: request }]);
      presentAdmission(result);
      if (draftOperation) {
        const accepted = clearDraftAfterAcceptance(draftOperation);
        setInput(accepted.draft);
        setPendingAskDraft(accepted.pending);
      }
    } catch (caught) {
      if (draftOperation) {
        const retained = retainDraftAfterUnacceptedFailure(draftOperation);
        setInput(retained.draft);
        setPendingAskDraft(retained.pending);
      }
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
    setMicrophoneMuted(false);
    setNexusMuted(false);
    audio.current.muted = false;
    const client = new RealtimeVoiceClient(audio.current, {
      onState: setVoiceState,
      onAmplitude: setAmplitude,
      onUserTranscript: async (text, idempotencyKey) => {
        latestUserTranscript.current = text;
        setMessages((items) => [...items, { speaker: "operator", text }]);
        const admission = await admitRuntimeVoiceTranscript(
          text,
          conversationId.current,
          idempotencyKey,
        );
        presentAdmission(admission);
        latestUserTranscript.current = "";
        return admission;
      },
      onError: (message) => {
        setError(message);
        const captured = latestUserTranscript.current.trim();
        if (captured) {
          const staged = snapshotPrivateDraftOperation(
            { transcript: captured, operatorAlreadyVisible: true },
            newExecutiveInteractionId(),
          );
          setPendingVoiceRequest((current) => (
            current
            && current.payload.transcript === staged.payload.transcript
            && current.payload.operatorAlreadyVisible === staged.payload.operatorAlreadyVisible
              ? current
              : staged
          ));
          setError(`${message} The captured transcript has not been sent. Use the explicit governed Voice action to send it.`);
        }
      },
    });
    liveClient.current = client;
    try { await client.connect(); }
    catch (caught) { setVoiceState("error"); setError(messageFrom(caught)); }
  }

  async function routeGovernedVoice(
    request: string,
    operatorAlreadyVisible = false,
    retryRequest: PendingCopilotVoiceRequest | null = null,
  ) {
    if ((!request.trim() && !retryRequest) || !textAction.available) {
      setError(textAction.reason);
      return;
    }
    const staged = retryRequest ?? snapshotPrivateDraftOperation(
      { transcript: request.trim(), operatorAlreadyVisible },
      newExecutiveInteractionId(),
    );
    const presentOperatorTranscript = shouldPresentPrivateDraft(
      staged,
      staged.payload.operatorAlreadyVisible,
    );
    const operation = beginPrivateDraftAttempt(staged);
    setPendingVoiceRequest(operation);
    setBusy(true);
    setError(null);
    if (presentOperatorTranscript) {
      setMessages((items) => [...items, { speaker: "operator", text: operation.payload.transcript }]);
    }
    try {
      const result = await executeExplicitPrivateDraftAction(
        operation,
        (explicitOperation) => admitRuntimeVoiceTranscript(
          explicitOperation.payload.transcript,
          conversationId.current,
          explicitOperation.idempotencyKey,
        ),
      );
      presentAdmission(result);
      if (!nexusMuted) speakBrowserResponse(result.spokenSummary);
      setPendingVoiceRequest(clearPrivateDraftAfterSuccess());
      if (latestUserTranscript.current.trim() === operation.payload.transcript) latestUserTranscript.current = "";
    } catch (caught) {
      setPendingVoiceRequest(retainPrivateDraftAfterFailure(operation));
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
    liveClient.current?.stop();
    liveClient.current = null;
    latestUserTranscript.current = "";
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
          {pendingVoiceRequest && <button type="button" onClick={() => void routeGovernedVoice("", pendingVoiceRequest.payload.operatorAlreadyVisible, pendingVoiceRequest)} disabled={!textAction.available || busy} title={textAction.available ? undefined : textAction.reason}><Send size={15} />{pendingVoiceRequest.attempts === 0 ? "Send captured transcript through governed Voice" : "Retry exact governed Voice request"}</button>}
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
        {busy && <div className="nexus-copilot__thinking"><i /><i /><i /><span>Reasoning over registered context</span></div>}
        {error && <p className="nexus-copilot__error">{error}</p>}
      </div>

      <ExecutiveInteractionApproval
        admission={pendingApproval}
        busy={approvalBusy}
        onApprove={() => void approvePendingIntent()}
        onDeny={() => void denyPendingIntent()}
      />

      <section className="nexus-copilot__skills">
        <header><span>Executive skills</span><b>{SKILLS.length}</b></header>
        <div>{SKILLS.map((skill) => <button key={skill.label} disabled={!interactionAction.available} onClick={() => useSkill(skill)}>{skill.label}<ChevronRight size={13} /></button>)}</div>
      </section>

      <form className="nexus-copilot__composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} disabled={!interactionAction.available || busy || Boolean(pendingAskDraft)} placeholder={interactionAction.available ? "Ask NEXUS…" : "NEXUS interaction is unavailable"} aria-label="Ask NEXUS" autoComplete="off" />
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
