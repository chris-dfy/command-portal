import { useEffect, useState, type ReactNode } from "react";
import { Activity, BookOpen, Bot, BrainCircuit, CircleGauge, FileCheck2, Files, FolderKanban, History, Mic2, Network, ServerCog, Settings2, ShieldCheck, Waypoints, type LucideIcon } from "lucide-react";
import { ConclaveWorkspace } from "./components/ConclaveWorkspace";
import { DataPanel, EmptyRecord } from "./components/DataPanel";
import { DocumentIntake } from "./components/DocumentIntake";
import { EdgeRuntime } from "./components/EdgeRuntime";
import { ExecutiveStatusBar } from "./components/ExecutiveStatusBar";
import { KnowledgeWorkspace } from "./components/KnowledgeWorkspace";
import { MissionDashboard } from "./components/MissionDashboard";
import { NexusCopilot } from "./components/NexusCopilot";
import { OperationalReplay } from "./components/OperationalReplay";
import { OperationsCenter } from "./components/OperationsCenter";
import { OperationsWorkspace } from "./components/OperationsWorkspace";
import { OperationalAccessGate } from "./components/OperationalAccessGate";
import { ProjectStudio } from "./components/ProjectStudio";
import { ReleaseRevision } from "./components/ReleaseRevision";
import { RuntimeHealth } from "./components/RuntimeHealth";
import { RuntimeInformation } from "./components/RuntimeInformation";
import { RuntimeTopology } from "./components/RuntimeTopology";
import { StatusPill } from "./components/StatusPill";
import { VoiceWorkspace } from "./components/VoiceWorkspace";
import { AppearanceWorkspace } from "./appearance/AppearanceWorkspace";
import { useAppearanceSettings } from "./appearance/useAppearanceSettings";
import type { EoxAssessment } from "./lib/eox-client";
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
  portalClient,
} from "./lib/portal-client";
import { displayLabel } from "./lib/presentation";
import type { CapabilityRegistryProjection, ConnectionState, GatewayEnvelope, ProviderRecord, RuntimeSnapshot } from "./lib/types";
import { NexusContextInspector } from "./platform/NexusContextInspector";
import { NexusExecutiveNavigation } from "./platform/NexusExecutiveNavigation";
import { NexusPlatformRail, type PlatformRailGroup } from "./platform/NexusPlatformRail";
import { NexusActivityStream, NexusWorkspaceCommandBar } from "./platform/NexusWorkspaceChrome";
import { NexusWorkspaceFrame } from "./platform/NexusWorkspaceFrame";
import {
  NEXUS_PLATFORM_NAVIGATION,
  NEXUS_PLATFORM_PATH_ALIASES,
  NEXUS_PLATFORM_PATHS,
  type NexusPlatformAreaId,
} from "./platform/navigation";
import "./design-system/nexus-tokens.css";
import "./design-system/nexus-foundation.css";
import "./appearance/appearance-workspace.css";
import "./platform/nexus-platform.css";
import "./components/HostedOperationalContext.css";

type AreaId = NexusPlatformAreaId | "documents" | "projects" | "voice" | "providers" | "evidence";
type Area = { id: AreaId; label: string; detail: string; icon: LucideIcon; group: "Platform" | "Capabilities" };
type CopilotAreaId = Parameters<typeof NexusCopilot>[0]["activeArea"];

const PLATFORM_ICONS: Record<NexusPlatformAreaId, LucideIcon> = {
  dashboard: CircleGauge,
  missions: Waypoints,
  replay: History,
  conclave: BrainCircuit,
  knowledge: BookOpen,
  edge: ServerCog,
  "mission-control": Network,
  settings: Settings2,
};

const AREAS: Area[] = [
  ...NEXUS_PLATFORM_NAVIGATION.map((area) => ({ ...area, icon: PLATFORM_ICONS[area.id], group: "Platform" as const })),
  { id: "documents", label: "Document Intelligence", detail: "Governed evidence ingestion", icon: Files, group: "Capabilities" },
  { id: "projects", label: "Projects", detail: "Plan, scope, and compile", icon: FolderKanban, group: "Capabilities" },
  { id: "voice", label: "Voice Operations", detail: "Governed voice interface", icon: Mic2, group: "Capabilities" },
  { id: "providers", label: "Model Gateway", detail: "Verified provider registry", icon: Bot, group: "Capabilities" },
  { id: "evidence", label: "Evidence Center", detail: "Proofs and receipts", icon: FileCheck2, group: "Capabilities" },
];

