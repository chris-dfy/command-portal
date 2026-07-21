import { Cpu, Network, ShieldCheck } from "lucide-react";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";
import type { RuntimeSnapshot } from "../lib/types";

const asRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function EdgeRuntime({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const capabilities = asRecord(snapshot.capabilities?.data);
  const edge = asRecord(capabilities?.edgeRuntime) ?? asRecord(capabilities?.edge_runtime) ?? asRecord(capabilities?.edge);
  const environment = asRecord(snapshot.environment?.data);

  return <div className="experience-grid">
    <DataPanel eyebrow="Edge Runtime" title="Edge capability surface" icon={<Cpu size={18} />} className="span-2">
      {edge ? <div className="replay-event-detail">
          {Object.entries(edge).slice(0, 12).map(([key, value]) => <div className="replay-event-field" key={key}>
            <dt>{key}</dt><dd>{value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
          </div>)}
        </div>
      : <EmptyRecord>Runtime did not report an edge runtime capability. Edge status is unavailable.</EmptyRecord>}
    </DataPanel>
    <DataPanel eyebrow="Runtime environment" title="Reported environment" icon={<Network size={18} />}>
      {environment ? <div className="replay-event-detail">
          {Object.entries(environment).slice(0, 8).map(([key, value]) => <div className="replay-event-field" key={key}>
            <dt>{key}</dt><dd>{value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
          </div>)}
        </div>
      : <EmptyRecord>Runtime did not supply environment details.</EmptyRecord>}
    </DataPanel>
    <DataPanel eyebrow="Boundary" title="Edge trust posture" icon={<ShieldCheck size={18} />}>
      <p className="boundary-note">Edge runtime state is reported by NEXUS Runtime and read through the Experience Gateway. <StatusPill value={edge ? "reported" : "unavailable"} /></p>
    </DataPanel>
  </div>;
}
