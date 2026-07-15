import { ArrowDown, BrainCircuit, Cable, Eye, Gavel, Globe2, Layers3, Network, ServerCog, Workflow } from "lucide-react";
import type { DomainEnvelope, PortalMeta } from "../lib/types";
import { asRecord, displayLabel, statusTone } from "../lib/presentation";
import { StatusPill } from "./StatusPill";

export function RuntimeTopology({ domains, meta }: { domains: Record<string, DomainEnvelope>; meta: PortalMeta }) {
  const hosting = asRecord(domains["model-hosting"]);
  const matrixValue = asRecord(domains["runtime-matrix"]).matrix;
  const matrix = Array.isArray(matrixValue) ? matrixValue as Record<string, unknown>[] : [];
  const matrixStatus = (id: string) => String(matrix.find((item) => item.capabilityId === id)?.status ?? "unavailable");
  const nodes = [
    { name: "OpenAI", status: "unverified", note: "Provider connectivity not verified", icon: Globe2 },
    { name: "Runtime Gateway", status: meta.dataMode === "local_runtime" ? "connected" : "local contract verified", note: "Server-side read boundary", icon: ServerCog },
    { name: "Knowledge", status: "registered fixture inventory", note: "No claim of live organization knowledge", icon: BrainCircuit },
    { name: "Conclave", status: "staged", note: "Not live multi-agent validation", icon: Network },
    { name: "Governance", status: matrixStatus("governance"), note: "Policy and evidence boundary", icon: Gavel },
    { name: "Execution", status: "bounded local only", note: "No portal execution controls", icon: Workflow },
    { name: "Experience", status: "preview only", note: "Standalone executive read surface", icon: Eye },
    { name: "Command Portal", status: "Phase 5X-B functionally complete", note: "Hosted connection acceptance pending", icon: Layers3 }
  ];

  return <div className="topology-layout">
    <section className="topology-map" aria-labelledby="topology-heading">
      <header className="visualization-header"><div><span>Current-state architecture</span><h3 id="topology-heading">Runtime topology</h3><p>Solid relationships represent the current portal contract. The external provider link remains visibly unverified.</p></div><Cable size={21} /></header>
      <div className="topology-flow" aria-label="Runtime topology from provider to portal">
        {nodes.map((node, index) => <div className="topology-step" key={node.name}>
          <article data-tone={statusTone(node.status)}><node.icon size={20} aria-hidden="true" /><div><span>{index === 0 ? "External provider" : `Stage ${index}`}</span><strong>{node.name}</strong><small>{node.note}</small></div><StatusPill value={node.status} /></article>
          {index < nodes.length - 1 && <div className={index === 0 ? "topology-connector is-unverified" : "topology-connector"}><ArrowDown size={15} aria-hidden="true" /><span>{index === 0 ? "connection unverified" : "read path"}</span></div>}
        </div>)}
      </div>
    </section>
    <aside className="topology-truth" aria-label="Topology truth boundary">
      <span>Provider truth</span><h3>Configured is not connected</h3>
      <div className="provider-card"><Globe2 size={20} /><div><small>Default provider</small><strong>{displayLabel(hosting.defaultProvider)}</strong></div></div>
      <dl><div><dt>Live external inference</dt><dd>{displayLabel(hosting.liveExternalInference)}</dd></div><div><dt>Hosted models</dt><dd>{String(hosting.hostedModels ?? 0)}</dd></div><div><dt>Edge models</dt><dd>{String(hosting.edgeModels ?? 0)}</dd></div></dl>
      <p>The topology reserves the external-provider position but does not depict OpenAI as connected. No future systems are hardcoded beyond this supplied current-state path.</p>
    </aside>
  </div>;
}
