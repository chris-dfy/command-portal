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
import { localNexusClient } from "../lib/local-client";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

type RuntimeRecord = Record<string, unknown>;
type MissionStepState = "ready" | "staged" | "blocked" | "unavailable" | "planned";

const object = (value: unknown): RuntimeRecord => value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeRecord : {};
const rows = (value: unknown, names: string[]) => {
  const source = object(value);
  for (const name of names) if (Array.isArray(source[name])) return source[name] as RuntimeRecord[];
  return [] as RuntimeRecord[];
};
const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value : fallback;
const list = (value: unknown) => Array.isArray(value) ? value.map((item) => text(item, "")).filter(Boolean) : [];
const missionId = (mission: RuntimeRecord) => text(mission.missionId ?? mission.id, "mission-unavailable");
const statusOf = (mission: RuntimeRecord) => text(mission.status, "planned");
const finished = (value: unknown) => ["complete", "completed", "success", "verified", "recorded"].includes(text(value, "").toLowerCase());
const restricted = (value: unknown) => ["blocked", "waiting_for_approval", "approval_required", "failed", "error"].includes(text(value, "").toLowerCase());

function stepState(step: RuntimeRecord): MissionStepState {
  const status = text(step.status ?? step.capabilityStatus, "planned").toLowerCase();
  if (step.blocked || restricted(status)) return "blocked";
  if (step.unavailable || status.includes("unavailable") || status.includes("missing")) return "unavailable";
  if (step.executableLocal === true || step.executable === true || status === "ready" || status === "live") return "ready";
  if (status === "staged" || status.includes("approval")) return "staged";
  return "planned";
}

const stepIcons = { ready: Play, staged: Radio, blocked: LockKeyhole, unavailable: TriangleAlert, planned: Circle };

