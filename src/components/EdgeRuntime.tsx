import { Cpu, Network, ShieldCheck } from "lucide-react";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";
import type { RuntimeSnapshot } from "../lib/types";

const asRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const EDGE_CAPABILITY_IDS = new Set(["edge", "edge-runtime", "edge_runtime", "nexus-edge-runtime", "nexus_edge_runtime"]);

export function EdgeRuntime({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const capabilityData = snapshot.capabilities?.data;
  const capabilityList = Array.isArray(capabilityData)
    ? capabilityData.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
  const capabilityMap = asRecord(capabilityData);
  const edge = capabilityList.find((capability) => {
    const id = String(capability.id ?? capability.capabilityId ?? "").trim().toLowerCase();
    return EDGE_CAPABILITY_IDS.has(id);
  }) ?? asRecord(capabilityMap?.edgeRuntime) ?? asRecord(capabilityMap?.edge_runtime) ?? asRecord(capabilityMap?.edge);
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
