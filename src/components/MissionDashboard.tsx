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
import { localNexusClient, operationalSessionClient } from "../lib/local-client";
import { NexusButton, NexusMetric } from "../design-system/NexusPrimitives";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

type RuntimeRecord = Record<string, unknown>;
type LoadState = "loading" | "ready" | "empty" | "unavailable";
type MissionStepState = "complete" | "ready" | "staged" | "blocked" | "unavailable" | "planned";

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
  if (step.executableLocal === true || step.executable === true || status === "ready" || status === "live") return "ready";
  if (status === "staged" || status.includes("approval")) return "staged";
  return "planned";
}

function linkedReceiptIds(mission: RuntimeRecord) {
  const ids = new Set(list(mission.receiptLinks ?? mission.receipt_links));
  if (Array.isArray(mission.steps)) {
    (mission.steps as RuntimeRecord[]).forEach((step) => stepReceiptIds(step).forEach((id) => ids.add(id)));
  }
  return ids;
}

function receiptMatchesMission(receipt: RuntimeRecord, mission: RuntimeRecord) {
  const id = missionId(mission);
  return text(receipt.missionId ?? receipt.mission_id, "") === id || linkedReceiptIds(mission).has(receiptId(receipt));
}

function receiptSuccessful(receipt: RuntimeRecord) {
  const status = statusValue(receipt.status);
  const verification = statusValue(receipt.verificationStatus ?? receipt.verification_status);
  const successful = ["complete", "completed", "success", "verified", "recorded", "approved_for_local_execution", "executed"];
  return !restricted(status) && !restricted(verification)
    && (successful.includes(status) || successful.includes(verification));
}

function missionHasConstraints(mission: RuntimeRecord) {
  return Array.isArray(mission.steps)
    && (mission.steps as RuntimeRecord[]).some((step) => ["blocked", "unavailable"].includes(stepState(step)));
}

const stepIcons = { complete: Check, ready: Play, staged: Radio, blocked: LockKeyhole, unavailable: TriangleAlert, planned: Circle };

