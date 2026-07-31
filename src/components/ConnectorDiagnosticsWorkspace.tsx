import { Network, ShieldCheck } from "lucide-react";
import type { GatewayEnvelope } from "../lib/types";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

const object = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(object);
  const body = object(value);
  for (const key of ["connectors", "results", "checks"]) {
    const candidate = body[key];
    if (Array.isArray(candidate)) return candidate.map(object);
  }
  return Object.keys(body).length ? [body] : [];
}

function identity(value: Record<string, unknown>, index: number) {
  return String(value.connectorId ?? value.id ?? value.name ?? `Connector ${index + 1}`);
}

function posture(value: Record<string, unknown>) {
  return String(
    value.classification
    ?? value.operationalAvailability
    ?? value.health
    ?? value.status
    ?? value.state
    ?? "recorded",
  );
}

export function ConnectorDiagnosticsWorkspace({
  envelope,
}: {
  envelope?: GatewayEnvelope;
}) {
  const inventory = records(envelope?.data);
  const health = inventory;
  const error = envelope?.error?.message ?? "";

  return <div className="experience-grid">
    <DataPanel eyebrow="Connector inventory" title="Runtime-owned registrations" icon={<Network size={18} />}>
      {inventory.length ? <div className="reference-list">
        {inventory.map((connector, index) => <article key={`${identity(connector, index)}-${index}`}>
          <strong>{identity(connector, index)}</strong>
          <StatusPill value={posture(connector)} />
        </article>)}
      </div> : <EmptyRecord />}
    </DataPanel>
    <DataPanel eyebrow="Connector verification" title="Read-only health projection" icon={<ShieldCheck size={18} />}>
      <p className="boundary-note">
        This surface reads only the signed Runtime connector projection already used by the dashboard. It grants
        no connector Authority, creates no operational session, and exposes no mutation control.
      </p>
      {health.length ? <div className="reference-list">
        {health.map((check, index) => <article key={`${identity(check, index)}-${index}`}>
          <strong>{identity(check, index)}</strong>
          <StatusPill value={posture(check)} />
        </article>)}
      </div> : <EmptyRecord />}
      {error && <p className="work-sessions-workspace__error" role="alert">{error}</p>}
    </DataPanel>
  </div>;
}
