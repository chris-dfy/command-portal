import { useState } from "react";
import { BrainCircuit, CheckCircle2, Scale, ShieldAlert, TriangleAlert } from "lucide-react";
import { DataPanel } from "./DataPanel";
import { StatusPill } from "./StatusPill";
import { runConclaveReview, type ConclaveReview } from "../lib/conclave-client";
import { displayLabel } from "../lib/presentation";

const suggestedProposal = "Authorize a new operational capability before registered evidence, governance authority, and rollback criteria are complete.";

export function ConclaveWorkspace({ status }: { status?: Record<string, unknown> | null }) {
  const [proposal, setProposal] = useState("");
  const [review, setReview] = useState<ConclaveReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runReview() {
    const value = proposal.trim();
    if (!value || busy) return;
    setBusy(true); setError(null);
    try { setReview(await runConclaveReview(value)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  return <div className="conclave-workspace">
    <section className="conclave-hero">
      <div><span>Runtime-owned decision challenge</span><h2>Conclave</h2><p>Pressure-test an assessment before governance or execution. Conclave preserves disagreement, identifies missing evidence, and returns a bounded synthesis grounded only in registered Operational Context.</p></div>
      <aside><StatusPill value={String(status?.state ?? "available")} /><strong>Structured Runtime review</strong><small>No execution authority · No fabricated independent agents</small></aside>
    </section>

    <DataPanel eyebrow="Proposal under review" title="Frame the decision" icon={<Scale size={18} />}>
      <div className="conclave-composer"><label htmlFor="conclave-proposal">What should Conclave challenge?</label><textarea id="conclave-proposal" value={proposal} onChange={(event) => setProposal(event.target.value)} placeholder={suggestedProposal} maxLength={8000} /><div><small>{proposal.length.toLocaleString()} / 8,000</small><button onClick={() => void runReview()} disabled={!proposal.trim() || busy}><BrainCircuit size={16} />{busy ? "Reviewing registered context…" : "Run governed review"}</button></div></div>
      {error && <p className="conclave-error" role="alert">{error}</p>}
    </DataPanel>

    <section className="conclave-context-grid" aria-label="Conclave mission workspace">
      <article><span>Mission</span><strong>{review?.reviewId ?? "Review not started"}</strong><p>{proposal || "Frame a governed mission decision above."}</p></article>
      <article><span>Objectives</span><strong>Challenge before progression</strong><p>Identify missing authority, evidence, constraints, and rollback expectations.</p></article>
      <article><span>Knowledge</span><strong>{review?.provenanceCount ?? 0} provenance records</strong><p>Only registered Runtime context contributes to synthesis.</p></article>
      <article><span>Unknowns</span><strong>{review?.missingContextDomains.length ?? 0} open domains</strong><p>{review?.missingContextDomains.join(", ") || "Unknowns populate after review."}</p></article>
      <article><span>Task Graph</span><strong>{review ? "Review → Challenge → Synthesis" : "Awaiting proposal"}</strong><p>Conclave does not execute the resulting mission graph.</p></article>
      <article><span>Specialists</span><strong>{review?.perspectives.length ?? 0} assigned perspectives</strong><p>{review?.perspectives.map((item) => item.name).join(", ") || "Specialists populate from the governed review."}</p></article>
      <article><span>Evidence</span><strong>{review?.proofIds.length ?? 0} proof references</strong><p>{review?.proofIds.join(", ") || "No review evidence is selected."}</p></article>
      <article><span>Knowledge Graph</span><strong>{review ? "Context relationships established" : "Not established"}</strong><p>Provenance, dissent, missing domains, and conclusions remain linked.</p></article>
      <article><span>Operational Replay</span><strong>{review ? "Review replay available" : "No replay"}</strong><p>Review stages remain inspectable through the permanent Replay workspace.</p></article>
      <article><span>Executive Conclusions</span><strong>{review ? displayLabel(review.outcome) : "Pending"}</strong><p>{review?.synthesis ?? "Run a review to establish a bounded conclusion."}</p></article>
    </section>

    {review ? <>
      <section className="conclave-summary" data-outcome={review.outcome}>
        <div><span>Conclave synthesis</span><h3>{displayLabel(review.outcome)}</h3><p>{review.synthesis}</p></div>
        <dl><div><dt>Confidence</dt><dd>{Math.round(review.confidence * 100)}%</dd></div><div><dt>Context coverage</dt><dd>{Math.round(review.contextCompleteness * 100)}%</dd></div><div><dt>Dissent preserved</dt><dd>{review.dissent.length}</dd></div><div><dt>Execution</dt><dd>Not authorized</dd></div></dl>
      </section>
      <div className="conclave-perspectives">{review.perspectives.map((item) => <article key={item.id} data-position={item.position}>
        <header>{item.position === "challenge" ? <ShieldAlert size={18} /> : <CheckCircle2 size={18} />}<div><span>{item.mandate}</span><h3>{item.name}</h3></div><StatusPill value={item.position} /></header>
        <p>{item.assessment}</p>
        {item.requiredEvidence.length > 0 && <section><strong>Required before progression</strong><ul>{item.requiredEvidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></section>}
      </article>)}</div>
      <DataPanel eyebrow="Truth boundary" title="What this review does not establish" icon={<TriangleAlert size={18} />}>
        <div className="conclave-boundary"><p>This review is Runtime evidence, not proof that the proposal is correct. It does not authorize or perform execution.</p><div>{review.missingContextDomains.map((domain) => <StatusPill key={domain} value={`${domain} missing`} tone="warn" />)}</div><small>{review.reviewId} · {review.provenanceCount} provenance records · {new Date(review.reviewedAt).toLocaleString()}</small></div>
      </DataPanel>
    </> : <section className="conclave-empty"><BrainCircuit size={25} /><div><strong>No review has been run in this client session.</strong><p>Frame a proposal above. Conclave will expose challenges and missing evidence before the work moves toward governance.</p></div></section>}
  </div>;
}
