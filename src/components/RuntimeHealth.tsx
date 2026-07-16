import { Activity, Boxes, Cloud, FileCheck2, Network, ServerCog, ShieldCheck } from "lucide-react";
import type { ConnectionState, RuntimeSnapshot } from "../lib/types";
import { displayLabel, statusTone } from "../lib/presentation";
import { DataPanel } from "./DataPanel";
import { StatusPill } from "./StatusPill";

const LIFECYCLE: ConnectionState[] = ["Connecting", "Healthy", "Degraded", "Unavailable", "Retrying", "Timed Out", "Version Mismatch", "Schema Mismatch", "Unauthorized", "Unknown"];

export function RuntimeHealth({ snapshot, connectionState }: { snapshot: RuntimeSnapshot; connectionState: ConnectionState }) {
  const health = snapshot.health?.data as { checks?: Record<string, boolean> } | undefined;
  const diagnostics = snapshot.diagnostics?.data as { checks?: Record<string, boolean> } | undefined;
  const environment = snapshot.environment?.data as { environment?: string; valid?: boolean; validationErrors?: string[] } | undefined;
  const cards = [
    { name: "Gateway Health", value: snapshot.health?.gateway.status ?? "Unknown", detail: "Experience Gateway is serving this validated response.", icon: ShieldCheck },
    { name: "Runtime Health", value: snapshot.health?.runtime?.status ?? "Unknown", detail: "Hosted runtime liveness endpoint.", icon: Activity },
    { name: "Provider Registry", value: health?.checks?.providerRegistryLoaded ? "Healthy" : "Unavailable", detail: "Provider registry startup state.", icon: Boxes },
    { name: "Environment", value: environment?.valid ? "Healthy" : "Unavailable", detail: displayLabel(environment?.environment), icon: Cloud },
    { name: "Connection", value: connectionState, detail: snapshot.health?.gateway.runtimeUrl ?? "Runtime URL unavailable", icon: Network },
    { name: "Version", value: snapshot.version?.runtime ? "Compatible" : "Unknown", detail: `${snapshot.version?.runtime?.runtimeVersion ?? "?"} / schema ${snapshot.version?.runtime?.schemaVersion ?? "?"}`, icon: ServerCog },
    { name: "Diagnostics", value: diagnostics?.checks && Object.values(diagnostics.checks).every(Boolean) ? "Healthy" : "Degraded", detail: "Required and informational checks remain independently visible.", icon: FileCheck2 }
  ];
  return <div className="experience-grid">
    <DataPanel eyebrow="Health model" title="Independent operational signals" icon={<Activity size={18} />} className="span-2">
      <div className="health-card-grid">{cards.map((card) => <article key={card.name} data-tone={statusTone(card.value)}><card.icon size={19} /><div><span>{card.name}</span><strong>{card.value}</strong><small>{card.detail}</small></div></article>)}</div>
    </DataPanel>
    <DataPanel eyebrow="Connection lifecycle" title="All observable states" icon={<Network size={18} />} className="span-2">
      <div className="lifecycle-grid">{LIFECYCLE.map((state) => <article key={state} className={state === connectionState ? "is-active" : ""}><StatusPill value={state} /><span>{state === connectionState ? "Current state" : "Observable state"}</span></article>)}</div>
    </DataPanel>
    <DataPanel eyebrow="Runtime checks" title="Diagnostics detail" icon={<FileCheck2 size={18} />} className="span-2">
      <div className="diagnostic-list">{Object.entries(diagnostics?.checks ?? {}).map(([name, value]) => <div key={name}><span>{displayLabel(name)}</span><StatusPill value={value ? "healthy" : "unavailable"} /></div>)}</div>
    </DataPanel>
  </div>;
}

