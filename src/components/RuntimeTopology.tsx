import { ArrowDown, Boxes, Cable, Globe2, Layers3, Network, ServerCog } from "lucide-react";
import type { ProviderRecord, RuntimeSnapshot } from "../lib/types";
import { statusTone } from "../lib/presentation";
import { StatusPill } from "./StatusPill";

export function RuntimeTopology({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const diagnostics = snapshot.diagnostics?.data as { gateway?: { initialized?: boolean }; checks?: Record<string, boolean> } | undefined;
  const providers = (Array.isArray(snapshot.providers?.data) ? snapshot.providers.data : []) as ProviderRecord[];
  const openai = providers.find((provider) => provider.id === "openai");
  const providerHealthy = Boolean((snapshot.health?.data as { checks?: Record<string, boolean> } | undefined)?.checks?.providerRegistryLoaded);
  const nodes = [
    { name: "Command Portal", status: "Healthy", note: "Hosted observation view; Mission Control is the operational lane", icon: Layers3 },
    { name: "Experience Gateway", status: snapshot.health?.gateway.status ?? "Connecting", note: "This diagram shows the fixed diagnostics GET allowlist", icon: Cable },
    { name: "Runtime Gateway", status: diagnostics?.gateway?.initialized ? "Healthy" : "Unavailable", note: "Hosted server request boundary", icon: Network },
    { name: "Hosted Runtime", status: snapshot.health?.runtime?.status ?? "Unknown", note: snapshot.health?.gateway.runtimeUrl ?? "Runtime URL unavailable", icon: ServerCog },
    { name: "Providers", status: providerHealthy ? "Healthy" : "Unavailable", note: `${providers.length} registry entries`, icon: Boxes },
    { name: "OpenAI", status: openai?.verified && openai.reachable ? "Healthy" : "Unavailable", note: openai?.configured ? "Configured; live inference unverified" : "Not configured or verified", icon: Globe2 }
  ];
  return <section className="topology-map live-topology" aria-labelledby="topology-heading">
    <header className="visualization-header"><div><span>Hosted observation lane</span><h3 id="topology-heading">Diagnostics topology</h3><p>This view intentionally shows the read-only diagnostics path. Authenticated work uses Mission Control and the separate Hosted Operational Gateway.</p></div><Cable size={21} /></header>
    <div className="topology-flow" aria-label="Command Portal to provider topology">
      {nodes.map((node, index) => <div className="topology-step" key={node.name}>
        <article data-tone={statusTone(node.status)}><node.icon size={20} aria-hidden="true" /><div><span>Node {index + 1}</span><strong>{node.name}</strong><small>{node.note}</small></div><StatusPill value={node.status} /></article>
        {index < nodes.length - 1 && <div className="topology-connector"><ArrowDown size={15} aria-hidden="true" /><span>observation lane</span></div>}
      </div>)}
    </div>
  </section>;
}
