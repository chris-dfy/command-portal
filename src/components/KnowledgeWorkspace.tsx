import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  BookOpen,
  Database,
  FileCheck2,
  Layers,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { localNexusClient, type IntakeSource } from "../lib/local-client";
import type { RuntimeSnapshot } from "../lib/types";
import { NexusButton, NexusMetric } from "../design-system/NexusPrimitives";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

type RuntimeRecord = Record<string, unknown>;
type LoadState = "loading" | "ready" | "empty" | "unavailable";
type PromotionDraft = {
  draftId: string;
  title: string;
  sourceId: string;
  sourceClass: "retrieved_evidence";
  requestedAt: string;
  candidateRecordId: string;
  evidenceIds: string[];
  proofId?: string;
  limitations: string[];
};
type RuntimeKnowledge = {
  nodeId: string;
  title: string;
  promotionId: string;
  missionId: string;
  evidenceIds: string[];
  digest: string;
};

const DRAFT_KEY = "nexus.web.knowledge-promotion-drafts.v3";
const READY_EXTRACTION = new Set(["extracted", "metadata_only", "complete", "completed", "verified", "success", "ready"]);
const SAFE_SECRET_SCAN = new Set(["passed", "clean"]);
const text = (value: unknown, fallback = "Unavailable") => {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
};
const asRecord = (value: unknown): RuntimeRecord | null => value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeRecord : null;
const strings = (value: unknown) => Array.isArray(value) ? value.map((item) => text(item, "")).filter(Boolean) : [];

function readDrafts(): PromotionDraft[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate) => {
      const item = asRecord(candidate);
      const sourceId = text(item?.sourceId, "");
      const draftId = text(item?.draftId, "");
      if (!item || !sourceId || !draftId) return [];
      return [{
        draftId,
        title: text(item.title, "Knowledge promotion draft"),
        sourceId,
        sourceClass: "retrieved_evidence" as const,
        requestedAt: text(item.requestedAt, "Timestamp unavailable"),
        candidateRecordId: text(item.candidateRecordId, "Candidate ID unavailable"),
        evidenceIds: strings(item.evidenceIds),
        ...(text(item.proofId, "") ? { proofId: text(item.proofId, "") } : {}),
        limitations: strings(item.limitations),
      }];
    });
  } catch {
    return [];
  }
}

function writeDrafts(drafts: PromotionDraft[]) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); }
  catch { /* A browser that blocks storage still retains the in-memory draft register. */ }
}

function sourceReady(source: IntakeSource) {
  const extraction = text(source.extractionStatus, "unknown").toLowerCase();
  const secretScan = text(source.secretScanStatus, "unknown").toLowerCase();
  return READY_EXTRACTION.has(extraction)
    && SAFE_SECRET_SCAN.has(secretScan)
    && Boolean(source.proofId)
    && Boolean(source.evidenceIds?.length);
}

function safeValue(value: unknown) {
  if (value === null || value === undefined) return "Not supplied";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return `${value.length} bounded record${value.length === 1 ? "" : "s"}`;
  const item = asRecord(value);
  if (!item) return "Runtime record";
  return text(item.title ?? item.name ?? item.status ?? item.id, `${Object.keys(item).length} recorded fields`);
}

