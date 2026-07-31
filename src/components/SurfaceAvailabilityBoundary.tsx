import { MonitorCog, ShieldAlert } from "lucide-react";
import type {
  NexusClientId,
  NexusModuleDefinition,
  NexusSurfaceDefinition,
} from "../platform/surfaceRegistry";
import { DataPanel } from "./DataPanel";
import { StatusPill } from "./StatusPill";

const stateLabel = (state: NexusSurfaceDefinition["clients"]["web"]["state"]) => (
  state === "local_only"
    ? "Local NEXUS only"
    : state.replaceAll("_", " ")
);

export function ModuleAvailabilityBoundary({
  module,
  client,
}: {
  module: NexusModuleDefinition;
  client: NexusClientId;
}) {
  const projection = module.clients[client];
  return <DataPanel
    eyebrow="Canonical module registry"
    title={`${module.label} is ${stateLabel(projection.state)}`}
    icon={projection.state === "local_only" ? <MonitorCog size={18} /> : <ShieldAlert size={18} />}
    className="module-availability-boundary"
  >
    <div className="surface-availability-boundary__state">
      <StatusPill value={stateLabel(projection.state)} />
      <p>{projection.reason}</p>
    </div>
    <p className="boundary-note">
      This module remains visible in the shared inventory without claiming a handler,
      Runtime capability, or cross-client behavior that has not been verified.
    </p>
  </DataPanel>;
}

export function SurfaceAvailabilityBoundary({
  surface,
}: {
  surface: NexusSurfaceDefinition;
}) {
  const web = surface.clients.web;
  const desktop = surface.clients.desktop;
  return <DataPanel
    eyebrow="Canonical surface registry"
    title={`${surface.label} is ${stateLabel(web.state)}`}
    icon={web.state === "local_only" ? <MonitorCog size={18} /> : <ShieldAlert size={18} />}
    className="span-2 surface-availability-boundary"
  >
    <div className="surface-availability-boundary__state">
      <StatusPill value={stateLabel(web.state)} />
      <p>{web.reason}</p>
    </div>
    <dl className="surface-availability-boundary__clients">
      <div><dt>Hosted Experience</dt><dd>{stateLabel(web.state)}</dd></div>
      <div><dt>Local NEXUS</dt><dd>{stateLabel(desktop.state)}</dd></div>
      <div><dt>Local route</dt><dd><code>{desktop.route}</code></dd></div>
    </dl>
    <div className="surface-availability-boundary__modules" aria-label={`${surface.label} module inventory`}>
      {surface.modules.map((module) => <ModuleAvailabilityBoundary
        key={module.moduleId}
        module={module}
        client="web"
      />)}
    </div>
    <p className="boundary-note">
      Navigation parity records the surface without claiming capability parity.
      The browser will not substitute static data, local state, or a generic proxy.
    </p>
  </DataPanel>;
}
