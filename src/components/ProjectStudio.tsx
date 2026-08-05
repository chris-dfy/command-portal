import { useEffect, useState } from "react";
import { Calculator, FileCheck2, FolderKanban, Plus, RefreshCw, Route } from "lucide-react";
import { DataPanel } from "./DataPanel";
import {
  localNexusClient,
  operationalSessionClient,
  type ArtifactDefinition,
  type CompiledArtifact,
  type OperationalSession,
  type PlanningModel,
  type ProjectEstimate,
  type ProjectScope,
} from "../lib/local-client";
import {
  canonicalHostedControlAvailability,
  PROJECTS_PLANNING_CAPABILITY_ID,
} from "../lib/hosted-capability-gate";
import { displayLabel } from "../lib/presentation";
import type { CapabilityRegistryProjection } from "../lib/types";
import {
  beginPrivateDraftAttempt,
  clearPrivateDraftAfterSuccess,
  retainPrivateDraftAfterFailure,
  snapshotPrivateDraftOperation,
  type PrivateDraftOperation,
} from "../lib/private-draft-operation";
import { OperationalResultLineage, type OpenOperationalReplay } from "./OperationalResultLineage";
import { admitCanonicalActionIntent, canonicalExecutionResult } from "../lib/canonical-action-intent";

type ProjectCreatePayload = { name: string };
type ProjectCompilePayload = {
  projectId: string;
  artifactType: string;
  options: Record<string, unknown>;
};

