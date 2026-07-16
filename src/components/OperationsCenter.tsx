import { Activity, BookOpenCheck, Brain, FileClock, Lightbulb, ShieldCheck, Sparkles, Target, TriangleAlert } from "lucide-react";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";
import type { EoxAssessment, WhyThisMatters } from "../lib/eox-client";

function Why({ value }: { value: WhyThisMatters }) {
  return <details className="why-matters"><summary>Why this matters</summary><dl><div><dt>Business impact</dt><dd>{value.businessImpact}</dd></div><div><dt>Operational impact</dt><dd>{value.operationalImpact}</dd></div><div><dt>Mission impact</dt><dd>{value.missionImpact}</dd></div></dl></details>;
}

export function OperationsCenter({ assessment }: { assessment: EoxAssessment | null }) {
  if (!assessment) return <section className="operations-center eox-unavailable"><TriangleAlert /><h3>Operational assessment unavailable</h3><p>The Runtime has not supplied an Executive Operating Loop contract. NEXUS will not fabricate one in the client.</p></section>;

  return <section className="operations-center" aria-labelledby="operations-center-heading">
    <header className="eox-hero" id="executive-narrative">
      <div><span>Executive Operational Experience</span><h2 id="operations-center-heading">Operations Center</h2><p>{assessment.executiveNarrative.text}</p></div>
      <aside><span>Executive state</span><strong>{assessment.executiveState.active}</strong><small>{assessment.executiveState.reason}</small></aside>
    </header>

    <div className="operating-loop" aria-label="Executive Operating Loop">{assessment.loop.map((stage, index) => <div key={stage.stage}><article data-active={stage.active}><span>{index + 1}</span><strong>{stage.stage}</strong><small>{stage.status.replaceAll("_", " ")}</small></article><b aria-hidden="true">→</b></div>)}</div>

    <div className="experience-grid eox-grid">
      <DataPanel eyebrow="What matters now" title="Executive Brief" icon={<Target size={18} />} className="span-2" ><section id="executive-brief" className="eox-section"><div className="brief-posture"><span>Current operational posture</span><strong>{assessment.executiveBrief.currentOperationalPosture}</strong></div><div className="brief-counts"><article><strong>{assessment.attentionQueue.length}</strong><span>attention items</span></article><article><strong>{assessment.recommendedActions.length}</strong><span>recommendations</span></article><article><strong>{String(assessment.executiveBrief.currentApprovals.value ?? "Pending capability")}</strong><span>approval intelligence</span></article></div></section></DataPanel>

      <DataPanel eyebrow="Runtime-owned indicators" title="Operational Health" icon={<Activity size={18} />} className="span-2"><section id="operational-health" className="eox-indicators">{assessment.operationalHealth.map((item) => <article key={item.name}><span>{item.name}</span><strong>{item.value}</strong><StatusPill value={item.status} /><small>{item.basis}</small></article>)}</section></DataPanel>

      <DataPanel eyebrow="Executive attention" title="Attention Queue" icon={<TriangleAlert size={18} />}><section id="attention-queue" className="eox-list">{assessment.attentionQueue.length ? assessment.attentionQueue.map((item) => <article key={item.title}><header><strong>{item.title}</strong><StatusPill value={item.significance} /></header><Why value={item.whyThisMatters} /></article>) : <EmptyRecord>No Runtime-evidenced attention items.</EmptyRecord>}</section></DataPanel>

      <DataPanel eyebrow="Runtime recommendations" title="Recommended Actions" icon={<Lightbulb size={18} />}><section id="recommended-actions" className="eox-list">{assessment.recommendedActions.map((item) => <article key={item.recommendationId}><header><strong>{item.title}</strong><StatusPill value="recommended" /></header><p>Suggested view: {item.suggestedNavigation.replaceAll("-", " ")}</p><Why value={item.whyThisMatters} /></article>)}</section></DataPanel>

      <DataPanel eyebrow="What NEXUS can establish" title="Operational Understanding" icon={<Brain size={18} />} className="span-2"><section id="operational-understanding" className="eox-indicators understanding-grid">{assessment.operationalUnderstanding.map((item) => <article key={item.name}><span>{item.name}</span><strong>{item.value}</strong><StatusPill value={item.status} /><small>{item.basis}</small></article>)}</section></DataPanel>

      <DataPanel eyebrow="Operational history" title="Mission Timeline" icon={<FileClock size={18} />} className="span-2"><section id="mission-timeline" className="mission-timeline">{assessment.missionTimeline.map((item) => <article key={`${item.occurredAt}-${item.event}`}><BookOpenCheck /><div><strong>{item.event}</strong><span>{new Date(item.occurredAt).toLocaleString()}</span><p>{item.whyThisMatters}</p></div></article>)}</section></DataPanel>
    </div>
    <footer className="eox-truth"><ShieldCheck size={15} /><span>Runtime owns operational understanding and interaction behavior.</span><Sparkles size={15} /><span>The persistent NEXUS copilot is the client presentation surface.</span></footer>
  </section>;
}
