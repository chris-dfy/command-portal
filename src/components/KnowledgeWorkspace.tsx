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
import { localNexusClient, type OperationalSession } from "../lib/local-client";
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
  promotions: RuntimeRecord[];
  knowledgeStore: RuntimeRecord[];
  receipts: RuntimeRecord[];
};

const EMPTY_SOURCES: KnowledgeSources = {
  readiness: null,
  missionStore: [],
  acquisitions: [],
  candidates: [],
  promotions: [],
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
const nestedRecord = (value: unknown, names: string[]): RuntimeRecord => {
  const source = object(value);
  for (const name of names) {
    const nested = object(source[name]);
    if (Object.keys(nested).length) return nested;
  }
  return source;
};
const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.map((item) => text(item, "")).filter(Boolean)
  : [];
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
  const state = stateOf(candidate, "unknown");
  if (/rejected|ineligible|withdrawn|promoted|unavailable|failed/i.test(state)) return false;
  if (
    candidate.eligible === true
    || candidate.policyEligible === true
    || candidate.policy_eligible === true
    || candidate.promotionEligible === true
    || candidate.promotion_eligible === true
  ) return true;
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

export function KnowledgeWorkspace({
  snapshot,
  session = { authenticated: false },
}: {
  snapshot?: RuntimeSnapshot;
  session?: OperationalSession;
}) {
  const [sources, setSources] = useState<KnowledgeSources>(EMPTY_SOURCES);
  const [states, setStates] = useState<Record<keyof KnowledgeSources, SourceState>>({
    readiness: "loading",
    missionStore: "loading",
    acquisitions: "loading",
    candidates: "loading",
    promotions: "loading",
    knowledgeStore: "loading",
    receipts: "loading",
  });
  const [selectedAcquisition, setSelectedAcquisition] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [selectedKnowledgeRecord, setSelectedKnowledgeRecord] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState("");
  const [missionStoreDetail, setMissionStoreDetail] = useState<RuntimeRecord | null>(null);
  const [acquisitionDetail, setAcquisitionDetail] = useState<RuntimeRecord | null>(null);
  const [candidateDetail, setCandidateDetail] = useState<RuntimeRecord | null>(null);
  const [knowledgeRecordDetail, setKnowledgeRecordDetail] = useState<RuntimeRecord | null>(null);
  const [knowledgeVersions, setKnowledgeVersions] = useState<RuntimeRecord[]>([]);
  const [knowledgeReceiptDetail, setKnowledgeReceiptDetail] = useState<RuntimeRecord | null>(null);
  const [intakeTaskId, setIntakeTaskId] = useState("");
  const [intakeOrigin, setIntakeOrigin] = useState("");
  const [intakeClaim, setIntakeClaim] = useState("");
  const [intakeConfidence, setIntakeConfidence] = useState("1.0");
  const [intakeSource, setIntakeSource] = useState<"model_native" | "platform_knowledge" | "tenant_knowledge" | "retrieved_evidence" | "live_external_source" | "runtime_evidence">("runtime_evidence");
  const [completeIntakeTask, setCompleteIntakeTask] = useState(false);
  const [expectedDeployedCommit, setExpectedDeployedCommit] = useState("");
  const [busy, setBusy] = useState<"" | "intake" | "baseline" | "candidate" | "promotion">("");
  const [errors, setErrors] = useState<string[]>([]);
  const [operationResult, setOperationResult] = useState<RuntimeRecord | null>(null);

  const refresh = useCallback(async () => {
    const requests = {
      readiness: localNexusClient.capabilityReadiness(),
      missionStore: localNexusClient.missionStore(),
      acquisitions: localNexusClient.knowledgeAcquisitions(),
      candidates: localNexusClient.knowledgePromotionCandidates(),
      promotions: localNexusClient.knowledgePromotions(),
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
      promotions: "loading",
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
        promotions: ["promotions", "records", "items"],
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
    setSelectedKnowledgeRecord((current) => current && next.knowledgeStore.some((item) => identifier(item, ["recordId", "nodeId", "id"]) === current)
      ? current
      : identifier(next.knowledgeStore[0] ?? {}, ["recordId", "nodeId", "id"]));
    setSelectedReceipt((current) => current && next.receipts.some((item) => identifier(item, ["promotion_id", "receiptId", "receipt_id", "id"]) === current)
      ? current
      : identifier(next.receipts[0] ?? {}, ["promotion_id", "receiptId", "receipt_id", "id"]));
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!selectedAcquisition) {
      setMissionStoreDetail(null);
      setAcquisitionDetail(null);
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      localNexusClient.missionStoreRecord(selectedAcquisition),
      localNexusClient.knowledgeAcquisition(selectedAcquisition),
    ]).then(([missionResult, acquisitionResult]) => {
      if (cancelled) return;
      const nextErrors: string[] = [];
      if (missionResult.status === "fulfilled") setMissionStoreDetail(nestedRecord(missionResult.value, ["mission"]));
      else {
        setMissionStoreDetail(null);
        nextErrors.push(missionResult.reason instanceof Error ? missionResult.reason.message : "Mission Store detail is unavailable.");
      }
      if (acquisitionResult.status === "fulfilled") setAcquisitionDetail(nestedRecord(acquisitionResult.value, ["acquisition"]));
      else {
        setAcquisitionDetail(null);
        nextErrors.push(acquisitionResult.reason instanceof Error ? acquisitionResult.reason.message : "Knowledge Acquisition detail is unavailable.");
      }
      if (nextErrors.length) setErrors((current) => [...new Set([...current, ...nextErrors])]);
    });
    return () => { cancelled = true; };
  }, [selectedAcquisition]);
  useEffect(() => {
    if (!selectedCandidate) {
      setCandidateDetail(null);
      return;
    }
    let cancelled = false;
    void localNexusClient.knowledgePromotionCandidate(selectedCandidate)
      .then((value) => { if (!cancelled) setCandidateDetail(nestedRecord(value, ["candidate"])); })
      .catch((caught) => {
        if (!cancelled) {
          setCandidateDetail(null);
          setErrors((current) => [...new Set([...current, caught instanceof Error ? caught.message : "Promotion candidate detail is unavailable."])]);
        }
      });
    return () => { cancelled = true; };
  }, [selectedCandidate]);
  useEffect(() => {
    if (!selectedKnowledgeRecord) {
      setKnowledgeRecordDetail(null);
      setKnowledgeVersions([]);
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      localNexusClient.knowledgeRecord(selectedKnowledgeRecord),
      localNexusClient.knowledgeVersions(selectedKnowledgeRecord),
    ]).then(([recordResult, versionsResult]) => {
      if (cancelled) return;
      const nextErrors: string[] = [];
      if (recordResult.status === "fulfilled") setKnowledgeRecordDetail(nestedRecord(recordResult.value, ["record"]));
      else {
        setKnowledgeRecordDetail(null);
        nextErrors.push(recordResult.reason instanceof Error ? recordResult.reason.message : "Knowledge record detail is unavailable.");
      }
      if (versionsResult.status === "fulfilled") setKnowledgeVersions(rows(versionsResult.value, ["versions", "records", "items"]));
      else {
        setKnowledgeVersions([]);
        nextErrors.push(versionsResult.reason instanceof Error ? versionsResult.reason.message : "Knowledge version history is unavailable.");
      }
      if (nextErrors.length) setErrors((current) => [...new Set([...current, ...nextErrors])]);
    });
    return () => { cancelled = true; };
  }, [selectedKnowledgeRecord]);
  useEffect(() => {
    if (!selectedReceipt) {
      setKnowledgeReceiptDetail(null);
      return;
    }
    let cancelled = false;
    void localNexusClient.knowledgeReceipt(selectedReceipt)
      .then((value) => { if (!cancelled) setKnowledgeReceiptDetail(nestedRecord(value, ["receipt"])); })
      .catch((caught) => {
        if (!cancelled) {
          setKnowledgeReceiptDetail(null);
          setErrors((current) => [...new Set([...current, caught instanceof Error ? caught.message : "Knowledge Receipt detail is unavailable."])]);
        }
      });
    return () => { cancelled = true; };
  }, [selectedReceipt]);

  const eligibleCandidates = useMemo(() => sources.candidates.filter(candidateEligible), [sources.candidates]);
  const selectedAcquisitionRecord = sources.acquisitions.find((item) => identifier(item, ["missionId", "mission_id", "acquisitionId", "id"]) === selectedAcquisition);
  const selectedCandidateRecord = sources.candidates.find((item) => identifier(item, ["candidateId", "candidate_id", "id"]) === selectedCandidate);
  const selectedCandidateView = candidateDetail ?? selectedCandidateRecord;
  const selectedKnowledgeRecordView = knowledgeRecordDetail ?? sources.knowledgeStore.find((item) => identifier(item, ["recordId", "nodeId", "id"]) === selectedKnowledgeRecord);
  const selectedReceiptView = knowledgeReceiptDetail ?? sources.receipts.find((item) => identifier(item, ["promotion_id", "receiptId", "receipt_id", "id"]) === selectedReceipt);
  const intakeMission = acquisitionDetail ?? missionStoreDetail ?? selectedAcquisitionRecord ?? null;
  const intakeTasks = useMemo(
    () => intakeMission && Array.isArray(intakeMission.steps) ? intakeMission.steps as RuntimeRecord[] : [],
    [intakeMission],
  );
  const runtimeConnection = snapshot?.status?.gateway.connectionState ?? "Unavailable";
  const capabilityRecords = rows(sources.readiness, ["capabilities", "items", "records"]);
  const actionGate = (capabilityId: string, scope: string) => {
    const capability = capabilityRecords.find((item) => identifier(item, ["capabilityId", "capability_id", "id"]) === capabilityId);
    const available = stateOf(capability ?? {}, "unavailable").toLowerCase() === "available";
    const scoped = session.scopes?.includes(scope) === true;
    return {
      allowed: available && scoped,
      reason: !available
        ? reasonsOf(capability ?? {}, `${capabilityId} capability readiness is unavailable.`)
        : scoped ? `${capabilityId} and ${scope} are available.` : `The hosted session lacks ${scope}.`,
    };
  };
  const intakeGate = actionGate("knowledge_intake", "evidence:write");
  const acquisitionGate = actionGate("knowledge_acquisition", "operations:write");
  const promotionGate = actionGate("knowledge_promotion", "knowledge:promote");

  useEffect(() => {
    setIntakeTaskId((current) => current && intakeTasks.some((task) => identifier(task, ["taskId", "task_id", "id"]) === current)
      ? current
      : identifier(intakeTasks.find((task) => !/complete|cancelled/i.test(stateOf(task, ""))) ?? intakeTasks[0] ?? {}, ["taskId", "task_id", "id"]));
  }, [intakeMission, intakeTasks]);

  async function submitIntake() {
    if (!intakeGate.allowed) { setErrors([intakeGate.reason]); return; }
    const missionId = identifier(intakeMission ?? {}, ["missionId", "mission_id", "id"]);
    const confidence = Number(intakeConfidence);
    if (!missionId || !intakeTaskId || !intakeOrigin.trim() || !intakeClaim.trim() || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      setErrors(["Select a mission task and provide a valid origin, factual claim, and confidence between zero and one."]);
      return;
    }
    setBusy("intake"); setErrors([]); setOperationResult(null);
    try {
      const result = await localNexusClient.knowledgeIntake({
        missionId,
        taskId: intakeTaskId,
        origin: intakeOrigin.trim(),
        sourceClassification: intakeSource,
        confidence,
        claim: intakeClaim.trim(),
        supportingArtifacts: [],
        relationships: [],
        operationalContext: {},
        completeTask: completeIntakeTask,
      }, `knowledge-intake-${globalThis.crypto.randomUUID()}`);
      setOperationResult(result);
      setIntakeOrigin("");
      setIntakeClaim("");
      setCompleteIntakeTask(false);
      await refresh();
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Knowledge intake failed safely."]);
    } finally { setBusy(""); }
  }

  async function establishBaseline() {
    if (!acquisitionGate.allowed) { setErrors([acquisitionGate.reason]); return; }
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
    if (!acquisitionGate.allowed) { setErrors([acquisitionGate.reason]); return; }
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
    if (!promotionGate.allowed) { setErrors([promotionGate.reason]); return; }
    if (!selectedCandidateView) return;
    const candidateId = identifier(selectedCandidateView, ["candidateId", "candidate_id", "id"]);
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
    {operationResult && <section className="operation-error" role="status"><FileCheck2 size={18} /><span>Runtime operation recorded: {identifier(operationResult, ["evidenceId", "receiptId", "receipt_id", "baselineId", "baseline_id", "promotionId", "promotion_id", "status"], "response received")}</span></section>}
    <DataPanel eyebrow="Capability-specific readiness" title="Runtime truth before action" icon={<ShieldCheck size={18} />}>
      <p className="boundary-note">Experience Gateway: {runtimeConnection}. Route presence does not establish readiness; each knowledge capability reports its own dependency state.</p>
      <ReadinessRecord readiness={sources.readiness} />
    </DataPanel>
    <DataPanel eyebrow="Knowledge intake" title="Admit factual Evidence to a Mission task" icon={<BookOpen size={18} />}>
      <p className="boundary-note">Intake adds an evidence-backed record to the temporary Mission Store. It does not promote anything into permanent Knowledge Store.</p>
      <label className="operation-field"><span>Acquisition mission</span><select value={selectedAcquisition} onChange={(event) => setSelectedAcquisition(event.target.value)} disabled={!sources.acquisitions.length}>{sources.acquisitions.length ? sources.acquisitions.map((item, index) => { const id = identifier(item, ["missionId", "mission_id", "id"], `mission-${index + 1}`); return <option key={id} value={id}>{text(item.title ?? item.objective, id)}</option>; }) : <option value="">No Mission Store record available</option>}</select></label>
      <label className="operation-field"><span>Mission task</span><select value={intakeTaskId} onChange={(event) => setIntakeTaskId(event.target.value)} disabled={!intakeTasks.length}>{intakeTasks.length ? intakeTasks.map((task, index) => { const id = identifier(task, ["taskId", "task_id", "id"], `task-${index + 1}`); return <option key={id} value={id}>{text(task.objective ?? task.title, id)} · {stateOf(task, "unknown")}</option>; }) : <option value="">No task available for intake</option>}</select></label>
      <label className="operation-field"><span>Evidence origin</span><input value={intakeOrigin} onChange={(event) => setIntakeOrigin(event.target.value)} placeholder="runtime://collector/source or governed source locator" autoComplete="off" /></label>
      <label className="operation-field"><span>Source classification</span><select value={intakeSource} onChange={(event) => setIntakeSource(event.target.value as typeof intakeSource)}><option value="runtime_evidence">Runtime Evidence</option><option value="live_external_source">Live external source</option><option value="retrieved_evidence">Retrieved Evidence</option><option value="tenant_knowledge">Tenant knowledge</option><option value="platform_knowledge">Platform knowledge</option><option value="model_native">Model-native candidate</option></select></label>
      <label className="operation-field"><span>Factual claim</span><textarea value={intakeClaim} onChange={(event) => setIntakeClaim(event.target.value)} placeholder="Record the observed claim without adding Authority or approval assertions." /></label>
      <label className="operation-field"><span>Evidence confidence (0–1)</span><input type="number" min="0" max="1" step="0.01" value={intakeConfidence} onChange={(event) => setIntakeConfidence(event.target.value)} /></label>
      <label className="operation-field"><span><input type="checkbox" checked={completeIntakeTask} onChange={(event) => setCompleteIntakeTask(event.target.checked)} /> Mark task complete only if this Evidence satisfies its recorded criterion</span></label>
      <button className="nx-action" onClick={() => void submitIntake()} disabled={!selectedAcquisition || !intakeTaskId || !intakeOrigin.trim() || !intakeClaim.trim() || Boolean(busy) || !intakeGate.allowed}><BookOpen size={14} />{busy === "intake" ? "Admitting Evidence…" : "Admit Evidence"}</button>
      <p className="boundary-note">Knowledge intake gate: {intakeGate.reason}</p>
      <p className="boundary-note">Mission detail source: {missionStoreDetail ? "Mission Store" : "unavailable"}. Acquisition detail source: {acquisitionDetail ? "Knowledge Acquisition" : "unavailable"}.</p>
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
        <button className="nx-action" onClick={() => void createPromotionCandidate()} disabled={!selectedAcquisitionRecord || Boolean(busy) || !acquisitionGate.allowed}><BookOpen size={14} />{busy === "candidate" ? "Validating mission…" : "Create promotion candidate"}</button>
        <p className="boundary-note">Candidate creation gate: {acquisitionGate.reason}</p>
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
        {selectedCandidateView && <p className="boundary-note">Selected candidate: {identifier(selectedCandidateView, ["candidateId", "candidate_id", "id"], "unavailable")} · {reasonsOf(selectedCandidateView, "Runtime supplied no evaluation reason")}</p>}
        <button className="nx-action" onClick={() => void promoteKnowledge()} disabled={!selectedCandidateView || !candidateEligible(selectedCandidateView) || Boolean(busy) || !promotionGate.allowed}><ShieldCheck size={14} />{busy === "promotion" ? "Running governed promotion…" : "Promote selected candidate"}</button>
        <p className="boundary-note">Promotion gate: {promotionGate.reason}</p>
        <p className="boundary-note">The request contains only the candidate ID. Tenant, workspace, principal, policy, approval, and Authority are resolved and enforced by the Runtime.</p>
      </DataPanel>
    </div>
    <div className="experience-grid">
      <DataPanel eyebrow="Permanent Knowledge Store" title="Versioned operational knowledge" icon={<Database size={18} />}>
        {states.knowledgeStore === "loading" ? <p className="replay-loading">Loading versioned Knowledge Store…</p>
          : states.knowledgeStore === "unavailable" ? <EmptyRecord>Knowledge Store is unavailable. No records are inferred.</EmptyRecord>
            : sources.knowledgeStore.length ? <div className="promotion-candidates">{sources.knowledgeStore.map((item, index) => {
              const id = identifier(item, ["recordId", "knowledgeId", "knowledge_id", "nodeId", "id"], `knowledge-${index + 1}`);
              return <label key={`${id}-${index}`} data-eligible="true"><input type="radio" name="knowledge-record" checked={selectedKnowledgeRecord === id} onChange={() => setSelectedKnowledgeRecord(id)} /><span><strong>{text(item.label ?? item.title ?? item.subject ?? item.name, id)}</strong><small>{id} · version {text(item.version, "not supplied")} · {stateOf(item, "promoted")}</small></span></label>;
            })}</div> : <EmptyRecord>No explicitly promoted Knowledge Store records exist.</EmptyRecord>}
        {selectedKnowledgeRecordView && <p className="boundary-note">Selected record: {identifier(selectedKnowledgeRecordView, ["recordId", "nodeId", "id"], "unavailable")} · {strings(selectedKnowledgeRecordView.evidenceRefs ?? selectedKnowledgeRecordView.evidence_refs).length} Evidence reference(s).</p>}
      </DataPanel>
      <DataPanel eyebrow="Knowledge Receipts" title="Promotion lineage" icon={<FileCheck2 size={18} />}>
        {states.receipts === "unavailable" ? <EmptyRecord>Knowledge Receipts are unavailable.</EmptyRecord> : <div className="promotion-candidates">{sources.receipts.map((item, index) => {
          const id = identifier(item, ["receiptId", "receipt_id", "promotionId", "promotion_id", "id"], `receipt-${index + 1}`);
          return <label key={id} data-eligible="true"><input type="radio" name="knowledge-receipt" checked={selectedReceipt === id} onChange={() => setSelectedReceipt(id)} /><span><strong>{id}</strong><small>{text(item.missionId ?? item.mission_id, "Mission lineage unavailable")} · {text(item.contentDigest ?? item.content_digest, "digest unavailable")}</small></span></label>;
        })}{states.receipts === "empty" && <EmptyRecord>No Knowledge Receipts are recorded.</EmptyRecord>}</div>}
        {selectedReceiptView && <p className="boundary-note">Originating Mission: {text(selectedReceiptView.missionId ?? selectedReceiptView.mission_id, "not supplied")} · Evidence: {strings(selectedReceiptView.evidenceIds ?? selectedReceiptView.evidence_ids).length} · Knowledge records: {strings(selectedReceiptView.knowledgeNodeIds ?? selectedReceiptView.knowledge_node_ids).length}.</p>}
      </DataPanel>
      <DataPanel eyebrow="Knowledge versions" title="Immutable version lineage" icon={<Layers size={18} />}>
        <div className="compact-records">{knowledgeVersions.length ? knowledgeVersions.map((version, index) => <article key={`${identifier(version, ["recordId", "nodeId", "id"], selectedKnowledgeRecord)}-${text(version.version, String(index + 1))}`}><strong>Version {text(version.version, String(index + 1))}</strong><span>{text(version.label ?? version.title, selectedKnowledgeRecord)} · {strings(version.knowledgeReceiptRefs).join(", ") || "receipt reference unavailable"}</span><StatusPill value="recorded" /></article>) : <EmptyRecord>No version history is available for the selected Knowledge record.</EmptyRecord>}</div>
      </DataPanel>
      <DataPanel eyebrow="Promotion history" title="Explicit promotion lifecycle" icon={<ShieldCheck size={18} />}>
        <div className="compact-records">{sources.promotions.length ? sources.promotions.map((promotion, index) => { const id = identifier(promotion, ["promotionId", "receiptId", "id"], `promotion-${index + 1}`); return <article key={id}><strong>{id}</strong><span>{text(promotion.missionId, "Mission unavailable")} · candidate {text(promotion.candidateId, "not supplied")} · Replay {text(promotion.replayId, "not supplied")}</span><StatusPill value="promoted" /></article>; }) : states.promotions === "unavailable" ? <EmptyRecord>Promotion history is unavailable.</EmptyRecord> : <EmptyRecord>No explicit Knowledge Promotion has occurred.</EmptyRecord>}</div>
        <p className="boundary-note">Promotion history is read from the Runtime. Mission completion never creates these records automatically.</p>
      </DataPanel>
      <DataPanel eyebrow="Runtime Baseline" title="Capture the deployed operational baseline" icon={<FileCheck2 size={18} />}>
        <label className="operation-field"><span>Expected deployed commit (optional)</span><input value={expectedDeployedCommit} onChange={(event) => setExpectedDeployedCommit(event.target.value)} placeholder="Full source commit for compare-and-record" autoComplete="off" spellCheck={false} /></label>
        <button className="nx-action" onClick={() => void establishBaseline()} disabled={Boolean(busy) || !acquisitionGate.allowed}><FileCheck2 size={14} />{busy === "baseline" ? "Recording Runtime baseline…" : "Record Runtime baseline"}</button>
        <p className="boundary-note">Baseline gate: {acquisitionGate.reason}</p>
        <p className="boundary-note">The Runtime observes its own deployed identity, capability state, routes, missions, Replay, receipts, stores, and Edge posture. The browser may only provide an optional expected commit for mismatch detection.</p>
      </DataPanel>
    </div>
  </div>;
}