export function MissionDashboard({ onReplay }: { onReplay?: (missionId?: string) => void } = {}) {
  const hosted = operationalSessionClient.mode() === "hosted";
  const [missions, setMissions] = useState<RuntimeRecord[]>([]);
  const [receipts, setReceipts] = useState<RuntimeRecord[]>([]);
  const [missionState, setMissionState] = useState<LoadState>("loading");
  const [receiptState, setReceiptState] = useState<LoadState>("loading");
  const [objective, setObjective] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    const [missionResult, receiptResult] = await Promise.allSettled([
      localNexusClient.missions(),
      localNexusClient.receipts(),
    ]);
    const errors: string[] = [];
    if (missionResult.status === "fulfilled") {
      const nextMissions = rows(missionResult.value, ["missions"]);
      setMissions(nextMissions);
      setMissionState(nextMissions.length ? "ready" : "empty");
      setSelected((current) => current && nextMissions.some((mission) => missionId(mission) === current)
        ? current
        : nextMissions[0] ? missionId(nextMissions[0]) : null);
    } else {
      setMissions([]);
      setMissionState("unavailable");
      setSelected(null);
      errors.push(missionResult.reason instanceof Error ? missionResult.reason.message : "Mission Runtime is unavailable.");
    }
    if (receiptResult.status === "fulfilled") {
      const nextReceipts = rows(receiptResult.value, ["receipts"]);
      setReceipts(nextReceipts);
      setReceiptState(nextReceipts.length ? "ready" : "empty");
    } else {
      setReceipts([]);
      setReceiptState("unavailable");
      errors.push(receiptResult.reason instanceof Error ? receiptResult.reason.message : "Mission receipts are unavailable.");
    }
    setError([...new Set(errors)].join(" "));
    setBusy(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function plan() {
    if (!objective.trim()) return;
    setBusy(true);
    setError("");
    try {
      await localNexusClient.planMission(objective.trim());
      setObjective("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mission planning failed safely.");
      setBusy(false);
    }
  }

  async function execute(id: string, stepId: string) {
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
  const receiptBackedCompleted = completed.filter((mission) => receipts.some((receipt) => receiptMatchesMission(receipt, mission) && receiptSuccessful(receipt)));
  const selectedMission = missions.find((mission) => missionId(mission) === selected) ?? missions[0] ?? null;
  const steps = selectedMission && Array.isArray(selectedMission.steps) ? selectedMission.steps as RuntimeRecord[] : [];
  const specialists = selectedMission && Array.isArray(selectedMission.specialists) ? selectedMission.specialists as RuntimeRecord[] : [];
  const selectedReceipts = selectedMission ? receipts.filter((receipt) => receiptMatchesMission(receipt, selectedMission)) : [];
  const selectedComplete = selectedMission ? finished(statusOf(selectedMission)) : false;
  const progress = steps.length ? Math.round(steps.filter(stepCompleted).length / steps.length * 100) : selectedComplete ? 100 : 0;
  const health = missionState === "loading" ? "loading" : missionState === "unavailable" ? "unavailable" : blocked.length ? "attention" : active.length ? "operational" : completed.length ? "stable" : "waiting";
  const blockers = steps.filter((step) => ["blocked", "unavailable"].includes(stepState(step)));
  const requirements = selectedMission ? list(selectedMission.requiredCapabilities ?? selectedMission.required_capabilities) : [];
  const reversible = steps.filter((step) => step.reversible !== false).length;
  const latestReceipt = selectedReceipts[0];
  const latestReceiptId = latestReceipt ? receiptId(latestReceipt) : "";
  const executableCount = useMemo(
    () => missions.flatMap((mission) => Array.isArray(mission.steps) ? mission.steps as RuntimeRecord[] : []).filter((step) => stepState(step) === "ready").length,
    [missions],
  );
  const metric = (value: number) => missionState === "loading" || missionState === "unavailable" ? "—" : value;

  return <div className="mission-dashboard">
    <section className="nx-workspace-hero"><div><span className="nx-eyebrow">Mission Dashboard</span><h2>Coordinate governed work across independent mission streams.</h2><p>Each mission retains its own objective, task graph, specialist context, replay stream, receipts, and verification boundary.</p></div><NexusButton className="nx-action" size="sm" onClick={() => void refresh()} loading={busy}><RefreshCw size={15} />Refresh</NexusButton></section>
    <section className="nx-metrics">
      <NexusMetric label="Active Missions" value={metric(active.length)} detail={missionState === "unavailable" ? "Runtime mission history unavailable" : `${executableCount} bounded steps executable now`} />
      <NexusMetric label="Blocked Missions" value={metric(blocked.length)} detail="Recorded authority, capability, or evidence constraints" tone={blocked.length ? "attention" : "neutral"} />
      <NexusMetric label="Completed Missions" value={metric(completed.length)} detail={receiptState === "unavailable" ? "Receipt linkage unavailable" : `${receiptBackedCompleted.length} with linked successful Runtime receipts`} />
      <NexusMetric label="Mission Health" value={health} detail={selectedMission ? `${progress}% selected progress` : "No selected Runtime mission"} tone={health === "operational" || health === "stable" ? "success" : health === "attention" ? "attention" : "neutral"} />
    </section>
    {error && <section className="operation-error" role="alert"><ShieldAlert size={18} /><span>{error}</span></section>}
    <div className="mission-compose"><label><span>{hosted ? "New Conclave mission" : "New mission objective"}</span><textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder={hosted ? "Describe the evidence-bound investigation NEXUS should coordinate…" : "Describe the governed outcome NEXUS should coordinate…"} /></label><button onClick={() => void plan()} disabled={busy || !objective.trim()}><Network size={15} />{hosted ? "Start canonical Conclave mission" : "Plan independent mission"}</button></div>
    <div className="mission-dashboard__grid">
      <DataPanel eyebrow="Mission portfolio" title="Active, blocked, and completed missions" icon={<CircleGauge size={18} />}>
        <div className="mission-list">{missionState === "loading" ? <p className="replay-loading">Loading mission history from Runtime…</p> : missionState === "unavailable" ? <EmptyRecord>Runtime did not supply mission history. Mission status is unavailable.</EmptyRecord> : missions.length ? missions.map((mission) => { const id = missionId(mission); return <button key={id} data-active={id === selected} onClick={() => setSelected(id)}><div><strong>{text(mission.userObjective ?? mission.objective ?? mission.title, "Mission")}</strong><small>{id}</small></div><StatusPill value={statusOf(mission)} /></button>; }) : <EmptyRecord>No missions have been recorded by Runtime.</EmptyRecord>}</div>
      </DataPanel>
      <DataPanel eyebrow="Executive summary" title={selectedMission ? text(selectedMission.userObjective ?? selectedMission.objective ?? selectedMission.title, "Selected mission") : "No selected mission"} icon={<Activity size={18} />}>
        {selectedMission ? <><div className="mission-progress"><span style={{ width: `${progress}%` }} /><strong>{progress}%</strong></div><p className="boundary-note">{text(selectedMission.executiveSummary ?? selectedMission.executive_summary ?? selectedMission.honestNarration ?? selectedMission.suggestedNextAction, "Runtime has not supplied an executive summary for this mission.")}</p><div className="mission-posture"><span><ShieldCheck size={13} />{text(selectedMission.riskLevel ?? selectedMission.risk_level, "unclassified")} risk</span><span><LockKeyhole size={13} />{blockers.length} constrained</span><span><Check size={13} />{reversible} reversible</span></div>{onReplay && <div className="operation-actions"><button onClick={() => onReplay(missionId(selectedMission))}>Open Operational Replay</button></div>}</> : <EmptyRecord>No Runtime mission is selected.</EmptyRecord>}
      </DataPanel>
      <DataPanel eyebrow="Mission Executor" title="Independent task graph" icon={<Play size={18} />}>
        <ol className="mission-task-graph">{steps.length ? steps.map((step, index) => { const stepId = text(step.stepId ?? step.step_id ?? step.id, `step-${index + 1}`); const state = stepState(step); const StepIcon = stepIcons[state]; const linked = stepReceiptIds(step).length > 0; return <li key={stepId} data-state={state}><span className="mission-task-rail"><StepIcon size={14} /></span><article><header><div><span>Step {String(index + 1).padStart(2, "0")}</span><strong>{text(step.title ?? step.action, stepId)}</strong></div><StatusPill value={state} /></header><p>{text(step.action ?? step.nextAction ?? step.honestNarration, "This step remains bounded by registered capability and authority.")}</p><footer><span>{text(step.capabilityStatus ?? step.capability_status, "capability unrecorded")}</span><span>{text(step.riskLevel ?? step.risk_level, "unclassified")} risk</span><span>{step.reversible === false ? "irreversible" : "reversible"}</span>{linked ? <span><Check size={11} />receipt linked</span> : <span>no receipt yet</span>}{state === "ready" && !hosted && <button onClick={() => void execute(missionId(selectedMission ?? {}), stepId)} disabled={busy}><Play size={12} />Execute bounded step</button>}{state === "ready" && hosted && <span>governed execution route unavailable</span>}</footer></article></li>; }) : <EmptyRecord>No task graph is available for the selected mission.</EmptyRecord>}</ol>
      </DataPanel>
      <aside className="mission-inspector" aria-label="Selected mission context">
        <section><span className="nx-eyebrow">Mission posture</span><strong>{selectedMission ? `${progress}% receipt-aware progress` : "Unavailable"}</strong><div className="mission-progress"><span style={{ width: `${progress}%` }} /></div></section>
        <section><header><Activity size={15} />Runtime record</header><dl><div><dt>Mission ID</dt><dd>{selectedMission ? missionId(selectedMission) : "unavailable"}</dd></div><div><dt>Created</dt><dd>{selectedMission ? text(selectedMission.createdAt ?? selectedMission.created_at, "not supplied") : "unavailable"}</dd></div><div><dt>Updated</dt><dd>{selectedMission ? text(selectedMission.updatedAt ?? selectedMission.updated_at, "not supplied") : "unavailable"}</dd></div></dl></section>
        <section><header><ShieldCheck size={15} />Governance boundary</header><dl><div><dt>Risk</dt><dd>{selectedMission ? text(selectedMission.riskLevel ?? selectedMission.risk_level, "unclassified") : "unavailable"}</dd></div><div><dt>Blocked steps</dt><dd>{blockers.length}</dd></div><div><dt>Reversible</dt><dd>{reversible} steps</dd></div><div><dt>Authority</dt><dd>Runtime policy enforced</dd></div></dl></section>
        <section><header><TriangleAlert size={15} />Constraints</header>{blockers.length ? <ul>{blockers.map((step, index) => <li key={text(step.stepId ?? step.step_id ?? step.id, `blocked-${index}`)}>{text(step.title ?? step.action, "Constrained mission step")}</li>)}</ul> : <p>No recorded blockers in the selected plan.</p>}</section>
        <section><header><Link2 size={15} />Required capabilities</header>{requirements.length ? <div className="mission-tags">{requirements.map((item) => <code key={item}>{item}</code>)}</div> : <p>No capability requirements were recorded.</p>}</section>
        <section><header><FileCheck2 size={15} />Latest receipt</header>{receiptState === "unavailable" ? <p>Runtime receipt history is unavailable.</p> : latestReceiptId ? <code>{latestReceiptId}</code> : <p>No execution receipt is linked.</p>}<StatusPill value={receiptState === "unavailable" ? "unavailable" : latestReceiptId ? text(latestReceipt?.verificationStatus ?? latestReceipt?.verification_status ?? latestReceipt?.status, "recorded") : "awaiting execution"} /></section>
      </aside>
      <DataPanel eyebrow="Specialist assignments" title="Mission-specific expertise" icon={<Network size={18} />}>
        <div className="compact-records">{specialists.length ? specialists.map((specialist, index) => <article key={text(specialist.specialistId ?? specialist.specialist_id ?? specialist.id, `specialist-${index}`)}><strong>{text(specialist.name ?? specialist.role, "Specialist")}</strong><span>{text(specialist.assignment ?? specialist.mandate, "Assignment pending")}</span><StatusPill value={text(specialist.status, "assigned")} /></article>) : <EmptyRecord>No Runtime specialist assignments are recorded.</EmptyRecord>}</div>
      </DataPanel>
      <DataPanel eyebrow="Mission receipts" title="Independent evidence chain" icon={<FileCheck2 size={18} />}>
        <div className="compact-records">{receiptState === "loading" ? <p className="replay-loading">Loading Runtime receipts…</p> : receiptState === "unavailable" ? <EmptyRecord>Runtime receipt history is unavailable. Receipt status cannot be inferred.</EmptyRecord> : selectedReceipts.length ? selectedReceipts.map((receipt, index) => <article key={receiptId(receipt) || `receipt-${index}`}><strong>{receiptId(receipt) || "Receipt ID unavailable"}</strong><span>{text(receipt.status, "recorded")}</span><StatusPill value={text(receipt.verificationStatus ?? receipt.verification_status ?? receipt.status, "recorded")} /></article>) : <EmptyRecord>No receipt is linked to the selected mission.</EmptyRecord>}</div>
      </DataPanel>
    </div>
    <footer className="mission-dashboard__footer"><span><Activity size={14} />Every mission remains independently replayable.</span><span><ShieldAlert size={14} />Execution requires registered capability and Runtime authority.</span><span><FileCheck2 size={14} />Completion claims require a linked receipt and verified postcondition.</span></footer>
  </div>;
}
