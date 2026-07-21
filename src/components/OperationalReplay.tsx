import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleHelp,
  Download,
  Eye,
  FastForward,
  FileCheck2,
  Gauge,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  TerminalSquare,
  Waypoints,
} from "lucide-react";
import { localNexusClient } from "../lib/local-client";
import { replayClient } from "../lib/replay-client";
import { StatusPill } from "./StatusPill";

type RuntimeRecord = Record<string, unknown>;
type ReplayMode = "watch" | "inspect" | "engineering";
type ReplaySourceKind = "projection" | "runtime" | "mission";
type SourceState = "loading" | "available" | "empty" | "unavailable" | "stale";
type Speed = 0.5 | 1 | 1.5 | 2;
type ReplayObject = { id: string; type: string; status: string; classification: string };
type ReplayFailure = { type: string; reason: string; lastSuccessfulStage: string; restartPoint: string };
type ReplayStage = {
  id: string;
  contractStage?: string;
  label: string;
  status: string;
  occurredAt: string;
  meaning: string;
  whatChanged: string;
  whyChanged: string;
  source: string;
  evidence: string[];
  policies: string[];
  decisions: string[];
  confidenceStatus: string;
  confidenceExplanation: string;
  inputs: ReplayObject[];
  outputs: ReplayObject[];
  artifacts: string[];
  failure: ReplayFailure | null;
};
type RuntimeReplayProjection = {
  run_id: string;
  status: string;
  content_digest?: string;
  source?: RuntimeRecord;
  metrics?: { stage_count?: number; observation_count?: number; evidence_count?: number; representation_count?: number; receipt_count?: number };
  stages: RuntimeRecord[];
};
type ReplaySession = { id: string; label: string; status: string; missionId: string; createdAt: string };
type RuntimeReplayDetail = { id: string; status: string; createdAt: string; contentDigest: string; classification: string; limitations: string[] };

const STAGES = [
  { id: "observation", label: "Observation", description: "What the Runtime observed as input and context." },
  { id: "evidence", label: "Evidence", description: "Evidence the Runtime gathered and validated." },
  { id: "representation", label: "Representation", description: "How the Runtime represented the situation internally." },
  { id: "conclave", label: "Conclave", description: "Challenge, dissent, and synthesis inside the Runtime." },
  { id: "authority", label: "Authority", description: "Governance authorization applied by the Runtime." },
  { id: "decision", label: "Decision", description: "The bounded decision the Runtime reached." },
  { id: "receipt", label: "Receipt", description: "The execution receipt and proof recorded by the Runtime." },
] as const;
const SPEEDS: Speed[] = [0.5, 1, 1.5, 2];
const STAGE_INTERVAL_BASE_MS = 2000;

