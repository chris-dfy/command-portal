import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, CheckCircle2, FilePlus2, RefreshCw, Scale, ShieldAlert, TriangleAlert } from "lucide-react";
import { DataPanel } from "./DataPanel";
import { OperationalResultLineage, type OpenOperationalReplay } from "./OperationalResultLineage";
import { StatusPill } from "./StatusPill";
import {
  conclaveRunFromWorkspace,
  type ConclaveRun,
} from "../lib/conclave-client";
import {
  resolvePendingConclaveEvidenceAdmission,
  resolvePendingConclaveCreate,
  type ConclaveEvidenceAdmissionRequest,
  type ConclavePredecessor,
  type PendingConclaveEvidenceAdmission,
  type PendingConclaveCreate,
} from "../lib/conclave-request-identity";
import {
  localNexusClient,
  operationalSessionClient,
  type ConclaveWorkspaceRecord,
  type OperationalSession,
} from "../lib/local-client";
import {
  conclaveDirectoryLabel,
  defaultConclaveWorkspace,
  isLegacyPromptOnly,
  isVerifiedCanonicalReview,
  orderConclaveDirectory,
} from "../lib/conclave-directory";
import { canonicalHostedControlAvailability } from "../lib/hosted-capability-gate";
import { conclaveActionGates } from "../lib/conclave-action-flow";
import { displayLabel } from "../lib/presentation";
import type { CapabilityRegistryProjection } from "../lib/types";
import { admitCanonicalActionIntent } from "../lib/canonical-action-intent";

const suggestedProposal = "Investigate how an Edge Runtime can establish evidence-only communication with an unfamiliar operational asset, identify every available interface, and recommend the safest next test.";
const evidenceSourceClassifications: ConclaveEvidenceAdmissionRequest["sourceClassification"][] = [
  "tenant_knowledge",
  "retrieved_evidence",
];
export type ConclaveWorkspaceAvailability = {
  capabilityState: string;
  status: string;
  tone: "good" | "warn" | "bad" | "neutral";
  title: string;
  summary: string;
  gatewayState: string;
  reason: string;
  tenantId: string;
  workspaceId: string;
  expiresAt: string | null;
};
const compactReference = (value: string, leading = 12, trailing = 8) => (
  value.length > leading + trailing + 1
    ? `${value.slice(0, leading)}…${value.slice(-trailing)}`
    : value
);
const workspaceDisplayStatus = (workspace: ConclaveWorkspaceRecord) => (
  workspace.lifecyclePosture === "legacy_read_only"
    ? "legacy_read_only"
    : workspace.displayStatus
);
const lines = (value: string) => value
  .split("\n")
  .map((item) => item.trim())
  .filter(Boolean);
const presentationText = (record: Record<string, unknown> | null, keys: string[]) => {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};
const reconcileRefreshedRun = (
  current: ConclaveRun,
  refreshed: ConclaveWorkspaceRecord,
): ConclaveRun => {
  const recovered = conclaveRunFromWorkspace(refreshed);
  return current.runPending
    && recovered.runPending
    && current.expectedWorkspaceVersion === refreshed.workspaceVersion
    ? { ...current, workspace: refreshed }
    : recovered;
};