function runtimeKnowledge(missions: RuntimeRecord[]): RuntimeKnowledge[] {
  const records = new Map<string, RuntimeKnowledge>();
  missions.forEach((mission) => {
    const receipts = [
      mission.knowledgePromotionReceipt,
      mission.knowledge_promotion_receipt,
      mission.knowledgeReceipt,
      mission.knowledge_receipt,
      ...(Array.isArray(mission.knowledgeReceipts) ? mission.knowledgeReceipts : []),
      ...(Array.isArray(mission.knowledge_receipts) ? mission.knowledge_receipts : []),
    ];
    receipts.forEach((candidate) => {
      const receipt = asRecord(candidate);
      if (!receipt) return;
      const receiptType = text(receipt.receipt_type ?? receipt.receiptType, "").toLowerCase();
      const promotionId = text(receipt.promotion_id ?? receipt.promotionId, "");
      const missionId = text(receipt.mission_id ?? receipt.missionId ?? mission.missionId ?? mission.id, "");
      const evidenceIds = strings(receipt.evidence_ids ?? receipt.evidenceIds);
      const nodeIds = strings(receipt.knowledge_node_ids ?? receipt.knowledgeNodeIds);
      const digest = text(receipt.content_digest ?? receipt.contentDigest, "");
      const lineage = Array.isArray(receipt.knowledge_lineage ?? receipt.knowledgeLineage)
        ? (receipt.knowledge_lineage ?? receipt.knowledgeLineage) as unknown[]
        : [];
      const lineagedNodes = new Set(lineage.map((value) => {
        const item = asRecord(value);
        return text(item?.knowledge_node_id ?? item?.knowledgeNodeId, "");
      }).filter(Boolean));
      const completeLineage = nodeIds.length > 0 && nodeIds.every((nodeId) => lineagedNodes.has(nodeId));
      if (receiptType !== "knowledge_receipt" || !promotionId || !missionId || !evidenceIds.length || !completeLineage || !digest.startsWith("sha256:")) return;
      nodeIds.forEach((nodeId) => {
        const key = `${promotionId}:${nodeId}`;
        records.set(key, {
          nodeId,
          title: text(receipt.title ?? mission.userObjective ?? mission.objective ?? mission.title, `Knowledge node ${nodeId}`),
          promotionId,
          missionId,
          evidenceIds,
          digest,
        });
      });
    });
  });
  return [...records.values()];
}

function RuntimeStore({ store, unavailable }: { store: RuntimeRecord | null; unavailable: string }) {
  if (!store) return <EmptyRecord>{unavailable}</EmptyRecord>;
  const entries = Object.entries(store).slice(0, 10);
  return entries.length ? <div className="compact-records">
    {entries.map(([key, value]) => <article key={key}><strong>{key}</strong><span>{safeValue(value)}</span><StatusPill value="Runtime supplied" /></article>)}
  </div> : <EmptyRecord>Runtime supplied an empty store record.</EmptyRecord>;
}

