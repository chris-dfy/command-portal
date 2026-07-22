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
  TriangleAlert,
} from "lucide-react";
import { localNexusClient } from "../lib/local-client";
import type { RuntimeSnapshot } from "../lib/types";
import { NexusButton, NexusMetric } from "../design-system/NexusPrimitives";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

type RuntimeRecord = Record<string, unknown>;
type SourceState = "loading" | "available" | "empty" | "unavailable";
type KnowledgeSources = {
  readiness: RuntimeRecord | null;
  missionStore: RuntimeRecord[];
  acquisitions: RuntimeRecord[];
  candidates: RuntimeRecord[];
  knowledgeStore: RuntimeRecord[];
  receipts: RuntimeRecord[];
};

const EMPTY_SOURCES: KnowledgeSources = {
  readiness: null,
  missionStore: [],
  acquisitions: [],
  candidates: [],
  knowledgeStore: [],
  receipts: [],
};
const object = (value: unknown): RuntimeRecord => value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeRecord : {};
const records = (value: unknown): RuntimeRecord[] => Array.isArray(value)
  ? value.filter((item): item is RuntimeRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
  : [];
const text = (value: unknown, fallback = "Unavailable") => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
};
const rows = (value: unknown, names: string[]): RuntimeRecord[] => {
  if (Array.isArray(value)) return records(value);
  const source = object(value);
  for (const name of names) if (Array.isArray(source[name])) return records(source[name]);
  for (const wrapper of ["data", "result", "store", "missionStore", "knowledgeStore"]) {
    const nested = object(source[wrapper]);
    for (const name of names) if (Array.isArray(nested[name])) return records(nested[name]);
  }
  if (Object.keys(source).length && !source.capabilities) return [source];
  return [];
};
const identifier = (value: RuntimeRecord, keys: string[], fallback = "") => {
  for (const key of keys) {
    const candidate = text(value[key], "");
    if (candidate) return candidate;
  }
  return fallback;
};
const stateOf = (value: RuntimeRecord, fallback = "recorded") => text(value.state ?? value.status ?? value.lifecycleState, fallback);
const reasonsOf = (value: RuntimeRecord, fallback: string) => Array.isArray(value.reasons)
  ? value.reasons.map((item) => text(item, "")).filter(Boolean).join(" · ") || fallback
  : text(value.reason ?? value.requiredNextAction ?? value.required_next_action, fallback);
const candidateEligible = (candidate: RuntimeRecord) => {
  if (candidate.eligible === true || candidate.promotionEligible === true || candidate.promotion_eligible === true) return true;
  const state = stateOf(candidate, "unknown");
  return /eligible|validated|ready|approved/i.test(state)
    && !/rejected|ineligible|withdrawn|promoted|unavailable|failed/i.test(state);
};

function ReadinessRecord({ readiness }: { readiness: RuntimeRecord | null }) {
  if (!readiness) return <EmptyRecord>Capability readiness is unavailable.</EmptyRecord>;
  const capabilities = rows(readiness, ["capabilities", "items", "records"]);
  const knowledge = capabilities.filter((item) => /knowledge|mission_store/i.test(identifier(item, ["capabilityId", "id", "name"]))).slice(0, 6);
  return knowledge.length ? <div className="compact-records">{knowledge.map((item, index) => {
    const id = identifier(item, ["capabilityId", "id", "name"], `capability-${index}`);
    return <article key={id}><strong>{id}</strong><span>{text(item.reason ?? item.requiredNextAction, "Runtime supplied no reason")}</span><StatusPill value={stateOf(item, "unknown")} /></article>;
  })}</div> : <EmptyRecord>The Runtime returned no knowledge capability records.</EmptyRecord>;
}

