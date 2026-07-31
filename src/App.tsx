import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, BookOpen, Bot, BrainCircuit, CircleGauge, FileCheck2, Files, FolderKanban, History, Mic2, Network, ServerCog, Settings2, ShieldCheck, Waypoints, type LucideIcon } from "lucide-react";
import { CapabilityRegistryProjection as CapabilityRegistryWorkspace } from "./components/CapabilityRegistryProjection";
import { ConnectorDiagnosticsWorkspace } from "./components/ConnectorDiagnosticsWorkspace";
import { ConclaveWorkspace } from "./components/ConclaveWorkspace";
import { DataPanel, EmptyRecord } from "./components/DataPanel";
import { DocumentIntake } from "./components/DocumentIntake";
import { EdgeAdmissionWorkspace } from "./components/EdgeAdmissionWorkspace";
import { EdgeRuntime } from "./components/EdgeRuntime";
import { ExecutiveStatusBar } from "./components/ExecutiveStatusBar";
import { KnowledgeWorkspace } from "./components/KnowledgeWorkspace";
import { MissionDashboard } from "./components/MissionDashboard";
import { NexusCopilot } from "./components/NexusCopilot";
import { OperationalReplay } from "./components/OperationalReplay";
import { OperationsCenter } from "./components/OperationsCenter";
import { OperationsWorkspace } from "./components/OperationsWorkspace";
import { OperationalAccessGate } from "./components/OperationalAccessGate";
import {
  AuthorityReadinessDiagnostics,
  FunctionalReadinessDiagnostics,
  GovernanceReadinessDiagnostics,
  MissionRuntimeEvidence,
  RuntimeMissionInventory,
  VoiceRuntimeStatus,
} from "./components/ParityDiagnostics";
import { ProjectStudio } from "./components/ProjectStudio";
import { RegisteredExecutiveSession } from "./components/RegisteredExecutiveSession";
import { CanonicalExecutionSpine } from "./components/CanonicalExecutionSpine";
import { ReleaseRevision } from "./components/ReleaseRevision";
import { RuntimeHealth } from "./components/RuntimeHealth";
import { RuntimeInformation } from "./components/RuntimeInformation";
import { RuntimeTopology } from "./components/RuntimeTopology";
import { StatusPill } from "./components/StatusPill";
import {
  ModuleAvailabilityBoundary,
  SurfaceAvailabilityBoundary,
} from "./components/SurfaceAvailabilityBoundary";
import { VoiceWorkspace } from "./components/VoiceWorkspace";
import { WorkSessionsWorkspace } from "./components/WorkSessionsWorkspace";
import { AppearanceWorkspace } from "./appearance/AppearanceWorkspace";
import { useAppearanceSettings } from "./appearance/useAppearanceSettings";
import type { EoxAssessment } from "./lib/eox-client";
import {
  capabilityStateView,
  hostedSessionActionAvailability,
  MODULE_MOUNT_ACTION_REQUIREMENTS,
} from "./lib/hosted-capability-gate";
import {
  OPERATIONAL_SESSION_INVALID_EVENT,
  localNexusClient,
  operationalSessionClient,
  type OperationalSession,
} from "./lib/local-client";
import {
  PORTAL_CANONICAL_ACTIONS,
  asCapabilityRegistryProjection,
  canonicalActionAvailability,
  portalFailureEnvelope,
  portalClient,
} from "./lib/portal-client";
import {
  derivePortalConnectionState,
  selectPortalPrimaryFailure,
} from "./lib/request-coordination.mjs";
import { displayLabel } from "./lib/presentation";
import type {
  CapabilityRegistryProjection,
  ConnectionState,
  GatewayEnvelope,
  ProviderRecord,
  RuntimeRoute,
  RuntimeSnapshot,
} from "./lib/types";
import { NexusContextInspector } from "./platform/NexusContextInspector";
import { NexusExecutiveNavigation } from "./platform/NexusExecutiveNavigation";
import { NexusPlatformRail, type PlatformRailGroup } from "./platform/NexusPlatformRail";
import { NexusActivityStream, NexusWorkspaceCommandBar } from "./platform/NexusWorkspaceChrome";
import { NexusWorkspaceFrame } from "./platform/NexusWorkspaceFrame";
import {
  NEXUS_PLATFORM_PATH_ALIASES,
} from "./platform/navigation";
import {
  NEXUS_EXECUTIVE_SURFACES,
  NEXUS_SURFACE_GROUPS,
  NEXUS_WEB_SURFACES,
  assertNexusModuleComponentMap,
  nexusSurfaceFromWebPath,
  nexusSurfaceSourceClass,
  type NexusModuleDefinition,
  type NexusSurfaceDefinition,
  type NexusSurfaceIcon,
  type NexusSurfaceId,
} from "./platform/surfaceRegistry";
import "./design-system/nexus-tokens.css";
import "./design-system/nexus-foundation.css";
import "./appearance/appearance-workspace.css";
import "./platform/nexus-platform.css";
import "./components/HostedOperationalContext.css";

