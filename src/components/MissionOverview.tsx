import { Activity, ArrowRight, BrainCircuit, CheckCircle2, CircleAlert, CloudOff, FileCheck2, Flag, ShieldCheck, TriangleAlert } from "lucide-react";
import type { DomainEnvelope, PortalMeta } from "../lib/types";
import { asItems, asRecord, displayLabel } from "../lib/presentation";
import { StatusPill } from "./StatusPill";
import { FutureBriefingDock } from "./FutureBriefingDock";

export function MissionOverview({ domains, meta }: { domains: Record<string, DomainEnvelope>; meta: PortalMeta }) {
  const readiness = asRecord(domains.readiness);
  const hosted = asRecord(domains["hosted-readiness"]);
  const specialists = asRecord(domains.specialists);
  const hosting = asRecord(domains["model-hosting"]);
  const limitationsValue = asRecord(domains.limitations).items;
  const limitations = Array.isArray(limitationsValue) ? limitationsValue.map(String) : [];
  const proofs = asItems(domains.proofs).length;
  const receipts = asItems(domains.receipts).length;
  const missing = Array.isArray(hosted.missing) ? hosted.missing.map(String) : [];

  return <div className="mission-overview">
    <section className="mission-hero" aria-labelledby="mission-heading">
      <div className="mission-hero__copy">
        <span className="section-kicker">Executive operating picture</span>
        <h3 id="mission-heading">Local foundation verified. Hosted connection remains the mission.</h3>
        <p>The standalone read-only portal is functionally complete. Current evidence proves the local contract and security boundary—not a hosted runtime connection, production readiness, or enterprise readiness.</p>
        <div className="mission-position">
          <StatusPill value="Phase 5X-B functionally complete" tone="good" />
          <ArrowRight size={15} aria-hidden="true" />
          <StatusPill value="Phase 5X-C not started" tone="warn" />
        </div>
      </div>
      <div className="mission-ring" data-tone="warn" aria-label="Hosted runtime pending">
        <span>Hosted runtime</span><strong>Pending</strong><small>Awaiting secure connection</small>
      </div>
    </section>

    <section className="mission-section" aria-labelledby="operational-health-heading">
      <header><div><span>Operational health</span><h3 id="operational-health-heading">What is working now</h3></div><Activity size={18} /></header>
      <div className="executive-health-grid">
        <article data-tone="good"><CheckCircle2 /><div><span>Portal foundation</span><strong>{displayLabel(readiness.phase5XB)}</strong><p>Standalone client, BFF, tests, and Replit configuration are present.</p></div></article>
        <article data-tone="good"><ShieldCheck /><div><span>Security boundary</span><strong>Read-only enforced</strong><p>Fixed same-origin GET allowlist; runtime credential remains server-only.</p></div></article>
        <article data-tone="good"><FileCheck2 /><div><span>Evidence posture</span><strong>{proofs + receipts} local records</strong><p>{proofs} proof and {receipts} receipt demonstrate the fixture contract.</p></div></article>
        <article data-tone="warn"><CloudOff /><div><span>Runtime status</span><strong>Awaiting secure runtime connection</strong><p>Phase 5X-C has not started; hosted acceptance is pending.</p></div></article>
      </div>
    </section>

    <div className="mission-columns">
      <section className="mission-section" aria-labelledby="findings-heading">
        <header><div><span>Critical findings</span><h3 id="findings-heading">What leadership should know</h3></div><Flag size={18} /></header>
        <div className="finding-list">
          <article><BrainCircuit /><div><strong>AI workforce is profiled, not trained</strong><p>Three specialist profiles are registered. Actual trained SLMs: {String(specialists.actualTrainedSLMs ?? 0)}.</p></div><StatusPill value="limited" tone="warn" /></article>
          <article><CircleAlert /><div><strong>Conclave remains staged</strong><p>It cannot be represented as live multi-agent validation.</p></div><StatusPill value="staged" tone="warn" /></article>
          <article><CloudOff /><div><strong>External model inference is unverified</strong><p>Current default provider: {displayLabel(hosting.defaultProvider)}.</p></div><StatusPill value="unverified" tone="warn" /></article>
        </div>
      </section>

      <section className="mission-section" aria-labelledby="next-steps-heading">
        <header><div><span>Immediate next steps</span><h3 id="next-steps-heading">What must happen next</h3></div><ArrowRight size={18} /></header>
        <ol className="next-step-list">{missing.length ? missing.map((item, index) => <li key={item}><span>{index + 1}</span><div><strong>{displayLabel(item)}</strong><p>Required before hosted connection acceptance can begin.</p></div></li>) : <li><span>1</span><div><strong>No verified next-step record</strong><p>The portal will not invent one.</p></div></li>}</ol>
      </section>
    </div>

    <section className="mission-section mission-risks" aria-labelledby="risks-heading">
      <header><div><span>Current risks and limitations</span><h3 id="risks-heading">What remains blocked or unverified</h3></div><TriangleAlert size={18} /></header>
      <ul>{limitations.map((item) => <li key={item}><TriangleAlert size={14} aria-hidden="true" /><span>{item}</span></li>)}</ul>
      <footer><span>Production ready: false</span><span>Enterprise ready: false</span><span>Cloud primary: false</span><span>Local source of truth: {String(meta.localSourceOfTruth)}</span></footer>
    </section>

    <FutureBriefingDock />
  </div>;
}
