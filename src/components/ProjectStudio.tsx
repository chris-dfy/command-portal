import { useEffect, useState } from "react";
import { Calculator, FileCheck2, FolderKanban, Plus, RefreshCw, Route } from "lucide-react";
import { DataPanel } from "./DataPanel";
import { localNexusClient, type ArtifactDefinition, type CompiledArtifact, type PlanningModel, type ProjectEstimate, type ProjectScope } from "../lib/local-client";
import { displayLabel } from "../lib/presentation";

export function ProjectStudio() {
  const [definitions, setDefinitions] = useState<ArtifactDefinition[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [artifactType, setArtifactType] = useState("roadmap");
  const [weeks, setWeeks] = useState("");
  const [assumption, setAssumption] = useState("");
  const [scope, setScope] = useState<ProjectScope | null>(null);
  const [estimate, setEstimate] = useState<ProjectEstimate | null>(null);
  const [planning, setPlanning] = useState<PlanningModel | null>(null);
  const [artifact, setArtifact] = useState<CompiledArtifact | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void localNexusClient.artifactTypes().then((data) => setDefinitions(data.artifacts)).catch((error) => setMessage(messageFrom(error))); }, []);

  async function create() {
    setBusy(true); setMessage(null);
    try {
      const project = await localNexusClient.projectCreate(projectName.trim() || "New Nexicron Project");
      setProjectId(project.projectId); setProjectName(project.name);
      setMessage(`Created ${project.name}. Add evidence before relying on scope or pricing.`);
    } catch (error) { setMessage(messageFrom(error)); }
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
    setBusy(true); setMessage(null);
    try {
      const result = await localNexusClient.projectCompile(projectId, artifactType, {
        ...(weeks ? { defaultPhaseDurationWeeks: Number(weeks) } : {}),
        assumptions: assumption.trim() ? [assumption.trim()] : []
      });
      setArtifact(result);
      setMessage(result.status === "compiled_verified" ? "Artifact compiled and recorded with proof." : `Artifact ${result.status ?? "unavailable"}: ${result.reason ?? "not implemented"}.`);
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  }

  const range = estimate?.estimateRange;
  const price = estimate?.estimatedTotal ?? range?.likely ?? null;
  const currency = estimate?.currency ?? range?.currency ?? "";

  return <div className="experience-grid local-workspace">
    <DataPanel eyebrow="Nexicron projects" title="Project control" icon={<FolderKanban size={18} />} className="span-2">
      <div className="project-control-grid">
        <label className="workspace-field"><span>Project name</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Nexicron customer transformation" /></label>
        <button onClick={() => void create()} disabled={busy}><Plus size={15} /> Create project</button>
        <label className="workspace-field"><span>Active project ID</span><input value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="PROJECT-…" /></label>
        <button onClick={() => void analyze()} disabled={busy || !projectId.trim()}><RefreshCw size={15} /> Build project context</button>
      </div>
      {message && <p className="workspace-message" role="status">{message}</p>}
      <p className="boundary-note">Scope, plan, and price are assembled by the private Runtime from linked evidence. The browser performs no project calculation.</p>
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
        <label className="workspace-field"><span>Artifact</span><select value={artifactType} onChange={(event) => setArtifactType(event.target.value)}>{definitions.map((definition) => <option key={definition.artifactType} value={definition.artifactType}>{definition.name} · {definition.status}</option>)}</select></label>
        <label className="workspace-field"><span>Default phase weeks</span><input type="number" min="0.5" max="520" step="0.5" value={weeks} onChange={(event) => setWeeks(event.target.value)} placeholder="Optional" /></label>
        <label className="workspace-field span-input"><span>Explicit operator assumption</span><input value={assumption} onChange={(event) => setAssumption(event.target.value)} placeholder="Clearly labeled; never treated as source evidence" /></label>
        <button onClick={() => void compile()} disabled={busy || !projectId.trim()}><FileCheck2 size={15} /> Compile</button>
      </div>
      {artifact && <div className="artifact-result"><strong>{displayLabel(artifact.status ?? "unknown")}</strong><span>{artifact.confidence ?? "Unrated"} confidence · {displayLabel(artifact.estimateStatus ?? "no estimate")}</span><code>{artifact.proofId ?? artifact.reason ?? "Proof unavailable"}</code></div>}
    </DataPanel>
  </div>;
}

function RecordList({ records = [], empty }: { records?: Array<Record<string, unknown>>; empty: string }) {
  if (!records.length) return <p className="empty-record">{empty}</p>;
  return <div className="compact-records">{records.slice(0, 8).map((item, index) => <p key={String(item.evidenceId ?? index)}>{String(item.normalizedFact ?? item.text ?? item.evidenceId ?? "Recorded requirement")}</p>)}</div>;
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : String(error);