export function KnowledgeWorkspace({ snapshot }: { snapshot?: RuntimeSnapshot }) {
  const [sources, setSources] = useState<IntakeSource[]>([]);
  const [missions, setMissions] = useState<RuntimeRecord[]>([]);
  const [sourceState, setSourceState] = useState<LoadState>("loading");
  const [missionState, setMissionState] = useState<LoadState>("loading");
  const [drafts, setDrafts] = useState<PromotionDraft[]>(readDrafts);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    const [historyResult, missionResult] = await Promise.allSettled([
      localNexusClient.intakeHistory(),
      localNexusClient.missions(),
    ]);
    const errors: string[] = [];
    if (historyResult.status === "fulfilled") {
      const nextSources = historyResult.value.sources ?? [];
      setSources(nextSources);
      setSourceState(nextSources.length ? "ready" : "empty");
    } else {
      setSources([]);
      setSourceState("unavailable");
      errors.push(historyResult.reason instanceof Error ? historyResult.reason.message : "Knowledge sources are unavailable.");
    }
    if (missionResult.status === "fulfilled") {
      const nextMissions = Array.isArray(missionResult.value.missions) ? missionResult.value.missions as RuntimeRecord[] : [];
      setMissions(nextMissions);
      setMissionState(nextMissions.length ? "ready" : "empty");
    } else {
      setMissions([]);
      setMissionState("unavailable");
      errors.push(missionResult.reason instanceof Error ? missionResult.reason.message : "Mission context is unavailable.");
    }
    setError([...new Set(errors)].join(" "));
    setBusy(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const capabilities = asRecord(snapshot?.capabilities?.data);
  const missionStore = asRecord(capabilities?.missionStore ?? capabilities?.mission_store);
  const knowledgeStore = asRecord(capabilities?.knowledgeStore ?? capabilities?.knowledge_store);
  const candidates = useMemo(
    () => sources.filter((source) => !drafts.some((draft) => draft.sourceId === source.sourceId)),
    [sources, drafts],
  );
  const promoted = useMemo(() => runtimeKnowledge(missions), [missions]);
  const promotionReceiptCount = new Set(promoted.map((item) => item.promotionId)).size;
  const eligibleSelected = candidates.filter((source) => selected.includes(source.sourceId) && sourceReady(source));

  function requestDraft() {
    const timestamp = new Date().toISOString();
    const additions = eligibleSelected.map((source, index) => {
      const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}`;
      return {
        draftId: `KPR-DRAFT-${suffix}`,
        title: text(source.normalizedTitle ?? source.originalFilename, "Operational knowledge candidate"),
        sourceId: source.sourceId,
        sourceClass: "retrieved_evidence" as const,
        requestedAt: timestamp,
        candidateRecordId: `KPR-CANDIDATE-${suffix}`,
        evidenceIds: source.evidenceIds ?? [],
        ...(source.proofId ? { proofId: source.proofId } : {}),
        limitations: ["This browser-local draft has not been submitted to Runtime and is not a Knowledge Receipt, approval, proof, or deployed capability."],
      };
    });
    const next = [...additions, ...drafts];
    setDrafts(next);
    setSelected([]);
    writeDrafts(next);
  }

  function removeDraft(draftId: string) {
    const next = drafts.filter((item) => item.draftId !== draftId);
    setDrafts(next);
    writeDrafts(next);
  }

  const missionStoreCount = missionStore ? Object.keys(missionStore).length : null;
  const knowledgeStoreCount = knowledgeStore ? Object.keys(knowledgeStore).length : promoted.length || null;
  const candidateCount = sourceState === "unavailable" || sourceState === "loading" ? null : candidates.length;

  return <div className="knowledge-workspace">
    <section className="nx-workspace-hero"><div><span className="nx-eyebrow">Autonomous Knowledge Acquisition</span><h2>Separate temporary mission context from promoted operational knowledge.</h2><p>Mission Store remains mission-scoped. Only a Runtime-issued, evidence-lineaged Knowledge Receipt can place an item in the permanent Knowledge Store.</p></div><NexusButton className="nx-action" size="sm" onClick={() => void refresh()} loading={busy}><RefreshCw size={14} />Refresh sources</NexusButton></section>
    <section className="nx-metrics">
      <NexusMetric label="Mission Store" value={missionStoreCount ?? "—"} detail="Runtime-supplied temporary state" />
      <NexusMetric label="Promotion Candidates" value={candidateCount ?? "—"} detail="Intake evidence, not authoritative" />
      <NexusMetric label="Knowledge Store" value={knowledgeStoreCount ?? "—"} detail="Runtime-supplied permanent state" />
      <NexusMetric label="Promotion Receipts" value={promotionReceiptCount} detail="Digest-bearing Runtime records" tone={promotionReceiptCount ? "success" : "neutral"} />
    </section>
    {error && <section className="operation-error" role="alert"><TriangleAlert size={18} /><span>{error}</span></section>}
    <div className="knowledge-flow">
      <DataPanel eyebrow="Temporary Mission Store" title="Mission-scoped context" icon={<Archive size={18} />}>
        <RuntimeStore store={missionStore} unavailable="Runtime did not supply Mission Store state. Working knowledge is unavailable." />
        <h4>Related Runtime missions</h4>
        <div className="compact-records">{missionState === "loading" ? <p className="replay-loading">Loading mission context from Runtime…</p> : missionState === "unavailable" ? <EmptyRecord>Runtime mission history is unavailable; this is not an empty Mission Store.</EmptyRecord> : missions.length ? missions.map((mission, index) => <article key={text(mission.missionId ?? mission.id, `mission-${index}`)}><strong>{text(mission.userObjective ?? mission.objective ?? mission.title, "Mission")}</strong><span>{text(mission.missionId ?? mission.id, "ID unavailable")}</span><StatusPill value="related mission" /></article>) : <EmptyRecord>No related Runtime missions are recorded.</EmptyRecord>}</div>
        <p className="boundary-note">Mission history is contextual reference, not Mission Store content. Mission completion never promotes knowledge automatically.</p>
      </DataPanel>
      <ArrowRight className="knowledge-flow__arrow" />
      <DataPanel eyebrow="Knowledge Promotion Engine" title="Draft an evidence review" icon={<ShieldCheck size={18} />}>
        <div className="promotion-gates"><span><Layers size={12} />Runtime must verify a terminal archived mission</span><span><FileCheck2 size={12} />Runtime must verify the completion receipt digest</span><span><ShieldCheck size={12} />Evidence and confidence thresholds remain Runtime gates</span><span><TriangleAlert size={12} />Contradictions and required approval remain unresolved here</span></div>
        <div className="promotion-candidates">{sourceState === "loading" ? <p className="replay-loading">Loading evidence sources from Runtime…</p> : sourceState === "unavailable" ? <EmptyRecord>Runtime did not supply intake evidence. Promotion candidates are unavailable.</EmptyRecord> : candidates.length ? candidates.map((source) => { const eligible = sourceReady(source); return <label key={source.sourceId} data-eligible={eligible}><input type="checkbox" disabled={!eligible} checked={selected.includes(source.sourceId)} onChange={(event) => setSelected((items) => event.target.checked ? [...items, source.sourceId] : items.filter((id) => id !== source.sourceId))} /><span><strong>{text(source.normalizedTitle ?? source.originalFilename, "Evidence source")}</strong><small>{source.sourceId} · {eligible ? "intake evidence eligible for a local draft" : "requires extracted evidence, a passed secret scan, Evidence IDs, and proof"}</small></span></label>; }) : <EmptyRecord>No unreviewed evidence candidates.</EmptyRecord>}</div>
        <button className="nx-action" onClick={requestDraft} disabled={!eligibleSelected.length}><BookOpen size={14} />Draft promotion review</button>
        <div className="promotion-review-register">{drafts.length ? drafts.map((item) => <article key={item.draftId}><div><strong>{item.title}</strong><small>{item.candidateRecordId}</small></div><StatusPill value="browser-local draft" /><button onClick={() => removeDraft(item.draftId)} aria-label={`Remove ${item.title} draft`}><Trash2 size={13} /></button></article>) : <p className="boundary-note">No browser-local review drafts are pending.</p>}</div>
        <p className="boundary-note">Drafting records an ephemeral client request only. It does not submit, approve, promote, or deploy knowledge.</p>
      </DataPanel>
      <ArrowRight className="knowledge-flow__arrow" />
      <DataPanel eyebrow="Promoted Knowledge Store" title="Operational knowledge" icon={<Database size={18} />}>
        <div className="promoted-knowledge">{promoted.length ? promoted.map((item) => <article key={`${item.promotionId}:${item.nodeId}`}><div><strong>{item.title}</strong><small>{item.nodeId} · {item.missionId}</small></div><StatusPill value="Runtime promoted" /><footer><FileCheck2 size={13} /><code>{item.promotionId}</code><code>{item.digest}</code></footer></article>) : <EmptyRecord>No complete, digest-bearing Runtime Knowledge Receipt is available.</EmptyRecord>}</div>
        <h4>Runtime-supplied store state</h4>
        <RuntimeStore store={knowledgeStore} unavailable="Runtime did not supply Knowledge Store state. Verified knowledge is unavailable." />
        <p className="boundary-note">The Mission Store and Knowledge Store are strictly separated. Promotion happens only inside NEXUS Runtime with verified evidence — never in this portal. Runtime-supplied store state is not counted as receipt-backed unless a complete Knowledge Receipt is also available.</p>
      </DataPanel>
    </div>
  </div>;
}