export function ConclaveWorkspace({
  onReplay,
  readiness = null,
  session = { authenticated: false },
  capabilityRegistry = null,
  availability = null,
}: {
  onReplay?: OpenOperationalReplay;
  readiness?: Record<string, unknown> | null;
  session?: OperationalSession;
  capabilityRegistry?: CapabilityRegistryProjection | null;
  availability?: ConclaveWorkspaceAvailability | null;
} = {}) {
  const [proposal, setProposal] = useState("");
  const [pendingCreate, setPendingCreate] = useState<PendingConclaveCreate | null>(null);
  const [pendingEvidence, setPendingEvidence] = useState<PendingConclaveEvidenceAdmission | null>(null);
  const [evidenceTaskId, setEvidenceTaskId] = useState("");
  const [evidenceOrigin, setEvidenceOrigin] = useState("");
  const [evidenceSourceClassification, setEvidenceSourceClassification] = useState<ConclaveEvidenceAdmissionRequest["sourceClassification"]>("tenant_knowledge");
  const [evidenceConfidence, setEvidenceConfidence] = useState("1");
  const [evidenceClaim, setEvidenceClaim] = useState("");
  const [evidenceArtifacts, setEvidenceArtifacts] = useState("");
  const [evidenceRelationships, setEvidenceRelationships] = useState("");
  const [evidenceOperationalContext, setEvidenceOperationalContext] = useState("{}");
  const [run, setRun] = useState<ConclaveRun | null>(null);
  const [workspaces, setWorkspaces] = useState<ConclaveWorkspaceRecord[]>([]);
  const [sourceState, setSourceState] = useState<"loading" | "available" | "empty" | "unavailable" | "stale">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const workspace = run?.workspace ?? null;
  const orderedWorkspaces = orderConclaveDirectory(workspaces);
  const verifiedResult = workspace ? isVerifiedCanonicalReview(workspace) : false;
  const legacyPromptOnly = workspace ? isLegacyPromptOnly(workspace) : false;
  const synthesis = presentationText(workspace?.executiveSummary ?? null, ["synthesis", "summary", "conclusion", "narrative"]);
  const synthesisOutcome = presentationText(workspace?.executiveSummary ?? null, ["outcome", "status"]);
  const terminalReceiptReference = presentationText(
    workspace?.completionReceipt ?? workspace?.runReceipt ?? null,
    ["receiptId", "receipt_id", "id"],
  );
  const taskCounts = workspace?.tasks.reduce<Record<string, number>>((counts, task) => {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
    return counts;
  }, {}) ?? {};
  const waitingTasks = workspace?.tasks.filter((task) => (
    workspace.waitingTaskIds?.includes(task.task_id)
    || (
      task.status !== "complete"
      && task.evidence_required.length > task.evidence_ids.length
    )
  )) ?? [];
  const selectedEvidenceTaskId = waitingTasks.some((task) => task.task_id === evidenceTaskId)
    ? evidenceTaskId
    : waitingTasks[0]?.task_id ?? "";
  const readinessCapabilities = Array.isArray(readiness?.capabilities) ? readiness.capabilities.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  const conclaveCapability = readinessCapabilities.find((item) => String(item.capabilityId ?? item.capability_id ?? item.id ?? "") === "conclave");
  const conclaveAvailable = String(conclaveCapability?.state ?? conclaveCapability?.status ?? "unavailable").toLowerCase() === "available";
  const hostedActionAccess = {
    hosted: operationalSessionClient.mode() === "hosted",
    authenticated: session.authenticated,
    scopes: session.scopes,
  };
  const createAction = canonicalHostedControlAvailability(
    capabilityRegistry,
    {
      capabilityId: "conclave",
      method: "POST",
      pathTemplate: "/conclave/workspaces",
    },
    hostedActionAccess,
    "operations:write",
  );
  const runAction = canonicalHostedControlAvailability(
    capabilityRegistry,
    {
      capabilityId: "conclave",
      method: "POST",
      pathTemplate: "/conclave/workspaces/{mission_id}/run",
    },
    hostedActionAccess,
    "operations:write",
  );
  const evidenceAction = canonicalHostedControlAvailability(
    capabilityRegistry,
    {
      capabilityId: "evidence",
      method: "POST",
      pathTemplate: "/conclave/workspaces/{mission_id}/tasks/{task_id}/evidence",
    },
    hostedActionAccess,
    "evidence:write",
  );
  const { createAllowed: creationAllowed, runAllowed } = conclaveActionGates(
    createAction.available,
    runAction.available,
  );
  const creationReason = createAction.available
    ? "The exact durable Conclave create action is live under the hosted operations:write scope. Creation does not dispatch a run."
    : createAction.reason;
  const evidenceAdmissionAllowed = workspace?.lifecyclePosture === "canonical_operational"
    && evidenceAction.available;
  const evidenceAdmissionReason = workspace?.lifecyclePosture !== "canonical_operational"
      ? "Historical legacy workspaces are read-only; restart the Review before admitting Evidence."
      : evidenceAction.reason;
  const conclaveReadinessNote = conclaveAvailable
    ? "Aggregate Conclave readiness is available."
    : String(
      conclaveCapability?.reason
      ?? conclaveCapability?.requiredNextAction
      ?? "Aggregate Conclave readiness is unavailable; exact action truth remains authoritative for each control.",
    );
  const investigationPosture = workspace
    ? "A saved Review is selected."
    : sourceState === "loading"
      ? "Loading saved Reviews…"
      : !creationAllowed
        ? "Starting an investigation is currently unavailable."
        : sourceState === "unavailable"
          ? "Saved Reviews are unavailable; a new investigation can still be requested."
          : sourceState === "stale"
            ? "Saved Reviews may be out of date; a new investigation can still be requested."
          : "Ready to request a new evidence-backed investigation.";
  const actionAvailabilityNote = [
    creationAllowed
      ? "Start requests a Runtime Review record."
      : "Start is unavailable. Open Tool availability below for the Runtime reason.",
    run?.runPending && !runAllowed
      ? "Run is unavailable. Open Tool availability below for the Runtime reason."
      : "",
  ].filter(Boolean).join(" ");

  const refreshDirectory = useCallback(async () => {
    try {
      const result = await localNexusClient.conclaveWorkspaces();
      const next = Array.isArray(result.workspaces) ? result.workspaces : [];
      const ordered = orderConclaveDirectory(next);
      setWorkspaces(ordered);
      setSourceState(next.length ? "available" : "empty");
      setRun((current) => {
        const refreshed = current && next.find((item) => item.missionId === current.workspace.missionId);
        if (refreshed) return reconcileRefreshedRun(current, refreshed);
        const selected = defaultConclaveWorkspace(ordered);
        return current ?? (selected ? conclaveRunFromWorkspace(selected) : null);
      });
    } catch (caught) {
      setSourceState((current) => current === "available" || current === "stale" ? "stale" : "unavailable");
      setError(caught instanceof Error ? caught.message : "Conclave workspace history is unavailable.");
    }
  }, []);

  useEffect(() => { void refreshDirectory(); }, [refreshDirectory]);

  async function startInvestigation() {
    const restartCanonical = workspace?.lifecyclePosture === "legacy_read_only"
      && workspace.availableActions.includes("restart_canonical");
    const value = (
      restartCanonical
        ? workspace.proposal
        : proposal.trim() || pendingCreate?.proposal || ""
    ).trim();
    if (!value || busy) return;
    if (!creationAllowed) {
      setError(creationReason);
      return;
    }
    setBusy(true); setError(null); setOutcome(null);
    try {
      const predecessor: ConclavePredecessor | undefined = restartCanonical && workspace
        ? {
          missionId: workspace.missionId,
          workspaceId: workspace.workspaceId,
          workspaceVersion: workspace.workspaceVersion,
        }
        : undefined;
      const createIdentity = resolvePendingConclaveCreate(
        pendingCreate,
        {
          proposal: value,
          ...(predecessor ? { predecessor } : {}),
        },
        () => globalThis.crypto.randomUUID(),
      );
      setPendingCreate(createIdentity);
      setProposal("");
      const admission = await admitCanonicalActionIntent(
        `${restartCanonical ? "Restart" : "Create"} a governed Conclave Review for this proposal: ${createIdentity.proposal}${createIdentity.predecessor ? ` Predecessor binding: ${JSON.stringify(createIdentity.predecessor)}.` : ""}`,
        createIdentity.idempotencyKey,
      );
      setPendingCreate(null);
      setOutcome(admission.spokenSummary);
      await refreshDirectory();
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  async function retryInvestigation() {
    if (!run?.runPending || busy) return;
    if (!runAllowed) {
      setError(runAction.reason);
      return;
    }
    setBusy(true); setError(null); setOutcome(null);
    try {
      const admission = await admitCanonicalActionIntent(
        `Run governed Conclave Review ${JSON.stringify(run.workspace.missionId)} at expected workspace version ${JSON.stringify(run.expectedWorkspaceVersion)}.`,
        run.runIdempotencyKey,
      );
      setOutcome(admission.spokenSummary);
      await refreshDirectory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function admitEvidence() {
    if (!workspace || busy) return;
    let admission = pendingEvidence?.missionId === workspace.missionId
      ? pendingEvidence
      : null;
    if (!selectedEvidenceTaskId && !admission) return;
    if (!evidenceAdmissionAllowed) {
      setError(evidenceAdmissionReason);
      return;
    }
    if (!admission) {
      const confidence = Number(evidenceConfidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        setError("Evidence confidence must be a number between zero and one.");
        return;
      }
      let operationalContext: Record<string, unknown>;
      try {
        const parsed = JSON.parse(evidenceOperationalContext) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        operationalContext = parsed as Record<string, unknown>;
      } catch {
        setError("Operational Context must be a valid JSON object.");
        return;
      }
      const evidence: ConclaveEvidenceAdmissionRequest = {
        origin: evidenceOrigin,
        sourceClassification: evidenceSourceClassification,
        confidence,
        claim: evidenceClaim,
        supportingArtifacts: lines(evidenceArtifacts),
        relationships: lines(evidenceRelationships),
        operationalContext,
      };
      admission = resolvePendingConclaveEvidenceAdmission(
        null,
        workspace.missionId,
        selectedEvidenceTaskId,
        evidence,
        () => globalThis.crypto.randomUUID(),
      );
      setPendingEvidence(admission);
      setEvidenceOrigin("");
      setEvidenceClaim("");
      setEvidenceArtifacts("");
      setEvidenceRelationships("");
      setEvidenceOperationalContext("{}");
    }
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await admitCanonicalActionIntent(
        `Admit this Evidence to Conclave Review ${JSON.stringify(admission.missionId)} task ${JSON.stringify(admission.taskId)}: ${JSON.stringify(admission.evidence)}.`,
        admission.idempotencyKey,
      );
      setOutcome(result.spokenSummary);
      setPendingEvidence(null);
      setEvidenceTaskId("");
      await refreshDirectory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function refreshWorkspace() {
    if (!workspace || busy) return;
    setBusy(true); setError(null);
    try {
      const refreshed = await localNexusClient.conclaveWorkspace(workspace.missionId);
      setRun((current) => current ? reconcileRefreshedRun(current, refreshed) : current);
      setWorkspaces((current) => current.map((item) => item.missionId === refreshed.missionId ? refreshed : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  return <div className="conclave-workspace">
    {availability && <section className="hosted-operational-context hosted-operational-context--summary" aria-label="Workspace availability" data-capability-state={availability.capabilityState}>
      <header className="hosted-operational-context__summary">
        <StatusPill value={availability.status} tone={availability.tone} />
        <div><strong>{availability.title}</strong><p>{availability.summary}</p></div>
      </header>
    </section>}
    <DataPanel eyebrow="Investigation" title="What would you like to investigate?" icon={<Scale size={18} />}>
      <div className="conclave-workspace-posture">
        <StatusPill value={workspace ? workspaceDisplayStatus(workspace) : sourceState} />
        <span>{investigationPosture}</span>
      </div>
      <div className="conclave-composer"><label htmlFor="conclave-workspace">Saved Reviews</label><select id="conclave-workspace" value={workspace?.missionId ?? ""} onChange={(event) => { const selected = workspaces.find((item) => item.missionId === event.target.value); setRun(selected ? conclaveRunFromWorkspace(selected) : null); }} disabled={sourceState === "loading"}><option value="">{sourceState === "loading" ? "Loading saved Reviews…" : "Start a new investigation"}</option>{orderedWorkspaces.map((item) => <option key={item.missionId} value={item.missionId}>{conclaveDirectoryLabel(item)}</option>)}</select><label htmlFor="conclave-proposal">Operational question</label><textarea id="conclave-proposal" value={proposal} onChange={(event) => setProposal(event.target.value)} placeholder={suggestedProposal} maxLength={3000} autoComplete="off" /><div><small>{proposal.length.toLocaleString()} / 3,000 · not yet a Runtime record</small><span className="conclave-composer__actions">{run?.runPending && <button className="conclave-secondary-action" onClick={() => void retryInvestigation()} disabled={busy || !runAllowed} aria-describedby="conclave-action-availability"><RefreshCw size={16} />Run review</button>}{workspace && <button className="conclave-secondary-action" onClick={() => void refreshWorkspace()} disabled={busy}><RefreshCw size={16} />Refresh</button>}<button onClick={() => void startInvestigation()} disabled={busy || !creationAllowed || (workspace ? !(workspace.lifecyclePosture === "legacy_read_only" && workspace.availableActions.includes("restart_canonical")) : !proposal.trim() && !pendingCreate?.proposal)} aria-describedby="conclave-action-availability"><BrainCircuit size={16} />{busy ? "Coordinating…" : workspace?.lifecyclePosture === "legacy_read_only" ? "Restart as current Review" : pendingCreate ? "Retry start" : "Start investigation"}</button></span></div></div>
      {error && <p className="conclave-error" role="alert">{error}</p>}
      {outcome && <p className="boundary-note" role="status">{outcome}</p>}
      <p id="conclave-action-availability" className="conclave-control-note">{actionAvailabilityNote}</p>
      <p className="conclave-governance-summary"><ShieldAlert size={16} aria-hidden="true" />Starting an investigation requests creation of a governed Review record. It does not run tasks or authorize external actions.</p>
      <details className="conclave-technical-details">
        <summary>Tool availability</summary>
        <dl>
          <div><dt>Workspace directory</dt><dd>{sourceState}. NEXUS does not substitute a browser-only result when durable Conclave is unavailable.</dd></div>
          <div><dt>Create Review</dt><dd>{creationReason}</dd></div>
          <div><dt>Run Review</dt><dd>{runAction.reason}</dd></div>
          <div><dt>Readiness</dt><dd>{conclaveReadinessNote}</dd></div>
        </dl>
      </details>
    </DataPanel>

    {availability && <section className="hosted-operational-context hosted-operational-context--details" aria-label="Workspace technical details">
      <details className="hosted-operational-context__details">
        <summary>System details</summary>
        <dl>
          <div><dt>Gateway connection</dt><dd><StatusPill value={availability.gatewayState} /></dd></div>
          <div><dt>Capability state</dt><dd><StatusPill value={availability.capabilityState} /></dd></div>
          <div><dt>Tenant</dt><dd>{availability.tenantId}</dd></div>
          <div><dt>Workspace</dt><dd>{availability.workspaceId}</dd></div>
          <div><dt>Session expires</dt><dd>{availability.expiresAt ? <time dateTime={availability.expiresAt}>{new Date(availability.expiresAt).toLocaleString()}</time> : "Unavailable"}</dd></div>
          <div className="hosted-operational-context__reason"><dt>Verified Runtime reason</dt><dd>{availability.reason}</dd></div>
        </dl>
      </details>
    </section>}

    {verifiedResult && workspace && <section className="conclave-result" aria-label="Verified Conclave Review result">
      <CheckCircle2 size={22} />
      <div><span>Verified canonical Review result</span><strong>{synthesis || workspace.recommendedNextAction}</strong><small>Review integrity verified · Terminal receipt verified.</small><OperationalResultLineage receiptId={terminalReceiptReference} replayId={workspace.operationalReplay.runId} missionId={workspace.missionId} onOpenReplay={onReplay} /></div>
    </section>}

    {legacyPromptOnly && workspace && <section className="conclave-legacy-notice" aria-label="Legacy prompt-only record">
      <TriangleAlert size={20} />
      <div><strong>Historical prompt only — not a Review result</strong><p>This preserved read-only record contains zero admitted Evidence and no verified terminal receipt. Restart it as a canonical Review to produce current governed results.</p></div>
    </section>}

    <section className="conclave-context-grid" aria-label="Conclave mission workspace">
      <article><span>Mission / workspace</span><strong>{workspace ? <code className="conclave-reference" title={workspace.missionId}>{compactReference(workspace.missionId)}</code> : "Not started"}</strong><p>{workspace ? <><code className="conclave-reference" title={workspace.workspaceId}>{compactReference(workspace.workspaceId)}</code> · {workspace.proposal}</> : proposal || "Frame an investigation mission above."}</p></article>
      {workspace?.predecessor && <article><span>Predecessor lineage</span><strong><code className="conclave-reference" title={workspace.predecessor.missionId}>{compactReference(workspace.predecessor.missionId)}</code></strong><p><code className="conclave-reference" title={workspace.predecessor.workspaceId}>{compactReference(workspace.predecessor.workspaceId)}</code> · <code className="conclave-reference" title={workspace.predecessor.workspaceVersion}>{compactReference(workspace.predecessor.workspaceVersion)}</code></p></article>}
      <article><span>Objectives</span><strong>{workspace ? `${workspace.objectives.length} evidence lanes` : "Awaiting mission"}</strong><p>Domain-neutral inquiry routes through the existing Knowledge Acquisition Engine.</p></article>
      <article><span>Knowledge</span><strong>{workspace?.evidence.length ?? 0} admitted Evidence records</strong><p>Working state stays in Mission Store; nothing is silently promoted to Knowledge Store.</p></article>
      <article><span>Unknowns</span><strong>{workspace?.unknowns.length ?? 0} open questions</strong><p>{workspace ? "Unknowns remain first-class until Evidence resolves them." : "Unknowns populate when the workspace is created."}</p></article>
      <article><span>Task Graph</span><strong>{workspace ? `${taskCounts.in_progress ?? 0} active · ${taskCounts.complete ?? 0} complete` : "Awaiting mission"}</strong><p>{workspace ? `${taskCounts.assigned ?? 0} dependency-gated tasks are waiting.` : "Tasks are generated by the CAO-005 Mission Planner."}</p></article>
      <article><span>Specialists</span><strong>{workspace?.specialistRegistry.filter((item) => item.assignedTaskIds.length).length ?? 0} assigned roles</strong><p>Roles are configurable and contain no product-specific expertise.</p></article>
      <article><span>Evidence</span><strong>{workspace?.evidence.length ?? 0} immutable records</strong><p>{workspace?.waitingForEvidence ? "Active specialists are waiting for authorized collectors." : "Evidence posture updates from the Runtime."}</p></article>
      <article><span>Knowledge Graph</span><strong>{workspace ? `${workspace.contradictions.length} open contradiction records` : "Not established"}</strong><p>Findings, provenance, unknowns, and contradictions remain linked.</p></article>
      <article><span>Operational Replay</span><strong>{workspace ? <code className="conclave-reference" title={workspace.operationalReplay.runId}>{compactReference(workspace.operationalReplay.runId)}</code> : "No Replay"}</strong><p>{workspace ? <><code className="conclave-reference" title={workspace.operationalReplay.contentDigest}>{compactReference(workspace.operationalReplay.contentDigest)}</code> · {workspace.operationalReplay.stageCount} recorded stages</> : "Replay begins when the mission is admitted."}</p></article>
      <article><span>Lifecycle Receipt</span><strong>{workspace?.lifecycleReceipt ? <code className="conclave-reference" title={workspace.lifecycleReceipt.receiptId}>{compactReference(workspace.lifecycleReceipt.receiptId)}</code> : "Not issued"}</strong><p>{workspace?.lifecycleReceipt ? <>Recorded {workspace.lifecycleReceipt.recordedStatus}; <code className="conclave-reference" title={workspace.lifecycleReceipt.contentDigest}>{compactReference(workspace.lifecycleReceipt.contentDigest)}</code>. Completion is not claimed.</> : "A Runtime receipt is issued when the mission lifecycle starts."}</p></article>
      <article><span>Executive Conclusions</span><strong>{workspace?.executiveSummary ? "Evidence-backed synthesis available" : "Withheld"}</strong><p>{workspace?.recommendedNextAction ?? "Conclusions require completed tasks and admitted Evidence."}</p></article>
    </section>

    {workspace?.waitingForEvidence && workspace.lifecyclePosture === "canonical_operational" && <DataPanel eyebrow="Evidence admission" title="Unblock an evidence-waiting task" icon={<FilePlus2 size={18} />}>
      <form className="conclave-evidence-intake" onSubmit={(event) => { event.preventDefault(); void admitEvidence(); }}>
        <label><span>Evidence-waiting task</span><select value={selectedEvidenceTaskId} onChange={(event) => { setEvidenceTaskId(event.target.value); setPendingEvidence(null); }} required>{waitingTasks.map((task) => <option key={task.task_id} value={task.task_id}>{task.objective} · {compactReference(task.task_id)}</option>)}</select></label>
        <label><span>Source origin</span><input value={evidenceOrigin} onChange={(event) => { setEvidenceOrigin(event.target.value); setPendingEvidence(null); }} placeholder="runtime://edge/node/observation-id" maxLength={2000} autoComplete="off" required /></label>
        <label><span>Source classification</span><select value={evidenceSourceClassification} onChange={(event) => { setEvidenceSourceClassification(event.target.value as ConclaveEvidenceAdmissionRequest["sourceClassification"]); setPendingEvidence(null); }}>{evidenceSourceClassifications.map((classification) => <option key={classification} value={classification}>{displayLabel(classification)}</option>)}</select></label>
        <label><span>Confidence input</span><input type="number" min="0" max="1" step="0.01" value={evidenceConfidence} onChange={(event) => { setEvidenceConfidence(event.target.value); setPendingEvidence(null); }} required /></label>
        <label className="span-2"><span>Evidence claim</span><textarea value={evidenceClaim} onChange={(event) => { setEvidenceClaim(event.target.value); setPendingEvidence(null); }} placeholder="State only what this source supports, contradicts, or contextualizes." maxLength={8000} autoComplete="off" required /></label>
        <label><span>Supporting artifact refs</span><textarea value={evidenceArtifacts} onChange={(event) => { setEvidenceArtifacts(event.target.value); setPendingEvidence(null); }} placeholder={"One immutable reference per line"} autoComplete="off" /></label>
        <label><span>Relationship refs</span><textarea value={evidenceRelationships} onChange={(event) => { setEvidenceRelationships(event.target.value); setPendingEvidence(null); }} placeholder={"One relationship per line"} autoComplete="off" /></label>
        <label className="span-2"><span>Operational Context (JSON object)</span><textarea value={evidenceOperationalContext} onChange={(event) => { setEvidenceOperationalContext(event.target.value); setPendingEvidence(null); }} spellCheck={false} autoComplete="off" /></label>
        <div className="conclave-evidence-intake__actions span-2"><div><p className="boundary-note">The Runtime verifies and records admitted Evidence. Adding Evidence does not complete the task.</p><details className="conclave-technical-details"><summary>Evidence availability</summary><p>{evidenceAdmissionReason} The Runtime derives the collector from the authenticated principal.</p></details></div><button type="submit" disabled={busy || !evidenceAdmissionAllowed || (!pendingEvidence && (!selectedEvidenceTaskId || !evidenceOrigin.trim() || !evidenceClaim.trim()))}><FilePlus2 size={16} />{pendingEvidence ? "Retry exact Evidence admission" : "Add Evidence"}</button></div>
      </form>
    </DataPanel>}

    {workspace ? <>
      <section className="conclave-summary" data-outcome={workspace.waitingForEvidence ? "insufficient_context" : workspaceDisplayStatus(workspace)}>
        <div><span>Mission Executor posture</span><h3>{displayLabel(workspaceDisplayStatus(workspace))}</h3><p>{workspace.recommendedNextAction}</p></div>
        <dl><div><dt>Active tasks</dt><dd>{taskCounts.in_progress ?? 0}</dd></div><div><dt>Evidence</dt><dd>{workspace.evidence.length}</dd></div><div><dt>Replay stages</dt><dd>{workspace.operationalReplay.stageCount}</dd></div><div><dt>External execution</dt><dd>Not performed</dd></div></dl>
      </section>

      <div className="conclave-perspectives">{workspace.tasks.map((task) => {
        const specialist = workspace.specialistRegistry.find((item) => item.specialist_id === task.specialist_id);
        return <article key={task.task_id} data-position={task.status === "blocked" ? "challenge" : task.status === "complete" ? "support" : "conditional"}>
          <header>{task.status === "blocked" ? <ShieldAlert size={18} /> : <CheckCircle2 size={18} />}<div><span>{specialist?.purpose ?? "Unassigned specialist role"}</span><h3>{specialist?.name ?? task.specialist_id ?? "Unassigned"}</h3></div><StatusPill value={task.status} /></header>
          <p>{task.objective}</p>
          <section><strong>Required before progression</strong><ul>{task.evidence_required.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <small><code className="conclave-reference" title={task.task_id}>{compactReference(task.task_id)}</code> · {task.evidence_ids.length} Evidence record(s) · {task.dependencies.length} dependencies</small>
        </article>;
      })}</div>

      <DataPanel eyebrow="Conclave synthesis" title={workspace.executiveSummary ? "Runtime synthesis recorded" : "Withheld pending Evidence"} icon={<ShieldAlert size={18} />}>
        <div className="conclave-boundary">{synthesis ? <p>{synthesis}</p> : <p>{workspace.executiveSummary ? "The Runtime recorded a structured executive summary but supplied no presentation-safe synthesis field." : "No synthesis is presented until the durable Runtime workspace records an evidence-backed executive summary."}</p>}{synthesisOutcome && <StatusPill value={synthesisOutcome} />}<small><code className="conclave-reference" title={workspace.missionId}>{compactReference(workspace.missionId)}</code> · source: authenticated Runtime workspace · hidden model reasoning is never presented</small></div>
      </DataPanel>

      <DataPanel eyebrow="Truth boundary" title="Current operational limits" icon={<TriangleAlert size={18} />}>
        <div className="conclave-boundary"><p>The workspace is executing coordination, not device control. A task state does not claim a specialist or operational asset performed work.</p><ul>{workspace.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul><small><code className="conclave-reference" title={workspace.missionId}>{compactReference(workspace.missionId)}</code> · scope {workspace.scope.tenantId}/<code className="conclave-reference" title={workspace.scope.workspaceId}>{compactReference(workspace.scope.workspaceId)}</code></small></div>
      </DataPanel>
    </> : <section className="conclave-empty"><BrainCircuit size={25} /><div><strong>No live investigation is active in this client session.</strong><p>Frame a mission above. Conclave will create an isolated workspace, task graph, specialist assignments, and Replay stream in the operational Runtime.</p></div></section>}
  </div>;
}
