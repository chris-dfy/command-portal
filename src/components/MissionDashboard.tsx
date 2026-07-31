import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  Circle,
  CircleGauge,
  FileCheck2,
  Link2,
  LockKeyhole,
  Network,
  Play,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { localNexusClient, operationalSessionClient, type OperationalSession } from "../lib/local-client";
import { canonicalHostedControlAvailability } from "../lib/hosted-capability-gate";
import type { CapabilityRegistryProjection } from "../lib/types";
import { NexusButton, NexusMetric } from "../design-system/NexusPrimitives";
import { nexusModuleById } from "../platform/surfaceRegistry";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { OperationalResultLineage, type OpenOperationalReplay } from "./OperationalResultLineage";
import { StatusPill } from "./StatusPill";

type RuntimeRecord = Record<string, unknown>;
type LoadState = "loading" | "ready" | "empty" | "unavailable";
type MissionStepState = "complete" | "active" | "ready" | "staged" | "blocked" | "unavailable" | "planned";

const object = (value: unknown): RuntimeRecord => value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeRecord : {};
const rows = (value: unknown, names: string[]) => {
  if (Array.isArray(value)) return value as RuntimeRecord[];
  const source = object(value);
  for (const name of names) if (Array.isArray(source[name])) return source[name] as RuntimeRecord[];
  return [] as RuntimeRecord[];
};
const text = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
};
const list = (value: unknown) => Array.isArray(value) ? value.map((item) => text(item, "")).filter(Boolean) : [];
const nestedRecord = (value: unknown, names: string[]) => {
  const source = object(value);
  for (const name of names) {
    const nested = object(source[name]);
    if (Object.keys(nested).length) return nested;
  }
  return source;
};
const missionId = (mission: RuntimeRecord) => text(mission.missionId ?? mission.mission_id ?? mission.id, "mission-unavailable");
const statusOf = (mission: RuntimeRecord) => text(mission.status, "planned");
const receiptId = (receipt: RuntimeRecord) => text(receipt.executionReceiptId ?? receipt.receiptId ?? receipt.id, "");
const statusValue = (value: unknown) => text(value, "").toLowerCase();
const finished = (value: unknown) => ["complete", "completed", "success", "verified", "recorded"].includes(statusValue(value));
const restricted = (value: unknown) => ["blocked", "waiting_for_approval", "approval_required", "failed", "error"].includes(statusValue(value));

function stepReceiptIds(step: RuntimeRecord) {
  return [...new Set([
    ...list(step.receiptLinks ?? step.receipt_links),
    text(step.executionReceiptId ?? step.execution_receipt_id ?? step.receiptId ?? step.receipt_id, ""),
  ].filter(Boolean))];
}

function stepCompleted(step: RuntimeRecord) {
  const status = statusValue(step.status);
  const lastExecutionStatus = statusValue(step.lastExecutionStatus ?? step.last_execution_status);
  const hasReceipt = stepReceiptIds(step).length > 0;
  if (["verified", "recorded"].includes(status)) return true;
  if (finished(status) && step.executableLocal !== true && step.executable !== true) return true;
  const successful = ["complete", "completed", "success", "approved_for_local_execution", "executed"];
  return hasReceipt && (successful.includes(status) || successful.includes(lastExecutionStatus));
}

function stepState(step: RuntimeRecord): MissionStepState {
  const status = statusValue(step.status) || statusValue(step.capabilityStatus ?? step.capability_status) || "planned";
  const lastExecutionStatus = statusValue(step.lastExecutionStatus ?? step.last_execution_status);
  if (stepCompleted(step)) return "complete";
  if (step.blocked || restricted(status) || restricted(lastExecutionStatus)) return "blocked";
  if (step.unavailable || status.includes("unavailable") || status.includes("missing")) return "unavailable";
  if (["active", "in_progress", "running", "executing"].includes(status)) return "active";
  if (step.executableLocal === true || step.executable === true || status === "ready" || status === "live") return "ready";
  if (status === "staged" || status.includes("approval")) return "staged";
  return "planned";
}