type AreaId = NexusSurfaceId;
type Area = NexusSurfaceDefinition & { iconComponent: LucideIcon };
type CopilotAreaId = Parameters<typeof NexusCopilot>[0]["activeArea"];

const SURFACE_ICONS: Record<NexusSurfaceIcon, LucideIcon> = {
  dashboard: CircleGauge,
  missions: Waypoints,
  replay: History,
  conclave: BrainCircuit,
  knowledge: BookOpen,
  edge: ServerCog,
  "mission-control": Network,
  settings: Settings2,
  documents: Files,
  projects: FolderKanban,
  "data-platform": Activity,
  providers: Bot,
  runtime: ServerCog,
  connectors: Network,
  storage: Files,
  cloud: ServerCog,
  team: Bot,
  governance: ShieldCheck,
  "capability-ledger": FileCheck2,
  evidence: FileCheck2,
  security: ShieldCheck,
  receipts: FileCheck2,
  voice: Mic2,
  "executive-views": CircleGauge,
  "work-sessions": History,
  government: ShieldCheck,
};

const AREAS: Area[] = NEXUS_WEB_SURFACES.map((surface) => ({
  ...surface,
  clients: {
    desktop: { ...surface.clients.desktop },
    web: { ...surface.clients.web },
  },
  capabilityIds: [...surface.capabilityIds],
  iconComponent: SURFACE_ICONS[surface.icon],
}));

