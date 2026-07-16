import { useEffect, useRef, useState } from "react";
import { Activity, BookOpenCheck, Brain, CirclePause, FileClock, Lightbulb, Play, ShieldCheck, Sparkles, Target, TriangleAlert } from "lucide-react";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";
import { eoxClient, type EoxAssessment, type WhyThisMatters } from "../lib/eox-client";
import type { HifEvent, HifInteraction } from "../lib/hif-client";

function Why({ value }: { value: WhyThisMatters }) {
  return <details className="why-matters"><summary>Why this matters</summary><dl><div><dt>Business impact</dt><dd>{value.businessImpact}</dd></div><div><dt>Operational impact</dt><dd>{value.operationalImpact}</dd></div><div><dt>Mission impact</dt><dd>{value.missionImpact}</dd></div></dl></details>;
}

export function OperationsCenter({ assessment }: { assessment: EoxAssessment | null }) {
  const [interaction, setInteraction] = useState<HifInteraction | null>(null);
  const [events, setEvents] = useState<HifEvent[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  if (!assessment) return <section className="operations-center eox-unavailable"><TriangleAlert /><h3>Operational assessment unavailable</h3><p>The Runtime has not supplied an Executive Operating Loop contract. NEXUS will not fabricate one in the client.</p></section>;

  const begin = async () => {
    setBusy(true); setMessage(""); timers.current.forEach(window.clearTimeout); timers.current = [];
    try {
      const result = await eoxClient.beginBriefing(); setInteraction(result.interaction); setEvents(result.events);
      const speech = result.events.find((event) => event.type === "SpeechStarted")?.payload.text;
      if (speech && "speechSynthesis" in window) { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(String(speech)); utterance.rate = 0.96; window.speechSynthesis.speak(utterance); }
      let elapsed = 0;
      result.events.filter((event) => event.type === "HighlightRequested").forEach((event) => {
        elapsed += Number(event.payload.delayMs ?? 900);
        timers.current.push(window.setTimeout(() => setHighlight(String(event.payload.target ?? "")), elapsed));
      });
      setMessage("Executive briefing is being presented by the Human Interaction Framework.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const interrupt = async () => {
    if (!interaction) return; window.speechSynthesis?.cancel(); timers.current.forEach(window.clearTimeout); setHighlight(null);
    try { const result = await eoxClient.interrupt(interaction.interactionId); setEvents(result.events); setInteraction(result.interaction); setMessage("Briefing interrupted. The conversation remains available to resume from Runtime state."); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const resume = async () => {
    if (!interaction) return;
    try {
      const result = await eoxClient.resume(interaction.interactionId); setEvents(result.events); setInteraction(result.interaction);
      const speech = [...result.events].reverse().find((event) => event.type === "SpeechStarted")?.payload.text;
      if (speech && "speechSynthesis" in window) { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(String(speech)); utterance.rate = 0.96; window.speechSynthesis.speak(utterance); }
      setMessage("Executive briefing resumed by the Human Interaction Framework.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  return <section className="operations-center" aria-labelledby="operations-center-heading">
    <header className="eox-hero" data-highlight={highlight === "executive-narrative"} id="executive-narrative">
      <div><span>Executive Operational Experience</span><h2 id="operations-center-heading">Operations Center</h2><p>{assessment.executiveNarrative.text}</p></div>
      <aside><span>Executive state</span><strong>{assessment.executiveState.active}</strong><small>{assessment.executiveState.reason}</small></aside>
      <div className="eox-actions"><button onClick={() => void begin()} disabled={busy}><Play size={16} /> Begin Executive Briefing</button>{interaction?.state === "interrupted" ? <button onClick={() => void resume()}><Play size={16} /> Resume</button> : interaction && <button onClick={() => void interrupt()}><CirclePause size={16} /> Interrupt</button>}</div>
      {message && <p className="eox-message" role="status">{message}</p>}
    </header>

    <div className="operating-loop" aria-label="Executive Operating Loop">{assessment.loop.map((stage, index) => <div key={stage.stage}><article data-active={stage.active}><span>{index + 1}</span><strong>{stage.stage}</strong><small>{stage.status.replaceAll("_", " ")}</small></article><b aria-hidden="true">→</b></div>)}</div>

    <div className="experience-grid eox-grid">
      <DataPanel eyebrow="What matters now" title="Executive Brief" icon={<Target size={18} />} className="span-2" ><section id="executive-brief" data-highlight={highlight === "executive-brief"} className="eox-section"><div className="brief-posture"><span>Current operational posture</span><strong>{assessment.executiveBrief.currentOperationalPosture}</strong></div><div className="brief-counts"><article><strong>{assessment.attentionQueue.length}</strong><span>attention items</span></article><article><strong>{assessment.recommendedActions.length}</strong><span>recommendations</span></article><article><strong>{String(assessment.executiveBrief.currentApprovals.value ?? "Pending capability")}</strong><span>approval intelligence</span></article></div></section></DataPanel>

      <DataPanel eyebrow="Runtime-owned indicators" title="Operational Health" icon={<Activity size={18} />} className="span-2"><section id="operational-health" data-highlight={highlight === "operational-health"} className="eox-indicators">{assessment.operationalHealth.map((item) => <article key={item.name}><span>{item.name}</span><strong>{item.value}</strong><StatusPill value={item.status} /><small>{item.basis}</small></article>)}</section></DataPanel>

      <DataPanel eyebrow="Executive attention" title="Attention Queue" icon={<TriangleAlert size={18} />}><section id="attention-queue" data-highlight={highlight === "attention-queue"} className="eox-list">{assessment.attentionQueue.length ? assessment.attentionQueue.map((item) => <article key={item.title}><header><strong>{item.title}</strong><StatusPill value={item.significance} /></header><Why value={item.whyThisMatters} /></article>) : <EmptyRecord>No Runtime-evidenced attention items.</EmptyRecord>}</section></DataPanel>

      <DataPanel eyebrow="Runtime recommendations" title="Recommended Actions" icon={<Lightbulb size={18} />}><section id="recommended-actions" data-highlight={highlight === "recommended-actions"} className="eox-list">{assessment.recommendedActions.map((item) => <article key={item.recommendationId}><header><strong>{item.title}</strong><StatusPill value="recommended" /></header><p>Suggested view: {item.suggestedNavigation.replaceAll("-", " ")}</p><Why value={item.whyThisMatters} /></article>)}</section></DataPanel>

      <DataPanel eyebrow="What NEXUS can establish" title="Operational Understanding" icon={<Brain size={18} />} className="span-2"><section id="operational-understanding" data-highlight={highlight === "operational-understanding"} className="eox-indicators understanding-grid">{assessment.operationalUnderstanding.map((item) => <article key={item.name}><span>{item.name}</span><strong>{item.value}</strong><StatusPill value={item.status} /><small>{item.basis}</small></article>)}</section></DataPanel>

      <DataPanel eyebrow="Operational history" title="Mission Timeline" icon={<FileClock size={18} />} className="span-2"><section id="mission-timeline" data-highlight={highlight === "mission-timeline"} className="mission-timeline">{assessment.missionTimeline.map((item) => <article key={`${item.occurredAt}-${item.event}`}><BookOpenCheck /><div><strong>{item.event}</strong><span>{new Date(item.occurredAt).toLocaleString()}</span><p>{item.whyThisMatters}</p></div></article>)}</section></DataPanel>
    </div>
    <footer className="eox-truth"><ShieldCheck size={15} /><span>Runtime owns operational understanding.</span><Sparkles size={15} /><span>HIF owns briefing behavior.</span><span>Client presentation only.</span><span>{events.length} interaction events</span></footer>
  </section>;
}
