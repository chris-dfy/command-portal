import { Boxes, FileWarning, ServerCog, ShieldCheck } from "lucide-react";
import type { ConnectionState, RuntimeSnapshot } from "../lib/types";
import { displayLabel } from "../lib/presentation";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function RuntimeInformation({ snapshot, connectionState }: { snapshot: RuntimeSnapshot; connectionState: ConnectionState }) {
  const status = record(snapshot.status?.data);
  const environment = record(snapshot.environment?.data);
  const providers = Array.isArray(snapshot.providers?.data) ? snapshot.providers.data as Record<string, unknown>[] : [];
  const capabilities = Array.isArray(snapshot.capabilities?.data) ? snapshot.capabilities.data as Record<string, unknown>[] : [];
  const limitations = Array.from(new Set(Object.values(snapshot).flatMap((value) => value?.runtime?.limitations ?? [])));
  const truth = snapshot.status?.truth;
  return <div className="experience-grid">
    <DataPanel eyebrow="Runtime discovery" title="Hosted runtime information" icon={<ServerCog size={18} />} className="span-2">
      <div className="information-grid">
        <article><span>Runtime version</span><strong>{snapshot.version?.runtime?.runtimeVersion ?? "Unavailable"}</strong></article>
        <article><span>Schema version</span><strong>{snapshot.version?.runtime?.schemaVersion ?? "Unavailable"}</strong></article>
        <article><span>Environment</span><strong>{displayLabel(status.environment ?? environment.environment)}</strong></article>
        <article><span>Runtime URL</span><strong>{snapshot.status?.gateway.runtimeUrl ?? "Unavailable"}</strong></article>
        <article><span>Gateway status</span><strong>{snapshot.status?.gateway.status ?? "Unavailable"}</strong></article>
        <article><span>Connection</span><strong>{connectionState}</strong></article>
        <article><span>Provider registry</span><strong>{providers.length} entries</strong></article>
        <article><span>Capabilities</span><strong>{capabilities.length} registered</strong></article>
      </div>
    </DataPanel>
    <DataPanel eyebrow="Truth state" title="Preserved boundaries" icon={<ShieldCheck size={18} />}>
      {truth ? <dl className="definition-list truth-list">
        <div><dt>Production ready</dt><dd>{String(truth.productionReady)}</dd></div><div><dt>Enterprise ready</dt><dd>{String(truth.enterpriseReady)}</dd></div><div><dt>Cloud primary</dt><dd>{String(truth.cloudPrimary)}</dd></div><div><dt>Local source of truth</dt><dd>{String(truth.localSourceOfTruth)}</dd></div><div><dt>Default provider</dt><dd>{truth.defaultProvider}</dd></div><div><dt>Conclave</dt><dd>{truth.conclave}</dd></div><div><dt>Actual trained SLMs</dt><dd>{truth.actualTrainedSLMs}</dd></div>
      </dl> : <EmptyRecord />}
    </DataPanel>
    <DataPanel eyebrow="Capabilities" title="Runtime registry" icon={<Boxes size={18} />}>
      <div className="capability-list">{capabilities.map((capability) => <article key={String(capability.id)}><strong>{displayLabel(capability.id)}</strong><StatusPill value={String(capability.state)} /><small>Observation contract read-only: {String(capability.readOnly)} · operational availability is reported separately in Mission Control.</small></article>)}</div>
    </DataPanel>
    <DataPanel eyebrow="Limitations" title="Configured constraints" icon={<FileWarning size={18} />} className="span-2">
      {limitations.length ? <ul className="limitation-list">{limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <EmptyRecord />}
    </DataPanel>
  </div>;
}