const EXECUTIVE_IDS = new Set(NEXUS_EXECUTIVE_SURFACES.map((surface) => surface.id));
const EXECUTIVE_AREAS = AREAS.filter((area) => EXECUTIVE_IDS.has(area.id)).map((area) => ({
  id: area.id,
  label: area.label,
  icon: area.iconComponent,
}));
const RAIL_GROUPS: PlatformRailGroup[] = NEXUS_SURFACE_GROUPS.map((group) => ({
  label: group,
  items: AREAS.filter((area) => area.group === group).map((area) => ({
    id: area.id,
    label: area.label,
    detail: area.detail,
    icon: area.iconComponent,
  })),
}));

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown) => Array.isArray(value) ? value as Record<string, unknown>[] : [];
const isAreaId = (value: string): value is AreaId => AREAS.some((area) => area.id === value);
const AREA_PATHS: Readonly<Record<AreaId, string>> = Object.freeze(
  Object.fromEntries(AREAS.map((area) => [area.id, area.clients.web.route])) as Record<AreaId, string>,
);
const normalizePath = (value: string) => {
  const normalized = `/${value}`.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return normalized || "/";
};
const areaFromPath = (pathname: string): AreaId | null => {
  const path = normalizePath(pathname);
  const canonical = nexusSurfaceFromWebPath(path);
  if (canonical) return canonical.id;
  return NEXUS_PLATFORM_PATH_ALIASES[path] ?? null;
};
const routeFromLocation = (): AreaId => {
  const hashValue = window.location.hash.replace(/^#\/?/, "").split("/")[0] ?? "";
  if (normalizePath(window.location.pathname) === "/" && isAreaId(hashValue)) return hashValue;
  return areaFromPath(window.location.pathname) ?? (isAreaId(hashValue) ? hashValue : "dashboard");
};
const COPILOT_TO_PLATFORM: Record<CopilotAreaId, AreaId> = {
  center: "dashboard", intake: "documents", projects: "projects", voice: "voice",
  operations: "mission-control", replay: "replay", missions: "missions", knowledge: "knowledge", edge: "edge",
  conclave: "conclave", information: "settings",
  health: "settings", topology: "edge", providers: "providers", evidence: "evidence",
};
const PLATFORM_TO_COPILOT: Partial<Record<AreaId, CopilotAreaId>> = {
  dashboard: "center", missions: "missions", replay: "replay", conclave: "conclave",
  knowledge: "knowledge", edge: "edge", "mission-control": "operations", settings: "information",
  documents: "intake", projects: "projects", voice: "voice", providers: "providers", evidence: "evidence",
};
const OPERATIONAL_AREAS = new Set<AreaId>(
  AREAS.filter((area) => area.webOperationalSessionRequired).map((area) => area.id),
);
const HOSTED_CONTRACT_AREAS = new Set<AreaId>(
  AREAS.filter((area) => area.webHostedContract).map((area) => area.id),
);
const AREA_CAPABILITY_IDS: Readonly<Partial<Record<AreaId, readonly string[]>>> = Object.freeze(
  Object.fromEntries(AREAS.map((area) => [area.id, Object.freeze([...area.capabilityIds])])),
);
const MODULE_RUNTIME_ROUTES: Readonly<Record<string, readonly RuntimeRoute[]>> = Object.freeze({
  "dashboard.executive-status": ["status", "health", "ready", "version", "providers", "environment", "diagnostics"],
  "dashboard.operations-center": ["eox"],
  "missions.runtime-evidence": ["ready", "receipts"],
  "edge.monitoring": ["capabilities", "environment"],
  "edge.diagnostics-topology": ["diagnostics", "providers", "health"],
  "settings.runtime-information": ["status", "version", "environment", "providers", "capability-registry"],
  "settings.runtime-health": ["health", "ready", "version", "environment", "diagnostics"],
  "providers.registry": ["providers"],
  "providers.truth-boundary": ["providers"],
  "mission-control.mission-dashboard": ["ready", "receipts"],
  "mission-control.runtime-missions": ["ready", "receipts"],
  "mission-control.functional-readiness": ["ready", "capabilities"],
  "governance.readiness-diagnostics": ["governance"],
  "connectors.registry": ["connectors"],
  "capability-ledger.registry": ["capability-registry"],
  "evidence.proof-references": ["proofs"],
  "evidence.execution-receipts": ["receipts"],
  "evidence.release-provenance": ["version"],
  "receipts.runtime-workspace": ["receipts"],
  "receipts.execution-receipts": ["receipts"],
  "receipts.proof-references": ["proofs"],
  "receipts.release-provenance": ["version"],
  "voice.runtime-status": ["health", "providers"],
  "executive-views.operations-center": ["eox"],
});

function surfaceCapabilityStateView(
  projection: CapabilityRegistryProjection | null,
  surface: NexusSurfaceDefinition,
  registryFailure: string,
) {
  const modules = surface.modules.filter((module) => (
    ["functional", "read_only"].includes(module.clients.web.state)
    && module.capabilityIds.length > 0
  ));
  if (!modules.length) {
    return capabilityStateView(projection, AREA_CAPABILITY_IDS[surface.id] ?? [], registryFailure);
  }
  const states = modules.map((module) => ({
    module,
    capability: capabilityStateView(projection, module.capabilityIds, registryFailure),
  }));
  const admitted = states.filter(({ capability }) => ["live", "degraded"].includes(capability.state));
  if (!admitted.length) return states[0].capability;
  const unavailable = states.filter(({ capability }) => !["live", "degraded"].includes(capability.state));
  if (unavailable.length) {
    return {
      state: "degraded",
      reason: `${admitted.length} module capability contract${admitted.length === 1 ? " remains" : "s remain"} usable; ${unavailable.map(({ module }) => module.label).join(", ")} remains unavailable.`,
    };
  }
  return {
    state: states.some(({ capability }) => capability.state === "degraded") ? "degraded" : "live",
    reason: states.map(({ capability }) => capability.reason).join(" "),
  };
}

function envelopeHasVerifiedRuntimeEvidence(envelope: GatewayEnvelope | undefined) {
  return envelope?.data !== undefined
    && envelope.data !== null
    && ["Healthy", "Degraded"].includes(envelope.gateway.connectionState);
}

function moduleHasVerifiedRuntimeEvidence(
  module: NexusModuleDefinition,
  snapshot: RuntimeSnapshot,
  projection: CapabilityRegistryProjection | null,
) {
  const routeEvidence = (MODULE_RUNTIME_ROUTES[module.moduleId] ?? [])
    .some((route) => envelopeHasVerifiedRuntimeEvidence(snapshot[route]));
  if (routeEvidence) return true;
  if (!module.capabilityIds.length || !projection) return false;
  const records = new Map(
    projection.capabilities.map((capability) => [capability.capabilityId, capability]),
  );
  return module.capabilityIds.every((capabilityId) => {
    const capability = records.get(capabilityId);
    return capability
      ? ["live_verified", "live_degraded"].includes(capability.classification)
      : false;
  });
}

function surfaceHasVerifiedRuntimeEvidence(
  surface: NexusSurfaceDefinition,
  snapshot: RuntimeSnapshot,
  projection: CapabilityRegistryProjection | null,
) {
  return surface.modules
    .filter((module) => ["functional", "read_only"].includes(module.clients.web.state))
    .some((module) => moduleHasVerifiedRuntimeEvidence(module, snapshot, projection));
}

function connectionState(snapshot: RuntimeSnapshot, failures: GatewayEnvelope[], loading: boolean): ConnectionState {
  return derivePortalConnectionState(snapshot, failures, loading) as ConnectionState;
}

function nexusTone(state: ConnectionState): "neutral" | "info" | "success" | "attention" | "critical" {
  if (state === "Healthy") return "success";
  if (state === "Connecting" || state === "Retrying") return "info";
  if (state === "Degraded" || state === "Unknown") return "attention";
  return "critical";
}

function ProviderRegistry({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const providers = list(snapshot.providers?.data) as unknown as ProviderRecord[];
  return <DataPanel eyebrow="Provider registry" title="Verified runtime inventory" icon={<ShieldCheck size={18} />} className="span-2">
      {providers.length ? <div className="provider-table" role="table" aria-label="Runtime providers">
        <div className="provider-row provider-head" role="row"><span>Provider</span><span>Configured</span><span>Reachable</span><span>Verified</span><span>Hosting</span></div>
        {providers.map((provider) => <div className="provider-row" role="row" key={provider.id}><div><strong>{provider.displayName}</strong><small>{provider.id}{provider.default ? " · default" : ""}</small></div><StatusPill value={provider.configured ? "configured" : "unconfigured"} /><StatusPill value={provider.reachable ? "reachable" : "unavailable"} /><StatusPill value={provider.verified ? "verified" : "unverified"} /><span>{displayLabel(provider.hostingMode)}</span></div>)}
      </div> : <EmptyRecord />}
    </DataPanel>;
}

function ProviderTruth({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const providers = list(snapshot.providers?.data) as unknown as ProviderRecord[];
  const openai = providers.find((provider) => provider.id === "openai");
  return <DataPanel eyebrow="Model-native boundary" title="Provider truth" icon={<ShieldCheck size={18} />}>
      <p className="boundary-note">Configuration is not connectivity. {openai?.liveInferenceVerified ? "Live inference is Runtime-verified; model-native output remains non-authoritative." : "No live provider capability is established until Runtime inference succeeds."}</p>
    </DataPanel>;
}

function HostedCapabilityBoundary({
  configured,
  title,
  capability,
  children,
}: {
  configured: boolean;
  title: string;
  capability: { state: string; reason: string };
  children: ReactNode;
}) {
  if (configured && ["live", "degraded"].includes(capability.state)) return children;
  const boundaryState = configured ? capability.state : "unavailable";
  const reason = configured ? capability.reason : "Hosted operational mode is not configured for this deployment.";
  return <DataPanel eyebrow="Hosted capability boundary" title={`${title} is ${boundaryState === "checking" ? "being verified" : "unavailable"}`} icon={<ShieldCheck size={18} />}>
    <p className="boundary-note">{reason} NEXUS will not substitute local state or infer readiness from the portal connection.</p>
    <StatusPill value={boundaryState} />
  </DataPanel>;
}

function ProofReferences({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const proofs = list(snapshot.proofs?.data);
  return <DataPanel eyebrow="Decision Flight Recorder" title="Proof references" icon={<FileCheck2 size={18} />}>{proofs.length ? <div className="reference-list">{proofs.map((proof, index) => <article key={String(proof.id ?? index)}><strong>{String(proof.id ?? "Proof")}</strong><StatusPill value={proof.verified ? "verified" : "recorded"} /></article>)}</div> : <EmptyRecord />}</DataPanel>;
}

function ExecutionReceipts({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const receipts = list(snapshot.receipts?.data);
  return <DataPanel eyebrow="Outcome Ledger" title="Execution receipts" icon={<FileCheck2 size={18} />}>{receipts.length ? <div className="reference-list">{receipts.map((receipt, index) => <article key={String(receipt.id ?? index)}><strong>{String(receipt.id ?? "Receipt")}</strong></article>)}</div> : <EmptyRecord>No execution receipts are available.</EmptyRecord>}</DataPanel>;
}

function ReleaseProvenance({
  runtimeCommit,
  programAlphaCommit,
}: {
  runtimeCommit: string;
  programAlphaCommit: string;
}) {
  return <DataPanel eyebrow="Release provenance" title="Verified deployment revisions" icon={<ShieldCheck size={18} />} className="span-2">
      <div className="information-grid release-provenance-grid">
        <ReleaseRevision label="Runtime commit" value={runtimeCommit} />
        <ReleaseRevision label="Program Alpha commit" value={programAlphaCommit} />
      </div>
    </DataPanel>;
}

function MissionStepExecutionPosture({
  readiness,
}: {
  readiness: Record<string, unknown> | null;
}) {
  const capabilities = rowsFromUnknown(readiness?.capabilities);
  const mission = capabilities.find((item) => item.capabilityId === "mission_executor");
  const available = mission?.available === true || mission?.state === "available";
  return <DataPanel eyebrow="Canonical execution spine" title="Mission step Authority posture" icon={<ShieldCheck size={18} />}>
    <p className="boundary-note">
      Supported typed Mission steps require policy and Decision controls, a one-use capability-bound Authority Grant,
      a receipt, and an independently verified postcondition. When policy requires Approval, the adapter consumes a
      real recorded Approval; it never fabricates one. Unsupported or unprovisioned steps fail closed.
    </p>
    <StatusPill value={available ? "available" : "capability gated"} />
  </DataPanel>;
}

function rowsFromUnknown(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

export function App() {
  const appearance = useAppearanceSettings();
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>({});
  const [failures, setFailures] = useState<GatewayEnvelope[]>([]);
  const [active, setActive] = useState<AreaId>(routeFromLocation);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotExpanded, setCopilotExpanded] = useState(false);
  const [replayMissionId, setReplayMissionId] = useState<string>();
  const [sessionBootstrapComplete, setSessionBootstrapComplete] = useState(false);
  const [hostedOperationalConfigured, setHostedOperationalConfigured] = useState(false);
  const [operationalSession, setOperationalSession] = useState<OperationalSession>({ authenticated: false });
  const [operationalReadiness, setOperationalReadiness] = useState<Record<string, unknown> | null>(null);
  const refreshGeneration = useRef(0);

  const refresh = (forceRefresh = false) => {
    const generation = refreshGeneration.current + 1;
    refreshGeneration.current = generation;
    setLoading(true);
    portalClient.snapshot(forceRefresh)
      .then((result) => {
        setSnapshot((current) => ({ ...current, ...result.data }));
        setFailures(result.failures);
      })
      .catch(() => {
        setFailures((current) => [
          ...current.filter(
            (item) => item.error?.code !== "gateway_snapshot_failed",
          ),
          portalFailureEnvelope(
            "status",
            "gateway_snapshot_failed",
            "The browser could not complete the bounded Runtime snapshot. Previously verified module state remains visible.",
            "Unknown",
          ),
        ]);
      })
      .finally(() => {
        if (refreshGeneration.current === generation) setLoading(false);
      });
  };
  function focusPlatformSearch() {
    if (window.matchMedia("(max-width: 820px)").matches) setMenuOpen(true);
    window.requestAnimationFrame(() => document.getElementById("platform-search")?.focus());
  }

  useEffect(() => refresh(false), []);
  useEffect(() => {
    let active = true;
    operationalSessionClient.status()
      .then((session) => {
        if (!active) return;
        operationalSessionClient.use(session);
        setHostedOperationalConfigured(true);
        setOperationalSession(session);
      })
      .catch(() => {
        if (!active) return;
        operationalSessionClient.use({ authenticated: false });
        setHostedOperationalConfigured(false);
        setOperationalSession({ authenticated: false });
      })
      .finally(() => { if (active) setSessionBootstrapComplete(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!operationalSession.authenticated) {
      setOperationalReadiness(null);
      return;
    }
    let mounted = true;
    const verify = () => {
      void localNexusClient.capabilityReadiness().then((value) => {
        if (!mounted) return;
        setOperationalReadiness(record(value));
      }).catch(() => {
        if (!mounted) return;
        setOperationalReadiness(null);
      });
    };
    void verify();
    const timer = window.setInterval(verify, 30_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [operationalSession.authenticated, operationalSession.tenantId, operationalSession.workspaceId]);
  useEffect(() => {
    const invalidate = () => {
      const disconnected: OperationalSession = { authenticated: false };
      operationalSessionClient.use(disconnected);
      setOperationalSession(disconnected);
    };
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;
      operationalSessionClient.status().then((session) => {
        operationalSessionClient.use(session);
        setHostedOperationalConfigured(true);
        setOperationalSession(session);
      }).catch(invalidate);
    };
    window.addEventListener(OPERATIONAL_SESSION_INVALID_EVENT, invalidate);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    const timer = window.setInterval(revalidate, 30_000);
    return () => {
      window.removeEventListener(OPERATIONAL_SESSION_INVALID_EVENT, invalidate);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => { const timer = window.setInterval(() => refresh(false), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const sync = () => setActive(routeFromLocation());
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);
  useEffect(() => {
    const canonical = AREA_PATHS[active];
    if (normalizePath(window.location.pathname) !== canonical || window.location.hash) {
      window.history.replaceState({ nexusArea: active }, "", canonical);
    }
  }, [active]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); focusPlatformSearch(); }
      if (event.key === "Escape") {
        setMenuOpen(false);
        setInspectorOpen(false);
        setCopilotOpen(false);
        setCopilotExpanded(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const state = connectionState(snapshot, failures, loading);
  const connectionTone = nexusTone(state);
  const primaryFailure = selectPortalPrimaryFailure(failures, state);
  const current = AREAS.find((area) => area.id === active) ?? AREAS[0];
  const status = record(snapshot.status?.data);
  const versionData = record(snapshot.version?.data);
  const deployedCommits = record(versionData.deployedCommits);
  const deployedRuntimeCommit = String(deployedCommits.runtimeRepository ?? versionData.deployedCommit ?? "Unavailable");
  const deployedProgramAlphaCommit = String(deployedCommits.programAlpha ?? versionData.programAlphaCommit ?? "Unavailable");
  const environment = String(status.environment ?? record(snapshot.environment?.data).environment ?? "Unavailable");
  const runtimeVersion = snapshot.version?.runtime?.runtimeVersion ?? "Unavailable";
  const eox = snapshot.eox?.data as EoxAssessment | null | undefined;
  const proofId = list(snapshot.proofs?.data).map((proof) => proof.id).find(Boolean);
  const receiptId = list(snapshot.receipts?.data).map((receipt) => receipt.id).find(Boolean);
  const capabilityRegistryEnvelope = snapshot["capability-registry"];
  const capabilityRegistry = asCapabilityRegistryProjection(capabilityRegistryEnvelope?.data);
  const capabilityRegistryFailure = capabilityRegistryEnvelope?.error?.message
    ?? (capabilityRegistryEnvelope && !capabilityRegistry ? "The canonical Capability Registry projection failed validation." : "");
  const currentRuntimeEvidenceVerified = surfaceHasVerifiedRuntimeEvidence(
    current,
    snapshot,
    capabilityRegistry,
  );
  const hostedActionAccess = {
    hosted: operationalSessionClient.mode() === "hosted",
    authenticated: operationalSession.authenticated,
    scopes: operationalSession.scopes,
  };
  const copilotInteractionAction = hostedSessionActionAvailability(
    canonicalActionAvailability(
      capabilityRegistry,
      PORTAL_CANONICAL_ACTIONS.copilotInteractionStart,
      capabilityRegistryFailure,
    ),
    hostedActionAccess,
    "operations:write",
  );
  const realtimeVoiceAction = hostedSessionActionAvailability(
    canonicalActionAvailability(
      capabilityRegistry,
      PORTAL_CANONICAL_ACTIONS.realtimeVoiceCall,
      capabilityRegistryFailure,
    ),
    hostedActionAccess,
    "operations:write",
  );
  const voiceOperatorTranscriptAction = hostedSessionActionAvailability(
    canonicalActionAvailability(
      capabilityRegistry,
      PORTAL_CANONICAL_ACTIONS.voiceOperatorTranscript,
      capabilityRegistryFailure,
    ),
    hostedActionAccess,
    "operations:read",
  );
  const registryRailGroups = RAIL_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const surface = AREAS.find((candidate) => candidate.id === item.id) ?? AREAS[0];
      return {
        ...item,
        live: ["functional", "read_only"].includes(surface.clients.web.state)
          && surfaceCapabilityStateView(
            capabilityRegistry,
            surface,
            capabilityRegistryFailure,
          ).state === "live",
      };
    }),
  }));
  const hostedCapability = surfaceCapabilityStateView(
    capabilityRegistry,
    current,
    capabilityRegistryFailure,
  );
  const activityTimestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sidePanel = copilotOpen ? "copilot" : inspectorOpen ? "inspector" : "closed";

  function navigate(id: AreaId) {
    const path = AREA_PATHS[id];
    if (normalizePath(window.location.pathname) !== path || window.location.hash) {
      window.history.pushState({ nexusArea: id }, "", path);
    }
    setActive(id);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }
  function openReplay(missionId?: string) { setReplayMissionId(missionId); navigate("replay"); }
  function toggleCopilot() {
    const next = !copilotOpen;
    setCopilotOpen(next);
    if (next) setInspectorOpen(false);
    else setCopilotExpanded(false);
  }
  function toggleInspector() {
    const next = !inspectorOpen;
    setInspectorOpen(next);
    if (next) {
      setCopilotOpen(false);
      setCopilotExpanded(false);
    }
  }
  function setCopilotPanelOpen(open: boolean) {
    setCopilotOpen(open);
    if (open) setInspectorOpen(false);
    else setCopilotExpanded(false);
  }

  function acceptOperationalSession(session: OperationalSession) {
    operationalSessionClient.use(session);
    setHostedOperationalConfigured(true);
    setOperationalSession(session);
    refresh(true);
  }

  const webModuleComponents: Record<string, ReactNode> = {
    "web.dashboard.executive-status": <ExecutiveStatusBar snapshot={snapshot} connectionState={state} />,
    "web.dashboard.operations-center": <OperationsCenter assessment={eox ?? null} />,
    "web.missions.dashboard": <MissionDashboard onReplay={openReplay} readiness={operationalReadiness} session={operationalSession} capabilityRegistry={capabilityRegistry} />,
    "web.missions.runtime-evidence": <MissionRuntimeEvidence />,
    "web.missions.step-execution": <MissionStepExecutionPosture readiness={operationalReadiness} />,
    "web.replay.timeline": <OperationalReplay requestedMissionId={replayMissionId} />,
    "web.conclave.workspace": <ConclaveWorkspace readiness={operationalReadiness} session={operationalSession} capabilityRegistry={capabilityRegistry} />,
    "web.knowledge.workspace": <KnowledgeWorkspace snapshot={snapshot} session={operationalSession} capabilityRegistry={capabilityRegistry} />,
    "web.edge.monitoring": <EdgeRuntime snapshot={snapshot} />,
    "web.edge.diagnostics-topology": <RuntimeTopology snapshot={snapshot} />,
    "web.edge.admission-request": <EdgeAdmissionWorkspace capabilityRegistry={capabilityRegistry} onFleetRefresh={() => refresh(true)} />,
    "web.mission-control.operations-workspace": <OperationsWorkspace session={operationalSession} onSessionChange={acceptOperationalSession} runtimeCommit={deployedRuntimeCommit} programAlphaCommit={deployedProgramAlphaCommit} capabilityRegistry={capabilityRegistry} />,
    "web.mission-control.mission-dashboard": <MissionDashboard onReplay={openReplay} readiness={operationalReadiness} session={operationalSession} capabilityRegistry={capabilityRegistry} />,
    "web.mission-control.runtime-missions": <RuntimeMissionInventory />,
    "web.mission-control.functional-readiness": <FunctionalReadinessDiagnostics readiness={operationalReadiness} />,
    "web.settings.runtime-information": <RuntimeInformation snapshot={snapshot} connectionState={state} runtimeCommit={deployedRuntimeCommit} programAlphaCommit={deployedProgramAlphaCommit} />,
    "web.settings.runtime-health": <RuntimeHealth snapshot={snapshot} connectionState={state} />,
    "web.settings.appearance": <AppearanceWorkspace appearance={appearance} />,
    "web.settings.registered-executive": <RegisteredExecutiveSession />,
    "web.settings.canonical-execution": <CanonicalExecutionSpine capabilityRegistry={capabilityRegistry} />,
    "web.documents.intake": <DocumentIntake capabilityRegistry={capabilityRegistry} session={operationalSession} />,
    "web.projects.planning": <ProjectStudio capabilityRegistry={capabilityRegistry} session={operationalSession} />,
    "web.providers.registry": <ProviderRegistry snapshot={snapshot} />,
    "web.providers.truth-boundary": <ProviderTruth snapshot={snapshot} />,
    "web.governance.readiness": <GovernanceReadinessDiagnostics />,
    "web.governance.authority": <AuthorityReadinessDiagnostics />,
    "web.connectors.registry": <ConnectorDiagnosticsWorkspace envelope={snapshot.connectors} />,
    "web.capability-ledger.registry": <CapabilityRegistryWorkspace projection={capabilityRegistry} gatewayStale={capabilityRegistryEnvelope?.gateway.cache.stale === true} />,
    "web.evidence.proofs": <ProofReferences snapshot={snapshot} />,
    "web.evidence.execution-receipts": <ExecutionReceipts snapshot={snapshot} />,
    "web.evidence.release-provenance": <ReleaseProvenance runtimeCommit={deployedRuntimeCommit} programAlphaCommit={deployedProgramAlphaCommit} />,
    "web.receipts.runtime-workspace": <ExecutionReceipts snapshot={snapshot} />,
    "web.receipts.execution-receipts": <ExecutionReceipts snapshot={snapshot} />,
    "web.receipts.proofs": <ProofReferences snapshot={snapshot} />,
    "web.receipts.release-provenance": <ReleaseProvenance runtimeCommit={deployedRuntimeCommit} programAlphaCommit={deployedProgramAlphaCommit} />,
    "web.voice.operator": <VoiceWorkspace realtimeAction={realtimeVoiceAction} textAction={voiceOperatorTranscriptAction} />,
    "web.voice.runtime-status": <VoiceRuntimeStatus />,
    "web.executive-views.operations-center": <OperationsCenter assessment={eox ?? null} />,
    "web.work-sessions.workspace": <WorkSessionsWorkspace capabilityRegistry={capabilityRegistry} session={operationalSession} />,
  };
  assertNexusModuleComponentMap("web", webModuleComponents);

  function renderWebModule(module: NexusModuleDefinition) {
    const projection = module.clients.web;
    if (!projection.componentKey || ["local_only", "unavailable"].includes(projection.state)) {
      return <ModuleAvailabilityBoundary key={module.moduleId} module={module} client="web" />;
    }
    const component = webModuleComponents[projection.componentKey];
    const shouldGateCapability = module.capabilityIds.length > 0
      && (current.webOperationalSessionRequired || current.webHostedContract);
    const content = shouldGateCapability
      ? <HostedCapabilityBoundary
          configured={hostedOperationalConfigured}
          title={module.label}
          capability={capabilityStateView(
            capabilityRegistry,
            module.capabilityIds,
            capabilityRegistryFailure,
            MODULE_MOUNT_ACTION_REQUIREMENTS[module.moduleId] ?? [],
          )}
        >{component}</HostedCapabilityBoundary>
      : component;
    return <div
      className="nexus-module-slot"
      data-module-id={module.moduleId}
      data-module-state={projection.state}
      key={module.moduleId}
    >{content}</div>;
  }

  const requiresOperationalSession = OPERATIONAL_AREAS.has(active) || (hostedOperationalConfigured && HOSTED_CONTRACT_AREAS.has(active));
  const showsHostedContext = operationalSession.authenticated && (OPERATIONAL_AREAS.has(active) || HOSTED_CONTRACT_AREAS.has(active));
  const renderedModules = current.modules.map(renderWebModule);
  const content = !sessionBootstrapComplete || (loading && !Object.keys(snapshot).length) ? <section className="loading-state"><div /><p>Connecting through the Experience Gateway…</p></section> : ["local_only", "unavailable"].includes(current.clients.web.state) ? <SurfaceAvailabilityBoundary surface={current} /> : requiresOperationalSession && !operationalSession.authenticated ? <OperationalAccessGate workspace={current.label} onAuthenticated={acceptOperationalSession} /> : <>
    {showsHostedContext && <section className="hosted-operational-context" aria-label="Authenticated hosted operational context">
      <article><span>Gateway transport</span><StatusPill value={state} /></article>
      <article><span>Capability state</span><StatusPill value={hostedCapability.state} /></article>
      <article className="hosted-operational-context__reason"><span>Capability reason</span><strong>{hostedCapability.reason}</strong></article>
      <article><span>Tenant</span><strong>{operationalSession.tenantId ?? "Unavailable"}</strong></article>
      <article><span>Workspace</span><strong>{operationalSession.workspaceId ?? "Unavailable"}</strong></article>
      <article><span>Session expires</span><strong>{operationalSession.expiresAt ? new Date(operationalSession.expiresAt).toLocaleString() : "Unavailable"}</strong></article>
    </section>}
    {active === "settings" ? <div className="settings-workspaces">{renderedModules}</div> : renderedModules}
  </>;

  return <div
    className="nx-app-shell nx-hosted-shell"
    data-inspector={inspectorOpen ? "open" : "closed"}
    data-side-panel={sidePanel}
    data-copilot-expanded={copilotExpanded ? "true" : "false"}
    data-navigation={menuOpen ? "open" : "closed"}
  >
    <a className="skip-link" href="#main-content">Skip to workspace</a>
    <NexusExecutiveNavigation
      items={EXECUTIVE_AREAS}
      active={active}
      connectionLabel={state}
      connectionTone={connectionTone}
      alertCount={failures.length}
      colorMode={appearance.settings.colorMode}
      onColorModeChange={(colorMode) => appearance.updateSettings({ colorMode })}
      onNavigate={(id) => navigate(id as AreaId)}
      onSearch={focusPlatformSearch}
    />
    <div className="nx-app-shell__body">
      <NexusPlatformRail
        groups={registryRailGroups}
        active={active}
        open={menuOpen}
        query={query}
        connectionLabel={state}
        connectionTone={connectionTone}
        onQueryChange={setQuery}
        onNavigate={(id) => navigate(id as AreaId)}
        onClose={() => setMenuOpen(false)}
      />
      <section className="nx-platform-stage">
        <NexusWorkspaceCommandBar
          activeLabel={current.label}
          loading={loading}
          navigationOpen={menuOpen}
          copilotOpen={copilotOpen}
          inspectorOpen={inspectorOpen}
          onOpenNavigation={() => setMenuOpen(true)}
          onRefresh={() => refresh(true)}
          onToggleCopilot={toggleCopilot}
          onToggleInspector={toggleInspector}
        />
        {failures.length > 0 && <section className="nx-runtime-alert" role="alert" data-tone={connectionTone}><Activity size={17} /><div><strong>{state}</strong><span>{primaryFailure?.error?.message ?? "One or more Runtime signals are unavailable."}</span></div></section>}
        <main id="main-content" className="nx-primary-workspace">
          <NexusWorkspaceFrame
            eyebrow={current.group === "Platform" ? "Hosted Experience Gateway" : "Platform capability"}
            title={current.label}
            description={current.detail}
            icon={current.iconComponent}
            connectionLabel={state}
            connectionTone={connectionTone}
          >{content}</NexusWorkspaceFrame>
        </main>
        <NexusActivityStream
          message={state === "Healthy" ? "Experience Gateway connected. Operational claims still require Runtime Evidence and postcondition verification." : "Presentation available; live operational state is not established."}
          timestamp={activityTimestamp}
        />
      </section>
      {inspectorOpen && <NexusContextInspector
        featureLabel={current.label}
        routePath={AREA_PATHS[active]}
        sourceClass={nexusSurfaceSourceClass(current, "web", currentRuntimeEvidenceVerified)}
        connectionLabel={state}
        connectionTone={connectionTone}
        environment={environment}
        runtimeVersion={runtimeVersion}
        runtimeRevision={deployedRuntimeCommit}
        failureCount={failures.length}
        proofId={proofId ? String(proofId) : undefined}
        receiptId={receiptId ? String(receiptId) : undefined}
        onClose={() => setInspectorOpen(false)}
      />}
      <NexusCopilot
        activeArea={PLATFORM_TO_COPILOT[active] ?? "center"}
        activeLabel={current.label}
        runtimeState={state}
        onNavigate={(area) => navigate(COPILOT_TO_PLATFORM[area])}
        interactionAction={copilotInteractionAction}
        realtimeAction={realtimeVoiceAction}
        open={copilotOpen}
        expanded={copilotExpanded}
        onOpenChange={setCopilotPanelOpen}
        onExpandedChange={setCopilotExpanded}
      />
    </div>
  </div>;
}
