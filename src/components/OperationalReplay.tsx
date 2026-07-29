import { useCallback, useEffect, useRef, useState } from "react";
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
import { StatusPill } from "./StatusPill";

type RuntimeRecord = Record<string, unknown>;
type ReplayMode = "watch" | "inspect" | "engineering";
type SourceState = "loading" | "available" | "empty" | "unavailable" | "stale";
type Speed = 0.5 | 1 | 1.5 | 2;
type ReplayObject = { id: string; type: string; status: string; classification: string };
type ReplayFailure = { type: string; reason: string; lastSuccessfulStage: string; restartPoint: string };
type ReplayStage = {
  id: string;
  contractStage: string;
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
type ReplaySession = {
  id: string;
  label: string;
  status: string;
  missionId: string;
  createdAt: string;
  contentDigest: string;
  receiptRefs: string[];
};

const SPEEDS: Speed[] = [0.5, 1, 1.5, 2];
const STAGE_INTERVAL_BASE_MS = 2000;
const POLL_INTERVAL_MS = 5000;

const object = (value: unknown): RuntimeRecord => value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeRecord : {};
const text = (value: unknown, fallback = "Unavailable") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const records = (value: unknown): RuntimeRecord[] => Array.isArray(value)
  ? value.filter((item): item is RuntimeRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
  : [];
const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.map((item) => typeof item === "string" ? item : text(object(item).id ?? object(item).proofId ?? object(item).receiptId, "")).filter(Boolean)
  : [];
const rows = (value: unknown, names: string[]): RuntimeRecord[] => {
  if (Array.isArray(value)) return records(value);
  const source = object(value);
  for (const name of names) if (Array.isArray(source[name])) return records(source[name]);
  for (const name of ["data", "result", "replay"]) {
    const nested = object(source[name]);
    for (const candidate of names) if (Array.isArray(nested[candidate])) return records(nested[candidate]);
  }
  return [];
};
const failed = (status: string) => ["failed", "blocked", "error", "denied"].some((value) => status.toLowerCase().includes(value));
const complete = (status: string) => ["complete", "completed", "success", "succeeded", "verified", "recorded", "approved"].some((value) => status.toLowerCase().includes(value));

function replayObjects(value: unknown): ReplayObject[] {
  return records(value).map((item, index) => ({
    id: text(item.observation_id ?? item.observationId ?? item.evidence_id ?? item.evidenceId ?? item.representation_id ?? item.representationId ?? item.receipt_id ?? item.receiptId ?? item.id, `record-${index + 1}`),
    type: text(item.type ?? item.representation_type ?? item.representationType ?? item.recordType, "constitutional object"),
    status: text(item.status, "recorded"),
    classification: text(item.sourceClassification ?? item.source_classification ?? item.classification, "runtime_evidence"),
  }));
}

function replayRecord(value: unknown): RuntimeRecord {
  const source = object(value);
  for (const key of ["replay", "session", "record", "detail", "stage"]) {
    const nested = object(source[key]);
    if (Object.keys(nested).length) return nested;
  }
  return source;
}

function sessionFrom(value: unknown): ReplaySession | null {
  const item = replayRecord(value);
  const id = text(item.replayId ?? item.replay_id ?? item.runId ?? item.run_id ?? item.sessionId ?? item.id, "");
  if (!id) return null;
  const missionId = text(item.missionId ?? item.mission_id, "");
  return {
    id,
    label: text(item.label ?? item.name ?? item.title ?? item.missionTitle, missionId || id),
    status: text(item.status, "recorded"),
    missionId,
    createdAt: text(item.createdAt ?? item.created_at ?? item.startedAt, ""),
    contentDigest: text(item.contentDigest ?? item.content_digest ?? item.digest, "not supplied"),
    receiptRefs: strings(item.receiptRefs ?? item.receipt_refs),
  };
}

function sessionsFrom(value: unknown): ReplaySession[] {
  const listed = rows(value, ["replays", "sessions", "records", "items"]);
  const candidates = listed.length ? listed : [replayRecord(value)];
  const unique = new Map<string, ReplaySession>();
  candidates.forEach((candidate) => {
    const session = sessionFrom(candidate);
    if (session) unique.set(session.id, session);
  });
  return [...unique.values()];
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

function stageFrom(value: unknown, index: number): ReplayStage {
  const raw = replayRecord(value);
  const runtimeEvent = object(raw.runtime_event ?? raw.runtimeEvent);
  const explainability = object(raw.explainability);
  const confidence = object(explainability.confidence ?? raw.confidence);
  const state = object(raw.current_operational_state ?? raw.currentOperationalState);
  const id = text(raw.stageId ?? raw.stage_id ?? runtimeEvent.event_id ?? runtimeEvent.eventId ?? raw.id, `stage-${index + 1}`);
  const label = text(raw.stageName ?? raw.stage_name ?? raw.name ?? raw.phase, `Runtime stage ${index + 1}`);
  const status = text(raw.status, "recorded");
  const meaning = text(raw.explanation ?? raw.summary, "The Runtime recorded this stage without a separate human-readable explanation.");
  const evidence = strings(explainability.evidence_refs ?? explainability.evidenceRefs ?? raw.evidenceRefs ?? raw.evidence_refs);
  const directEvidence = [text(raw.proofId ?? raw.proof_id, ""), text(raw.receiptId ?? raw.receipt_id ?? raw.executionReceiptId, "")].filter(Boolean);
  return {
    id,
    contractStage: text(raw.contractStage ?? raw.contract_stage ?? raw.stage ?? raw.stageId ?? raw.stage_id ?? label, id),
    label,
    status,
    occurredAt: text(raw.completedAt ?? raw.completed_at ?? raw.occurredAt ?? raw.occurred_at ?? runtimeEvent.occurred_at ?? runtimeEvent.occurredAt, ""),
    meaning,
    whatChanged: text(explainability.what_changed ?? explainability.whatChanged ?? raw.whatChanged, meaning),
    whyChanged: text(explainability.why_changed ?? explainability.whyChanged ?? raw.whyChanged ?? raw.reason, "The Runtime record contains no separate causal explanation."),
    source: text(raw.sourceClassification ?? raw.source_classification ?? raw.source, "runtime_evidence"),
    evidence: [...new Set([...evidence, ...directEvidence])],
    policies: strings(explainability.policy_refs ?? explainability.policyRefs ?? raw.policyRefs ?? raw.policy_refs),
    decisions: strings(explainability.decision_refs ?? explainability.decisionRefs ?? raw.decisionRefs ?? raw.decision_refs),
    confidenceStatus: text(confidence.status ?? raw.confidenceStatus, "not recorded"),
    confidenceExplanation: text(confidence.explanation, "No confidence explanation was recorded for this stage."),
    inputs: replayObjects(raw.input_objects ?? raw.inputObjects ?? state.observations),
    outputs: replayObjects(raw.output_objects ?? raw.outputObjects ?? state.representations),
    artifacts: strings(raw.generated_artifacts ?? raw.generatedArtifacts ?? raw.artifacts),
    failure: safeFailure(raw, status),
  };
}

function stagesFrom(value: unknown): ReplayStage[] {
  const source = replayRecord(value);
  const supplied = rows(value, ["events", "stages", "records", "items"]);
  const nested = supplied.length ? supplied : records(source.stages ?? source.events);
  return nested.map(stageFrom);
}

function ReferenceList({ values, empty }: { values: string[]; empty: string }) {
  return values.length ? <div className="replay-references">{values.map((value) => <code key={value} title={value}>{value}</code>)}</div> : <p className="replay-empty-reference">{empty}</p>;
}

function ObjectList({ values, empty }: { values: ReplayObject[]; empty: string }) {
  return values.length ? <div className="replay-objects">{values.map((item) => <article key={item.id}><span>{item.type.replaceAll("_", " ")}</span><code>{item.id}</code><small>{item.status} · {item.classification}</small></article>)}</div> : <p className="replay-empty-reference">{empty}</p>;
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
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const sessionsRef = useRef<ReplaySession[]>([]);
  const [sourceState, setSourceState] = useState<SourceState>("loading");
  const [selectedReplayId, setSelectedReplayId] = useState("");
  const [detail, setDetail] = useState<RuntimeRecord | null>(null);
  const [stages, setStages] = useState<ReplayStage[]>([]);
  const stagesRef = useRef<ReplayStage[]>([]);
  const [failureRecords, setFailureRecords] = useState<RuntimeRecord[]>([]);
  const failureRecordsRef = useRef<RuntimeRecord[]>([]);
  const [failureState, setFailureState] = useState<SourceState>("loading");
  const [detailState, setDetailState] = useState<SourceState>("empty");
  const [selectedStage, setSelectedStage] = useState(0);
  const [mode, setMode] = useState<ReplayMode>("watch");
  const [live, setLive] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [failureOnly, setFailureOnly] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [explanation, setExplanation] = useState("");
  const [explainState, setExplainState] = useState<"idle" | "loading" | "available" | "unavailable">("idle");
  const [notice, setNotice] = useState("");

  const refreshList = useCallback(async () => {
    const [replaysResult, failuresResult] = await Promise.allSettled([
      localNexusClient.operationalReplays(),
      localNexusClient.operationalReplayFailures(),
    ]);
    if (replaysResult.status === "fulfilled") {
      const next = sessionsFrom(replaysResult.value);
      sessionsRef.current = next;
      setSessions(next);
      setSourceState(next.length ? "available" : "empty");
      setNotice("");
      setSelectedReplayId((current) => current && next.some((session) => session.id === current) ? current : next[0]?.id ?? "");
    } else {
      setSourceState(sessionsRef.current.length ? "stale" : "unavailable");
      setNotice(replaysResult.reason instanceof Error ? replaysResult.reason.message : "Operational Replay is unavailable.");
    }
    if (failuresResult.status === "fulfilled") {
      const next = rows(failuresResult.value, ["failures", "events", "records", "items"]);
      failureRecordsRef.current = next;
      setFailureRecords(next);
      setFailureState(next.length ? "available" : "empty");
    } else {
      setFailureState(failureRecordsRef.current.length ? "stale" : "unavailable");
    }
  }, []);

  useEffect(() => { void refreshList(); }, [refreshList]);
  useEffect(() => {
    if (!requestedMissionId) return;
    let cancelled = false;
    localNexusClient.operationalReplayForMission(requestedMissionId).then((value) => {
      if (cancelled) return;
      const linked = sessionsFrom(value);
      if (!linked.length) {
        setNotice(`Runtime returned no Replay linked to mission ${requestedMissionId}.`);
        return;
      }
      const merged = new Map(sessionsRef.current.map((item) => [item.id, item]));
      linked.forEach((item) => merged.set(item.id, item));
      const next = [...merged.values()];
      sessionsRef.current = next;
      setSessions(next);
      setSelectedReplayId(linked[0].id);
      setSourceState("available");
    }).catch((caught) => {
      if (!cancelled) setNotice(caught instanceof Error ? caught.message : "Mission-linked Replay is unavailable.");
    });
    return () => { cancelled = true; };
  }, [requestedMissionId]);

  const loadReplay = useCallback(async (replayId: string, quiet = false) => {
    if (!replayId) return;
    if (!quiet) setDetailState("loading");
    const [detailResult, eventsResult] = await Promise.allSettled([
      localNexusClient.operationalReplay(replayId),
      localNexusClient.operationalReplayEvents(replayId),
    ]);
    if (detailResult.status === "rejected" && eventsResult.status === "rejected") {
      setDetailState(stagesRef.current.length ? "stale" : "unavailable");
      if (!quiet) setNotice(detailResult.reason instanceof Error ? detailResult.reason.message : "Replay detail is unavailable.");
      return;
    }
    const nextDetail = detailResult.status === "fulfilled" ? replayRecord(detailResult.value) : null;
    const eventStages = eventsResult.status === "fulfilled" ? stagesFrom(eventsResult.value) : [];
    const detailStages = nextDetail ? stagesFrom(nextDetail) : [];
    const nextStages = eventStages.length ? eventStages : detailStages;
    setDetail(nextDetail);
    stagesRef.current = nextStages;
    setStages(nextStages);
    setDetailState(nextStages.length ? "available" : "empty");
  }, []);

  useEffect(() => {
    setSelectedStage(0);
    setPlaying(false);
    setFailureOnly(false);
    setExplanation("");
    setExplainState("idle");
    stagesRef.current = [];
    setStages([]);
    setDetail(null);
    if (selectedReplayId) void loadReplay(selectedReplayId);
  }, [loadReplay, selectedReplayId]);
  useEffect(() => {
    if (!live || !selectedReplayId) return;
    const timer = window.setInterval(() => {
      void refreshList();
      void loadReplay(selectedReplayId, true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [live, loadReplay, refreshList, selectedReplayId]);

  const visibleStages = failureOnly ? stages.filter((stage) => stage.failure || failed(stage.status)) : stages;
  const currentIndex = Math.min(selectedStage, Math.max(visibleStages.length - 1, 0));
  const current = visibleStages[currentIndex];

  useEffect(() => { setSelectedStage(0); setPlaying(false); }, [failureOnly]);
  useEffect(() => {
    if (!playing || visibleStages.length < 2) return;
    const timer = window.setTimeout(() => setSelectedStage((value) => {
      if (value >= visibleStages.length - 1) {
        setPlaying(false);
        return value;
      }
      return value + 1;
    }), STAGE_INTERVAL_BASE_MS / speed);
    return () => window.clearTimeout(timer);
  }, [playing, selectedStage, speed, visibleStages.length]);
  useEffect(() => {
    if (live && visibleStages.length) setSelectedStage(visibleStages.length - 1);
  }, [live, visibleStages.length]);
  useEffect(() => { setExplanation(""); setExplainState("idle"); }, [current?.id]);
  useEffect(() => {
    if (!current || !selectedReplayId) return;
    let cancelled = false;
    localNexusClient.operationalReplayStage(selectedReplayId, current.contractStage).then((value) => {
      if (cancelled) return;
      const supplied = stageFrom(value, currentIndex);
      setStages((items) => {
        const next = items.map((item) => item.id === current.id ? supplied : item);
        stagesRef.current = next;
        return next;
      });
    }).catch(() => { /* The ordered event remains authoritative when detail is unavailable. */ });
    return () => { cancelled = true; };
  }, [current?.contractStage, current?.id, currentIndex, selectedReplayId]);

  const evidenceCount = new Set(stages.flatMap((stage) => stage.evidence)).size;
  const observationCount = stages.reduce((total, stage) => total + stage.inputs.length, 0);
  const representationCount = stages.reduce((total, stage) => total + stage.outputs.length, 0);
  const selectedSession = sessions.find((session) => session.id === selectedReplayId) ?? null;
  const receiptCount = new Set([
    ...(selectedSession?.receiptRefs ?? []),
    ...stages.flatMap((stage) => stage.evidence.filter((reference) => /receipt/i.test(reference))),
  ]).size;

  function chooseStage(index: number) {
    setPlaying(false);
    setLive(false);
    setSelectedStage(index);
  }

  async function explainCurrentStage() {
    if (!current || !selectedReplayId) return;
    setExplainState("loading");
    setExplanation("");
    try {
      const supplied = replayRecord(await localNexusClient.explainOperationalReplayStage(selectedReplayId, current.contractStage));
      const whatChanged = text(supplied.whatChanged ?? supplied.what_changed, "");
      const whyChanged = text(supplied.whyChanged ?? supplied.why_changed, "");
      const next = text(supplied.explanation ?? supplied.summary ?? supplied.stageExplanation, "")
        || [whatChanged, whyChanged].filter(Boolean).join(" ");
      if (next) {
        setExplanation(next);
        setExplainState("available");
      } else setExplainState("unavailable");
    } catch {
      setExplainState("unavailable");
    }
  }

  function exportReplay() {
    if (!selectedSession || !stages.length) return;
    const payload = {
      recordType: "nexus_operational_replay_projection",
      exportedAt: new Date().toISOString(),
      source: "authenticated_runtime_replay",
      replayId: selectedSession.id,
      missionId: selectedSession.missionId || undefined,
      status: selectedSession.status,
      contentDigest: selectedSession.contentDigest,
      receiptRefs: selectedSession.receiptRefs,
      detail,
      stages: stages.map(safeStageExport),
      limitations: ["Passive, presentation-safe projection of authenticated Runtime records. It does not re-execute work."],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `nexus-replay-${selectedSession.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const engineeringView = current ? {
    source: "authenticated_runtime_replay",
    replayId: selectedReplayId,
    missionId: selectedSession?.missionId,
    sourceStatus: sourceState,
    detailStatus: detailState,
    contentDigest: selectedSession?.contentDigest,
    stage: safeStageExport(current),
    limitations: ["Presentation-safe normalized fields only; unrestricted Runtime payloads are omitted."],
  } : null;
  const sourceUnavailable = sourceState === "unavailable" && !sessions.length;

  return <div className="operational-replay">
    <section className="nx-workspace-hero"><div><span className="nx-eyebrow">Operational Replay</span><h2>Watch NEXUS build operational understanding.</h2><p>Every stage comes from the authenticated, tenant-bound Runtime contract. Replay remains passive: it explains recorded work and never re-executes it.</p></div><div className="replay-live"><StatusPill value={detailState === "available" && live ? "live" : detailState} /><button className="nx-action" onClick={() => { setPlaying(false); setLive(true); setSelectedStage(Math.max(0, visibleStages.length - 1)); }} disabled={!visibleStages.length}><Radio size={14} />Live</button></div></section>
    {notice && <section className="operation-error" role="alert"><AlertTriangle size={18} />{notice}</section>}
    {sourceUnavailable && <section className="operation-error" role="status"><AlertTriangle size={18} />Authenticated Runtime Replay is unavailable. NEXUS has not synthesized replacement data.</section>}
    <section className="replay-source-health" aria-label="Replay source availability"><span>Authenticated Runtime <StatusPill value={sourceState} /></span><span>Replay detail <StatusPill value={detailState} /></span><span>Failure records · {failureRecords.length} <StatusPill value={failureState} /></span></section>
    <section className="replay-runbar"><label><span>Replay source</span><select value={selectedReplayId} onChange={(event) => setSelectedReplayId(event.target.value)} disabled={!sessions.length}><option value="">{sessions.length ? "Select replay source" : "No Runtime Replay available"}</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.label} · {session.status}</option>)}</select></label><article><Waypoints size={14} /><span>Stages</span><strong>{stages.length}</strong></article><article><Eye size={14} /><span>Observations</span><strong>{observationCount}</strong></article><article><ShieldCheck size={14} /><span>Evidence</span><strong>{evidenceCount}</strong></article><article><Gauge size={14} /><span>Representations</span><strong>{representationCount}</strong></article><article><FileCheck2 size={14} /><span>Receipts</span><strong>{receiptCount}</strong></article><button onClick={() => { void refreshList(); if (selectedReplayId) void loadReplay(selectedReplayId); }}><RefreshCw size={14} />Refresh</button><button onClick={exportReplay} disabled={!current}><Download size={14} />Export</button></section>
    <p className="replay-source-boundary"><strong>Canonical direct Replay</strong> · tenant and workspace are resolved by the authenticated Experience Gateway. No local-only Replay fallback is used.</p>
    <section className="replay-pipeline" aria-label="Replay pipeline visualization">{stages.map((stage, index) => <button key={`${stage.id}-${index}`} data-status={stage.status} data-active={!failureOnly && current?.id === stage.id} onClick={() => { setFailureOnly(false); chooseStage(index); }}>{complete(stage.status) ? <CheckCircle2 size={15} /> : failed(stage.status) ? <AlertTriangle size={15} /> : <Circle size={15} />}<span>{String(index + 1).padStart(2, "0")} · {stage.label}</span><small>{stage.status}</small></button>)}</section>
    <div className="replay-toolbar"><div><button data-active={mode === "watch"} onClick={() => setMode("watch")}>Executive Mode</button><button data-active={mode === "inspect"} onClick={() => setMode("inspect")}><CircleHelp size={14} />Inspect</button><button data-active={mode === "engineering"} onClick={() => setMode("engineering")}><TerminalSquare size={14} />Engineering Mode</button><button data-active={failureOnly} onClick={() => setFailureOnly((value) => !value)}><AlertTriangle size={14} />Failure Replay</button></div><div><button onClick={() => chooseStage(Math.max(0, currentIndex - 1))} aria-label="Previous replay stage" disabled={!current || currentIndex === 0}><ChevronLeft size={15} /></button><button onClick={() => { setLive(false); if (!playing && currentIndex >= visibleStages.length - 1) setSelectedStage(0); setPlaying((value) => !value); }} aria-label={playing ? "Pause replay" : "Play replay"} disabled={visibleStages.length < 2}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><button onClick={() => chooseStage(Math.min(Math.max(0, visibleStages.length - 1), currentIndex + 1))} aria-label="Next replay stage" disabled={!current || currentIndex >= visibleStages.length - 1}><ChevronRight size={15} /></button></div></div>
    {current ? <section className="replay-inspector">
      <div className="replay-stage"><span className="nx-eyebrow">Stage Inspector · {String(currentIndex + 1).padStart(2, "0")}</span><h2>{current.label}</h2><StatusPill value={current.status} />{current.failure && <section className="replay-failure"><AlertTriangle size={17} /><div><strong>{current.failure.type}</strong><p>{current.failure.reason}</p><span>Last success: {current.failure.lastSuccessfulStage} · Restart: {current.failure.restartPoint}</span></div></section>}{mode === "watch" && <><span className="replay-section-label">What changed</span><h3>{current.whatChanged}</h3><p>{current.whyChanged}</p><div className="replay-state-metrics"><div><strong>{current.inputs.length}</strong><span>Inputs</span></div><div><strong>{current.evidence.length}</strong><span>Evidence</span></div><div><strong>{current.outputs.length}</strong><span>Outputs</span></div><div><strong>{current.artifacts.length}</strong><span>Artifacts</span></div></div></>}{mode === "inspect" && <div className="replay-inspection-grid"><section><span>Inputs</span><ObjectList values={current.inputs} empty="No input objects were recorded at this boundary." /></section><section><span>Outputs</span><ObjectList values={current.outputs} empty="No output objects were recorded at this boundary." /></section><section><span>Evidence lineage</span><ReferenceList values={current.evidence} empty="No Evidence participated in this available record." /></section><section><span>Artifacts</span><ReferenceList values={current.artifacts} empty="No generated artifacts were recorded." /></section></div>}{mode === "engineering" && <div className="replay-engineering"><header><Braces size={15} /><span>Normalized Runtime record</span></header><pre>{JSON.stringify(engineeringView, null, 2)}</pre></div>}<dl><div><dt>Source classification</dt><dd>{current.source}</dd></div><div><dt>Occurred</dt><dd>{current.occurredAt || "Runtime timestamp unavailable"}</dd></div><div><dt>Stage ID</dt><dd>{current.id}</dd></div></dl></div>
      <aside><header className="replay-explain-header"><CircleHelp size={17} /><div><span className="nx-eyebrow">Explain This Step</span><h3>Why NEXUS can say this</h3></div></header><button className="replay-explain-action" onClick={() => void explainCurrentStage()} disabled={explainState === "loading"}>{explainState === "loading" ? "Requesting Runtime explanation…" : "Explain This Step"}</button>{explainState === "available" && <p className="replay-explanation">{explanation}</p>}{explainState === "unavailable" && <p className="replay-explanation replay-explanation--unavailable">Runtime supplied no explanation for this stage.</p>}<dl className="replay-explain-list"><div><dt>Evidence</dt><dd><ReferenceList values={current.evidence} empty="No Evidence reference is attached." /></dd></div><div><dt>Governance</dt><dd><ReferenceList values={current.policies} empty="No policy reference is attached." /></dd></div><div><dt>Confidence</dt><dd><strong>{current.confidenceStatus}</strong><p>{current.confidenceExplanation}</p></dd></div><div><dt>Decision</dt><dd><ReferenceList values={current.decisions} empty="No Decision reference is attached." /></dd></div></dl></aside>
    </section> : <section className="conclave-empty"><Circle size={24} /><div><strong>No replay stage is available.</strong><p>Select an authenticated Runtime Replay, wait for its ordered events, or disable Failure Replay.</p></div></section>}
    <footer className="replay-controls"><div><button onClick={() => { setLive(false); setPlaying(false); setSelectedStage(0); }} aria-label="Restart replay"><RotateCcw size={14} /><span>Restart</span></button><button onClick={() => chooseStage(Math.max(0, currentIndex - 1))} disabled={!current || currentIndex === 0} aria-label="Previous stage"><ChevronLeft size={14} /><span>Previous</span></button><button onClick={() => setPlaying((value) => !value)} disabled={visibleStages.length < 2} aria-label={playing ? "Pause replay" : "Play replay"}>{playing ? <><Pause size={14} /><span>Pause</span></> : <><Play size={14} /><span>Play</span></>}</button><button onClick={() => chooseStage(Math.min(Math.max(0, visibleStages.length - 1), currentIndex + 1))} disabled={!current || currentIndex >= visibleStages.length - 1} aria-label="Next stage"><span>Next</span><ChevronRight size={14} /></button><label><FastForward size={14} />Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value) as Speed)}>{SPEEDS.map((item) => <option key={item} value={item}>{item}×</option>)}</select></label></div><span><ScrollText size={14} />Replay is a passive projection of recorded Runtime data. It does not re-execute work.</span></footer>
  </div>;
}