function missionHasConstraints(mission: RuntimeRecord) {
  return Array.isArray(mission.steps)
    && (mission.steps as RuntimeRecord[]).some((step) => ["blocked", "unavailable"].includes(stepState(step)));
}

function executiveSummary(mission: RuntimeRecord) {
  const summary = object(mission.executiveSummary ?? mission.executive_summary);
  const understanding = list(summary.current_understanding ?? summary.currentUnderstanding);
  return text(
    summary.knowledge_summary ?? summary.knowledgeSummary,
    understanding.join(" ") || text(mission.honestNarration ?? mission.suggestedNextAction, "Runtime has not supplied an executive summary for this mission."),
  );
}

function missionHasReceipt(mission: RuntimeRecord) {
  return Object.keys(object(mission.completionReceipt ?? mission.completion_receipt)).length > 0
    || Boolean(text(mission.completion_receipt_path, ""));
}

const stepIcons = { complete: Check, active: Activity, ready: Play, staged: Radio, blocked: LockKeyhole, unavailable: TriangleAlert, planned: Circle };
const missionStepExecutionModule = nexusModuleById("missions.step-execution");
const missionStepExecutionAvailable = missionStepExecutionModule?.clients.web.state === "functional";
const missionStepExecutionReason = missionStepExecutionModule?.clients.web.reason
  ?? "Mission step execution has no verified canonical module contract.";

