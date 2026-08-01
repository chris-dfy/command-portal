import { AlertTriangle, Boxes, Cable, ListChecks, ShieldCheck } from "lucide-react";
import { NexusButton } from "../design-system/NexusPrimitives";
import type {
  CapabilityClassification,
  CapabilityDisplayState,
  CapabilityRegistryProjection as CapabilityRegistryProjectionRecord,
  CanonicalConnectorRecord,
  ExecutiveContinuityClassification,
  RegistryFreshness,
} from "../lib/types";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

const CONTINUITY_LABELS: Readonly<Record<ExecutiveContinuityClassification, string>> = Object.freeze({
  hard_blocking: "Hard blocking",
  safely_remediable: "Safely remediable",
  non_blocking_degraded: "Non-blocking degraded",
  operator_action_required: "Operator action required",
});

export function capabilityDisplayState(classification: CapabilityClassification): CapabilityDisplayState {
  if (classification === "live_verified") return "Live";
  if (classification === "live_degraded") return "Degraded";
  if (classification === "simulated") return "Simulated";
  return "Unavailable";
}

function connectorDisplayState(connector: CanonicalConnectorRecord): CapabilityDisplayState {
  const availability = connector.operationalAvailability.trim().toLowerCase();
  if (availability === "simulated") return "Simulated";
  if (["live_degraded", "degraded", "partially_available"].includes(availability)) return "Degraded";
  if (["live_verified", "live", "available", "operational"].includes(availability)) {
    return connector.freshness.stale === true ? "Degraded" : "Live";
  }
  return "Unavailable";
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export function verificationAge(
  lastSuccessfulVerification: string | null | undefined,
  freshness: RegistryFreshness | undefined,
  now = Date.now(),
) {
  if (typeof freshness?.ageSeconds === "number" && Number.isFinite(freshness.ageSeconds)) {
    return `${formatDuration(freshness.ageSeconds)} ago`;
  }
  if (!lastSuccessfulVerification) return "Never verified";
  const verifiedAt = Date.parse(lastSuccessfulVerification);
  if (Number.isNaN(verifiedAt)) return "Verification time unavailable";
  return `${formatDuration((now - verifiedAt) / 1_000)} ago`;
}

function limitationsText(limitations: string[]) {
  return limitations.length ? limitations.join(" · ") : "No current limitations reported.";
}

export function CapabilityRegistryProjection({
  projection,
  gatewayStale = false,
}: {
  projection: CapabilityRegistryProjectionRecord | null;
  gatewayStale?: boolean;
}) {
  if (!projection) {
    return <DataPanel
      eyebrow="Canonical capability truth"
      title="Live Capability Registry unavailable"
      icon={<Boxes size={18} />}
      className="span-2 capability-registry"
    >
      <EmptyRecord>
        The Experience Gateway did not receive a valid Runtime-owned registry projection. All capability actions remain unavailable.
      </EmptyRecord>
    </DataPanel>;
  }

  return <div className="capability-registry-layout span-2">
    <DataPanel
      eyebrow="Canonical capability truth"
      title="Runtime-owned Capability Registry"
      icon={<Boxes size={18} />}
      className="span-2 capability-registry"
    >
      <div className="capability-registry__authority">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>Authority is separate: Not granted</strong>
          <span>Live or healthy capability Evidence never creates Authority. This read-only projection introduced no execution Authority.</span>
        </div>
        <StatusPill value={gatewayStale ? "Degraded" : "Runtime verified projection"} />
      </div>
      <dl className="capability-registry__meta">
        <div><dt>Owner</dt><dd>{projection.owner}</dd></div>
        <div><dt>Schema</dt><dd>{projection.schemaVersion}</dd></div>
        <div><dt>Generated</dt><dd>{new Date(projection.generatedAt).toLocaleString()}</dd></div>
        <div><dt>Authority</dt><dd>{projection.authority.authorityGranted ? "Granted" : "Not granted"}</dd></div>
      </dl>
    </DataPanel>

    <DataPanel eyebrow="Capabilities" title="Registered availability" icon={<Boxes size={18} />} className="span-2 capability-registry">
      {projection.capabilities.length ? <div className="capability-registry__records">
        {projection.capabilities.map((capability) => <article key={capability.capabilityId}>
          <div className="capability-registry__record-heading">
            <strong>{capability.capabilityId}</strong>
            <StatusPill value={capabilityDisplayState(capability.classification)} />
          </div>
          <small>{capability.classification}</small>
          <p>{limitationsText(capability.limitations)}</p>
          {capability.requiredNextAction && <span><b>Next:</b> {capability.requiredNextAction}</span>}
        </article>)}
      </div> : <EmptyRecord>No canonical capability records were returned.</EmptyRecord>}
    </DataPanel>

    <DataPanel eyebrow="Connectors" title="Independent verification dimensions" icon={<Cable size={18} />} className="span-2 capability-registry">
      {projection.connectors.length ? <div className="capability-registry__records capability-registry__connectors">
        {projection.connectors.map((connector) => <article key={connector.connectorId}>
          <div className="capability-registry__record-heading">
            <strong>{connector.connectorId}</strong>
            <StatusPill value={connectorDisplayState(connector)} />
          </div>
          <dl className="capability-registry__dimensions">
            <div><dt>Registration</dt><dd>{String(connector.registration)}</dd></div>
            <div><dt>Configuration</dt><dd>{String(connector.configuration)}</dd></div>
            <div><dt>Reachability</dt><dd>{String(connector.reachability)}</dd></div>
            <div><dt>Verification</dt><dd>{String(connector.verification)}</dd></div>
            <div><dt>Health</dt><dd>{String(connector.health)}</dd></div>
            <div><dt>Availability</dt><dd>{connector.operationalAvailability}</dd></div>
            <div><dt>Verification age</dt><dd>{verificationAge(connector.lastSuccessfulVerification, connector.freshness)}</dd></div>
            <div><dt>Authorization</dt><dd>{connector.authorizationRequirement}</dd></div>
          </dl>
          <p>{limitationsText(connector.limitations)}</p>
          <span><b>Evidence:</b> {connector.evidenceReferences.length ? connector.evidenceReferences.join(", ") : "None"}</span>
          <span><b>Receipts:</b> {connector.receiptReferences.length ? connector.receiptReferences.join(", ") : "None"}</span>
          <span><b>Next:</b> {connector.requiredNextAction}</span>
        </article>)}
      </div> : <EmptyRecord>No connector is currently registered.</EmptyRecord>}
    </DataPanel>

    <DataPanel eyebrow="Actions" title="Typed invocation inventory" icon={<ListChecks size={18} />} className="span-2 capability-registry">
      {projection.actions.length ? <div className="capability-registry__action-table" role="table" aria-label="Canonical action availability">
        <div className="capability-registry__action-row capability-registry__action-head" role="row">
          <span>Action</span><span>Capability</span><span>State</span><span>Invocation</span>
        </div>
        {projection.actions.map((action) => {
          const displayState = capabilityDisplayState(action.classification);
          const invocationEnabled = action.invocable && !gatewayStale && !["Unavailable"].includes(displayState);
          return <div className="capability-registry__action-row" role="row" key={action.actionId}>
            <div>
              <strong>{action.actionId}</strong>
              <small>{action.handlerId ?? "No typed handler registered"}</small>
              <small>{action.operationId} · {action.inputSchemaId}</small>
              <small>Fixed target: {action.fixedTarget ?? action.pathTemplate ?? "No fixed target reported"}</small>
              <small>{action.invocationPaths?.length ? action.invocationPaths.join(" · ") : "No invocation path registered"}</small>
              <small>{limitationsText(action.limitations)}{action.requiredNextAction ? ` Next: ${action.requiredNextAction}` : ""}</small>
            </div>
            <span>{action.capabilityId}</span>
            <StatusPill value={displayState} />
            {invocationEnabled
              ? <StatusPill value="Registered handler" />
              : <NexusButton
                size="sm"
                disabled
                aria-label={`${action.actionId} is unavailable`}
                title={limitationsText(action.limitations)}
              >Disabled</NexusButton>}
          </div>;
        })}
      </div> : <EmptyRecord>No typed actions are registered. No action can be invoked.</EmptyRecord>}
      <p className="capability-registry__boundary">
        This registry is read-only. “Registered” identifies an allowlisted handler; it is not an execution control and does not bypass authentication, policy, or Authority.
      </p>
    </DataPanel>

    <DataPanel eyebrow="Executive Continuity" title="Impediments and bounded next actions" icon={<AlertTriangle size={18} />} className="span-2 capability-registry">
      <div className="capability-registry__continuity-legend" aria-label="Executive Continuity classifications">
        {(Object.keys(CONTINUITY_LABELS) as ExecutiveContinuityClassification[]).map((classification) => (
          <StatusPill key={classification} value={CONTINUITY_LABELS[classification]} />
        ))}
      </div>
      {projection.executiveContinuity.impediments.length ? <div className="capability-registry__records capability-registry__continuity">
        {projection.executiveContinuity.impediments.map((impediment) => <article key={impediment.impedimentId}>
          <div className="capability-registry__record-heading">
            <strong>{impediment.impedimentId}</strong>
            <StatusPill value={CONTINUITY_LABELS[impediment.classification]} />
          </div>
          <p>{impediment.limitation}</p>
          <span><b>Required next action:</b> {impediment.requiredNextAction}</span>
          {impediment.remediationAction && <NexusButton size="sm" disabled>
            {impediment.remediationAction.classification === "staged" ? "Remediation staged" : "Remediation unavailable"}
          </NexusButton>}
        </article>)}
      </div> : <EmptyRecord>No current Executive Continuity impediments were reported.</EmptyRecord>}
    </DataPanel>
  </div>;
}