export function ProjectStudio({
  onReplay,
  capabilityRegistry = null,
  session = { authenticated: false },
}: {
  onReplay?: OpenOperationalReplay;
  capabilityRegistry?: CapabilityRegistryProjection | null;
  session?: OperationalSession;
} = {}) {
  const [definitions, setDefinitions] = useState<ArtifactDefinition[]>([]);
  const [projectName, setProjectName] = useState("");
  const [pendingCreate, setPendingCreate] = useState<PrivateDraftOperation<ProjectCreatePayload> | null>(null);
  const [projectId, setProjectId] = useState("");
  const [artifactType, setArtifactType] = useState("roadmap");
  const [weeks, setWeeks] = useState("");
  const [assumption, setAssumption] = useState("");
  const [pendingCompile, setPendingCompile] = useState<PrivateDraftOperation<ProjectCompilePayload> | null>(null);
  const [scope, setScope] = useState<ProjectScope | null>(null);
  const [estimate, setEstimate] = useState<ProjectEstimate | null>(null);
  const [planning, setPlanning] = useState<PlanningModel | null>(null);
  const [artifact, setArtifact] = useState<CompiledArtifact | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hostedAccess = {
    hosted: operationalSessionClient.mode() === "hosted",
    authenticated: session.authenticated,
    scopes: session.scopes,
  };
  const createAction = canonicalHostedControlAvailability(
    capabilityRegistry,
    {
      capabilityId: PROJECTS_PLANNING_CAPABILITY_ID,
      method: "POST",
      pathTemplate: "/projects",
    },
    hostedAccess,
    "operations:write",
  );
  const compileAction = canonicalHostedControlAvailability(
    capabilityRegistry,
    {
      capabilityId: PROJECTS_PLANNING_CAPABILITY_ID,
      method: "POST",
      pathTemplate: "/projects/{project_id}/compile",
    },
    hostedAccess,
    "operations:write",
  );

  useEffect(() => { void localNexusClient.artifactTypes().then((data) => setDefinitions(data.artifacts)).catch((error) => setMessage(messageFrom(error))); }, []);

  async function create() {
    if (!createAction.available) {
      setMessage(createAction.reason);
      return;
    }
    const staged = pendingCreate ?? snapshotPrivateDraftOperation(
      { name: projectName.trim() || "New NEXUS Project" },
      `project-create:${globalThis.crypto.randomUUID()}`,
    );
    if (!pendingCreate) setProjectName("");
    const operation = beginPrivateDraftAttempt(staged);
    setPendingCreate(operation);
    setBusy(true); setMessage(null);
    try {
      const admission = await admitCanonicalActionIntent(
        `Create a governed NEXUS Project named ${JSON.stringify(operation.payload.name)}.`,
        operation.idempotencyKey,
      );
      const project = canonicalExecutionResult(admission);
      setPendingCreate(clearPrivateDraftAfterSuccess());
      if (typeof project.projectId === "string") setProjectId(project.projectId);
      setMessage(admission.spokenSummary);
    } catch (error) {
      setPendingCreate(retainPrivateDraftAfterFailure(operation));
      setMessage(messageFrom(error));
    }
    finally { setBusy(false); }
  }

  async function analyze() {
    setBusy(true); setMessage(null);
    try {
      const [nextScope, nextEstimate, nextPlanning] = await Promise.all([
        localNexusClient.projectScope(projectId), localNexusClient.projectEstimate(projectId), localNexusClient.projectPlanningModel(projectId)
      ]);
      setScope(nextScope); setEstimate(nextEstimate); setPlanning(nextPlanning);
      setMessage("Runtime context refreshed from linked project evidence.");
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  }

  async function compile() {
    if (!compileAction.available) {
      setMessage(compileAction.reason);
      return;
    }
    if (!pendingCompile && !projectId.trim()) return;
    const staged = pendingCompile ?? snapshotPrivateDraftOperation(
      {
        projectId: projectId.trim(),
        artifactType,
        options: {
          ...(weeks ? { defaultPhaseDurationWeeks: Number(weeks) } : {}),
          assumptions: assumption.trim() ? [assumption.trim()] : [],
        },
      },
      `project-compile:${globalThis.crypto.randomUUID()}`,
    );
    if (!pendingCompile) {
      setWeeks("");
      setAssumption("");
    }
    const operation = beginPrivateDraftAttempt(staged);
    setPendingCompile(operation);
    setBusy(true); setMessage(null);
    try {
      const admission = await admitCanonicalActionIntent(
        `Compile the ${JSON.stringify(operation.payload.artifactType)} artifact for NEXUS Project ${JSON.stringify(operation.payload.projectId)} with these operator-supplied options: ${JSON.stringify(operation.payload.options)}.`,
        operation.idempotencyKey,
      );
      const result = canonicalExecutionResult(admission) as CompiledArtifact;
      setPendingCompile(clearPrivateDraftAfterSuccess());
      if (result.status || result.artifactId) setArtifact(result);
      setMessage(admission.spokenSummary);
    } catch (error) {
      setPendingCompile(retainPrivateDraftAfterFailure(operation));
      setMessage(messageFrom(error));
    }
    finally { setBusy(false); }
  }

  const range = estimate?.estimateRange;
  const price = estimate?.estimatedTotal ?? range?.likely ?? null;
  const currency = estimate?.currency ?? range?.currency ?? "";

  return <div className="experience-grid local-workspace">
    <DataPanel eyebrow="NEXUS Projects" title="Project control" icon={<FolderKanban size={18} />} className="span-2">
      <div className="project-control-grid">
        <label className="workspace-field"><span>Project name</span><input value={projectName} onChange={(event) => { setProjectName(event.target.value); setPendingCreate(null); }} placeholder="Customer transformation program" autoComplete="off" /></label>
        <button onClick={() => void create()} disabled={busy || !createAction.available} title={createAction.available ? undefined : createAction.reason}><Plus size={15} /> {pendingCreate ? "Retry exact project creation" : "Create project"}</button>
        <label className="workspace-field"><span>Active project ID</span><input value={projectId} onChange={(event) => { setProjectId(event.target.value); setPendingCompile(null); }} placeholder="PROJECT-…" /></label>
        <button onClick={() => void analyze()} disabled={busy || !projectId.trim()}><RefreshCw size={15} /> Build project context</button>
      </div>
      {message && <p className="workspace-message" role="status">{message}</p>}
      <p className="boundary-note">Create action: {createAction.reason} Scope, plan, and price are assembled by the workspace-scoped Runtime from linked evidence. The browser performs no project calculation.</p>
    </DataPanel>

    <DataPanel eyebrow="Evidence-backed scope" title="Scope" icon={<FileCheck2 size={18} />}>
      <div className="metric-row"><span><strong>{scope?.requirements?.length ?? 0}</strong> requirements</span><span><strong>{scope?.risks?.length ?? 0}</strong> risks</span><span><strong>{scope?.exclusions?.length ?? 0}</strong> exclusions</span></div>
      <RecordList records={scope?.requirements} empty="Link and ingest project documents to establish scope." />
    </DataPanel>

    <DataPanel eyebrow="Commercial truth" title="Pricing posture" icon={<Calculator size={18} />}>
      <strong className="price-value">{price === null ? "Evidence required" : `${currency} ${price.toLocaleString()}`}</strong>
      <span className="price-status">{displayLabel(estimate?.pricingStatus ?? range?.status ?? "not calculated")}</span>
      <ul className="limitation-list">{(estimate?.assumptionsCreatedDueToMissingEvidence ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
      <p className="boundary-note">Missing rates or quantities remain missing. NEXUS never fabricates a price.</p>
    </DataPanel>

    <DataPanel eyebrow="Operational plan" title="Planning model" icon={<Route size={18} />} className="span-2">
      <div className="planning-summary"><span><strong>{planning?.sourceCount ?? 0}</strong> linked sources</span><span><strong>{planning?.requirements?.length ?? 0}</strong> planning requirements</span><span><strong>{planning?.openQuestions?.length ?? 0}</strong> open questions</span></div>
      <div className="artifact-controls">
        <label className="workspace-field"><span>Artifact</span><select value={artifactType} onChange={(event) => { setArtifactType(event.target.value); setPendingCompile(null); }}>{definitions.map((definition) => <option key={definition.artifactType} value={definition.artifactType}>{definition.name} · {definition.status}</option>)}</select></label>
        <label className="workspace-field"><span>Default phase weeks</span><input type="number" min="0.5" max="520" step="0.5" value={weeks} onChange={(event) => { setWeeks(event.target.value); setPendingCompile(null); }} placeholder="Optional" autoComplete="off" /></label>
        <label className="workspace-field span-input"><span>Explicit operator assumption</span><input value={assumption} onChange={(event) => { setAssumption(event.target.value); setPendingCompile(null); }} placeholder="Clearly labeled; never treated as source evidence" autoComplete="off" /></label>
        <button onClick={() => void compile()} disabled={busy || (!projectId.trim() && !pendingCompile) || !compileAction.available} title={compileAction.available ? undefined : compileAction.reason}><FileCheck2 size={15} /> {pendingCompile ? "Retry exact compile" : "Compile"}</button>
        <p className="boundary-note">Compile action: {compileAction.reason}</p>
      </div>
      {artifact && <div className="artifact-result"><strong>{displayLabel(artifact.status ?? "unknown")}</strong><span>{artifact.confidence ?? "Unrated"} confidence · {displayLabel(artifact.estimateStatus ?? "no estimate")}</span>{artifact.reason && <p>{artifact.reason}</p>}<OperationalResultLineage proofId={artifact.proofId} receiptId={artifact.receiptId} onOpenReplay={onReplay} empty={artifact.status === "compiled_verified" ? "The Runtime returned a verified artifact without discoverable proof or receipt lineage." : "No proof or receipt is claimed for this unavailable artifact."} /></div>}
    </DataPanel>
  </div>;
}

function RecordList({ records = [], empty }: { records?: Array<Record<string, unknown>>; empty: string }) {
  if (!records.length) return <p className="empty-record">{empty}</p>;
  return <div className="compact-records">{records.slice(0, 8).map((item, index) => <p key={String(item.evidenceId ?? index)}>{String(item.normalizedFact ?? item.text ?? item.evidenceId ?? "Recorded requirement")}</p>)}</div>;
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : String(error);
