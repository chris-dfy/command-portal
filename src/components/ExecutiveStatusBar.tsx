import { Activity, Boxes, Cloud, FileCheck2, Network, ServerCog, ShieldCheck } from "lucide-react";
import { NexusMetric, type NexusTone } from "../design-system/NexusPrimitives";
import type { ConnectionState, RuntimeSnapshot } from "../lib/types";
import { statusTone } from "../lib/presentation";

const metricTone = (value: string): NexusTone => {
  const tone = statusTone(value);
  return tone === "good" ? "success" : tone === "warn" ? "attention" : tone === "bad" ? "critical" : "neutral";
};

export function ExecutiveStatusBar({ snapshot, connectionState }: { snapshot: RuntimeSnapshot; connectionState: ConnectionState }) {
  const health = snapshot.health?.data as { checks?: Record<string, boolean> } | undefined;
  const diagnostics = snapshot.diagnostics?.data as { checks?: Record<string, boolean> } | undefined;
  const environment = snapshot.environment?.data as { valid?: boolean } | undefined;
  const providers = Array.isArray(snapshot.providers?.data) ? snapshot.providers.data : [];
  const items = [
    { title: "Gateway Health", value: snapshot.health?.gateway.status ?? "Connecting", description: "Same-origin read boundary", icon: ShieldCheck },
    { title: "Runtime Health", value: snapshot.health?.runtime?.status ?? "Unknown", description: "Hosted liveness", icon: Activity },
    { title: "Provider Registry", value: health?.checks?.providerRegistryLoaded ? "Healthy" : "Unavailable", description: `${providers.length} registered providers`, icon: Boxes },
    { title: "Environment", value: environment?.valid ? "Healthy" : "Unavailable", description: String((snapshot.status?.data as { environment?: string })?.environment ?? "Unknown"), icon: Cloud },
    { title: "Connection", value: connectionState, description: "Gateway to runtime", icon: Network },
    { title: "Version", value: snapshot.version?.runtime ? "Compatible" : "Unknown", description: snapshot.version?.runtime?.runtimeVersion ?? "Unavailable", icon: ServerCog },
    { title: "Diagnostics", value: diagnostics?.checks && Object.values(diagnostics.checks).every(Boolean) ? "Healthy" : "Degraded", description: "All checks remain visible", icon: FileCheck2 }
  ];
  return <section className="nx-runtime-ribbon" aria-label="Experience Gateway health model">
    {items.map((item) => <div key={item.title} className="nx-runtime-ribbon__signal" aria-label={`${item.title}: ${item.value}. ${item.description}`}><item.icon size={16} aria-hidden="true" /><NexusMetric label={item.title} value={item.value} detail={item.description} tone={metricTone(item.value)} /></div>)}
  </section>;
}
