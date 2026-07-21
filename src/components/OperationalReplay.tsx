import { useCallback, useEffect, useMemo, useState } from "react";
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
type ReplayStage = {
  id: string;
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
  inputs: unknown[];
  outputs: unknown[];
  artifacts: string[];
  failure: RuntimeRecord | null;
  raw: RuntimeRecord;
};
type RuntimeReplayProjection = {
  run_id: string;
  status: string;
  content_digest?: string;
  source?: RuntimeRecord;
  metrics?: { stage_count?: number; observation_count?: number; evidence_count?: number; representation_count?: number; receipt_count?: number };
  stages: RuntimeRecord[];
};

const SPEEDS = [{ label: "1×", milliseconds: 2_800 }, { label: "1.5×", milliseconds: 1_850 }, { label: "2×", milliseconds: 1_100 }];
const object = (value: unknown): RuntimeRecord => value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeRecord : {};
const rows = (value: unknown, names: string[]) => {
  const source = object(value);
  for (const name of names) if (Array.isArray(source[name])) return source[name] as RuntimeRecord[];
  return [] as RuntimeRecord[];
};
const text = (value: unknown, fallback = "Unavailable") => typeof value === "string" && value.trim() ? value : fallback;
const strings = (value: unknown) => Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : text(object(item).id ?? object(item).proofId ?? object(item).receiptId, "")).filter(Boolean) : [];
const records = (value: unknown) => Array.isArray(value) ? value : [];
const failed = (status: string) => ["failed", "blocked", "error"].some((value) => status.toLowerCase().includes(value));
const complete = (status: string) => ["complete", "completed", "success", "verified", "recorded"].includes(status.toLowerCase());

function runtimeProjection(value: unknown): RuntimeReplayProjection | null {
  const candidate = object(value);
  if (typeof candidate.run_id !== "string" || !Array.isArray(candidate.stages)) return null;
  return candidate as unknown as RuntimeReplayProjection;
}

function replayStage(raw: RuntimeRecord, defaults: Pick<ReplayStage, "id" | "label" | "status" | "occurredAt" | "meaning">): ReplayStage {
  const explainability = object(raw.explainability);
  const confidence = object(explainability.confidence ?? raw.confidence);
  const state = object(raw.current_operational_state ?? raw.currentOperationalState);
  const evidence = strings(explainability.evidence_refs ?? raw.evidenceRefs ?? raw.evidence_refs);
  const directEvidence = [text(raw.proofId ?? raw.proof_id, ""), text(raw.receiptId ?? raw.receipt_id ?? raw.executionReceiptId, "")].filter(Boolean);
  const failure = Object.keys(object(raw.failure)).length ? object(raw.failure) : failed(defaults.status) ? object({ reason: raw.reason ?? raw.honestNarration }) : null;
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
    inputs: records(raw.input_objects ?? raw.inputObjects ?? state.observations),
    outputs: records(raw.output_objects ?? raw.outputObjects ?? state.representations),
    artifacts: strings(raw.generated_artifacts ?? raw.generatedArtifacts),
    failure,
    raw,
  };
}

