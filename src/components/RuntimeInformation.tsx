import { FileWarning, ServerCog, ShieldCheck } from "lucide-react";
import type { ConnectionState, RuntimeSnapshot } from "../lib/types";
import { asCapabilityRegistryProjection } from "../lib/portal-client";
import { displayLabel } from "../lib/presentation";
import { CapabilityRegistryProjection } from "./CapabilityRegistryProjection";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { ReleaseRevision } from "./ReleaseRevision";

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function RuntimeInformation({
  snapshot,
  connectionState,
  runtimeCommit,
  programAlphaCommit,
}: {
  snapshot: RuntimeSnapshot;
  connectionState: ConnectionState;
  runtimeCommit: string;
  programAlphaCommit: string;
}) {
  const status = record(snapshot.status?.data);
  const environment = record(snapshot.environment?.data);
  const providers = Array.isArray(snapshot.providers?.data) ? snapshot.providers.data as Record<string, unknown>[] : [];
  const capabilityRegistryEnvelope = snapshot["capability-registry"];
  const capabilityRegistry = asCapabilityRegistryProjection(capabilityRegistryEnvelope?.data);
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
        <article><span>Capabilities</span><strong>{capabilityRegistry ? `${capabilityRegistry.capabilities.length} canonical` : "Unavailable"}</strong></article>
        <ReleaseRevision label="Runtime commit" value={runtimeCommit} />
        <ReleaseRevision label="Program Alpha commit" value={programAlphaCommit} />
      </div>
    </DataPanel>
    <DataPanel eyebrow="Truth state" title="Preserved boundaries" icon={<ShieldCheck size={18} />}>
      {truth ? <dl className="definition-list truth-list">
        <div><dt>Production ready</dt><dd>{String(truth.productionReady)}</dd></div><div><dt>Enterprise ready</dt><dd>{String(truth.enterpriseReady)}</dd></div><div><dt>Cloud primary</dt><dd>{String(truth.cloudPrimary)}</dd></div><div><dt>Local source of truth</dt><dd>{String(truth.localSourceOfTruth)}</dd></div><div><dt>Default provider</dt><dd>{truth.defaultProvider}</dd></div><div><dt>Conclave</dt><dd>{truth.conclave}</dd></div><div><dt>Actual trained SLMs</dt><dd>{truth.actualTrainedSLMs}</dd></div>
      </dl> : <EmptyRecord />}
    </DataPanel>
    <CapabilityRegistryProjection
      projection={capabilityRegistry}
      gatewayStale={capabilityRegistryEnvelope?.gateway.cache.stale === true}
    />
    <DataPanel eyebrow="Limitations" title="Configured constraints" icon={<FileWarning size={18} />} className="span-2">
      {limitations.length ? <ul className="limitation-list">{limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <EmptyRecord />}
    </DataPanel>
  </div>;
}
