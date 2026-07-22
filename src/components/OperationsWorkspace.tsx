import { useCallback, useEffect, useState } from "react";
import { Activity, ClipboardCheck, FileCheck2, Network, RefreshCw, Route, ShieldAlert, ShieldCheck } from "lucide-react";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";
import { localNexusClient, operationalSessionClient, type OperationalSession } from "../lib/local-client";

type RuntimeRecord = Record<string, unknown>;

const object = (value: unknown): RuntimeRecord => value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeRecord : {};
const records = (value: unknown, keys: string[]): RuntimeRecord[] => {
  const source = object(value);
  for (const key of keys) if (Array.isArray(source[key])) return source[key] as RuntimeRecord[];
  return [];
};
const nestedRecord = (value: unknown, keys: string[]): RuntimeRecord => {
  const source = object(value);
  for (const key of keys) {
    const nested = object(source[key]);
    if (Object.keys(nested).length) return nested;
  }
  return source;
};
const text = (value: unknown, fallback = "Unavailable") => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
};
const strings = (value: unknown) => Array.isArray(value) ? value.map((item) => text(item, "")).filter(Boolean) : [];
const missionId = (mission: RuntimeRecord) => text(mission.missionId ?? mission.mission_id ?? mission.id, "");

export function OperationsWorkspace({
  session,
  onSessionChange,
  runtimeCommit,
  programAlphaCommit,
}: {
  session: OperationalSession;
  onSessionChange: (session: OperationalSession) => void;
  runtimeCommit?: string;
  programAlphaCommit?: string;
}) {
  const [readiness, setReadiness] = useState<RuntimeRecord | null>(null);
  const [missions, setMissions] = useState<RuntimeRecord[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [missionDetail, setMissionDetail] = useState<RuntimeRecord | null>(null);
  const [missionReceipts, setMissionReceipts] = useState<RuntimeRecord[]>([]);
  const [missionReplay, setMissionReplay] = useState<RuntimeRecord | null>(null);
  const [objective, setObjective] = useState("");
  const [result, setResult] = useState<RuntimeRecord | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    const [readinessResult, missionsResult] = await Promise.allSettled([
      localNexusClient.capabilityReadiness(),
      localNexusClient.missions(),
    ]);
    const nextErrors: string[] = [];
    if (readinessResult.status === "fulfilled") setReadiness(object(readinessResult.value));
    else {
      setReadiness(null);
      nextErrors.push(readinessResult.reason instanceof Error ? readinessResult.reason.message : "Capability readiness is unavailable.");
    }
    if (missionsResult.status === "fulfilled") {
      const nextMissions = records(missionsResult.value, ["missions"]);
      setMissions(nextMissions);
      setSelectedMissionId((current) => current && nextMissions.some((mission) => missionId(mission) === current)
        ? current
        : missionId(nextMissions[0] ?? {}));
    } else {
      setMissions([]);
      setSelectedMissionId("");
      nextErrors.push(missionsResult.reason instanceof Error ? missionsResult.reason.message : "Mission Executor state is unavailable.");
    }
    setErrors(nextErrors);
    setBusy(false);
  }, []);

  useEffect(() => { if (session.authenticated) void refresh(); }, [refresh, session.authenticated]);
  useEffect(() => {
    if (!selectedMissionId) {
      setMissionDetail(null);
      setMissionReceipts([]);
      setMissionReplay(null);
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      localNexusClient.mission(selectedMissionId),
      localNexusClient.missionReceipts(selectedMissionId),
      localNexusClient.operationalReplayForMission(selectedMissionId),
    ]).then(([detailResult, receiptsResult, replayResult]) => {
      if (cancelled) return;
      const nextErrors: string[] = [];
      if (detailResult.status === "fulfilled") setMissionDetail(nestedRecord(detailResult.value, ["mission"]));
      else {
        setMissionDetail(null);
        nextErrors.push(detailResult.reason instanceof Error ? detailResult.reason.message : "Mission detail is unavailable.");
      }
      if (receiptsResult.status === "fulfilled") setMissionReceipts(records(receiptsResult.value, ["receipts"]));
      else {
        setMissionReceipts([]);
        nextErrors.push(receiptsResult.reason instanceof Error ? receiptsResult.reason.message : "Mission receipts are unavailable.");
      }
      if (replayResult.status === "fulfilled") setMissionReplay(nestedRecord(replayResult.value, ["replay"]));
      else {
        setMissionReplay(null);
        nextErrors.push(replayResult.reason instanceof Error ? replayResult.reason.message : "Mission Replay is unavailable.");
      }
      setErrors(nextErrors);
    });
    return () => { cancelled = true; };
  }, [selectedMissionId]);

  const readinessCapabilities = records(readiness, ["capabilities", "items", "records"]);
  const deployedCommit = text(runtimeCommit, "Not supplied");
  const embeddedProgramAlphaCommit = text(programAlphaCommit, "Not supplied");
  const conclaveCapability = readinessCapabilities.find((item) => text(item.capabilityId ?? item.capability_id ?? item.id, "") === "conclave");
  const conclaveAvailable = text(conclaveCapability?.state ?? conclaveCapability?.status, "unavailable").toLowerCase() === "available";
  const missionCreationAllowed = conclaveAvailable && session.scopes?.includes("operations:write") === true;
  const missionCreationReason = conclaveAvailable
    ? session.scopes?.includes("operations:write") ? "Runtime capability and hosted mutation scope are available." : "The hosted session lacks operations:write."
    : text(conclaveCapability?.reason ?? conclaveCapability?.requiredNextAction, "Conclave capability readiness is unavailable.");
  const selectedMission = missionDetail ?? missions.find((mission) => missionId(mission) === selectedMissionId) ?? null;
  const tasks = selectedMission && Array.isArray(selectedMission.steps) ? selectedMission.steps as RuntimeRecord[] : [];
  const replayId = missionReplay
    ? text(missionReplay.replayId ?? missionReplay.runId ?? missionReplay.run_id ?? missionReplay.id, "")
    : text(object(selectedMission?.replay).replayId ?? selectedMission?.replay_run_id, "Not recorded");

  async function planMission() {
    if (!missionCreationAllowed) {
      setErrors([missionCreationReason]);
      return;
    }
    if (!objective.trim()) {
      setErrors(["Enter an evidence-bound mission objective."]);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const next = await localNexusClient.planMission(objective.trim());
      setResult(next);
      setObjective("");
      await refresh();
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Mission creation failed safely."]);
    } finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    setErrors([]);
    try {
      const next = await operationalSessionClient.logout();
      operationalSessionClient.use(next);
      onSessionChange(next);
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Sign out failed."]);
    } finally { setBusy(false); }
  }

  return <div className="experience-grid operations-workspace">
    <DataPanel eyebrow="Hosted Operational Gateway" title="Authenticated operational session" icon={<ShieldAlert size={18} />} className="span-2">
      <div className="session-strip"><article><span>User</span><strong>{session.userId}</strong></article><article><span>Tenant</span><strong>{session.tenantId}</strong></article><article><span>Workspace</span><strong>{session.workspaceId}</strong></article><article><span>Role</span><strong>{session.role}</strong></article><StatusPill value="authenticated" /><button className="secondary-action" onClick={() => void logout()} disabled={busy}>Sign out</button></div>
      <p className="boundary-note">Scopes: {session.scopes?.join(", ") || "none supplied"}. Session expiration: {session.expiresAt ?? "not supplied"}.</p>
      <p className="boundary-note">The browser submits operator intent. Tenant, workspace, principal, role, scope, policy, and Authority remain server-derived.</p>
    </DataPanel>

    <DataPanel eyebrow="Capability-specific readiness" title="Canonical Runtime v26 contract" icon={<ShieldCheck size={18} />} className="span-2">
      <div className="operations-summary"><article><span>Deployed commit</span><strong>{deployedCommit}</strong></article><article><span>Program Alpha</span><strong>{embeddedProgramAlphaCommit}</strong></article><article><span>Capability records</span><strong>{readiness ? readinessCapabilities.length : "—"}</strong></article><article><span>Readiness source</span><strong>{readiness ? "authenticated Runtime" : "Unavailable"}</strong></article></div>
      <div className="compact-records">{readinessCapabilities.length ? readinessCapabilities.map((capability, index) => { const id = text(capability.capabilityId ?? capability.capability_id ?? capability.id ?? capability.name, `Capability ${index + 1}`); return <article key={id}><strong>{id}</strong><span>{text(capability.reason ?? capability.requiredNextAction ?? capability.required_next_action, "Runtime supplied no readiness reason")}</span><StatusPill value={text(capability.state ?? capability.status ?? capability.availability, "unknown")} /></article>; }) : <EmptyRecord>Capability-specific readiness is unavailable or contains no capability records.</EmptyRecord>}</div>
      <p className="boundary-note">Governance and Authority are displayed as independent capability records. Authentication and role never establish operational Authority.</p>
    </DataPanel>

    {errors.length > 0 && <section className="operation-error span-2" role="alert"><ShieldAlert size={18} /><span>{[...new Set(errors)].join(" ")}</span></section>}

    <DataPanel eyebrow="Mission Control" title="Create a canonical Conclave mission" icon={<Route size={18} />}>
      <label className="operation-field"><span>Evidence-bound objective</span><textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Describe the operational question NEXUS should investigate…" /></label>
      <div className="operation-actions"><button onClick={() => void planMission()} disabled={busy || !objective.trim() || !missionCreationAllowed}><ClipboardCheck size={15} /> Start governed mission</button><button className="secondary-action" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15} /> Refresh</button></div>
      <p className="boundary-note">Mission creation gate: {missionCreationReason}</p>
      {result && <p className="boundary-note">Runtime accepted mission {text(result.missionId ?? object(result.mission).missionId ?? object(result.mission).mission_id, "response recorded")}.</p>}
    </DataPanel>

    <DataPanel eyebrow="Mission portfolio" title="Runtime Mission Executor state" icon={<Network size={18} />}>
      <div className="mission-list">{missions.length ? missions.map((mission) => { const id = missionId(mission); return <button key={id} data-active={selectedMissionId === id} onClick={() => setSelectedMissionId(id)}><div><strong>{text(mission.title ?? mission.objective, id)}</strong><small>{id}</small></div><StatusPill value={text(mission.status, "unknown")} /></button>; }) : <EmptyRecord>No tenant/workspace-bound missions are recorded.</EmptyRecord>}</div>
    </DataPanel>

    <DataPanel eyebrow="Mission Executor" title="Selected task graph and status" icon={<Activity size={18} />} className="span-2">
      {selectedMission ? <><div className="operations-summary"><article><span>Mission</span><strong>{missionId(selectedMission)}</strong></article><article><span>Status</span><strong>{text(selectedMission.status)}</strong></article><article><span>Workspace</span><strong>{text(selectedMission.workspaceId ?? selectedMission.workspace_id)}</strong></article><article><span>Replay</span><strong>{replayId}</strong></article></div><ol className="mission-task-graph">{tasks.length ? tasks.map((task, index) => { const id = text(task.taskId ?? task.task_id ?? task.id, `task-${index + 1}`); const evidence = strings(task.evidenceRequired ?? task.evidence_required); const dependencies = strings(task.dependencies); return <li key={id} data-state={text(task.status, "planned")}><span className="mission-task-rail"><Activity size={14} /></span><article><header><div><span>Task {String(index + 1).padStart(2, "0")}</span><strong>{text(task.objective ?? task.title, id)}</strong></div><StatusPill value={text(task.status, "planned")} /></header><p>{evidence.length ? `Evidence required: ${evidence.join("; ")}` : "No Evidence requirement was supplied."}</p><footer><span>{dependencies.length} dependencies</span><span>{strings(task.evidenceIds ?? task.evidence_ids).length} Evidence records</span><span>{text(task.specialistId ?? task.specialist_id, "unassigned specialist")}</span></footer></article></li>; }) : <EmptyRecord>The selected mission has no Runtime task graph.</EmptyRecord>}</ol></> : <EmptyRecord>Select a Runtime mission to inspect its canonical detail.</EmptyRecord>}
    </DataPanel>

    <DataPanel eyebrow="Mission receipts" title="Receipt-backed execution history" icon={<FileCheck2 size={18} />}>
      <div className="compact-records">{missionReceipts.length ? missionReceipts.map((receipt, index) => { const id = text(receipt.receiptId ?? receipt.receipt_id, `receipt-${index + 1}`); return <article key={id}><strong>{id}</strong><span>{text(receipt.receiptType ?? receipt.receipt_type, "Runtime receipt")} · {text(receipt.contentDigest ?? receipt.content_digest, "digest unavailable")}</span><StatusPill value="recorded" /></article>; }) : <EmptyRecord>No receipt is linked to the selected mission.</EmptyRecord>}</div>
    </DataPanel>

    <DataPanel eyebrow="Operational Replay" title="Mission evolution reference" icon={<FileCheck2 size={18} />}>
      {missionReplay ? <div className="compact-records"><article><strong>{replayId}</strong><span>{text(missionReplay.status, "recorded")} · {text(missionReplay.contentDigest ?? missionReplay.content_digest, "digest unavailable")}</span><StatusPill value={text(missionReplay.status, "recorded")} /></article></div> : <EmptyRecord>The selected mission has no retrievable Replay reference.</EmptyRecord>}
      <p className="boundary-note">Mission status, task graph, receipts, and Replay come from independent canonical Runtime routes. One unavailable source does not fabricate or erase another.</p>
    </DataPanel>
  </div>;
}
