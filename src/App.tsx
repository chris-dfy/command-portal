import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, BookOpen, Bot, BrainCircuit, ChevronRight, CircleGauge, Database, FileCheck2, Files, FolderKanban, History, Menu, Mic2, Network, PanelRightClose, PanelRightOpen, RefreshCw, Search, ServerCog, Settings2, ShieldCheck, Sparkles, Waypoints, X, type LucideIcon } from "lucide-react";
import { portalBrand } from "./brand";
import { ConclaveWorkspace } from "./components/ConclaveWorkspace";
import { DataPanel, EmptyRecord } from "./components/DataPanel";
import { DocumentIntake } from "./components/DocumentIntake";
import { ExecutiveStatusBar } from "./components/ExecutiveStatusBar";
import { KnowledgeWorkspace } from "./components/KnowledgeWorkspace";
import { MissionDashboard } from "./components/MissionDashboard";
import { NexusCopilot } from "./components/NexusCopilot";
import { OperationalReplay } from "./components/OperationalReplay";
import { OperationsCenter } from "./components/OperationsCenter";
import { OperationsWorkspace } from "./components/OperationsWorkspace";
import { ProjectStudio } from "./components/ProjectStudio";
import { RuntimeHealth } from "./components/RuntimeHealth";
import { RuntimeInformation } from "./components/RuntimeInformation";
import { RuntimeTopology } from "./components/RuntimeTopology";
import { StatusPill } from "./components/StatusPill";
import { VoiceWorkspace } from "./components/VoiceWorkspace";
import { portalClient } from "./lib/portal-client";
import { displayLabel, statusTone } from "./lib/presentation";
import type { ConnectionState, GatewayEnvelope, ProviderRecord, RuntimeSnapshot } from "./lib/types";
import type { EoxAssessment } from "./lib/eox-client";
import { NEXUS_PLATFORM_NAVIGATION, type NexusPlatformAreaId } from "./platform/navigation";

