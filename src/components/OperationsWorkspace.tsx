import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, Network, Play, RefreshCw, Route, ShieldAlert, Square, XCircle } from "lucide-react";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";
import { localNexusClient, operationalSessionClient, type ClientCapabilityContract, type OperationalSession } from "../lib/local-client";

type RuntimeRecord = Record<string, unknown>;

const records = (value: unknown, keys: string[]): RuntimeRecord[] => {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeRecord : {};
  for (const key of keys) if (Array.isArray(object[key])) return object[key] as RuntimeRecord[];
  return [];
};
const text = (value: unknown, fallback = "Unavailable") => typeof value === "string" && value.trim() ? value : fallback;
const idOf = (item: RuntimeRecord, keys: string[]) => keys.map((key) => item[key]).find((value) => typeof value === "string") as string | undefined;

export function OperationsWorkspace() {
  const [contract, setContract] = useState<ClientCapabilityContract | null>(null);
  const [missions, setMissions] = useState<RuntimeRecord[]>([]);
  const [sessions, setSessions] = useState<RuntimeRecord[]>([]);
  const [approvals, setApprovals] = useState<RuntimeRecord[]>([]);
  const [connectors, setConnectors] = useState<RuntimeRecord[]>([]);
  const [objective, setObjective] = useState("");
  const [action, setAction] = useState("");
  const [result, setResult] = useState<RuntimeRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<OperationalSession>({ authenticated: false });
  const [accessKey, setAccessKey] = useState("");
  const [sessionChecked, setSessionChecked] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [nextContract, missionData, sessionData, approvalData, connectorData] = await Promise.all([
        localNexusClient.clientCapabilities(), localNexusClient.missions(), localNexusClient.workSessions(), localNexusClient.approvals(), localNexusClient.connectors()
      ]);
      setContract(nextContract);
      setMissions(records(missionData, ["missions"]));
      setSessions(records(sessionData, ["sessions", "workSessions"]));
      setApprovals(records(approvalData, ["approvals"]));
      setConnectors(records(connectorData, ["connectors"]));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Operational Runtime is unavailable."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    operationalSessionClient.status()
      .then((next) => { operationalSessionClient.use(next); setSession(next); })
      .catch(() => operationalSessionClient.use({ authenticated: false }))
      .finally(() => setSessionChecked(true));
  }, []);
  useEffect(() => { if (sessionChecked) void refresh(); }, [refresh, sessionChecked]);

  const run = async (operation: () => Promise<RuntimeRecord>, refreshAfter = true) => {
    setBusy(true); setError("");
    try { setResult(await operation()); if (refreshAfter) await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Runtime operation failed safely."); }
    finally { setBusy(false); }
  };

  const objectiveRequired = () => {
    if (objective.trim()) return true;
    setError("Enter an objective for the Runtime.");
    return false;
  };

  const login = async () => {
    setBusy(true); setError("");
    try {
      const next = await operationalSessionClient.login(accessKey);
      operationalSessionClient.use(next); setSession(next); setAccessKey(""); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Authentication failed."); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true); setError("");
    try { const next = await operationalSessionClient.logout(); operationalSessionClient.use(next); setSession(next); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Sign out failed."); }
    finally { setBusy(false); }
  };

  return <div className="experience-grid operations-workspace">
    <DataPanel eyebrow="Hosted Operational Gateway" title={session.authenticated ? "Authenticated operational session" : "Operational sign in"} icon={<ShieldAlert size={18} />} className="span-2">
      {session.authenticated ? <div className="session-strip"><article><span>User</span><strong>{session.userId}</strong></article><article><span>Tenant</span><strong>{session.tenantId}</strong></article><article><span>Workspace</span><strong>{session.workspaceId}</strong></article><article><span>Role</span><strong>{session.role}</strong></article><StatusPill value="authenticated" /><button className="secondary-action" onClick={() => void logout()} disabled={busy}>Sign out</button></div> : <div className="session-login"><label className="operation-field"><span>Operator access key</span><input type="password" autoComplete="current-password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} placeholder="Enter the hosted operator access key" /></label><button className="secondary-action" onClick={() => void login()} disabled={busy || accessKey.length < 16}>Authenticate</button></div>}
      <p className="boundary-note">{session.authenticated ? "Requests use an HttpOnly session, CSRF verification, scoped authorization, fixed tenant/workspace identity, and per-mutation idempotency keys." : "Without a hosted session, the client remains in local-first mode. Hosted credentials never enter browser storage."}</p>
      <p className="boundary-note">Current classification: <strong>single-workspace hosted alpha</strong>. Production multi-tenant readiness remains false until external identity-provider login and persistent tenant-isolation verification are complete.</p>
    </DataPanel>
    <DataPanel eyebrow="Client parity contract" title="Runtime-owned operational surface" icon={<Network size={18} />} className="span-2">
      <div className="operations-summary">
        <article><span>Contract</span><strong>{contract?.contractVersion ?? "Unavailable"}</strong></article>
        <article><span>Portable capabilities</span><strong>{contract?.parity.portableCapabilityCount ?? "—"}</strong></article>
        <article><span>Web implemented</span><strong>{contract?.parity.nexusWebImplemented ?? "—"}</strong></article>
        <article><span>Parity drift</span><strong>{contract?.parity.driftCount ?? "—"}</strong></article>
      </div>
      <p className="boundary-note">Operational behavior, context assembly, governance decisions, proofs, and receipts remain owned by NEXUS Runtime. This web workspace only presents the shared contract and submits operator intent.</p>
      {contract && !contract.completeNativeInventory && <p className="boundary-note">Current scope: <strong>{contract.inventoryScope}</strong>. Remaining native surfaces are explicitly tracked: {contract.truth.remainingNativeSurfaces.join(", ").replaceAll("_", " ")}.</p>}
      <button className="secondary-action" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15} className={busy ? "spin" : ""} /> Refresh Runtime state</button>
    </DataPanel>

    {error && <section className="operation-error span-2" role="alert"><ShieldAlert size={18} /><span>{error}</span></section>}

    <DataPanel eyebrow="Mission Control" title="Plan governed missions" icon={<Route size={18} />}>
      <label className="operation-field"><span>Mission or work objective</span><textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Describe the outcome NEXUS should plan…" /></label>
      <div className="operation-actions">
        <button onClick={() => objectiveRequired() && void run(() => localNexusClient.planMission(objective))} disabled={busy}><ClipboardCheck size={15} /> Plan mission</button>
        <button onClick={() => objectiveRequired() && void run(() => localNexusClient.planWorkSession(objective))} disabled={busy}><ClipboardCheck size={15} /> Plan session</button>
        <button onClick={() => objectiveRequired() && void run(() => localNexusClient.startWorkSession(objective))} disabled={busy}><Play size={15} /> Start session</button>
      </div>
      <div className="compact-records">{missions.length ? missions.map((mission) => {
        const id = idOf(mission, ["missionId", "id"]); return <article key={id ?? JSON.stringify(mission)}><strong>{text(mission.objective ?? mission.title, "Mission")}</strong><span>{id ?? "ID unavailable"}</span><StatusPill value={text(mission.status, "planned")} /></article>;
      }) : <EmptyRecord>No recorded missions.</EmptyRecord>}</div>
    </DataPanel>

    <DataPanel eyebrow="Work Sessions" title="Control bounded Runtime work" icon={<Play size={18} />}>
      <div className="compact-records">{sessions.length ? sessions.map((session) => {
        const id = idOf(session, ["sessionId", "id"]); return <article key={id ?? JSON.stringify(session)}><strong>{text(session.objective, "Work session")}</strong><span>{id ?? "ID unavailable"}</span><StatusPill value={text(session.status, "unknown")} />{id && <div className="inline-controls"><button onClick={() => void run(() => localNexusClient.controlWorkSession(id, "step"))} disabled={busy}>Step</button><button onClick={() => void run(() => localNexusClient.controlWorkSession(id, "pause"))} disabled={busy}>Pause</button><button onClick={() => void run(() => localNexusClient.controlWorkSession(id, "continue"))} disabled={busy}>Continue</button><button onClick={() => void run(() => localNexusClient.controlWorkSession(id, "cancel"))} disabled={busy}><Square size={12} /> Cancel</button></div>}</article>;
      }) : <EmptyRecord>No active or recent work sessions.</EmptyRecord>}</div>
    </DataPanel>

    <DataPanel eyebrow="Governance" title="Approval queue" icon={<CheckCircle2 size={18} />}>
      <div className="compact-records">{approvals.length ? approvals.map((approval) => {
        const id = idOf(approval, ["approvalId", "id"]); return <article key={id ?? JSON.stringify(approval)}><strong>{text(approval.action ?? approval.objective, "Approval request")}</strong><span>{id ?? "ID unavailable"}</span><StatusPill value={text(approval.status, "pending")} />{id && <div className="inline-controls"><button onClick={() => window.confirm("Approve this Runtime request?") && void run(() => localNexusClient.approve(id))} disabled={busy}><CheckCircle2 size={12} /> Approve</button><button onClick={() => void run(() => localNexusClient.deny(id, "Denied by operator from NEXUS Web App."))} disabled={busy}><XCircle size={12} /> Deny</button></div>}</article>;
      }) : <EmptyRecord>No pending approval requests.</EmptyRecord>}</div>
    </DataPanel>

    <DataPanel eyebrow="Execution" title="Simulate before governed action" icon={<ShieldAlert size={18} />}>
      <label className="operation-field"><span>Action request</span><textarea value={action} onChange={(event) => setAction(event.target.value)} placeholder="Describe a bounded action…" /></label>
      <div className="operation-actions"><button onClick={() => action.trim() ? void run(() => localNexusClient.dryRunAction(action), false) : setError("Enter an action for the Runtime.")} disabled={busy}>Dry run</button><button className="danger-action" onClick={() => action.trim() && window.confirm("Submit this action to Runtime governance for execution?") && void run(() => localNexusClient.executeAction(action))} disabled={busy}>Request execution</button></div>
      <p className="boundary-note">A browser confirmation is operator acknowledgement only. Runtime policy and approval gates remain authoritative.</p>
      {result && <pre className="operation-result">{JSON.stringify(result, null, 2)}</pre>}
    </DataPanel>

    <DataPanel eyebrow="Operational Observation" title="Connector readiness" icon={<Network size={18} />} className="span-2">
      <div className="compact-records connector-records">{connectors.length ? connectors.map((connector) => <article key={text(connector.connectorId ?? connector.id)}><strong>{text(connector.name ?? connector.connectorId ?? connector.id, "Connector")}</strong><StatusPill value={text(connector.status ?? connector.state, "registered")} /><span>{text(connector.limitation ?? connector.message, "Runtime-registered connector")}</span></article>) : <EmptyRecord>No connectors are registered or the local Runtime is unavailable.</EmptyRecord>}</div>
    </DataPanel>
  </div>;
}