const object = (value: unknown): RuntimeRecord => value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeRecord : {};
const text = (value: unknown, fallback = "Unavailable") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const records = (value: unknown): RuntimeRecord[] => Array.isArray(value) ? value.filter((item): item is RuntimeRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.map((item) => typeof item === "string" ? item : text(object(item).id ?? object(item).proofId ?? object(item).receiptId, "")).filter(Boolean)
  : [];
const rows = (value: unknown, names: string[]): RuntimeRecord[] => {
  if (Array.isArray(value)) return records(value);
  const source = object(value);
  for (const name of names) if (Array.isArray(source[name])) return records(source[name]);
  return [];
};
const failed = (status: string) => ["failed", "blocked", "error", "denied"].some((value) => status.toLowerCase().includes(value));
const complete = (status: string) => ["complete", "completed", "success", "succeeded", "verified", "recorded", "approved"].some((value) => status.toLowerCase().includes(value));
const sourceKey = (kind: ReplaySourceKind, id: string) => `${kind}:${id}`;
const sourceKind = (key: string): ReplaySourceKind => key.startsWith("projection:") ? "projection" : key.startsWith("runtime:") ? "runtime" : "mission";
const sourceId = (key: string) => key.slice(key.indexOf(":") + 1);

function replayObjects(value: unknown): ReplayObject[] {
  return records(value).map((item, index) => ({
    id: text(item.observation_id ?? item.evidence_id ?? item.representation_id ?? item.receipt_id ?? item.id, `record-${index + 1}`),
    type: text(item.type ?? item.representation_type ?? item.recordType, "constitutional object"),
    status: text(item.status, "recorded"),
    classification: text(item.sourceClassification ?? item.source_classification ?? item.classification, "runtime_evidence"),
  }));
}

function runtimeProjection(value: unknown): RuntimeReplayProjection | null {
  const candidate = object(value);
  if (typeof candidate.run_id !== "string" || !Array.isArray(candidate.stages)) return null;
  return candidate as unknown as RuntimeReplayProjection;
}

function safeFailure(raw: RuntimeRecord, status: string): ReplayFailure | null {
  const supplied = object(raw.failure);
  if (!Object.keys(supplied).length && !failed(status)) return null;
  return {
    type: text(supplied.error_type ?? supplied.errorType ?? raw.errorType, "Operational evolution stopped"),
    reason: text(supplied.reason ?? raw.reason ?? raw.honestNarration, "No failure explanation was recorded."),
    lastSuccessfulStage: text(supplied.last_successful_stage ?? supplied.lastSuccessfulStage, "none recorded"),
    restartPoint: text(supplied.restart_point ?? supplied.restartPoint, "none recorded"),
  };
}

function replayStage(raw: RuntimeRecord, defaults: Pick<ReplayStage, "id" | "label" | "status" | "occurredAt" | "meaning"> & { contractStage?: string }): ReplayStage {
  const explainability = object(raw.explainability);
  const confidence = object(explainability.confidence ?? raw.confidence);
  const state = object(raw.current_operational_state ?? raw.currentOperationalState);
  const evidence = strings(explainability.evidence_refs ?? raw.evidenceRefs ?? raw.evidence_refs);
  const directEvidence = [text(raw.proofId ?? raw.proof_id, ""), text(raw.receiptId ?? raw.receipt_id ?? raw.executionReceiptId, "")].filter(Boolean);
  return {
    ...defaults,
    whatChanged: text(explainability.what_changed ?? raw.whatChanged, defaults.meaning),
    whyChanged: text(explainability.why_changed ?? raw.whyChanged ?? raw.reason, "The available Runtime record does not contain a separate causal explanation."),
    source: text(raw.sourceClassification ?? raw.source_classification ?? raw.source, "runtime_evidence"),
    evidence: [...new Set([...evidence, ...directEvidence])],
    policies: strings(explainability.policy_refs ?? raw.policyRefs ?? raw.policy_refs),
    decisions: strings(explainability.decision_refs ?? raw.decisionRefs ?? raw.decision_refs),
    confidenceStatus: text(confidence.status ?? raw.confidenceStatus, "not recorded"),
    confidenceExplanation: text(confidence.explanation, "No confidence explanation was recorded for this stage."),
    inputs: replayObjects(raw.input_objects ?? raw.inputObjects ?? state.observations),
    outputs: replayObjects(raw.output_objects ?? raw.outputObjects ?? state.representations),
    artifacts: strings(raw.generated_artifacts ?? raw.generatedArtifacts),
    failure: safeFailure(raw, defaults.status),
  };
}

function stagesForMission(mission: RuntimeRecord | null, proofs: RuntimeRecord[], receipts: RuntimeRecord[]): ReplayStage[] {
  if (!mission) return [];
  const id = text(mission.missionId ?? mission.id, "mission");
  const taskSteps = records(mission.steps);
  const pipeline: ReplayStage[] = [replayStage(mission, {
    id: `${id}-admitted`,
    label: "Admitted",
    status: text(mission.status, "recorded"),
    occurredAt: text(mission.createdAt ?? mission.plannedAt, ""),
    meaning: "The Runtime admitted an objective into a governed mission workspace.",
  })];
  taskSteps.forEach((step, index) => pipeline.push(replayStage(step, {
    id: text(step.stepId ?? step.id, `${id}-step-${index + 1}`),
    label: text(step.title ?? step.action, `Task ${index + 1}`),
    status: text(step.status ?? step.lastExecutionStatus ?? step.capabilityStatus, "planned"),
    occurredAt: text(step.completedAt ?? step.updatedAt, ""),
    meaning: text(step.honestNarration ?? step.reason, "This stage records a bounded unit of mission work."),
  })));
  proofs.filter((proof) => text(proof.missionId, "") === id).forEach((proof, index) => pipeline.push(replayStage(proof, {
    id: text(proof.proofId ?? proof.id, `${id}-proof-${index + 1}`),
    label: "Verification",
    status: text(proof.status ?? proof.verificationStatus, "recorded"),
    occurredAt: text(proof.createdAt, ""),
    meaning: text(proof.honestNarration, "Runtime proof was recorded for this mission."),
  })));
  receipts.filter((receipt) => text(receipt.missionId, "") === id).forEach((receipt, index) => pipeline.push(replayStage(receipt, {
    id: text(receipt.executionReceiptId ?? receipt.receiptId, `${id}-receipt-${index + 1}`),
    label: "Receipt",
    status: text(receipt.status, "recorded"),
    occurredAt: text(receipt.createdAt, ""),
    meaning: "An execution or outcome receipt was attached to the mission evidence chain.",
  })));
  return pipeline;
}

function stagesFromProjection(projection: RuntimeReplayProjection): ReplayStage[] {
  return projection.stages.map((stage, index) => {
    const runtimeEvent = object(stage.runtime_event);
    return replayStage(stage, {
      id: text(stage.stage_id ?? runtimeEvent.event_id, `${projection.run_id}-stage-${index + 1}`),
      label: text(stage.stage_name, `Runtime stage ${index + 1}`),
      status: text(stage.status, "unknown"),
      occurredAt: text(stage.completed_at ?? runtimeEvent.occurred_at, ""),
      meaning: text(stage.explanation, "The Runtime emitted this stage without a human-readable explanation."),
    });
  });
}

function runtimeStageName(event: RuntimeRecord): string {
  return text(event.stage ?? event.stageId ?? event.stage_id ?? event.phase ?? event.name, "").toLowerCase().replaceAll("_", "-");
}

function stagesFromRuntimeEvents(events: RuntimeRecord[]): ReplayStage[] {
  return STAGES.map((stage) => {
    const event = events.find((candidate) => runtimeStageName(candidate) === stage.id);
    if (!event) return replayStage({}, {
      id: `unavailable-${stage.id}`,
      contractStage: stage.id,
      label: stage.label,
      status: "unavailable",
      occurredAt: "",
      meaning: `${stage.description} Runtime supplied no recorded event for this stage.`,
    });
    return replayStage(event, {
      id: text(event.eventId ?? event.event_id ?? event.id, stage.id),
      contractStage: stage.id,
      label: stage.label,
      status: text(event.status, "recorded"),
      occurredAt: text(event.occurredAt ?? event.occurred_at ?? event.createdAt, ""),
      meaning: text(event.explanation ?? event.summary, stage.description),
    });
  });
}

function sessionsFrom(value: unknown): ReplaySession[] {
  return rows(value, ["sessions", "replays"]).map((session) => ({
    id: text(session.id ?? session.sessionId ?? session.replayId, ""),
    label: text(session.label ?? session.name ?? session.title, "Replay session"),
    status: text(session.status, "recorded"),
    missionId: text(session.missionId ?? session.mission_id, ""),
    createdAt: text(session.createdAt ?? session.created_at, ""),
  })).filter((session) => Boolean(session.id));
}

function detailFrom(value: unknown, fallbackId: string): RuntimeReplayDetail {
  const detail = object(value);
  return {
    id: text(detail.id ?? detail.sessionId ?? detail.replayId, fallbackId),
    status: text(detail.status, "recorded"),
    createdAt: text(detail.createdAt ?? detail.created_at, ""),
    contentDigest: text(detail.contentDigest ?? detail.content_digest ?? detail.digest, "not supplied"),
    classification: text(detail.sourceClassification ?? detail.source_classification ?? detail.classification, "runtime_evidence"),
    limitations: strings(detail.limitations),
  };
}

function ReferenceList({ values, empty }: { values: string[]; empty: string }) {
  return values.length ? <div className="replay-references">{values.map((value) => <code key={value} title={value}>{value}</code>)}</div> : <p className="replay-empty-reference">{empty}</p>;
}

function ObjectList({ values, empty }: { values: ReplayObject[]; empty: string }) {
  return values.length ? <div className="replay-objects">{values.map((item) => <article key={item.id}><span>{item.type.replaceAll("_", " ")}</span><code>{item.id}</code><small>{item.status} · {item.classification}</small></article>)}</div> : <p className="replay-empty-reference">{empty}</p>;
}

function sourceStatusLabel(state: SourceState) {
  if (state === "available") return "available";
  if (state === "empty") return "empty";
  if (state === "stale") return "stale";
  if (state === "loading") return "loading";
  return "unavailable";
}

function safeStageExport(stage: ReplayStage) {
  return {
    id: stage.id,
    contractStage: stage.contractStage,
    label: stage.label,
    status: stage.status,
    occurredAt: stage.occurredAt,
    meaning: stage.meaning,
    whatChanged: stage.whatChanged,
    whyChanged: stage.whyChanged,
    sourceClassification: stage.source,
    evidenceReferences: stage.evidence,
    policyReferences: stage.policies,
    decisionReferences: stage.decisions,
    confidence: { status: stage.confidenceStatus, explanation: stage.confidenceExplanation },
    inputs: stage.inputs,
    outputs: stage.outputs,
    artifacts: stage.artifacts,
    failure: stage.failure,
  };
}

export function OperationalReplay({ requestedMissionId }: { requestedMissionId?: string }) {
  const [projection, setProjection] = useState<RuntimeReplayProjection | null>(null);
  const [projectionState, setProjectionState] = useState<SourceState>("loading");
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const [sessionState, setSessionState] = useState<SourceState>("loading");
  const [missions, setMissions] = useState<RuntimeRecord[]>([]);
  const [proofs, setProofs] = useState<RuntimeRecord[]>([]);
  const [receipts, setReceipts] = useState<RuntimeRecord[]>([]);
  const [missionState, setMissionState] = useState<SourceState>("loading");
  const [selectedKey, setSelectedKey] = useState("");
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeRecord[]>([]);
  const [runtimeDetail, setRuntimeDetail] = useState<RuntimeReplayDetail | null>(null);
  const [runtimeDetailState, setRuntimeDetailState] = useState<SourceState>("empty");
  const [selectedStage, setSelectedStage] = useState(0);
  const [mode, setMode] = useState<ReplayMode>("watch");
  const [live, setLive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failureOnly, setFailureOnly] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [explanation, setExplanation] = useState("");
  const [explainState, setExplainState] = useState<"idle" | "loading" | "available" | "unavailable">("idle");
  const [notice, setNotice] = useState("");
  const selectionTouched = useRef(false);
  const projectionRef = useRef<RuntimeReplayProjection | null>(null);
  const sessionsRef = useRef<ReplaySession[]>([]);
  const missionsRef = useRef<RuntimeRecord[]>([]);

  const refresh = useCallback(async () => {
    const projectionRequest = fetch("/api/replay/replay.json", { cache: "no-store", headers: { Accept: "application/json" } }).then(async (response) => {
      if (!response.ok) throw new Error(`Dedicated replay projection returned ${response.status}.`);
      const next = runtimeProjection(await response.json());
      if (!next) throw new Error("Dedicated replay projection was invalid.");
      return next;
    });
    const [projectionResult, sessionResult, missionResult, proofResult, receiptResult] = await Promise.allSettled([
      projectionRequest,
      replayClient.listReplays(),
      localNexusClient.missions(),
      localNexusClient.proofs(),
      localNexusClient.receipts(),
    ]);

    if (projectionResult.status === "fulfilled") {
      projectionRef.current = projectionResult.value;
      setProjection(projectionResult.value);
      setProjectionState("available");
    } else setProjectionState(projectionRef.current ? "stale" : "unavailable");

    if (sessionResult.status === "fulfilled" && sessionResult.value.ok) {
      const next = sessionsFrom(sessionResult.value.data);
      sessionsRef.current = next;
      setSessions(next);
      setSessionState(next.length ? "available" : "empty");
    } else setSessionState(sessionsRef.current.length ? "stale" : "unavailable");

    if (missionResult.status === "fulfilled") {
      const next = rows(missionResult.value, ["missions"]);
      missionsRef.current = next;
      setMissions(next);
      setMissionState(next.length ? "available" : "empty");
    } else setMissionState(missionsRef.current.length ? "stale" : "unavailable");

    if (proofResult.status === "fulfilled") setProofs(rows(proofResult.value, ["proofs"]));
    if (receiptResult.status === "fulfilled") setReceipts(rows(receiptResult.value, ["receipts"]));
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!("EventSource" in window)) return;
    const stream = new EventSource("/api/replay/events");
    const update = (event: Event) => {
      try {
        const next = runtimeProjection(JSON.parse((event as MessageEvent<string>).data));
        if (next) {
          projectionRef.current = next;
          setProjection(next);
          setProjectionState("available");
        }
      } catch { /* Invalid Runtime events never replace recorded state. */ }
    };
    stream.addEventListener("replay", update);
    stream.addEventListener("error", () => {
      setProjectionState(projectionRef.current ? "stale" : "unavailable");
      stream.close();
    }, { once: true });
    return () => stream.close();
  }, []);

  useEffect(() => {
    if (selectionTouched.current || selectedKey) return;
    const requestedMission = requestedMissionId && missions.find((mission) => text(mission.missionId ?? mission.id, "") === requestedMissionId);
    const requestedSession = requestedMissionId && sessions.find((session) => session.missionId === requestedMissionId);
    const next = requestedMission ? sourceKey("mission", requestedMissionId)
      : requestedSession ? sourceKey("runtime", requestedSession.id)
      : projection ? sourceKey("projection", projection.run_id)
      : sessions[0] ? sourceKey("runtime", sessions[0].id)
      : missions[0] ? sourceKey("mission", text(missions[0].missionId ?? missions[0].id, "mission"))
      : "";
    if (next) {
      setSelectedKey(next);
      setLive(next.startsWith("projection:"));
    }
  }, [missions, projection, requestedMissionId, selectedKey, sessions]);

  const selectedSourceKind = selectedKey ? sourceKind(selectedKey) : "mission";
  const selectedSourceId = selectedKey ? sourceId(selectedKey) : "";

  useEffect(() => {
    if (selectedSourceKind !== "runtime" || !selectedSourceId) {
      setRuntimeEvents([]);
      setRuntimeDetail(null);
      setRuntimeDetailState("empty");
      return;
    }
    let cancelled = false;
    setRuntimeDetailState("loading");
    Promise.all([replayClient.getReplay(selectedSourceId), replayClient.getEvents(selectedSourceId)]).then(([detailEnvelope, eventsEnvelope]) => {
      if (cancelled) return;
      const suppliedEvents = rows(eventsEnvelope.data, ["events"]);
      if (detailEnvelope.ok || eventsEnvelope.ok) {
        setRuntimeDetail(detailFrom(detailEnvelope.data, selectedSourceId));
        setRuntimeEvents(eventsEnvelope.ok ? suppliedEvents : []);
        setRuntimeDetailState(suppliedEvents.length ? "available" : "empty");
      } else {
        setRuntimeDetail(null);
        setRuntimeEvents([]);
        setRuntimeDetailState("unavailable");
      }
    }).catch(() => {
      if (!cancelled) {
        setRuntimeDetail(null);
        setRuntimeEvents([]);
        setRuntimeDetailState("unavailable");
      }
    });
    return () => { cancelled = true; };
  }, [selectedSourceId, selectedSourceKind]);

  useEffect(() => {
    if (!live || selectedSourceKind !== "projection") return;
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [live, refresh, selectedSourceKind]);

  const selectedMission = useMemo(() => missions.find((mission) => text(mission.missionId ?? mission.id, "") === selectedSourceId) ?? null, [missions, selectedSourceId]);
  const allStages = useMemo(() => {
    if (selectedSourceKind === "projection") return projection ? stagesFromProjection(projection) : [];
    if (selectedSourceKind === "runtime") return stagesFromRuntimeEvents(runtimeEvents);
    return stagesForMission(selectedMission, proofs, receipts);
  }, [projection, proofs, receipts, runtimeEvents, selectedMission, selectedSourceKind]);
  const stages = failureOnly ? allStages.filter((stage) => failed(stage.status)) : allStages;
  const currentIndex = Math.min(selectedStage, Math.max(stages.length - 1, 0));
  const current = stages[currentIndex];

  useEffect(() => {
    setSelectedStage(0);
    setPlaying(false);
    setFailureOnly(false);
    setExplanation("");
    setExplainState("idle");
  }, [selectedKey]);
  useEffect(() => { setSelectedStage(0); setPlaying(false); }, [failureOnly]);
  useEffect(() => {
    if (!playing || stages.length < 2) return;
    const interval = STAGE_INTERVAL_BASE_MS / speed;
    const timer = window.setTimeout(() => setSelectedStage((value) => {
      if (value >= stages.length - 1) {
        setPlaying(false);
        return value;
      }
      return value + 1;
    }), interval);
    return () => window.clearTimeout(timer);
  }, [playing, selectedStage, speed, stages.length]);
  useEffect(() => {
    if (live && selectedSourceKind === "projection" && stages.length) setSelectedStage(stages.length - 1);
  }, [live, selectedSourceKind, stages.length]);
  useEffect(() => { setExplanation(""); setExplainState("idle"); }, [current?.id]);

  const options = useMemo(() => [
    ...(projection ? [{ key: sourceKey("projection", projection.run_id), label: `Live projection · ${projection.run_id}`, status: projection.status }] : []),
    ...sessions.map((session) => ({ key: sourceKey("runtime", session.id), label: `Runtime session · ${session.label}`, status: session.status })),
    ...missions.map((mission) => {
      const id = text(mission.missionId ?? mission.id, "mission");
      return { key: sourceKey("mission", id), label: `Mission · ${text(mission.userObjective ?? mission.objective ?? mission.title, id)}`, status: text(mission.status, "recorded") };
    }),
  ], [missions, projection, sessions]);

  const evidenceCount = new Set(allStages.flatMap((stage) => stage.evidence)).size;
  const observationCount = allStages.reduce((total, stage) => total + stage.inputs.length, 0);
  const representationCount = allStages.reduce((total, stage) => total + stage.outputs.length, 0);
  const receiptCount = allStages.filter((stage) => stage.label.toLowerCase().includes("receipt")).length;
  const selectedStatus = options.find((option) => option.key === selectedKey)?.status ?? "unavailable";

  function chooseSource(key: string) {
    selectionTouched.current = true;
    setSelectedKey(key);
    setLive(key.startsWith("projection:"));
  }

  function chooseStage(index: number) {
    setPlaying(false);
    setLive(false);
    setSelectedStage(index);
  }

  async function explainCurrentStage() {
    if (!current) return;
    if (selectedSourceKind !== "runtime") {
      setExplanation(current.whyChanged);
      setExplainState("available");
      return;
    }
    setExplainState("loading");
    setExplanation("");
    try {
      const envelope = await replayClient.explainStage(selectedSourceId, current.contractStage ?? current.id);
      const supplied = object(envelope.data);
      const next = text(supplied.explanation ?? supplied.summary ?? supplied.stageExplanation, "");
      if (envelope.ok && next) {
        setExplanation(next);
        setExplainState("available");
      } else setExplainState("unavailable");
    } catch {
      setExplainState("unavailable");
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportReplay() {
    setNotice("");
    if (selectedSourceKind === "projection" && projection) {
      try {
        const response = await fetch("/api/replay/export/replay.json", { headers: { Accept: "application/json" } });
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok || !contentType.toLowerCase().includes("json")) throw new Error("Runtime replay export was unavailable.");
        downloadBlob(await response.blob(), `nexus-replay-${projection.run_id}.json`);
      } catch (caught) {
        setNotice(caught instanceof Error ? caught.message : "Runtime replay export was unavailable.");
      }
      return;
    }
    const payload = {
      recordType: "nexus_operational_replay_projection",
      exportedAt: new Date().toISOString(),
      source: selectedSourceKind === "runtime" ? "runtime_replay_session" : "mission_evidence_projection",
      replayId: selectedSourceKind === "runtime" ? selectedSourceId : undefined,
      missionId: selectedSourceKind === "mission" ? selectedSourceId : sessions.find((session) => session.id === selectedSourceId)?.missionId || undefined,
      status: selectedStatus,
      detail: selectedSourceKind === "runtime" ? runtimeDetail : undefined,
      stages: allStages.map(safeStageExport),
      limitations: ["This is a passive, presentation-safe projection of Runtime records. It does not re-execute work and omits unrestricted raw payloads."],
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `nexus-replay-${selectedSourceId || "unselected"}.json`);
  }

  const engineeringView = current ? {
    source: selectedSourceKind,
    sourceId: selectedSourceId,
    sourceStatus: selectedStatus,
    projectionDigest: selectedSourceKind === "projection" ? projection?.content_digest : undefined,
    runtimeDetail: selectedSourceKind === "runtime" ? runtimeDetail : undefined,
    stage: safeStageExport(current),
    limitations: ["Presentation-safe normalized fields only; unrestricted Runtime payloads are intentionally omitted."],
  } : null;
  const sourceUnavailable = !options.length && [projectionState, sessionState, missionState].every((state) => state === "unavailable" || state === "empty");
  const sourceLabel = selectedSourceKind === "projection" ? "Dedicated replay projection" : selectedSourceKind === "runtime" ? "Runtime replay session" : "Mission evidence projection";

  return <div className="operational-replay">
    <section className="nx-workspace-hero"><div><span className="nx-eyebrow">Operational Replay</span><h2>Watch NEXUS build operational understanding.</h2><p>One canonical replay workspace combines configured replay projections, registered Runtime sessions, and mission evidence records while preserving their source boundaries.</p></div><div className="replay-live"><StatusPill value={selectedSourceKind === "projection" ? projectionState : selectedSourceKind === "runtime" ? runtimeDetailState : missionState} />{selectedSourceKind === "projection" && <button className="nx-action" onClick={() => { setPlaying(false); setLive(true); setSelectedStage(Math.max(0, stages.length - 1)); }}><Radio size={14} />Live</button>}</div></section>
    {notice && <section className="operation-error" role="alert"><AlertTriangle size={18} />{notice}</section>}
    {sourceUnavailable && <section className="operation-error" role="status"><AlertTriangle size={18} />Replay sources are unavailable or contain no sessions. NEXUS has not synthesized replacement data.</section>}
    <section className="replay-source-health" aria-label="Replay source availability"><span>Dedicated projection <StatusPill value={sourceStatusLabel(projectionState)} /></span><span>Runtime sessions <StatusPill value={sourceStatusLabel(sessionState)} /></span><span>Mission records <StatusPill value={sourceStatusLabel(missionState)} /></span></section>
    <section className="replay-runbar"><label><span>Replay source</span><select value={selectedKey} onChange={(event) => chooseSource(event.target.value)} disabled={!options.length}><option value="">{options.length ? "Select replay source" : "No replay source available"}</option>{options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label><article><Waypoints size={14} /><span>Stages</span><strong>{allStages.length}</strong></article><article><Eye size={14} /><span>Observations</span><strong>{observationCount}</strong></article><article><ShieldCheck size={14} /><span>Evidence</span><strong>{evidenceCount}</strong></article><article><Gauge size={14} /><span>Representations</span><strong>{representationCount}</strong></article><article><FileCheck2 size={14} /><span>Receipts</span><strong>{receiptCount}</strong></article><button onClick={() => void refresh()}><RefreshCw size={14} />Refresh</button><button onClick={() => void exportReplay()} disabled={!current}><Download size={14} />Export</button></section>
    <p className="replay-source-boundary"><strong>{sourceLabel}</strong> · {selectedSourceKind === "projection" ? `stream ${projectionState}` : selectedSourceKind === "runtime" ? `detail ${runtimeDetailState}` : `records ${missionState}`}. Replay is a passive view; it never re-executes the recorded work.</p>
    <section className="replay-pipeline" aria-label="Replay pipeline visualization">{allStages.map((stage, index) => <button key={`${stage.id}-${index}`} data-status={stage.status} data-active={!failureOnly && current?.id === stage.id} onClick={() => { setFailureOnly(false); chooseStage(index); }}>{complete(stage.status) ? <CheckCircle2 size={15} /> : failed(stage.status) ? <AlertTriangle size={15} /> : <Circle size={15} />}<span>{String(index + 1).padStart(2, "0")} · {stage.label}</span><small>{stage.status}</small></button>)}</section>
    <div className="replay-toolbar"><div><button data-active={mode === "watch"} onClick={() => setMode("watch")}>Executive Mode</button><button data-active={mode === "inspect"} onClick={() => setMode("inspect")}><CircleHelp size={14} />Inspect</button><button data-active={mode === "engineering"} onClick={() => setMode("engineering")}><TerminalSquare size={14} />Engineering Mode</button><button data-active={failureOnly} onClick={() => setFailureOnly((value) => !value)}><AlertTriangle size={14} />Failure Replay</button></div><div><button onClick={() => chooseStage(Math.max(0, currentIndex - 1))} aria-label="Previous replay stage" disabled={!current || currentIndex === 0}><ChevronLeft size={15} /></button><button onClick={() => { setLive(false); if (!playing && currentIndex >= stages.length - 1) setSelectedStage(0); setPlaying((value) => !value); }} aria-label={playing ? "Pause replay" : "Play replay"} disabled={stages.length < 2}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><button onClick={() => chooseStage(Math.min(Math.max(0, stages.length - 1), currentIndex + 1))} aria-label="Next replay stage" disabled={!current || currentIndex >= stages.length - 1}><ChevronRight size={15} /></button></div></div>
    {current ? <section className="replay-inspector">
      <div className="replay-stage"><span className="nx-eyebrow">Stage Inspector · {String(currentIndex + 1).padStart(2, "0")}</span><h2>{current.label}</h2><StatusPill value={current.status} />{current.failure && <section className="replay-failure"><AlertTriangle size={17} /><div><strong>{current.failure.type}</strong><p>{current.failure.reason}</p><span>Last success: {current.failure.lastSuccessfulStage} · Restart: {current.failure.restartPoint}</span></div></section>}{mode === "watch" && <><span className="replay-section-label">What changed</span><h3>{current.whatChanged}</h3><p>{current.whyChanged}</p><div className="replay-state-metrics"><div><strong>{current.inputs.length}</strong><span>Inputs</span></div><div><strong>{current.evidence.length}</strong><span>Evidence</span></div><div><strong>{current.outputs.length}</strong><span>Outputs</span></div><div><strong>{current.artifacts.length}</strong><span>Artifacts</span></div></div></>}{mode === "inspect" && <div className="replay-inspection-grid"><section><span>Inputs</span><ObjectList values={current.inputs} empty="No input objects were recorded at this boundary." /></section><section><span>Outputs</span><ObjectList values={current.outputs} empty="No output objects were recorded at this boundary." /></section><section><span>Evidence lineage</span><ReferenceList values={current.evidence} empty="No Evidence participated in this available record." /></section><section><span>Artifacts</span><ReferenceList values={current.artifacts} empty="No generated artifacts were recorded." /></section></div>}{mode === "engineering" && <div className="replay-engineering"><header><Braces size={15} /><span>Normalized Runtime record</span></header><pre>{JSON.stringify(engineeringView, null, 2)}</pre></div>}<dl><div><dt>Source classification</dt><dd>{current.source}</dd></div><div><dt>Occurred</dt><dd>{current.occurredAt || "Runtime timestamp unavailable"}</dd></div><div><dt>Stage ID</dt><dd>{current.id}</dd></div></dl></div>
      <aside><header className="replay-explain-header"><CircleHelp size={17} /><div><span className="nx-eyebrow">Explain This Step</span><h3>Why NEXUS can say this</h3></div></header><button className="replay-explain-action" onClick={() => void explainCurrentStage()} disabled={explainState === "loading"}>{explainState === "loading" ? "Requesting Runtime explanation…" : "Explain This Step"}</button>{explainState === "available" && <p className="replay-explanation">{explanation}</p>}{explainState === "unavailable" && <p className="replay-explanation replay-explanation--unavailable">Runtime supplied no explanation for this stage.</p>}<dl className="replay-explain-list"><div><dt>Evidence</dt><dd><ReferenceList values={current.evidence} empty="No Evidence reference is attached." /></dd></div><div><dt>Governance</dt><dd><ReferenceList values={current.policies} empty="No policy reference is attached." /></dd></div><div><dt>Confidence</dt><dd><strong>{current.confidenceStatus}</strong><p>{current.confidenceExplanation}</p></dd></div><div><dt>Decision</dt><dd><ReferenceList values={current.decisions} empty="No Decision reference is attached." /></dd></div></dl></aside>
    </section> : <section className="conclave-empty"><Circle size={24} /><div><strong>No replay stage is available.</strong><p>Select an available source, wait for Runtime detail, or disable Failure Replay.</p></div></section>}
    <footer className="replay-controls"><div><button onClick={() => { setLive(false); setPlaying(false); setSelectedStage(0); }} aria-label="Restart replay"><RotateCcw size={14} /><span>Restart</span></button><button onClick={() => chooseStage(Math.max(0, currentIndex - 1))} disabled={!current || currentIndex === 0} aria-label="Previous stage"><ChevronLeft size={14} /><span>Previous</span></button><button onClick={() => setPlaying((value) => !value)} disabled={stages.length < 2} aria-label={playing ? "Pause replay" : "Play replay"}>{playing ? <><Pause size={14} /><span>Pause</span></> : <><Play size={14} /><span>Play</span></>}</button><button onClick={() => chooseStage(Math.min(Math.max(0, stages.length - 1), currentIndex + 1))} disabled={!current || currentIndex >= stages.length - 1} aria-label="Next stage"><span>Next</span><ChevronRight size={14} /></button><label><FastForward size={14} />Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value) as Speed)}>{SPEEDS.map((item) => <option key={item} value={item}>{item}×</option>)}</select></label></div><span><ScrollText size={14} />Replay is a passive projection of recorded Runtime data. It does not re-execute work.</span></footer>
  </div>;
}
