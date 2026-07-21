import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArrowRight, BookOpen, CheckCircle2, FileCheck2, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { localNexusClient, type IntakeSource } from "../lib/local-client";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

type RuntimeRecord = Record<string, unknown>;
type PromotionReview = {
  reviewId: string;
  title: string;
  sourceId: string;
  sourceClass: "retrieved_evidence";
  requestedAt: string;
  reviewReceiptId: string;
  reviewState: "candidate_for_runtime_promotion";
  evidenceIds: string[];
  proofId?: string;
  limitations: string[];
};
type RuntimeKnowledge = {
  id: string;
  title: string;
  receiptId: string;
  missionId: string;
  evidenceIds: string[];
  digest?: string;
};

const REVIEW_KEY = "nexus.web.knowledge-promotion-reviews.v2";
const LEGACY_KEY = "nexus.web.knowledge-store.v1";
const MISSION_KEY = "nexus.web.mission-store.v1";
const text = (value: unknown, fallback = "Unavailable") => typeof value === "string" && value.trim() ? value : fallback;
const object = (value: unknown): RuntimeRecord => value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeRecord : {};
const strings = (value: unknown) => Array.isArray(value) ? value.map((item) => text(item, "")).filter(Boolean) : [];

function readReviews(): PromotionReview[] {
  try {
    const current = JSON.parse(localStorage.getItem(REVIEW_KEY) ?? "[]");
    if (Array.isArray(current) && current.length) return current as PromotionReview[];
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]");
    if (!Array.isArray(legacy)) return [];
    return legacy.map((value, index) => {
      const item = object(value);
      return {
        reviewId: text(item.knowledgeId, `legacy-review-${index}`),
        title: text(item.title, "Legacy knowledge promotion review"),
        sourceId: text(item.sourceId, `legacy-source-${index}`),
        sourceClass: "retrieved_evidence" as const,
        requestedAt: text(item.promotedAt, new Date(0).toISOString()),
        reviewReceiptId: text(item.receiptId, `legacy-candidate-${index}`),
        reviewState: "candidate_for_runtime_promotion" as const,
        evidenceIds: strings(item.evidenceIds),
        limitations: ["Migrated from the earlier client register. Runtime promotion and Knowledge Receipt verification remain required."],
      };
    });
  } catch { return []; }
}

function runtimeKnowledge(missions: RuntimeRecord[]): RuntimeKnowledge[] {
  const results: RuntimeKnowledge[] = [];
  missions.forEach((mission) => {
    const candidates = [mission.knowledgePromotionReceipt, mission.knowledgeReceipt, ...(Array.isArray(mission.knowledgeReceipts) ? mission.knowledgeReceipts : [])];
    candidates.map(object).filter((item) => Object.keys(item).length > 0).forEach((receipt, index) => {
      const nodes = strings(receipt.knowledge_node_ids ?? receipt.knowledgeNodeIds);
      const receiptId = text(receipt.promotion_id ?? receipt.promotionId ?? receipt.receipt_id ?? receipt.receiptId, "");
      if (!receiptId || !nodes.length) return;
      results.push({
        id: nodes[0] ?? `${receiptId}-${index}`,
        title: text(receipt.title ?? mission.userObjective ?? mission.objective, "Promoted operational knowledge"),
        receiptId,
        missionId: text(receipt.mission_id ?? receipt.missionId ?? mission.missionId ?? mission.id, "mission unavailable"),
        evidenceIds: strings(receipt.evidence_ids ?? receipt.evidenceIds),
        digest: text(receipt.content_digest ?? receipt.contentDigest, ""),
      });
    });
  });
  return results;
}

function sourceReady(source: IntakeSource) {
  const extraction = text(source.extractionStatus, "unknown").toLowerCase();
  const secretScan = text(source.secretScanStatus, "unknown").toLowerCase();
  return ["complete", "completed", "verified", "success", "ready"].includes(extraction)
    && !["failed", "unsafe", "blocked", "detected"].includes(secretScan)
    && Boolean(source.proofId)
    && Boolean(source.evidenceIds?.length);
}