function stagesFor(mission: RuntimeRecord | null, proofs: RuntimeRecord[], receipts: RuntimeRecord[]): ReplayStage[] {
  if (!mission) return [];
  const id = text(mission.missionId ?? mission.id, "mission");
  const taskSteps = Array.isArray(mission.steps) ? mission.steps as RuntimeRecord[] : [];
  const pipeline: ReplayStage[] = [replayStage(mission, {
    id: `${id}-admitted`,
    label: "Admitted",
    status: "complete",
    occurredAt: text(mission.createdAt ?? mission.plannedAt, ""),
    meaning: "The Runtime admitted an objective into a governed mission workspace.",
  })];
  taskSteps.forEach((step, index) => pipeline.push(replayStage(step, {
    id: text(step.stepId ?? step.id, `${id}-step-${index + 1}`),
    label: text(step.title ?? step.action, `Task ${index + 1}`),
    status: text(step.status ?? step.capabilityStatus, "planned"),
    occurredAt: text(step.completedAt ?? step.updatedAt, ""),
    meaning: text(step.honestNarration ?? step.reason, "This stage records a bounded unit of mission work."),
  })));
  proofs.filter((proof) => text(proof.missionId, "") === id).forEach((proof, index) => pipeline.push(replayStage(proof, {
    id: text(proof.proofId ?? proof.id, `${id}-proof-${index}`),
    label: "Verification",
    status: text(proof.status ?? proof.verificationStatus, "recorded"),
    occurredAt: text(proof.createdAt, ""),
    meaning: text(proof.honestNarration, "Runtime proof was recorded for this mission."),
  })));
  receipts.filter((receipt) => text(receipt.missionId, "") === id).forEach((receipt, index) => pipeline.push(replayStage(receipt, {
    id: text(receipt.executionReceiptId ?? receipt.receiptId, `${id}-receipt-${index}`),
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

function ReferenceList({ values, empty }: { values: string[]; empty: string }) {
  return values.length ? <div className="replay-references">{values.map((value) => <code key={value} title={value}>{value}</code>)}</div> : <p className="replay-empty-reference">{empty}</p>;
}

function ObjectList({ values, empty }: { values: unknown[]; empty: string }) {
  return values.length ? <div className="replay-objects">{values.map((value, index) => { const item = object(value); const identity = text(item.observation_id ?? item.evidence_id ?? item.representation_id ?? item.receipt_id ?? item.id, `record ${index + 1}`); return <article key={`${identity}-${index}`}><span>{text(item.type ?? item.representation_type, "constitutional object").replaceAll("_", " ")}</span><code>{identity}</code></article>; })}</div> : <p className="replay-empty-reference">{empty}</p>;
}

export function OperationalReplay({ requestedMissionId }: { requestedMissionId?: string }) {
  const [projection, setProjection] = useState<RuntimeReplayProjection | null>(null);
  const [missions, setMissions] = useState<RuntimeRecord[]>([]);
  const [proofs, setProofs] = useState<RuntimeRecord[]>([]);
  const [receipts, setReceipts] = useState<RuntimeRecord[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState(requestedMissionId ?? "");
  const [selectedStage, setSelectedStage] = useState(0);
  const [mode, setMode] = useState<ReplayMode>("watch");
  const [live, setLive] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [failureOnly, setFailureOnly] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[0].milliseconds);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    let replayAvailable = false;
    try {
      const response = await fetch("/api/replay/replay.json", { cache: "no-store", headers: { Accept: "application/json" } });
      if (response.ok) {
        const nextProjection = runtimeProjection(await response.json());
        if (nextProjection) { setProjection(nextProjection); replayAvailable = true; }
      }
    } catch { /* the mission-record projection below remains available */ }
    try {
      const [missionResult, proofResult, receiptResult] = await Promise.all([localNexusClient.missions(), localNexusClient.proofs(), localNexusClient.receipts()]);
      const nextMissions = rows(missionResult, ["missions"]);
      setMissions(nextMissions);
      setProofs(rows(proofResult, ["proofs"]));
      setReceipts(rows(receiptResult, ["receipts"]));
      setSelectedMissionId((current) => current || requestedMissionId || text(nextMissions[0]?.missionId ?? nextMissions[0]?.id, ""));
      setError("");
    } catch (caught) {
      if (!replayAvailable) setError(caught instanceof Error ? caught.message : "Replay records are unavailable.");
    }
  }, [requestedMissionId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!("EventSource" in window)) return;
    const stream = new EventSource("/api/replay/events");
    const update = (event: Event) => {
      try { const next = runtimeProjection(JSON.parse((event as MessageEvent<string>).data)); if (next) { setProjection(next); setError(""); } }
      catch { /* invalid projections never replace verified state */ }
    };
    stream.addEventListener("replay", update);
    stream.addEventListener("error", () => stream.close(), { once: true });
    return () => stream.close();
  }, []);
  useEffect(() => { if (!live) return; const timer = window.setInterval(() => void refresh(), 5_000); return () => window.clearInterval(timer); }, [live, refresh]);
  const selectedMission = missions.find((mission) => text(mission.missionId ?? mission.id, "") === selectedMissionId) ?? missions[0] ?? null;
  const allStages = useMemo(() => projection ? stagesFromProjection(projection) : stagesFor(selectedMission, proofs, receipts), [projection, selectedMission, proofs, receipts]);
  const stages = failureOnly ? allStages.filter((stage) => failed(stage.status)) : allStages;
  useEffect(() => { setSelectedStage(0); }, [selectedMissionId, failureOnly]);
  useEffect(() => {
    if (!playing || stages.length < 2) return;
    const timer = window.setTimeout(() => setSelectedStage((value) => {
      if (value >= stages.length - 1) { setPlaying(false); return value; }
      return value + 1;
    }), speed);
    return () => window.clearTimeout(timer);
  }, [playing, selectedStage, speed, stages.length]);
  useEffect(() => { if (live && stages.length) setSelectedStage(stages.length - 1); }, [live, stages.length]);
  const currentIndex = Math.min(selectedStage, Math.max(stages.length - 1, 0));
  const current = stages[currentIndex];
  const evidenceCount = projection?.metrics?.evidence_count ?? new Set(allStages.flatMap((stage) => stage.evidence)).size;
  const observationCount = projection?.metrics?.observation_count ?? allStages.reduce((total, stage) => total + stage.inputs.length, 0);
  const representationCount = projection?.metrics?.representation_count ?? allStages.reduce((total, stage) => total + stage.outputs.length, 0);
  const receiptCount = projection?.metrics?.receipt_count ?? allStages.filter((stage) => stage.label === "Receipt").length;

  function chooseStage(index: number) {
    setPlaying(false);
    setLive(false);
    setSelectedStage(index);
  }

  function exportReplay() {
    if (projection) {
      const link = document.createElement("a");
      link.href = "/api/replay/export/replay.json";
      link.download = `nexus-replay-${projection.run_id}.json`;
      link.click();
      return;
    }
    const payload = {
      recordType: "nexus_operational_replay_export",
      exportedAt: new Date().toISOString(),
      mission: selectedMission,
      stages: allStages,
      source: "same_origin_mission_record_projection",
      limitations: ["This export is a passive projection of currently available Runtime mission, proof, and receipt records. It does not re-execute work."],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `nexus-replay-${selectedMissionId || "unselected"}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <div className="operational-replay">
    <section className="nx-workspace-hero"><div><span className="nx-eyebrow">Operational Replay</span><h1>Watch NEXUS build operational understanding.</h1><p>{projection ? "One live, evidence-linked projection from the Runtime event stream. Pause anywhere to inspect what changed, why, and which proof supports it." : "A mission-scoped projection from the Runtime records currently available through the Experience Gateway. Missing lineage remains explicitly unrecorded."}</p></div><div className="replay-live"><StatusPill value={projection ? "runtime event stream" : live ? "following records" : "paused"} /><button className="nx-action" onClick={() => { setPlaying(false); setLive(true); setSelectedStage(Math.max(0, stages.length - 1)); }}><Radio size={14} />Live</button></div></section>
    {error && <section className="operation-error" role="alert"><AlertTriangle size={18} />{error}</section>}
    <section className="replay-runbar"><label><span>{projection ? "Runtime replay run" : "Mission stream"}</span>{projection ? <select value={projection.run_id} disabled><option>{projection.run_id}</option></select> : <select value={selectedMissionId} onChange={(event) => setSelectedMissionId(event.target.value)}>{missions.map((mission) => <option key={text(mission.missionId ?? mission.id)} value={text(mission.missionId ?? mission.id)}>{text(mission.userObjective ?? mission.objective ?? mission.title, "Mission")}</option>)}</select>}</label><article><Waypoints size={14} /><span>Events</span><strong>{allStages.length}</strong></article><article><Eye size={14} /><span>Observations</span><strong>{observationCount}</strong></article><article><ShieldCheck size={14} /><span>Evidence</span><strong>{evidenceCount}</strong></article><article><Gauge size={14} /><span>Representations</span><strong>{representationCount}</strong></article><article><FileCheck2 size={14} /><span>Receipts</span><strong>{receiptCount}</strong></article><button onClick={() => void refresh()}><RefreshCw size={14} />Refresh</button><button onClick={exportReplay}><Download size={14} />Export</button></section>
    <section className="replay-pipeline" aria-label="Replay pipeline visualization">{allStages.map((stage, index) => <button key={stage.id} data-status={stage.status} data-active={current?.id === stage.id} onClick={() => { setFailureOnly(false); chooseStage(index); }}>{complete(stage.status) ? <CheckCircle2 size={15} /> : failed(stage.status) ? <AlertTriangle size={15} /> : <Circle size={15} />}<span>{String(index + 1).padStart(2, "0")} · {stage.label}</span><small>{stage.status}</small></button>)}</section>
    <div className="replay-toolbar"><div><button data-active={mode === "watch"} onClick={() => setMode("watch")}>Executive Mode</button><button data-active={mode === "inspect"} onClick={() => setMode("inspect")}><CircleHelp size={14} />Inspect</button><button data-active={mode === "engineering"} onClick={() => setMode("engineering")}><TerminalSquare size={14} />Engineering Mode</button><button data-active={failureOnly} onClick={() => setFailureOnly((value) => !value)}><AlertTriangle size={14} />Failure Replay</button></div><div><button onClick={() => chooseStage(Math.max(0, currentIndex - 1))}><ChevronLeft size={15} /></button><button onClick={() => { setLive(false); if (!playing && currentIndex >= stages.length - 1) setSelectedStage(0); setPlaying((value) => !value); }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><button onClick={() => chooseStage(Math.min(Math.max(0, stages.length - 1), currentIndex + 1))}><ChevronRight size={15} /></button></div></div>
    {current ? <section className="replay-inspector">
      <div className="replay-stage"><span className="nx-eyebrow">Stage Inspector · {String(currentIndex + 1).padStart(2, "0")}</span><h2>{current.label}</h2><StatusPill value={current.status} />{current.failure && <section className="replay-failure"><AlertTriangle size={17} /><div><strong>{text(current.failure.error_type ?? current.failure.errorType, "Operational evolution stopped")}</strong><p>{text(current.failure.reason, "No failure explanation was recorded.")}</p><span>Last success: {text(current.failure.last_successful_stage ?? current.failure.lastSuccessfulStage, "none recorded")} · Restart: {text(current.failure.restart_point ?? current.failure.restartPoint, "none recorded")}</span></div></section>}{mode === "watch" && <><span className="replay-section-label">What changed</span><h3>{current.whatChanged}</h3><p>{current.whyChanged}</p><div className="replay-state-metrics"><div><strong>{current.inputs.length}</strong><span>Inputs</span></div><div><strong>{current.evidence.length}</strong><span>Evidence</span></div><div><strong>{current.outputs.length}</strong><span>Outputs</span></div><div><strong>{current.artifacts.length}</strong><span>Artifacts</span></div></div></>}{mode === "inspect" && <div className="replay-inspection-grid"><section><span>Inputs</span><ObjectList values={current.inputs} empty="No input objects were recorded at this boundary." /></section><section><span>Outputs</span><ObjectList values={current.outputs} empty="No output objects were recorded at this boundary." /></section><section><span>Evidence lineage</span><ReferenceList values={current.evidence} empty="No Evidence participated in this available record." /></section><section><span>Artifacts</span><ReferenceList values={current.artifacts} empty="No generated artifacts were recorded." /></section></div>}{mode === "engineering" && <div className="replay-engineering"><header><Braces size={15} /><span>Available Runtime record</span></header><pre>{JSON.stringify({ stage: current, run_id: projection?.run_id, content_digest: projection?.content_digest, source: projection?.source ?? "same_origin_mission_record_projection" }, null, 2)}</pre></div>}<dl><div><dt>Source classification</dt><dd>{current.source}</dd></div><div><dt>Occurred</dt><dd>{current.occurredAt || "Runtime timestamp unavailable"}</dd></div><div><dt>Stage ID</dt><dd>{current.id}</dd></div></dl></div>
      <aside><header className="replay-explain-header"><CircleHelp size={17} /><div><span className="nx-eyebrow">Explain This Step</span><h3>Why NEXUS can say this</h3></div></header><dl className="replay-explain-list"><div><dt>Evidence</dt><dd><ReferenceList values={current.evidence} empty="No Evidence reference is attached." /></dd></div><div><dt>Governance</dt><dd><ReferenceList values={current.policies} empty="No policy reference is attached." /></dd></div><div><dt>Confidence</dt><dd><strong>{current.confidenceStatus}</strong><p>{current.confidenceExplanation}</p></dd></div><div><dt>Decision</dt><dd><ReferenceList values={current.decisions} empty="No Decision reference is attached." /></dd></div></dl></aside>
    </section> : <section className="conclave-empty"><Circle size={24} /><div><strong>No replay stage is available.</strong><p>Select a mission with Runtime records or disable Failure Replay.</p></div></section>}
    <footer className="replay-controls"><div><button onClick={() => { setLive(false); setPlaying(false); setSelectedStage(0); }} aria-label="Restart replay"><RotateCcw size={14} /></button><label>Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{SPEEDS.map((item) => <option key={item.milliseconds} value={item.milliseconds}>{item.label}</option>)}</select></label></div><span><ScrollText size={14} />Replay is a passive projection of recorded Runtime data. It does not re-execute work.</span></footer>
  </div>;
}
