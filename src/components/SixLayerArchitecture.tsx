import { useMemo, useState } from "react";
import { ArrowDown, BrainCircuit, Cable, Eye, Gavel, Network, Workflow } from "lucide-react";
import type { DomainEnvelope } from "../lib/types";
import { asItems, asRecord, displayLabel, statusTone } from "../lib/presentation";
import { StatusPill } from "./StatusPill";

const LAYERS = [
  { id: "integration", name: "Integration", icon: Cable, purpose: "Connect governed inputs to the runtime boundary.", dependency: "Registered and authorized connectors", limitation: "External connectors were not exercised." },
  { id: "intelligence", name: "Intelligence", icon: BrainCircuit, purpose: "Apply configured model reasoning and grounded retrieval.", dependency: "Authorized model provider and registered knowledge", limitation: "Default provider is mock_model; live external inference is unverified." },
  { id: "conclave", name: "Conclave", icon: Network, purpose: "Coordinate multi-perspective validation.", dependency: "Verified specialist participants and orchestration", limitation: "Conclave is staged and cannot count as multi-agent validation." },
  { id: "governance", name: "Governance", icon: Gavel, purpose: "Enforce policy, authority, and evidence requirements.", dependency: "Registered policies and proof-linked decisions", limitation: "Only local verification is established." },
  { id: "execution", name: "Execution", icon: Workflow, purpose: "Perform bounded, authorized runtime actions.", dependency: "Registered handler, authorization, and postcondition proof", limitation: "Only a bounded local filesystem handler was verified; the portal cannot execute." },
  { id: "experience", name: "Experience", icon: Eye, purpose: "Translate runtime truth into an executive operating picture.", dependency: "Read-only BFF and validated runtime envelopes", limitation: "Hosted portal connection acceptance remains pending Phase 5X-C." }
] as const;

export function SixLayerArchitecture({ domains }: { domains: Record<string, DomainEnvelope> }) {
  const [selected, setSelected] = useState<(typeof LAYERS)[number]["id"]>("integration");
  const matrixValue = asRecord(domains["runtime-matrix"]).matrix;
  const matrix = Array.isArray(matrixValue) ? matrixValue as Record<string, unknown>[] : [];
  const capabilities = asItems(domains.capabilities);
  const details = useMemo(() => LAYERS.map((layer) => {
    const matrixEntry = matrix.find((item) => item.capabilityId === layer.id);
    const capability = capabilities.find((item) => item.id === layer.id);
    const status = matrixEntry?.status ?? capability?.state ?? (layer.id === "experience" ? "preview_only" : "unavailable");
    const environment = capability?.environment ?? (matrixEntry ? "local verification" : "not reported");
    return { ...layer, status: String(status), environment: String(environment) };
  }), [capabilities, matrix]);
  const active = details.find((layer) => layer.id === selected) ?? details[0];

  return <section className="layer-visualization" aria-labelledby="layer-visualization-heading">
    <header className="visualization-header"><div><span>Signature architecture</span><h3 id="layer-visualization-heading">Six-layer operating model</h3><p>Select a layer to inspect its verified posture, dependency, and current limitation.</p></div><LayersMark /></header>
    <div className="layer-visualization__body">
      <div className="layer-stack" aria-label="Six runtime layers">
        {details.map((layer, index) => <div className="layer-stack__step" key={layer.id}>
          <button type="button" aria-pressed={selected === layer.id} onClick={() => setSelected(layer.id)} data-tone={statusTone(layer.status)}>
            <span className="layer-number">0{index + 1}</span><layer.icon size={19} aria-hidden="true" /><div><strong>{layer.name}</strong><small>{displayLabel(layer.status)}</small></div><StatusPill value={layer.status} />
          </button>
          {index < details.length - 1 && <ArrowDown className="layer-arrow" size={15} aria-hidden="true" />}
        </div>)}
      </div>
      <article className="layer-detail" aria-live="polite">
        <div className="layer-detail__identity"><active.icon size={24} aria-hidden="true" /><div><span>Selected layer</span><h4>{active.name}</h4></div><StatusPill value={active.status} /></div>
        <p className="layer-purpose">{active.purpose}</p>
        <dl>
          <div><dt>Verification</dt><dd>{displayLabel(active.status)}</dd></div>
          <div><dt>Environment</dt><dd>{displayLabel(active.environment)}</dd></div>
          <div><dt>Dependency</dt><dd>{active.dependency}</dd></div>
          <div><dt>Current limitation</dt><dd>{active.limitation}</dd></div>
        </dl>
      </article>
    </div>
  </section>;
}

function LayersMark() {
  return <div className="layers-mark" aria-hidden="true"><span /><span /><span /></div>;
}