const EXECUTIVE_AREAS = AREAS.filter((area) => area.group === "Platform");
const RAIL_GROUPS: PlatformRailGroup[] = (["Platform", "Capabilities"] as const).map((group) => ({
  label: group,
  items: AREAS.filter((area) => area.group === group).map((area) => ({
    ...area,
  })),
}));

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown) => Array.isArray(value) ? value as Record<string, unknown>[] : [];
const STATE_PRIORITY: ConnectionState[] = ["Unauthorized", "Schema Mismatch", "Version Mismatch", "Timed Out", "Unavailable", "Unknown", "Degraded", "Retrying", "Connecting", "Healthy"];
const isAreaId = (value: string): value is AreaId => AREAS.some((area) => area.id === value);
const AREA_PATHS: Readonly<Record<AreaId, string>> = Object.freeze({
  ...NEXUS_PLATFORM_PATHS,
  documents: "/documents",
  projects: "/projects",
  voice: "/voice",
  providers: "/providers",
  evidence: "/evidence",
});
const normalizePath = (value: string) => {
  const normalized = `/${value}`.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return normalized || "/";
};
const areaFromPath = (pathname: string): AreaId | null => {
  const path = normalizePath(pathname);
  const canonical = (Object.entries(AREA_PATHS) as Array<[AreaId, string]>).find(([, candidate]) => (
    path === candidate || (candidate !== "/" && path.startsWith(`${candidate}/`))
  ));
  if (canonical) return canonical[0];
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
const PLATFORM_TO_COPILOT: Record<AreaId, CopilotAreaId> = {
  dashboard: "center", missions: "missions", replay: "replay", conclave: "conclave",
  knowledge: "knowledge", edge: "edge", "mission-control": "operations", settings: "information",
  documents: "intake", projects: "projects", voice: "voice", providers: "providers", evidence: "evidence",
};
const OPERATIONAL_AREAS = new Set<AreaId>([
  "missions", "replay", "conclave", "knowledge", "edge", "mission-control",
]);
const HOSTED_CONTRACT_AREAS = new Set<AreaId>(["documents", "projects", "voice"]);
const AREA_CAPABILITY_IDS: Partial<Record<AreaId, string[]>> = Object.freeze({
  missions: ["mission_executor", "receipts", "operational_replay"],
  replay: ["operational_replay"],
  conclave: ["conclave", "evidence", "operational_replay"],
  knowledge: ["knowledge_intake", "mission_store", "knowledge_acquisition", "knowledge_promotion", "knowledge_store"],
  edge: ["edge_monitoring", "edge_node_admission"],
  "mission-control": ["mission_executor", "conclave", "receipts", "operational_replay"],
  documents: ["knowledge.document_intake"],
  projects: ["projects.nexicron_planning"],
  voice: ["interaction.human"],
});

function capabilityStateView(
  projection: CapabilityRegistryProjection | null,
  active: AreaId,
  registryFailure: string,
) {
  const required = AREA_CAPABILITY_IDS[active] ?? [];
  if (!required.length) return { state: "not_applicable", reason: "This workspace has no hosted capability contract." };
  if (registryFailure) return { state: "unavailable", reason: registryFailure };
  if (!projection) return { state: "checking", reason: "The Runtime-owned Capability Registry projection is being verified." };
  const applicable = projection.capabilities.filter((item) => required.includes(item.capabilityId));
  if (applicable.length !== required.length) {
    const present = new Set(applicable.map((item) => item.capabilityId));
    const missing = required.filter((id) => !present.has(id));
    return { state: "unavailable", reason: `The canonical registry did not return capabilities: ${missing.join(", ")}.` };
  }
  const unavailable = applicable.filter((item) => !["live_verified", "live_degraded"].includes(item.classification));
  const capabilityActions = projection.actions.filter((item) => required.includes(item.capabilityId));
  const missingHandlers = required.filter((id) => !capabilityActions.some((action) => action.capabilityId === id));
  const blockedActions = capabilityActions.filter((action) => (
    action.invocable !== true || !["live_verified", "live_degraded"].includes(action.classification)
  ));
  if (!unavailable.length && !missingHandlers.length && !blockedActions.length) {
    const degraded = applicable.some((item) => item.classification === "live_degraded")
      || capabilityActions.some((item) => item.classification === "live_degraded");
    return {
      state: degraded ? "degraded" : "live",
      reason: `${required.length} required canonical capability contract${required.length === 1 ? " is" : "s are"} ${degraded ? "degraded but invocable" : "live verified"}. Authority remains a separate per-action requirement.`,
    };
  }
  const reasons = [
    ...unavailable.flatMap((item) => [item.requiredNextAction ?? "", ...item.limitations]),
    missingHandlers.length ? `No typed handler inventory for: ${missingHandlers.join(", ")}.` : "",
    ...blockedActions.flatMap((item) => [item.requiredNextAction ?? "", ...item.limitations]),
  ].filter(Boolean);
  return {
    state: unavailable[0]?.classification ?? blockedActions[0]?.classification ?? "unavailable",
    reason: [...new Set(reasons)].join(" ") || "The canonical registry reports this capability unavailable.",
  };
}

function connectionState(snapshot: RuntimeSnapshot, failures: GatewayEnvelope[], loading: boolean): ConnectionState {
  if (!Object.keys(snapshot).length) return loading ? "Connecting" : "Unavailable";
  if (loading) return "Retrying";
  const states = [...failures, ...Object.values(snapshot)].map((item) => item?.gateway.connectionState).filter(Boolean) as ConnectionState[];
  return STATE_PRIORITY.find((state) => states.includes(state)) ?? (failures.length ? "Unavailable" : "Healthy");
}

function nexusTone(state: ConnectionState): "neutral" | "info" | "success" | "attention" | "critical" {
  if (state === "Healthy") return "success";
  if (state === "Connecting" || state === "Retrying") return "info";
  if (state === "Degraded" || state === "Unknown") return "attention";
  return "critical";
}

function Providers({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const providers = list(snapshot.providers?.data) as unknown as ProviderRecord[];
  const openai = providers.find((provider) => provider.id === "openai");
  return <div className="experience-grid">
    <DataPanel eyebrow="Provider registry" title="Verified runtime inventory" icon={<ShieldCheck size={18} />} className="span-2">
      {providers.length ? <div className="provider-table" role="table" aria-label="Runtime providers">
        <div className="provider-row provider-head" role="row"><span>Provider</span><span>Configured</span><span>Reachable</span><span>Verified</span><span>Hosting</span></div>
        {providers.map((provider) => <div className="provider-row" role="row" key={provider.id}><div><strong>{provider.displayName}</strong><small>{provider.id}{provider.default ? " · default" : ""}</small></div><StatusPill value={provider.configured ? "configured" : "unconfigured"} /><StatusPill value={provider.reachable ? "reachable" : "unavailable"} /><StatusPill value={provider.verified ? "verified" : "unverified"} /><span>{displayLabel(provider.hostingMode)}</span></div>)}
      </div> : <EmptyRecord />}
    </DataPanel>
    <DataPanel eyebrow="Model-native boundary" title="Provider truth" icon={<ShieldCheck size={18} />}>
      <p className="boundary-note">Configuration is not connectivity. {openai?.liveInferenceVerified ? "Live inference is Runtime-verified; model-native output remains non-authoritative." : "No live provider capability is established until Runtime inference succeeds."}</p>
    </DataPanel>
  </div>;
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

function Evidence({
  snapshot,
  runtimeCommit,
  programAlphaCommit,
}: {
  snapshot: RuntimeSnapshot;
  runtimeCommit: string;
  programAlphaCommit: string;
}) {
  const proofs = list(snapshot.proofs?.data);
  const receipts = list(snapshot.receipts?.data);
  return <div className="experience-grid">
    <DataPanel eyebrow="Decision Flight Recorder" title="Proof references" icon={<FileCheck2 size={18} />}>{proofs.length ? <div className="reference-list">{proofs.map((proof, index) => <article key={String(proof.id ?? index)}><strong>{String(proof.id ?? "Proof")}</strong><StatusPill value={proof.verified ? "verified" : "recorded"} /></article>)}</div> : <EmptyRecord />}</DataPanel>
    <DataPanel eyebrow="Outcome Ledger" title="Execution receipts" icon={<FileCheck2 size={18} />}>{receipts.length ? <div className="reference-list">{receipts.map((receipt, index) => <article key={String(receipt.id ?? index)}><strong>{String(receipt.id ?? "Receipt")}</strong></article>)}</div> : <EmptyRecord>No execution receipts are available.</EmptyRecord>}</DataPanel>
    <DataPanel eyebrow="Release provenance" title="Verified deployment revisions" icon={<ShieldCheck size={18} />} className="span-2">
      <div className="information-grid release-provenance-grid">
        <ReleaseRevision label="Runtime commit" value={runtimeCommit} />
        <ReleaseRevision label="Program Alpha commit" value={programAlphaCommit} />
      </div>
    </DataPanel>
  </div>;
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

  const refresh = (forceRefresh = false) => { setLoading(true); portalClient.snapshot(forceRefresh).then((result) => { setSnapshot((current) => ({ ...current, ...result.data })); setFailures(result.failures); }).catch(() => { setSnapshot({}); setFailures([]); }).finally(() => setLoading(false)); };
  function focusPlatformSearch() {
    if (window.matchMedia("(max-width: 820px)").matches) setMenuOpen(true);
    window.requestAnimationFrame(() => document.getElementById("platform-search")?.focus());
  }

  useEffect(() => refresh(false), []);
  useEffect(() => {
    let active = true;
    operationalSessionClient.status()
      .then((session) => { operationalSessionClient.use(session); if (active) { setHostedOperationalConfigured(true); setOperationalSession(session); } })
      .catch(() => { operationalSessionClient.use({ authenticated: false }); if (active) { setHostedOperationalConfigured(false); setOperationalSession({ authenticated: false }); } })
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
  const copilotInteractionAction = canonicalActionAvailability(
    capabilityRegistry,
    PORTAL_CANONICAL_ACTIONS.copilotInteractionStart,
    capabilityRegistryFailure,
  );
  const realtimeVoiceAction = canonicalActionAvailability(
    capabilityRegistry,
    PORTAL_CANONICAL_ACTIONS.realtimeVoiceCall,
    capabilityRegistryFailure,
  );
  const voiceOperatorTranscriptAction = canonicalActionAvailability(
    capabilityRegistry,
    PORTAL_CANONICAL_ACTIONS.voiceOperatorTranscript,
    capabilityRegistryFailure,
  );
  const registryRailGroups = RAIL_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      live: capabilityStateView(
        capabilityRegistry,
        item.id as AreaId,
        capabilityRegistryFailure,
      ).state === "live",
    })),
  }));
  const hostedCapability = capabilityStateView(
    capabilityRegistry,
    active,
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
    setOperationalSession(session);
    refresh(true);
  }

  const requiresOperationalSession = OPERATIONAL_AREAS.has(active) || (hostedOperationalConfigured && HOSTED_CONTRACT_AREAS.has(active));
  const showsHostedContext = operationalSession.authenticated && (OPERATIONAL_AREAS.has(active) || HOSTED_CONTRACT_AREAS.has(active));
  const content = !sessionBootstrapComplete || (loading && !Object.keys(snapshot).length) ? <section className="loading-state"><div /><p>Connecting through the Experience Gateway…</p></section> : requiresOperationalSession && !operationalSession.authenticated ? <OperationalAccessGate workspace={current.label} onAuthenticated={acceptOperationalSession} /> : <>
    {showsHostedContext && <section className="hosted-operational-context" aria-label="Authenticated hosted operational context">
      <article><span>Gateway transport</span><StatusPill value={state} /></article>
      <article><span>Capability state</span><StatusPill value={hostedCapability.state} /></article>
      <article className="hosted-operational-context__reason"><span>Capability reason</span><strong>{hostedCapability.reason}</strong></article>
      <article><span>Tenant</span><strong>{operationalSession.tenantId ?? "Unavailable"}</strong></article>
      <article><span>Workspace</span><strong>{operationalSession.workspaceId ?? "Unavailable"}</strong></article>
      <article><span>Session expires</span><strong>{operationalSession.expiresAt ? new Date(operationalSession.expiresAt).toLocaleString() : "Unavailable"}</strong></article>
    </section>}
    {active === "dashboard" && <><ExecutiveStatusBar snapshot={snapshot} connectionState={state} /><OperationsCenter assessment={eox ?? null} /></>}
    {active === "missions" && <HostedCapabilityBoundary configured={hostedOperationalConfigured} title="Missions" capability={hostedCapability}><MissionDashboard onReplay={openReplay} readiness={operationalReadiness} session={operationalSession} /></HostedCapabilityBoundary>}
    {active === "replay" && <HostedCapabilityBoundary configured={hostedOperationalConfigured} title="Operational Replay" capability={hostedCapability}><OperationalReplay requestedMissionId={replayMissionId} /></HostedCapabilityBoundary>}
    {active === "conclave" && <HostedCapabilityBoundary configured={hostedOperationalConfigured} title="Conclave" capability={hostedCapability}><ConclaveWorkspace readiness={operationalReadiness} session={operationalSession} /></HostedCapabilityBoundary>}
    {active === "knowledge" && <HostedCapabilityBoundary configured={hostedOperationalConfigured} title="Knowledge" capability={hostedCapability}><KnowledgeWorkspace snapshot={snapshot} session={operationalSession} /></HostedCapabilityBoundary>}
    {active === "edge" && <HostedCapabilityBoundary configured={hostedOperationalConfigured} title="Edge Runtime" capability={hostedCapability}><><EdgeRuntime snapshot={snapshot} /><RuntimeTopology snapshot={snapshot} /></></HostedCapabilityBoundary>}
    {active === "mission-control" && <HostedCapabilityBoundary configured={hostedOperationalConfigured} title="Mission Control" capability={hostedCapability}><OperationsWorkspace session={operationalSession} onSessionChange={acceptOperationalSession} runtimeCommit={deployedRuntimeCommit} programAlphaCommit={deployedProgramAlphaCommit} /></HostedCapabilityBoundary>}
    {active === "settings" && <div className="settings-workspaces"><AppearanceWorkspace appearance={appearance} /><RuntimeInformation snapshot={snapshot} connectionState={state} runtimeCommit={deployedRuntimeCommit} programAlphaCommit={deployedProgramAlphaCommit} /><RuntimeHealth snapshot={snapshot} connectionState={state} /></div>}
    {active === "documents" && <HostedCapabilityBoundary configured={hostedOperationalConfigured} title="Document Intelligence" capability={hostedCapability}><DocumentIntake /></HostedCapabilityBoundary>}
    {active === "projects" && <HostedCapabilityBoundary configured={hostedOperationalConfigured} title="Projects" capability={hostedCapability}><ProjectStudio /></HostedCapabilityBoundary>}
    {active === "voice" && <HostedCapabilityBoundary configured={hostedOperationalConfigured} title="Voice Operations" capability={hostedCapability}><VoiceWorkspace realtimeAction={realtimeVoiceAction} textAction={voiceOperatorTranscriptAction} /></HostedCapabilityBoundary>}
    {active === "providers" && <Providers snapshot={snapshot} />}
    {active === "evidence" && <Evidence snapshot={snapshot} runtimeCommit={deployedRuntimeCommit} programAlphaCommit={deployedProgramAlphaCommit} />}
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
        {failures.length > 0 && <section className="nx-runtime-alert" role="alert" data-tone={connectionTone}><Activity size={17} /><div><strong>{state}</strong><span>{failures[0]?.error?.message ?? "One or more Runtime signals are unavailable."}</span></div></section>}
        <main id="main-content" className="nx-primary-workspace">
          <NexusWorkspaceFrame
            eyebrow={current.group === "Platform" ? "Hosted Experience Gateway" : "Platform capability"}
            title={current.label}
            description={current.detail}
            icon={current.icon}
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
        sourceClass="runtime_evidence"
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
        activeArea={PLATFORM_TO_COPILOT[active]}
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