export function KnowledgeWorkspace() {
  const [sources, setSources] = useState<IntakeSource[]>([]);
  const [missions, setMissions] = useState<RuntimeRecord[]>([]);
  const [reviews, setReviews] = useState<PromotionReview[]>(readReviews);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [history, missionResult] = await Promise.all([localNexusClient.intakeHistory(), localNexusClient.missions()]);
      setSources(history.sources ?? []);
      const missionRows = Array.isArray(missionResult.missions) ? missionResult.missions as RuntimeRecord[] : [];
      setMissions(missionRows);
      sessionStorage.setItem(MISSION_KEY, JSON.stringify(missionRows));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Knowledge sources are unavailable.");
      try { setMissions(JSON.parse(sessionStorage.getItem(MISSION_KEY) ?? "[]") as RuntimeRecord[]); }
      catch { setMissions([]); }
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const candidates = useMemo(() => sources.filter((source) => !reviews.some((item) => item.sourceId === source.sourceId)), [sources, reviews]);
  const promoted = useMemo(() => runtimeKnowledge(missions), [missions]);
  const eligibleSelected = candidates.filter((source) => selected.includes(source.sourceId) && sourceReady(source));

  function requestReview() {
    const timestamp = new Date().toISOString();
    const additions = eligibleSelected.map((source) => ({
      reviewId: `KPR-REVIEW-${crypto.randomUUID()}`,
      title: text(source.normalizedTitle ?? source.originalFilename, "Operational knowledge candidate"),
      sourceId: source.sourceId,
      sourceClass: "retrieved_evidence" as const,
      requestedAt: timestamp,
      reviewReceiptId: `KPR-CANDIDATE-${crypto.randomUUID()}`,
      reviewState: "candidate_for_runtime_promotion" as const,
      evidenceIds: source.evidenceIds ?? [],
      ...(source.proofId ? { proofId: source.proofId } : {}),
      limitations: ["This browser record is a promotion review request, not a Runtime Knowledge Receipt or proof of deployment."],
    }));
    const next = [...additions, ...reviews];
    setReviews(next);
    setSelected([]);
    localStorage.setItem(REVIEW_KEY, JSON.stringify(next));
  }

  function remove(reviewId: string) {
    const next = reviews.filter((item) => item.reviewId !== reviewId);
    setReviews(next);
    localStorage.setItem(REVIEW_KEY, JSON.stringify(next));
  }

  return <div className="knowledge-workspace">
    <section className="nx-workspace-hero"><div><span className="nx-eyebrow">Autonomous Knowledge Acquisition</span><h1>Separate temporary mission context from promoted operational knowledge.</h1><p>Mission Store remains session-scoped. Only a Runtime-issued, evidence-lineaged Knowledge Receipt can place an item in the permanent Knowledge Store.</p></div><button className="nx-action" onClick={() => void refresh()} disabled={busy}><RefreshCw size={14} className={busy ? "spin" : ""} />Refresh sources</button></section>
    <section className="nx-metrics"><article><span>Mission Store</span><strong>{missions.length}</strong><small>Temporary session context</small></article><article><span>Promotion Candidates</span><strong>{candidates.length}</strong><small>Not authoritative</small></article><article><span>Knowledge Store</span><strong>{promoted.length}</strong><small>Runtime-promoted only</small></article><article><span>Promotion Receipts</span><strong>{promoted.length}</strong><small>Verified Runtime records</small></article></section>
    {error && <section className="operation-error" role="alert">{error}</section>}
    <div className="knowledge-flow">
      <DataPanel eyebrow="Temporary Mission Store" title="Mission-scoped context" icon={<Archive size={18} />}><div className="compact-records">{missions.length ? missions.map((mission, index) => <article key={text(mission.missionId ?? mission.id, `mission-${index}`)}><strong>{text(mission.userObjective ?? mission.objective, "Mission")}</strong><span>{text(mission.missionId ?? mission.id, "ID unavailable")}</span><StatusPill value="temporary" /></article>) : <EmptyRecord>No mission context is held in this browser session.</EmptyRecord>}</div><p className="boundary-note">Mission completion never promotes knowledge automatically. Session context remains isolated from the permanent store.</p></DataPanel>
      <ArrowRight className="knowledge-flow__arrow" />
      <DataPanel eyebrow="Knowledge Promotion Engine" title="Review evidence candidates" icon={<ShieldCheck size={18} />}><div className="promotion-gates"><span><CheckCircle2 size={12} />Terminal archived mission</span><span><FileCheck2 size={12} />Completion receipt digest</span><span><ShieldCheck size={12} />Evidence and confidence threshold</span><span><TriangleAlert size={12} />No unresolved contradictions</span><span><ShieldCheck size={12} />Required executive approval</span></div><div className="promotion-candidates">{candidates.length ? candidates.map((source) => { const eligible = sourceReady(source); return <label key={source.sourceId} data-eligible={eligible}><input type="checkbox" disabled={!eligible} checked={selected.includes(source.sourceId)} onChange={(event) => setSelected((items) => event.target.checked ? [...items, source.sourceId] : items.filter((id) => id !== source.sourceId))} /><span><strong>{text(source.normalizedTitle ?? source.originalFilename, "Evidence source")}</strong><small>{source.sourceId} · {eligible ? "evidence gate ready for review" : "requires verified extraction, Evidence, and proof"}</small></span></label>; }) : <EmptyRecord>No unreviewed evidence candidates.</EmptyRecord>}</div><button className="nx-action" onClick={requestReview} disabled={!eligibleSelected.length}><BookOpen size={14} />Create promotion review</button><div className="promotion-review-register">{reviews.length ? reviews.map((item) => <article key={item.reviewId}><div><strong>{item.title}</strong><small>{item.reviewReceiptId}</small></div><StatusPill value="awaiting Runtime promotion" /><button onClick={() => remove(item.reviewId)} aria-label={`Remove ${item.title} review request`}><Trash2 size={13} /></button></article>) : <p className="boundary-note">No client promotion reviews are pending.</p>}</div></DataPanel>
      <ArrowRight className="knowledge-flow__arrow" />
      <DataPanel eyebrow="Promoted Knowledge Store" title="Operational knowledge" icon={<BookOpen size={18} />}><div className="promoted-knowledge">{promoted.length ? promoted.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.id} · {item.missionId}</small></div><StatusPill value="Runtime promoted" /><footer><FileCheck2 size={13} /><code>{item.receiptId}</code>{item.digest && <code>{item.digest}</code>}</footer></article>) : <EmptyRecord>No Runtime-issued Knowledge Receipt is available. Promotion reviews remain outside the Knowledge Store.</EmptyRecord>}</div><p className="boundary-note">The browser cannot self-promote knowledge. The authoritative Runtime must evaluate policy, write immutable lineage, issue the Knowledge Receipt, deploy the record, and return it here.</p></DataPanel>
    </div>
  </div>;
}