type AreaId = NexusPlatformAreaId | "documents" | "projects" | "voice" | "providers" | "evidence";
type Area = { id: AreaId; label: string; detail: string; icon: LucideIcon; group: "Platform" | "Capabilities" };
const PLATFORM_ICONS: Record<NexusPlatformAreaId, LucideIcon> = {
  dashboard: CircleGauge, missions: Waypoints, replay: History, conclave: BrainCircuit,
  knowledge: BookOpen, edge: ServerCog, "mission-control": Network, settings: Settings2,
};
const AREAS: Area[] = [
  ...NEXUS_PLATFORM_NAVIGATION.map((area) => ({ ...area, icon: PLATFORM_ICONS[area.id], group: "Platform" as const })),
  { id: "documents", label: "Document Intelligence", detail: "Private evidence ingestion", icon: Files, group: "Capabilities" },
  { id: "projects", label: "Projects", detail: "Plan, scope, and compile", icon: FolderKanban, group: "Capabilities" },
  { id: "voice", label: "Voice Operations", detail: "Governed voice interface", icon: Mic2, group: "Capabilities" },
  { id: "providers", label: "Model Gateway", detail: "Verified provider registry", icon: Bot, group: "Capabilities" },
  { id: "evidence", label: "Evidence Center", detail: "Proofs and receipts", icon: FileCheck2, group: "Capabilities" },
];
const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown) => Array.isArray(value) ? value as Record<string, unknown>[] : [];
const STATE_PRIORITY: ConnectionState[] = ["Unauthorized", "Schema Mismatch", "Version Mismatch", "Timed Out", "Unavailable", "Unknown", "Degraded", "Retrying", "Connecting", "Healthy"];
const routeFromHash = (): AreaId => { const value = window.location.hash.replace(/^#\/?/, "") as AreaId; return AREAS.some((area) => area.id === value) ? value : "dashboard"; };
const COPILOT_TO_PLATFORM: Record<string, AreaId> = {
  center: "dashboard", intake: "documents", projects: "projects", voice: "voice",
  operations: "mission-control", conclave: "conclave", information: "settings",
  health: "settings", topology: "edge", providers: "providers", evidence: "evidence",
};
const PLATFORM_TO_COPILOT: Record<AreaId, string> = {
  dashboard: "center", missions: "operations", replay: "evidence", conclave: "conclave",
  knowledge: "evidence", edge: "topology", "mission-control": "operations", settings: "information",
  documents: "intake", projects: "projects", voice: "voice", providers: "providers", evidence: "evidence",
};

function connectionState(snapshot: RuntimeSnapshot, failures: GatewayEnvelope[], loading: boolean): ConnectionState {
  if (loading && !Object.keys(snapshot).length) return "Connecting";
  if (loading) return "Retrying";
  const states = [...failures, ...Object.values(snapshot)].map((item) => item?.gateway.connectionState).filter(Boolean) as ConnectionState[];
  return STATE_PRIORITY.find((state) => states.includes(state)) ?? (failures.length ? "Unavailable" : "Healthy");
}

function Providers({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const providers = list(snapshot.providers?.data) as unknown as ProviderRecord[];
  return <div className="experience-grid"><DataPanel eyebrow="Provider registry" title="Verified runtime inventory" icon={<ShieldCheck size={18} />} className="span-2">{providers.length ? <div className="provider-table"><div className="provider-row provider-head"><span>Provider</span><span>Configured</span><span>Reachable</span><span>Verified</span><span>Hosting</span></div>{providers.map((provider) => <div className="provider-row" key={provider.id}><div><strong>{provider.displayName}</strong><small>{provider.id}</small></div><StatusPill value={provider.configured ? "configured" : "unconfigured"} /><StatusPill value={provider.reachable ? "reachable" : "unavailable"} /><StatusPill value={provider.verified ? "verified" : "unverified"} /><span>{displayLabel(provider.hostingMode)}</span></div>)}</div> : <EmptyRecord />}</DataPanel><DataPanel eyebrow="Model-native boundary" title="Provider truth" icon={<ShieldCheck size={18} />}><p className="boundary-note">Configuration is not connectivity. Model reasoning is not verified evidence, and hosted credentials remain server-only.</p></DataPanel></div>;
}

function Evidence({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const proofs = list(snapshot.proofs?.data); const receipts = list(snapshot.receipts?.data);
  return <div className="experience-grid"><DataPanel eyebrow="Decision Flight Recorder" title="Proof references" icon={<FileCheck2 size={18} />}>{proofs.length ? <div className="reference-list">{proofs.map((proof, index) => <article key={String(proof.id ?? index)}><strong>{String(proof.id ?? "Proof")}</strong><StatusPill value={proof.verified ? "verified" : "recorded"} /></article>)}</div> : <EmptyRecord />}</DataPanel><DataPanel eyebrow="Outcome Ledger" title="Execution receipts" icon={<FileCheck2 size={18} />}>{receipts.length ? <div className="reference-list">{receipts.map((receipt, index) => <article key={String(receipt.id ?? index)}><strong>{String(receipt.id ?? "Receipt")}</strong></article>)}</div> : <EmptyRecord>No execution receipts are available.</EmptyRecord>}</DataPanel></div>;
}

function WorkspaceFrame({ area, state, children }: { area: Area; state: ConnectionState; children: ReactNode }) {
  return <><header className="nx-route-header"><div><span>Local-first Experience Gateway</span><h1>{area.label}</h1><p>{area.detail}</p></div><StatusPill value={state} tone={statusTone(state)} /></header>{children}</>;
}

export function App() {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>({});
  const [failures, setFailures] = useState<GatewayEnvelope[]>([]);
  const [active, setActive] = useState<AreaId>(routeFromHash);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotExpanded, setCopilotExpanded] = useState(false);
  const [replayMissionId, setReplayMissionId] = useState<string>();

  const refresh = (forceRefresh = false) => { setLoading(true); portalClient.snapshot(forceRefresh).then((result) => { setSnapshot((current) => ({ ...current, ...result.data })); setFailures(result.failures); }).catch(() => setFailures([])).finally(() => setLoading(false)); };
  useEffect(() => refresh(false), []);
  useEffect(() => { const timer = window.setInterval(() => refresh(false), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const sync = () => setActive(routeFromHash()); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);

  const state = connectionState(snapshot, failures, loading);
  const visibleAreas = useMemo(() => AREAS.filter((area) => `${area.label} ${area.detail}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const current = AREAS.find((area) => area.id === active) ?? AREAS[0];
  const status = record(snapshot.status?.data);
  const environment = String(status.environment ?? record(snapshot.environment?.data).environment ?? "Unavailable");
  const eox = snapshot.eox?.data as EoxAssessment | null | undefined;

  function navigate(id: AreaId) { window.location.hash = `/${id}`; setActive(id); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openReplay(missionId?: string) { setReplayMissionId(missionId); navigate("replay"); }

  const content = loading && !Object.keys(snapshot).length ? (
    <section className="loading-state"><div /><p>Connecting through the Experience Gateway…</p></section>
  ) : (
    <>
      {active === "dashboard" && <><ExecutiveStatusBar snapshot={snapshot} connectionState={state} /><OperationsCenter assessment={eox ?? null} /></>}
      {active === "missions" && <MissionDashboard onReplay={openReplay} />}
      {active === "replay" && <OperationalReplay requestedMissionId={replayMissionId} />}
      {active === "conclave" && <ConclaveWorkspace status={record(snapshot.conclave?.data)} />}
      {active === "knowledge" && <KnowledgeWorkspace />}
      {active === "edge" && <RuntimeTopology snapshot={snapshot} />}
      {active === "mission-control" && <OperationsWorkspace />}
      {active === "settings" && <div className="experience-grid"><RuntimeInformation snapshot={snapshot} connectionState={state} /><RuntimeHealth snapshot={snapshot} connectionState={state} /></div>}
      {active === "documents" && <DocumentIntake />}
      {active === "projects" && <ProjectStudio />}
      {active === "voice" && <VoiceWorkspace />}
      {active === "providers" && <Providers snapshot={snapshot} />}
      {active === "evidence" && <Evidence snapshot={snapshot} />}
    </>
  );
  const navigation = (["Platform", "Capabilities"] as const).map((group) => (
    <section key={group}>
      <h2>{group}</h2>
      {visibleAreas.filter((area) => area.group === group).map((area) => {
        const Icon = area.icon;
        return <button key={area.id} data-active={active === area.id} onClick={() => navigate(area.id)}><Icon size={16} /><span>{area.label}</span>{area.id === "replay" && <i>LIVE</i>}</button>;
      })}
    </section>
  ));

  return (
    <div className="nx-platform" data-inspector={inspectorOpen ? "open" : "closed"}>
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <aside className={`nx-sidebar${menuOpen ? " is-open" : ""}`} aria-label="NEXUS platform navigation">
        <header><div className="nx-brand-mark">N</div><div><strong>{portalBrand.displayName}</strong><span>Enterprise Executive OS</span></div><button onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={16} /></button></header>
        <section className="nx-sidebar-context"><span>Active workspace</span><strong>Replit NEXUS</strong><small>Hosted Experience Gateway</small></section>
        <label className="nx-nav-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a workspace" /></label>
        <nav>{navigation}</nav>
        <footer><StatusPill value={state} tone={statusTone(state)} /><small>No browser-held Runtime credential</small></footer>
      </aside>
      <section className="nx-stage">
        <header className="nx-topbar"><div><button className="nx-menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={17} /></button><span>Replit NEXUS</span><ChevronRight size={13} /><strong>{current.label}</strong></div><div><StatusPill value={state} tone={statusTone(state)} /><button onClick={() => refresh(true)} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} />Refresh</button><button onClick={() => setCopilotOpen((value) => !value)} aria-label="Toggle NEXUS interaction panel"><Sparkles size={15} /></button><button onClick={() => setInspectorOpen((value) => !value)} aria-label="Toggle context inspector">{inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button></div></header>
        {failures.length > 0 && <section className="runtime-alert" role="alert" data-tone={statusTone(state)}><Activity size={17} /><div><strong>{state}</strong><span>{failures[0]?.error?.message ?? "One or more Runtime signals are unavailable."}</span></div></section>}
        <main id="main-content" className="nx-workspace"><WorkspaceFrame area={current} state={state}>{content}</WorkspaceFrame></main>
        <footer className="nx-activity-stream"><span><Activity size={13} />Activity</span><p>{state === "Healthy" ? "Experience Gateway connected. Operational claims still require Runtime evidence." : "Presentation available; live operational state is not established."}</p><time>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></footer>
      </section>
      <aside className="nx-inspector" aria-label="Context inspector"><header><div><span>Context Inspector</span><strong>{current.label}</strong></div><button onClick={() => setInspectorOpen(false)}><X size={15} /></button></header><section><h2>Operational context</h2><dl><div><dt>Route</dt><dd>/{active}</dd></div><div><dt>Environment</dt><dd>{environment}</dd></div><div><dt>Runtime</dt><dd>{state}</dd></div><div><dt>Knowledge</dt><dd>runtime evidence</dd></div></dl></section><section><h2>Platform contract</h2><ul><li>Shared canonical shell</li><li>Runtime-owned execution</li><li>Independent mission evidence</li><li>Explicit knowledge promotion</li><li>Replayable outcomes</li></ul></section><footer><Database size={16} /><p><strong>Boundary</strong>Hosted presentation never converts model output or UI state into authoritative operational fact.</p></footer></aside>
      {menuOpen && <button className="nx-sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <NexusCopilot activeArea={PLATFORM_TO_COPILOT[active] as never} activeLabel={current.label} runtimeState={state} onNavigate={(area) => navigate(COPILOT_TO_PLATFORM[area] ?? "dashboard")} open={copilotOpen} expanded={copilotExpanded} onOpenChange={setCopilotOpen} onExpandedChange={setCopilotExpanded} />
    </div>
  );
}