export function MissionDashboard({ onReplay }: { onReplay: (missionId?: string) => void }) {
  const [missions, setMissions] = useState<RuntimeRecord[]>([]);
  const [receipts, setReceipts] = useState<RuntimeRecord[]>([]);
  const [objective, setObjective] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [missionResult, receiptResult] = await Promise.all([localNexusClient.missions(), localNexusClient.receipts()]);
      const next = rows(missionResult, ["missions"]);
      setMissions(next);
      setReceipts(rows(receiptResult, ["receipts"]));
      setSelected((current) => current ?? (next[0] ? missionId(next[0]) : null));
      sessionStorage.setItem("nexus.web.mission-store.v1", JSON.stringify(next));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mission Runtime is unavailable.");
      try { setMissions(JSON.parse(sessionStorage.getItem("nexus.web.mission-store.v1") ?? "[]") as RuntimeRecord[]); }
      catch { setMissions([]); }
    } finally {
      setBusy(false);
    }
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

  const active = missions.filter((mission) => ["active", "running", "executing", "planned"].includes(statusOf(mission).toLowerCase()));
  const blocked = missions.filter((mission) => restricted(statusOf(mission)));
  const completed = missions.filter((mission) => finished(statusOf(mission)));
  const selectedMission = missions.find((mission) => missionId(mission) === selected) ?? missions[0] ?? null;
  const steps = selectedMission && Array.isArray(selectedMission.steps) ? selectedMission.steps as RuntimeRecord[] : [];
  const specialists = selectedMission && Array.isArray(selectedMission.specialists) ? selectedMission.specialists as RuntimeRecord[] : [];
  const selectedReceipts = receipts.filter((receipt) => text(receipt.missionId, "") === (selectedMission ? missionId(selectedMission) : "") || text(receipt.executionReceiptId ?? receipt.receiptId, "").includes(selectedMission ? missionId(selectedMission) : "__none__"));
  const progress = steps.length ? Math.round(steps.filter((step) => finished(step.status)).length / steps.length * 100) : completed.length && missions.length ? 100 : 0;
  const health = blocked.length ? "attention" : active.length ? "operational" : completed.length ? "stable" : "waiting";
  const blockers = steps.filter((step) => ["blocked", "unavailable"].includes(stepState(step)));
  const requirements = selectedMission ? list(selectedMission.requiredCapabilities ?? selectedMission.required_capabilities) : [];
  const reversible = steps.filter((step) => step.reversible !== false).length;
  const latestReceipt = selectedReceipts[0];
  const latestReceiptId = latestReceipt ? text(latestReceipt.executionReceiptId ?? latestReceipt.receiptId, "") : "";
  const executableCount = useMemo(() => missions.flatMap((mission) => Array.isArray(mission.steps) ? mission.steps as RuntimeRecord[] : []).filter((step) => stepState(step) === "ready").length, [missions]);

  return <div className="mission-dashboard">
    <section className="nx-workspace-hero"><div><span className="nx-eyebrow">Mission Dashboard</span><h1>Coordinate governed work across independent mission streams.</h1><p>Each mission retains its own objective, task graph, specialist context, replay stream, receipts, and verification boundary.</p></div><button className="nx-action" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15} className={busy ? "spin" : ""} />Refresh</button></section>
    <section className="nx-metrics"><article><span>Active Missions</span><strong>{active.length}</strong><small>{executableCount} bounded steps executable now</small></article><article><span>Blocked Missions</span><strong>{blocked.length}</strong><small>Authority or evidence attention</small></article><article><span>Completed Missions</span><strong>{completed.length}</strong><small>Receipt-backed outcomes</small></article><article><span>Mission Health</span><strong>{health}</strong><small>{progress}% selected progress</small></article></section>
    {error && <section className="operation-error" role="alert"><ShieldAlert size={18} /><span>{error}</span></section>}
    <div className="mission-compose"><label><span>New mission objective</span><textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Describe the governed outcome NEXUS should coordinate…" /></label><button onClick={() => void plan()} disabled={busy || !objective.trim()}><Network size={15} />Plan independent mission</button></div>
    <div className="mission-dashboard__grid">
      <DataPanel eyebrow="Mission portfolio" title="Active, blocked, and completed missions" icon={<CircleGauge size={18} />}>
        <div className="mission-list">{missions.length ? missions.map((mission) => { const id = missionId(mission); return <button key={id} data-active={id === selected} onClick={() => setSelected(id)}><div><strong>{text(mission.userObjective ?? mission.objective ?? mission.title, "Mission")}</strong><small>{id}</small></div><StatusPill value={statusOf(mission)} /></button>; }) : <EmptyRecord>No Runtime missions are recorded.</EmptyRecord>}</div>
      </DataPanel>
      <DataPanel eyebrow="Executive summary" title={selectedMission ? text(selectedMission.userObjective ?? selectedMission.objective, "Selected mission") : "No selected mission"} icon={<Activity size={18} />}>
        {selectedMission ? <><div className="mission-progress"><span style={{ width: `${progress}%` }} /><strong>{progress}%</strong></div><p className="boundary-note">{text(selectedMission.executiveSummary ?? selectedMission.honestNarration ?? selectedMission.suggestedNextAction, "Runtime has not supplied an executive summary for this mission.")}</p><div className="mission-posture"><span><ShieldCheck size={13} />{text(selectedMission.riskLevel ?? selectedMission.risk_level, "unclassified")} risk</span><span><LockKeyhole size={13} />{blockers.length} constrained</span><span><Check size={13} />{reversible} reversible</span></div><div className="operation-actions"><button onClick={() => onReplay(missionId(selectedMission))}>Open Operational Replay</button></div></> : <EmptyRecord />}
      </DataPanel>
      <DataPanel eyebrow="Mission Executor" title="Independent task graph" icon={<Play size={18} />}>
        <ol className="mission-task-graph">{steps.length ? steps.map((step, index) => { const stepId = text(step.stepId ?? step.id, `step-${index + 1}`); const state = stepState(step); const StepIcon = stepIcons[state]; return <li key={stepId} data-state={state}><span className="mission-task-rail"><StepIcon size={14} /></span><article><header><div><span>Step {String(index + 1).padStart(2, "0")}</span><strong>{text(step.title ?? step.action, stepId)}</strong></div><StatusPill value={state} /></header><p>{text(step.action ?? step.nextAction ?? step.honestNarration, "This step remains bounded by registered capability and authority.")}</p><footer><span>{text(step.capabilityStatus ?? step.capability_status, "capability unrecorded")}</span><span>{text(step.riskLevel ?? step.risk_level, "unclassified")} risk</span><span>{step.reversible === false ? "irreversible" : "reversible"}</span>{list(step.receiptLinks ?? step.receipt_links).length || text(step.receiptId, "") ? <span><Check size={11} />receipt linked</span> : <span>no receipt yet</span>}{state === "ready" && <button onClick={() => void execute(missionId(selectedMission ?? {}), stepId)} disabled={busy}><Play size={12} />Execute bounded step</button>}</footer></article></li>; }) : <EmptyRecord>No task graph is available for the selected mission.</EmptyRecord>}</ol>
      </DataPanel>
      <aside className="mission-inspector" aria-label="Selected mission context">
        <section><span className="nx-eyebrow">Mission posture</span><strong>{progress}% ready</strong><div className="mission-progress"><span style={{ width: `${progress}%` }} /></div></section>
        <section><header><ShieldCheck size={15} />Governance boundary</header><dl><div><dt>Risk</dt><dd>{selectedMission ? text(selectedMission.riskLevel ?? selectedMission.risk_level, "unclassified") : "unavailable"}</dd></div><div><dt>Blocked steps</dt><dd>{blockers.length}</dd></div><div><dt>Reversible</dt><dd>{reversible} steps</dd></div><div><dt>Authority</dt><dd>policy enforced</dd></div></dl></section>
        <section><header><TriangleAlert size={15} />Constraints</header>{blockers.length ? <ul>{blockers.map((step, index) => <li key={text(step.stepId ?? step.id, `blocked-${index}`)}>{text(step.title ?? step.action, "Constrained mission step")}</li>)}</ul> : <p>No recorded blockers in the selected plan.</p>}</section>
        <section><header><Link2 size={15} />Required capabilities</header>{requirements.length ? <div className="mission-tags">{requirements.map((item) => <code key={item}>{item}</code>)}</div> : <p>No capability requirements were recorded.</p>}</section>
        <section><header><FileCheck2 size={15} />Latest receipt</header>{latestReceiptId ? <code>{latestReceiptId}</code> : <p>No execution receipt is linked.</p>}<StatusPill value={latestReceiptId ? text(latestReceipt?.verificationStatus ?? latestReceipt?.status, "evidence linked") : "awaiting execution"} /></section>
      </aside>
      <DataPanel eyebrow="Specialist assignments" title="Mission-specific expertise" icon={<Network size={18} />}>
        <div className="compact-records">{specialists.length ? specialists.map((specialist, index) => <article key={text(specialist.specialistId ?? specialist.id, `specialist-${index}`)}><strong>{text(specialist.name ?? specialist.role, "Specialist")}</strong><span>{text(specialist.assignment ?? specialist.mandate, "Assignment pending")}</span><StatusPill value={text(specialist.status, "assigned")} /></article>) : <EmptyRecord>No Runtime specialist assignments are recorded.</EmptyRecord>}</div>
      </DataPanel>
      <DataPanel eyebrow="Mission receipts" title="Independent evidence chain" icon={<FileCheck2 size={18} />}>
        <div className="compact-records">{selectedReceipts.length ? selectedReceipts.map((receipt, index) => <article key={text(receipt.executionReceiptId ?? receipt.receiptId, `receipt-${index}`)}><strong>{text(receipt.executionReceiptId ?? receipt.receiptId, "Receipt")}</strong><span>{text(receipt.status, "recorded")}</span><StatusPill value={text(receipt.verificationStatus ?? receipt.status, "recorded")} /></article>) : <EmptyRecord>No receipt is linked to the selected mission.</EmptyRecord>}</div>
      </DataPanel>
    </div>
    <footer className="mission-dashboard__footer"><span><Activity size={14} />Every mission remains independently replayable.</span><span><ShieldAlert size={14} />Execution requires registered capability and authority.</span><span><FileCheck2 size={14} />Completion requires a verified receipt and postcondition.</span></footer>
  </div>;
}