export function MissionDashboard({
  onReplay,
  readiness = null,
  session = { authenticated: false },
  capabilityRegistry = null,
}: {
  onReplay?: OpenOperationalReplay;
  readiness?: RuntimeRecord | null;
  session?: OperationalSession;
  capabilityRegistry?: CapabilityRegistryProjection | null;
} = {}) {
  const hosted = operationalSessionClient.mode() === "hosted";
  const [missions, setMissions] = useState<RuntimeRecord[]>([]);
  const [receipts, setReceipts] = useState<RuntimeRecord[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<RuntimeRecord | null>(null);
  const [selectedReplay, setSelectedReplay] = useState<RuntimeRecord | null>(null);
  const [missionState, setMissionState] = useState<LoadState>("loading");
  const [receiptState, setReceiptState] = useState<LoadState>("loading");
  const [objective, setObjective] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const missionResult = await localNexusClient.missions();
      const nextMissions = rows(missionResult, ["missions"]);
      setMissions(nextMissions);
      setMissionState(nextMissions.length ? "ready" : "empty");
      setSelected((current) => current && nextMissions.some((mission) => missionId(mission) === current)
        ? current
        : nextMissions[0] ? missionId(nextMissions[0]) : null);
    } catch (caught) {
      setMissions([]);
      setMissionState("unavailable");
      setSelected(null);
      setError(caught instanceof Error ? caught.message : "Mission Runtime is unavailable.");
    }
    setBusy(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!selected) {
      setSelectedDetail(null);
      setSelectedReplay(null);
      setReceipts([]);
      setReceiptState("empty");
      return;
    }
    let cancelled = false;
    setSelectedDetail(null);
    setSelectedReplay(null);
    setReceiptState("loading");
    void Promise.allSettled([
      localNexusClient.mission(selected),
      localNexusClient.missionReceipts(selected),
      localNexusClient.operationalReplayForMission(selected),
    ]).then(([detailResult, receiptResult, replayResult]) => {
      if (cancelled) return;
      const failures: string[] = [];
      if (detailResult.status === "fulfilled") setSelectedDetail(nestedRecord(detailResult.value, ["mission"]));
      else {
        setSelectedDetail(null);
        failures.push(detailResult.reason instanceof Error ? detailResult.reason.message : "Mission detail is unavailable.");
      }
      if (receiptResult.status === "fulfilled") {
        const nextReceipts = rows(receiptResult.value, ["receipts"]);
        setReceipts(nextReceipts);
        setReceiptState(nextReceipts.length ? "ready" : "empty");
      } else {
        setReceipts([]);
        setReceiptState("unavailable");
        failures.push(receiptResult.reason instanceof Error ? receiptResult.reason.message : "Mission receipts are unavailable.");
      }
      if (replayResult.status === "fulfilled") setSelectedReplay(nestedRecord(replayResult.value, ["replay"]));
      else {
        setSelectedReplay(null);
        failures.push(replayResult.reason instanceof Error ? replayResult.reason.message : "Mission Replay is unavailable.");
      }
      if (failures.length) setError([...new Set(failures)].join(" "));
    });
    return () => { cancelled = true; };
  }, [selected]);

  async function plan() {
    const submittedObjective = objective.trim();
    if (!submittedObjective) return;
    if (hosted && !missionCreationAllowed) {
      setError(missionCreationReason);
      return;
    }
    setObjective("");
    setBusy(true);
    setError("");
    try {
      await localNexusClient.planMission(submittedObjective);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mission planning failed safely.");
      setBusy(false);
    }
  }

  async function execute(id: string, stepId: string) {
    if (!missionStepExecutionAvailable) {
      setError(missionStepExecutionReason);
      return;
    }
    if (hosted && !missionStepAllowed) {
      setError(missionStepExecutionBlockedReason);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await localNexusClient.executeMissionStep(id, stepId);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mission step was blocked or unavailable.");
      setBusy(false);
    }
  }

  const completed = missions.filter((mission) => finished(statusOf(mission)));
  const blocked = missions.filter((mission) => !finished(statusOf(mission)) && (restricted(statusOf(mission)) || missionHasConstraints(mission)));
  const active = missions.filter((mission) => !finished(statusOf(mission)) && !blocked.includes(mission));
  const receiptBackedCompleted = completed.filter(missionHasReceipt);
  const selectedMission = selectedDetail ?? missions.find((mission) => missionId(mission) === selected) ?? missions[0] ?? null;
  const steps = selectedMission && Array.isArray(selectedMission.steps) ? selectedMission.steps as RuntimeRecord[] : [];
  const specialists = selectedMission && Array.isArray(selectedMission.specialists) ? selectedMission.specialists as RuntimeRecord[] : [];
  const selectedReceipts = selectedMission ? receipts : [];
  const selectedComplete = selectedMission ? finished(statusOf(selectedMission)) : false;
  const progress = steps.length ? Math.round(steps.filter(stepCompleted).length / steps.length * 100) : selectedComplete ? 100 : 0;
  const health = missionState === "loading" ? "loading" : missionState === "unavailable" ? "unavailable" : blocked.length ? "attention" : active.length ? "operational" : completed.length ? "stable" : "waiting";
  const blockers = steps.filter((step) => ["blocked", "unavailable"].includes(stepState(step)));
  const requirements = selectedMission ? list(selectedMission.requiredCapabilities ?? selectedMission.required_capabilities) : [];
  const explicitlyReversible = steps.filter((step) => step.reversible === true).length;
  const reversibilityUnspecified = steps.filter((step) => typeof step.reversible !== "boolean").length;
  const latestReceipt = selectedReceipts[0];
  const latestReceiptId = latestReceipt ? receiptId(latestReceipt) : "";
  const replayId = selectedReplay
    ? text(selectedReplay.replayId ?? selectedReplay.runId ?? selectedReplay.run_id ?? selectedReplay.id, "")
    : text(object(selectedMission?.replay).replayId ?? selectedMission?.replay_run_id, "");
  const metric = (value: number) => missionState === "loading" || missionState === "unavailable" ? "—" : value;
  const readinessCapabilities = rows(readiness, ["capabilities", "items", "records"]);
  const missionCapability = readinessCapabilities.find((item) => (
    text(item.capabilityId ?? item.capability_id ?? item.id, "") === "mission_executor"
  ));
  const missionCapabilityState = statusValue(missionCapability?.state ?? missionCapability?.status);
  const missionCapabilityAvailable = missionCapability?.available === true
    || missionCapabilityState === "available";
  const missionReadinessNote = missionCapabilityAvailable
    ? "Aggregate Mission readiness reports available."
    : `Aggregate Mission readiness is ${missionCapabilityState || "unknown"}; each control still follows its exact canonical action record.`;
  const hostedMissionScope = session.authenticated && session.scopes?.includes("operations:write") === true;
  const hostedActionAccess = {
    hosted,
    authenticated: session.authenticated,
    scopes: session.scopes,
  };
  const missionPlanAction = canonicalHostedControlAvailability(
    capabilityRegistry,
    {
      capabilityId: "mission_executor",
      method: "POST",
      pathTemplate: "/missions/plan",
    },
    hostedActionAccess,
    "operations:write",
  );
  const missionStepAction = canonicalHostedControlAvailability(
    capabilityRegistry,
    {
      capabilityId: "mission_executor",
      method: "POST",
      pathTemplate: "/missions/{mission_id}/execute-step",
    },
    hostedActionAccess,
    "operations:write",
  );
  const missionCreationAllowed = missionPlanAction.available;
  const missionStepAllowed = missionStepExecutionAvailable
    && missionStepAction.available;
  const missionStepExecutionBlockedReason = !missionStepExecutionAvailable
    ? missionStepExecutionReason
    : !missionStepAction.available
      ? missionStepAction.reason
      : "The exact Runtime Mission step contract is available subject to per-action policy and Authority.";
  const executableCount = useMemo(
    () => missionStepAllowed
      ? missions.flatMap((mission) => Array.isArray(mission.steps) ? mission.steps as RuntimeRecord[] : []).filter((step) => stepState(step) === "ready").length
      : 0,
    [missionStepAllowed, missions],
  );
  const missionCreationReason = !hosted
    ? "Local mission planning remains bounded by the local Runtime contract."
    : !missionPlanAction.available
      ? missionPlanAction.reason
      : "The exact Runtime Mission contract remains subject to capability admission, policy, Authority, proof, receipt, and postcondition controls.";

  return <div className="mission-dashboard">
    <section className="nx-workspace-hero"><div><span className="nx-eyebrow">Mission Dashboard</span><h2>Coordinate governed work across independent mission streams.</h2><p>Each mission retains its own objective, task graph, specialist context, replay stream, receipts, and verification boundary.</p></div><NexusButton className="nx-action" size="sm" onClick={() => void refresh()} loading={busy}><RefreshCw size={15} />Refresh</NexusButton></section>
    <section className="nx-metrics">
      <NexusMetric label="Active Missions" value={metric(active.length)} detail={missionState === "unavailable" ? "Runtime mission history unavailable" : missionStepAllowed ? `${executableCount} bounded steps executable now` : "Step execution is capability-gated; planning and history remain usable"} />
      <NexusMetric label="Blocked Missions" value={metric(blocked.length)} detail="Recorded authority, capability, or evidence constraints" tone={blocked.length ? "attention" : "neutral"} />
      <NexusMetric label="Completed Missions" value={metric(completed.length)} detail={receiptState === "unavailable" ? "Receipt linkage unavailable" : `${receiptBackedCompleted.length} with linked successful Runtime receipts`} />
      <NexusMetric label="Mission Health" value={health} detail={selectedMission ? `${progress}% selected progress` : "No selected Runtime mission"} tone={health === "operational" || health === "stable" ? "success" : health === "attention" ? "attention" : "neutral"} />
    </section>
    {error && <section className="operation-error" role="alert"><ShieldAlert size={18} /><span>{error}</span></section>}
    <div className="mission-compose"><label><span>New mission objective</span><textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Describe the governed outcome NEXUS should coordinate…" autoComplete="off" /></label><button onClick={() => void plan()} disabled={busy || !objective.trim() || !missionCreationAllowed}><Network size={15} />Plan governed mission</button><small>{missionCreationReason} {missionReadinessNote}</small></div>
    <div className="mission-dashboard__grid">
      <DataPanel eyebrow="Mission portfolio" title="Active, blocked, and completed missions" icon={<CircleGauge size={18} />}>
        <div className="mission-list">{missionState === "loading" ? <p className="replay-loading">Loading mission history from Runtime…</p> : missionState === "unavailable" ? <EmptyRecord>Runtime did not supply mission history. Mission status is unavailable.</EmptyRecord> : missions.length ? missions.map((mission) => { const id = missionId(mission); return <button key={id} data-active={id === selected} onClick={() => setSelected(id)}><div><strong>{text(mission.userObjective ?? mission.objective ?? mission.title, "Mission")}</strong><small>{id}</small></div><StatusPill value={statusOf(mission)} /></button>; }) : <EmptyRecord>No missions have been recorded by Runtime.</EmptyRecord>}</div>
      </DataPanel>
      <DataPanel eyebrow="Executive summary" title={selectedMission ? text(selectedMission.userObjective ?? selectedMission.objective ?? selectedMission.title, "Selected mission") : "No selected mission"} icon={<Activity size={18} />}>
        {selectedMission ? <><div className="mission-progress"><span style={{ width: `${progress}%` }} /><strong>{progress}%</strong></div><p className="boundary-note">{executiveSummary(selectedMission)}</p><div className="mission-posture"><span><ShieldCheck size={13} />{text(selectedMission.riskLevel ?? selectedMission.risk_level, "unclassified")} risk</span><span><LockKeyhole size={13} />{blockers.length} constrained</span><span><Check size={13} />{explicitlyReversible} explicitly reversible · {reversibilityUnspecified} not supplied</span></div><OperationalResultLineage replayId={replayId} receiptId={latestReceiptId} missionId={missionId(selectedMission)} onOpenReplay={onReplay} /></> : <EmptyRecord>No Runtime mission is selected.</EmptyRecord>}
      </DataPanel>
      <DataPanel eyebrow="Mission Executor" title="Independent task graph" icon={<Play size={18} />}>
        <ol className="mission-task-graph">{steps.length ? steps.map((step, index) => { const stepId = text(step.stepId ?? step.step_id ?? step.task_id ?? step.id, `step-${index + 1}`); const state = stepState(step); const StepIcon = stepIcons[state]; const linked = stepReceiptIds(step).length > 0; const evidenceRequired = list(step.evidenceRequired ?? step.evidence_required); const dependencies = list(step.dependencies); return <li key={stepId} data-state={state}><span className="mission-task-rail"><StepIcon size={14} /></span><article><header><div><span>Step {String(index + 1).padStart(2, "0")}</span><strong>{text(step.objective ?? step.title ?? step.action, stepId)}</strong></div><StatusPill value={state} /></header><p>{text(step.action ?? step.nextAction ?? step.honestNarration, evidenceRequired.length ? `Evidence required: ${evidenceRequired.join("; ")}` : "This step remains bounded by registered capability and authority.")}</p><footer><span>{dependencies.length ? `${dependencies.length} dependencies` : "dependency-ready"}</span><span>{evidenceRequired.length} evidence requirements</span><span>{text(step.specialistId ?? step.specialist_id, "specialist unassigned")}</span>{linked ? <span><Check size={11} />receipt linked</span> : <span>no receipt yet</span>}{state === "ready" && <button title={missionStepAllowed ? undefined : missionStepExecutionBlockedReason} onClick={() => void execute(missionId(selectedMission ?? {}), stepId)} disabled={busy || !missionStepAllowed}><Play size={12} />{missionStepAllowed ? "Execute bounded step" : "Execution unavailable"}</button>}{state === "ready" && hosted && !hostedMissionScope && <span>hosted session lacks operations:write</span>}</footer></article></li>; }) : <EmptyRecord>No task graph is available for the selected mission.</EmptyRecord>}</ol>
      </DataPanel>
      <aside className="mission-inspector" aria-label="Selected mission context">
        <section><span className="nx-eyebrow">Mission posture</span><strong>{selectedMission ? `${progress}% receipt-aware progress` : "Unavailable"}</strong><div className="mission-progress"><span style={{ width: `${progress}%` }} /></div></section>
        <section><header><Activity size={15} />Runtime record</header><dl><div><dt>Mission ID</dt><dd>{selectedMission ? missionId(selectedMission) : "unavailable"}</dd></div><div><dt>Created</dt><dd>{selectedMission ? text(selectedMission.createdAt ?? selectedMission.created_at, "not supplied") : "unavailable"}</dd></div><div><dt>Updated</dt><dd>{selectedMission ? text(selectedMission.updatedAt ?? selectedMission.updated_at, "not supplied") : "unavailable"}</dd></div><div><dt>Replay</dt><dd>{replayId || "not recorded"}</dd></div></dl></section>
        <section><header><ShieldCheck size={15} />Governance boundary</header><dl><div><dt>Risk</dt><dd>{selectedMission ? text(selectedMission.riskLevel ?? selectedMission.risk_level, "unclassified") : "unavailable"}</dd></div><div><dt>Blocked steps</dt><dd>{blockers.length}</dd></div><div><dt>Reversible</dt><dd>{explicitlyReversible} explicit · {reversibilityUnspecified} not supplied</dd></div><div><dt>Authority</dt><dd>{missionStepExecutionAvailable ? "Required and revalidated per action" : "Execution adapter unavailable"}</dd></div></dl></section>
        <section><header><TriangleAlert size={15} />Constraints</header>{blockers.length ? <ul>{blockers.map((step, index) => <li key={text(step.stepId ?? step.step_id ?? step.id, `blocked-${index}`)}>{text(step.title ?? step.action, "Constrained mission step")}</li>)}</ul> : <p>No recorded blockers in the selected plan.</p>}</section>
        <section><header><Link2 size={15} />Required capabilities</header>{requirements.length ? <div className="mission-tags">{requirements.map((item) => <code key={item}>{item}</code>)}</div> : <p>No capability requirements were recorded.</p>}</section>
        <section><header><FileCheck2 size={15} />Latest receipt</header>{receiptState === "unavailable" ? <p>Runtime receipt history is unavailable.</p> : latestReceiptId ? <code>{latestReceiptId}</code> : <p>No execution receipt is linked.</p>}<StatusPill value={receiptState === "unavailable" ? "unavailable" : latestReceiptId ? text(latestReceipt?.verificationStatus ?? latestReceipt?.verification_status ?? latestReceipt?.status, "recorded") : "awaiting execution"} /></section>
      </aside>
      <DataPanel eyebrow="Specialist assignments" title="Mission-specific expertise" icon={<Network size={18} />}>
        <div className="compact-records">{specialists.length ? specialists.map((specialist, index) => { const specialistId = text(specialist.specialistId ?? specialist.specialist_id ?? specialist.id, `specialist-${index}`); return <article key={specialistId}><strong>{text(specialist.name ?? specialist.role, specialistId)}</strong><span>{text(specialist.assignment ?? specialist.mandate, specialistId)}</span><StatusPill value={text(specialist.status, "assigned")} /></article>; }) : <EmptyRecord>No Runtime specialist assignments are recorded.</EmptyRecord>}</div>
      </DataPanel>
      <DataPanel eyebrow="Mission receipts" title="Independent evidence chain" icon={<FileCheck2 size={18} />}>
        <div className="compact-records">{receiptState === "loading" ? <p className="replay-loading">Loading Runtime receipts…</p> : receiptState === "unavailable" ? <EmptyRecord>Runtime receipt history is unavailable. Receipt status cannot be inferred.</EmptyRecord> : selectedReceipts.length ? selectedReceipts.map((receipt, index) => <article key={receiptId(receipt) || `receipt-${index}`}><strong>{receiptId(receipt) || "Receipt ID unavailable"}</strong><span>{text(receipt.receiptType ?? receipt.status, "recorded")} · Replay {list(receipt.replayRefs ?? receipt.replay_refs)[0] ?? "not linked"}</span><StatusPill value={text(receipt.verificationStatus ?? receipt.verification_status ?? receipt.status, "recorded")} /></article>) : <EmptyRecord>No receipt is linked to the selected mission.</EmptyRecord>}</div>
      </DataPanel>
    </div>
    <footer className="mission-dashboard__footer"><span><Activity size={14} />Every mission remains independently replayable.</span><span><ShieldAlert size={14} />Execution requires registered capability and Runtime authority.</span><span><FileCheck2 size={14} />Completion claims require a linked receipt and verified postcondition.</span></footer>
  </div>;
}
