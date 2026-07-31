import { useCallback, useEffect, useState } from "react";
import { Pause, Play, ReceiptText, Route, StepForward, XCircle } from "lucide-react";
import {
  localNexusClient,
  operationalSessionClient,
  type OperationalSession,
} from "../lib/local-client";
import { canonicalHostedControlAvailability } from "../lib/hosted-capability-gate";
import type { CapabilityRegistryProjection } from "../lib/types";
import { nexusModuleById } from "../platform/surfaceRegistry";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

type WorkSessionRecord = {
  sessionId: string;
  objective?: string;
  status?: string;
  currentStep?: string | null;
  honestNarration?: string;
  proofIds?: string[];
  receiptIds?: string[];
  approvalIds?: string[];
};

const object = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

function workSession(value: unknown): WorkSessionRecord | null {
  const record = object(value);
  const nested = object(record.session);
  const candidate = Object.keys(nested).length ? nested : record;
  if (typeof candidate.sessionId !== "string" || !candidate.sessionId) return null;
  return {
    sessionId: candidate.sessionId,
    objective: typeof candidate.objective === "string" ? candidate.objective : undefined,
    status: typeof candidate.status === "string" ? candidate.status : undefined,
    currentStep: typeof candidate.currentStep === "string" || candidate.currentStep === null
      ? candidate.currentStep
      : undefined,
    honestNarration: typeof candidate.honestNarration === "string" ? candidate.honestNarration : undefined,
    proofIds: Array.isArray(candidate.proofIds) ? candidate.proofIds.filter((item): item is string => typeof item === "string") : [],
    receiptIds: Array.isArray(candidate.receiptIds) ? candidate.receiptIds.filter((item): item is string => typeof item === "string") : [],
    approvalIds: Array.isArray(candidate.approvalIds) ? candidate.approvalIds.filter((item): item is string => typeof item === "string") : [],
  };
}

function workSessionList(value: unknown): WorkSessionRecord[] {
  const sessions = object(value).sessions;
  return Array.isArray(sessions)
    ? sessions.map(workSession).filter((item): item is WorkSessionRecord => item !== null)
    : [];
}