export function KnowledgeWorkspace({ snapshot }: { snapshot?: RuntimeSnapshot }) {
  const [sources, setSources] = useState<KnowledgeSources>(EMPTY_SOURCES);
  const [states, setStates] = useState<Record<keyof KnowledgeSources, SourceState>>({
    readiness: "loading",
    missionStore: "loading",
    acquisitions: "loading",
    candidates: "loading",
    knowledgeStore: "loading",
    receipts: "loading",
  });
  const [selectedAcquisition, setSelectedAcquisition] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [expectedDeployedCommit, setExpectedDeployedCommit] = useState("");
  const [busy, setBusy] = useState<"" | "baseline" | "candidate" | "promotion">("");
  const [errors, setErrors] = useState<string[]>([]);
  const [operationResult, setOperationResult] = useState<RuntimeRecord | null>(null);

  const refresh = useCallback(async () => {
    const requests = {
      readiness: localNexusClient.capabilityReadiness(),
      missionStore: localNexusClient.missionStore(),
      acquisitions: localNexusClient.knowledgeAcquisitions(),
      candidates: localNexusClient.knowledgePromotionCandidates(),
      knowledgeStore: localNexusClient.knowledgeStore(),
      receipts: localNexusClient.knowledgeReceipts(),
    };
    const keys = Object.keys(requests) as Array<keyof typeof requests>;
    const results = await Promise.allSettled(keys.map((key) => requests[key]));
    const next: KnowledgeSources = { ...EMPTY_SOURCES };
    const nextStates: Record<keyof KnowledgeSources, SourceState> = {
      readiness: "loading",
      missionStore: "loading",
      acquisitions: "loading",
      candidates: "loading",
      knowledgeStore: "loading",
      receipts: "loading",
    };
    const nextErrors: string[] = [];
    results.forEach((result, index) => {
      const key = keys[index];
      if (result.status === "rejected") {
        nextStates[key] = "unavailable";
        nextErrors.push(`${key}: ${result.reason instanceof Error ? result.reason.message : "Runtime source unavailable"}`);
        return;
      }
      if (key === "readiness") {
        next.readiness = object(result.value);
        nextStates.readiness = Object.keys(next.readiness).length ? "available" : "empty";
        return;
      }
      const names: Record<Exclude<keyof KnowledgeSources, "readiness">, string[]> = {
        missionStore: ["missions", "workspaces", "records", "items"],
        acquisitions: ["acquisitions", "missions", "records", "items"],
        candidates: ["candidates", "promotionCandidates", "records", "items"],
        knowledgeStore: ["knowledge", "nodes", "records", "items", "versions"],
        receipts: ["receipts", "knowledgeReceipts", "records", "items"],
      };
      const dataKey = key as Exclude<keyof KnowledgeSources, "readiness">;
      const rowsForKey = rows(result.value, names[dataKey]);
      next[dataKey] = rowsForKey;
      nextStates[dataKey] = rowsForKey.length ? "available" : "empty";
    });
    setSources(next);
    setStates(nextStates);
    setErrors(nextErrors);
    setSelectedAcquisition((current) => current && next.acquisitions.some((item) => identifier(item, ["missionId", "mission_id", "acquisitionId", "id"]) === current)
      ? current
      : identifier(next.acquisitions[0] ?? {}, ["missionId", "mission_id", "acquisitionId", "id"]));
    setSelectedCandidate((current) => current && next.candidates.some((item) => identifier(item, ["candidateId", "candidate_id", "id"]) === current)
      ? current
      : identifier(next.candidates.find(candidateEligible) ?? {}, ["candidateId", "candidate_id", "id"]));
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const eligibleCandidates = useMemo(() => sources.candidates.filter(candidateEligible), [sources.candidates]);
  const selectedAcquisitionRecord = sources.acquisitions.find((item) => identifier(item, ["missionId", "mission_id", "acquisitionId", "id"]) === selectedAcquisition);
  const selectedCandidateRecord = sources.candidates.find((item) => identifier(item, ["candidateId", "candidate_id", "id"]) === selectedCandidate);
  const runtimeConnection = snapshot?.status?.gateway.connectionState ?? "Unavailable";

  async function establishBaseline() {
    setBusy("baseline"); setErrors([]); setOperationResult(null);
    try {
      const payload = expectedDeployedCommit.trim() ? { expectedDeployedCommit: expectedDeployedCommit.trim() } : {};
      const result = await localNexusClient.establishRuntimeBaseline(payload, `baseline-${globalThis.crypto.randomUUID()}`);
      setOperationResult(result);
      await refresh();
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Runtime baseline creation failed safely."]);
    } finally { setBusy(""); }
  }

  async function createPromotionCandidate() {
    if (!selectedAcquisitionRecord) return;
    const missionId = identifier(selectedAcquisitionRecord, ["missionId", "mission_id", "id"]);
    if (!missionId) return;
    const expectedMissionVersion = selectedAcquisitionRecord.version ?? selectedAcquisitionRecord.missionVersion ?? selectedAcquisitionRecord.mission_version;
    setBusy("candidate"); setErrors([]); setOperationResult(null);
    try {
      const result = await localNexusClient.createKnowledgePromotionCandidate(
        missionId,
        typeof expectedMissionVersion === "string" || typeof expectedMissionVersion === "number" ? expectedMissionVersion : undefined,
        `promotion-candidate-${globalThis.crypto.randomUUID()}`,
      );
      setOperationResult(result);
      await refresh();
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Promotion candidate creation failed safely."]);
    } finally { setBusy(""); }
  }

  async function promoteKnowledge() {
    if (!selectedCandidateRecord) return;
    const candidateId = identifier(selectedCandidateRecord, ["candidateId", "candidate_id", "id"]);
    if (!candidateId) return;
    setBusy("promotion"); setErrors([]); setOperationResult(null);
    try {
      const result = await localNexusClient.promoteKnowledge({ candidateId }, `knowledge-promotion-${globalThis.crypto.randomUUID()}`);
      setOperationResult(result);
      await refresh();
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Knowledge Promotion failed safely."]);
    } finally { setBusy(""); }
  }

  return <div className="knowledge-workspace">
    <section className="nx-workspace-hero"><div><span className="nx-eyebrow">Knowledge Lifecycle</span><h2>Promote evidence-backed understanding—not mission noise.</h2><p>Mission Store, Knowledge Acquisition, explicit Promotion, Knowledge Receipts, and versioned Knowledge Store records come from one authenticated Runtime contract.</p></div><NexusButton className="nx-action" size="sm" onClick={() => void refresh()} loading={Boolean(busy)}><RefreshCw size={14} />Refresh Runtime</NexusButton></section>
    <section className="nx-metrics">
      <NexusMetric label="Mission Store" value={states.missionStore === "unavailable" ? "—" : sources.missionStore.length} detail={states.missionStore} />
      <NexusMetric label="Acquisitions" value={states.acquisitions === "unavailable" ? "—" : sources.acquisitions.length} detail={states.acquisitions} />
      <NexusMetric label="Promotion Candidates" value={states.candidates === "unavailable" ? "—" : eligibleCandidates.length} detail="Explicit Runtime candidates" />
      <NexusMetric label="Knowledge Store" value={states.knowledgeStore === "unavailable" ? "—" : sources.knowledgeStore.length} detail={`${sources.receipts.length} Knowledge Receipt(s)`} tone={sources.receipts.length ? "success" : "neutral"} />
    </section>
    {errors.length > 0 && <section className="operation-error" role="alert"><TriangleAlert size={18} /><span>{[...new Set(errors)].join(" ")}</span></section>}
    {operationResult && <section className="operation-error" role="status"><FileCheck2 size={18} /><span>Runtime operation recorded: {identifier(operationResult, ["receiptId", "receipt_id", "baselineId", "baseline_id", "promotionId", "promotion_id", "status"], "response received")}</span></section>}
    <DataPanel eyebrow="Capability-specific readiness" title="Runtime truth before action" icon={<ShieldCheck size={18} />}>
      <p className="boundary-note">Experience Gateway: {runtimeConnection}. Route presence does not establish readiness; each knowledge capability reports its own dependency state.</p>
      <ReadinessRecord readiness={sources.readiness} />
    </DataPanel>
    <div className="knowledge-flow">
      <DataPanel eyebrow="Temporary Mission Store" title="Mission-scoped operational memory" icon={<Archive size={18} />}>
        {states.missionStore === "loading" ? <p className="replay-loading">Loading tenant-bound Mission Store…</p>
          : states.missionStore === "unavailable" ? <EmptyRecord>Mission Store is unavailable. This is not an empty store.</EmptyRecord>
            : sources.missionStore.length ? <div className="compact-records">{sources.missionStore.map((item, index) => {
              const id = identifier(item, ["missionId", "mission_id", "workspaceId", "id"], `mission-${index + 1}`);
              return <article key={id}><strong>{text(item.title ?? item.objective ?? item.proposal, id)}</strong><span>{id}</span><StatusPill value={stateOf(item)} /></article>;
            })}</div> : <EmptyRecord>No mission-scoped records are present.</EmptyRecord>}
        <p className="boundary-note">Mission completion never writes to Knowledge Store automatically.</p>
      </DataPanel>
      <ArrowRight className="knowledge-flow__arrow" />
      <DataPanel eyebrow="Knowledge Acquisition" title="Create a governed promotion candidate" icon={<Layers size={18} />}>
        {states.acquisitions === "unavailable" ? <EmptyRecord>Knowledge Acquisition is unavailable.</EmptyRecord> : <div className="promotion-candidates">{sources.acquisitions.map((item, index) => {
          const id = identifier(item, ["missionId", "mission_id", "acquisitionId", "id"], `acquisition-${index + 1}`);
          return <label key={id} data-eligible="true"><input type="radio" name="knowledge-acquisition" checked={selectedAcquisition === id} onChange={() => setSelectedAcquisition(id)} /><span><strong>{text(item.title ?? item.objective ?? item.proposal, id)}</strong><small>{id} · version {text(item.version ?? item.missionVersion, "not supplied")} · {stateOf(item)}</small></span></label>;
        })}{states.acquisitions === "empty" && <EmptyRecord>No acquisition mission is eligible for candidate creation.</EmptyRecord>}</div>}
        <button className="nx-action" onClick={() => void createPromotionCandidate()} disabled={!selectedAcquisitionRecord || Boolean(busy)}><BookOpen size={14} />{busy === "candidate" ? "Validating mission…" : "Create promotion candidate"}</button>
        <p className="boundary-note">The Runtime validates mission lifecycle, Evidence, confidence, contradiction state, lineage, and policy. The browser supplies only mission identity and an advisory expected version.</p>
      </DataPanel>
      <ArrowRight className="knowledge-flow__arrow" />
      <DataPanel eyebrow="Knowledge Promotion" title="Explicitly promote validated knowledge" icon={<ShieldCheck size={18} />}>
        <div className="promotion-gates"><span><FileCheck2 size={12} />Validated Evidence and lineage required</span><span><ShieldCheck size={12} />Confidence and contradiction gates enforced</span><span><Layers size={12} />Promotion policy remains Runtime-owned</span><span><TriangleAlert size={12} />Authentication is not operational Authority</span></div>
        {states.candidates === "unavailable" ? <EmptyRecord>Promotion candidates are unavailable.</EmptyRecord> : <div className="promotion-candidates">{sources.candidates.map((item, index) => {
          const id = identifier(item, ["candidateId", "candidate_id", "id"], `candidate-${index + 1}`);
          const eligible = candidateEligible(item);
          return <label key={id} data-eligible={eligible}><input type="radio" name="promotion-candidate" disabled={!eligible} checked={selectedCandidate === id} onChange={() => setSelectedCandidate(id)} /><span><strong>{text(item.title ?? item.finding ?? item.subject, id)}</strong><small>{id} · {stateOf(item)} · {reasonsOf(item, eligible ? "Runtime validation complete" : "Not eligible")}</small></span></label>;
        })}{states.candidates === "empty" && <EmptyRecord>No Runtime promotion candidates are available.</EmptyRecord>}</div>}
        <button className="nx-action" onClick={() => void promoteKnowledge()} disabled={!selectedCandidateRecord || !candidateEligible(selectedCandidateRecord) || Boolean(busy)}><ShieldCheck size={14} />{busy === "promotion" ? "Running governed promotion…" : "Promote selected candidate"}</button>
        <p className="boundary-note">The request contains only the candidate ID. Tenant, workspace, principal, policy, approval, and Authority are resolved and enforced by the Runtime.</p>
      </DataPanel>
    </div>
    <div className="experience-grid">
      <DataPanel eyebrow="Permanent Knowledge Store" title="Versioned operational knowledge" icon={<Database size={18} />}>
        {states.knowledgeStore === "loading" ? <p className="replay-loading">Loading versioned Knowledge Store…</p>
          : states.knowledgeStore === "unavailable" ? <EmptyRecord>Knowledge Store is unavailable. No records are inferred.</EmptyRecord>
            : sources.knowledgeStore.length ? <div className="promoted-knowledge">{sources.knowledgeStore.map((item, index) => {
              const id = identifier(item, ["recordId", "knowledgeId", "knowledge_id", "nodeId", "id"], `knowledge-${index + 1}`);
              return <article key={`${id}-${index}`}><div><strong>{text(item.label ?? item.title ?? item.subject ?? item.name, id)}</strong><small>{id} · version {text(item.version, "not supplied")}</small></div><StatusPill value={stateOf(item, "promoted")} /><footer><FileCheck2 size={13} /><code>{text(item.contentDigest ?? item.content_digest ?? (Array.isArray(item.knowledgeReceiptRefs) ? item.knowledgeReceiptRefs[0] : undefined), "digest unavailable")}</code></footer></article>;
            })}</div> : <EmptyRecord>No explicitly promoted Knowledge Store records exist.</EmptyRecord>}
      </DataPanel>
      <DataPanel eyebrow="Knowledge Receipts" title="Promotion lineage" icon={<FileCheck2 size={18} />}>
        {states.receipts === "unavailable" ? <EmptyRecord>Knowledge Receipts are unavailable.</EmptyRecord> : <div className="compact-records">{sources.receipts.map((item, index) => {
          const id = identifier(item, ["receiptId", "receipt_id", "promotionId", "promotion_id", "id"], `receipt-${index + 1}`);
          return <article key={id}><strong>{id}</strong><span>{text(item.missionId ?? item.mission_id, "Mission lineage unavailable")} · {text(item.contentDigest ?? item.content_digest, "digest unavailable")}</span><StatusPill value={stateOf(item, "recorded")} /></article>;
        })}{states.receipts === "empty" && <EmptyRecord>No Knowledge Receipts are recorded.</EmptyRecord>}</div>}
      </DataPanel>
      <DataPanel eyebrow="Runtime Baseline" title="Capture the deployed operational baseline" icon={<FileCheck2 size={18} />}>
        <label className="operation-field"><span>Expected deployed commit (optional)</span><input value={expectedDeployedCommit} onChange={(event) => setExpectedDeployedCommit(event.target.value)} placeholder="Full source commit for compare-and-record" autoComplete="off" spellCheck={false} /></label>
        <button className="nx-action" onClick={() => void establishBaseline()} disabled={Boolean(busy)}><FileCheck2 size={14} />{busy === "baseline" ? "Recording Runtime baseline…" : "Record Runtime baseline"}</button>
        <p className="boundary-note">The Runtime observes its own deployed identity, capability state, routes, missions, Replay, receipts, stores, and Edge posture. The browser may only provide an optional expected commit for mismatch detection.</p>
      </DataPanel>
    </div>
  </div>;
}