export function WorkSessionsWorkspace({
  capabilityRegistry = null,
  session = { authenticated: false },
}: {
  capabilityRegistry?: CapabilityRegistryProjection | null;
  session?: OperationalSession;
} = {}) {
  const hosted = operationalSessionClient.mode() === "hosted";
  const [objective, setObjective] = useState("");
  const [sessions, setSessions] = useState<WorkSessionRecord[]>([]);
  const [selected, setSelected] = useState<WorkSessionRecord | null>(null);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await localNexusClient.workSessions();
    const items = workSessionList(response);
    setSessions(items);
    setSelected((current) => (
      current
        ? items.find((item) => item.sessionId === current.sessionId) ?? current
        : items[0] ?? null
    ));
  }, []);

  useEffect(() => {
    let mounted = true;
    localNexusClient.workSessions()
      .then((response) => {
        if (!mounted) return;
        const items = workSessionList(response);
        setSessions(items);
        setSelected(items[0] ?? null);
      })
      .catch((caught) => {
        if (mounted) setError(caught instanceof Error ? caught.message : "Work Sessions are unavailable.");
      });
    return () => { mounted = false; };
  }, []);

  async function run(operation: () => Promise<Record<string, unknown>>) {
    setBusy(true);
    setError("");
    setReceipt(null);
    try {
      const result = await operation();
      const next = workSession(result);
      if (next) setSelected(next);
      const recordedReceipt = object(result.receipt);
      if (Object.keys(recordedReceipt).length) setReceipt(recordedReceipt);
      const failureReason = typeof result.failureReason === "string"
        ? result.failureReason
        : "";
      await refresh();
      if (failureReason) setError(failureReason);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The governed Work Session operation failed safely.");
    } finally {
      setBusy(false);
    }
  }

  async function showReceipt() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = object(await localNexusClient.workSessionReceipt(selected.sessionId));
      const recordedReceipt = object(response.receipt);
      if (!Object.keys(recordedReceipt).length) {
        throw new Error(`No receipt is recorded for ${selected.sessionId}.`);
      }
      setReceipt(recordedReceipt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Work Session receipt is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const actionGate = (method: string, pathTemplate: string, requiredScope: string) => (
    canonicalHostedControlAvailability(
      capabilityRegistry,
      {
        capabilityId: "operational.work_sessions",
        method,
        pathTemplate,
      },
      {
        hosted,
        authenticated: session.authenticated,
        scopes: session.scopes,
      },
      requiredScope,
    )
  );
  const planAction = actionGate("POST", "/work-sessions/plan", "operations:write");
  const startAction = actionGate("POST", "/work-sessions/start", "operations:write");
  const stepAction = actionGate("POST", "/work-sessions/{session_id}/step", "operations:write");
  const continueAction = actionGate("POST", "/work-sessions/{session_id}/continue", "operations:write");
  const pauseAction = actionGate("POST", "/work-sessions/{session_id}/pause", "operations:write");
  const cancelAction = actionGate("POST", "/work-sessions/{session_id}/cancel", "operations:write");
  const receiptAction = actionGate("GET", "/work-sessions/{session_id}/receipt", "operations:read");
  const planAvailable = planAction.available;
  const startAvailable = startAction.available;
  const pauseAvailable = pauseAction.available;
  const cancelAvailable = cancelAction.available;
  const receiptAvailable = receiptAction.available;
  const canSubmit = objective.trim().length > 0 && !busy;
  const selectedStatus = (selected?.status ?? "").toLowerCase();
  const terminal = new Set(["cancelled", "completed", "failed", "blocked", "budget_exceeded"]);
  const stepModule = nexusModuleById("work-sessions.step-execution");
  const continueModule = nexusModuleById("work-sessions.continuation");
  const stepAvailable = stepModule?.clients.web.state === "functional"
    && stepAction.available;
  const continueAvailable = continueModule?.clients.web.state === "functional"
    && continueAction.available;
  const canStep = stepAvailable && !busy && ["planned", "running"].includes(selectedStatus);
  const canContinue = continueAvailable && !busy && ["paused", "waiting_for_approval"].includes(selectedStatus);
  const canPause = pauseAvailable && !busy && ["planned", "running"].includes(selectedStatus);
  const canCancel = cancelAvailable && !busy && !terminal.has(selectedStatus);
  const unavailableActionReasons = [
    !planAvailable ? `Plan: ${planAction.reason}` : "",
    !startAvailable ? `Start: ${startAction.reason}` : "",
    !stepAvailable ? `Step: ${stepAction.available ? stepModule?.clients.web.reason : stepAction.reason}` : "",
    !continueAvailable ? `Continue: ${continueAction.available ? continueModule?.clients.web.reason : continueAction.reason}` : "",
  ].filter(Boolean);
  return <div className="experience-grid work-sessions-workspace">
    <DataPanel eyebrow="Governed autonomy" title="Bounded Work Session" icon={<Route size={18} />} className="span-2">
      <p className="boundary-note">
        Planning, continuity records, pause, cancellation, and receipt reads use exact scoped Runtime contracts.
        Effectful step and continuation controls remain unavailable until canonical per-action Authority and
        postcondition lineage are verified.
      </p>
      <label className="work-sessions-workspace__objective">
        <span>Objective</span>
        <textarea
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          placeholder="Describe one bounded objective."
          maxLength={4_000}
          disabled={busy}
        />
      </label>
      <div className="work-sessions-workspace__actions">
        <button type="button" disabled={!canSubmit || !planAvailable} title={planAvailable ? undefined : planAction.reason} onClick={() => void run(() => localNexusClient.planWorkSession(objective.trim()))}>
          <Route size={15} aria-hidden="true" /> Plan
        </button>
        <button type="button" disabled={!canSubmit || !startAvailable} title={startAvailable ? undefined : startAction.reason} onClick={() => void run(() => localNexusClient.startWorkSession(objective.trim()))}>
          <Play size={15} aria-hidden="true" /> Start
        </button>
      </div>
      {unavailableActionReasons.length > 0 && <p className="boundary-note">{unavailableActionReasons.join(" ")}</p>}
      {error && <p className="work-sessions-workspace__error" role="alert">{error}</p>}
    </DataPanel>

    <DataPanel eyebrow="Runtime state" title="Current session" icon={<StepForward size={18} />}>
      {selected ? <>
        <div className="work-sessions-workspace__heading">
          <strong>{selected.objective ?? selected.sessionId}</strong>
          <StatusPill value={selected.status ?? "unknown"} />
        </div>
        <dl className="surface-availability-boundary__clients">
          <div><dt>Session</dt><dd>{selected.sessionId}</dd></div>
          <div><dt>Current step</dt><dd>{selected.currentStep ?? "none"}</dd></div>
          <div><dt>Proofs</dt><dd>{selected.proofIds?.length ?? 0}</dd></div>
          <div><dt>Approvals</dt><dd>{selected.approvalIds?.length ?? 0}</dd></div>
        </dl>
        {selected.honestNarration && <p>{selected.honestNarration}</p>}
        <div className="work-sessions-workspace__actions">
          <button type="button" disabled={!canStep} title={stepAvailable ? undefined : stepAction.available ? stepModule?.clients.web.reason : stepAction.reason} onClick={() => void run(() => localNexusClient.controlWorkSession(selected.sessionId, "step"))}>
            <StepForward size={15} aria-hidden="true" /> step
          </button>
          <button type="button" disabled={!canContinue} title={continueAvailable ? undefined : continueAction.available ? continueModule?.clients.web.reason : continueAction.reason} onClick={() => void run(() => localNexusClient.controlWorkSession(selected.sessionId, "continue"))}>
            <StepForward size={15} aria-hidden="true" /> continue
          </button>
          <button type="button" disabled={!canPause} title={pauseAvailable ? undefined : pauseAction.reason} onClick={() => void run(() => localNexusClient.controlWorkSession(selected.sessionId, "pause"))}>
            <Pause size={15} aria-hidden="true" /> pause
          </button>
          <button type="button" disabled={!canCancel} title={cancelAvailable ? undefined : cancelAction.reason} onClick={() => void run(() => localNexusClient.controlWorkSession(selected.sessionId, "cancel"))}>
            <XCircle size={15} aria-hidden="true" /> cancel
          </button>
          <button type="button" disabled={busy || !receiptAvailable} title={receiptAvailable ? undefined : receiptAction.reason} onClick={() => void showReceipt()}>
            <ReceiptText size={15} aria-hidden="true" /> Receipt
          </button>
        </div>
      </> : <EmptyRecord>No Runtime-owned Work Session has been observed.</EmptyRecord>}
    </DataPanel>

    <DataPanel eyebrow="Continuity" title="Recent sessions" icon={<Route size={18} />}>
      {sessions.length ? <div className="reference-list">
        {sessions.slice(0, 8).map((session) => <button
          type="button"
          key={session.sessionId}
          onClick={() => { setSelected(session); setReceipt(null); }}
        >
          <strong>{session.objective ?? session.sessionId}</strong>
          <StatusPill value={session.status ?? "unknown"} />
        </button>)}
      </div> : <EmptyRecord />}
      {receipt && <article className="work-sessions-workspace__receipt">
        <span>Receipt</span>
        <strong>{String(receipt.receiptId ?? receipt.workSessionReceiptId ?? "recorded")}</strong>
        <StatusPill value={String(receipt.status ?? "recorded")} />
      </article>}
    </DataPanel>
  </div>;
}
