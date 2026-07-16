import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronRight, FileCheck2, Files, FolderKanban, GitBranch, Menu, Mic2, Network, RefreshCw, Search, ServerCog, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { portalBrand } from "./brand";
import { DataPanel, EmptyRecord } from "./components/DataPanel";
import { ExecutiveStatusBar } from "./components/ExecutiveStatusBar";
import { DocumentIntake } from "./components/DocumentIntake";
import { ProjectStudio } from "./components/ProjectStudio";
import { RuntimeHealth } from "./components/RuntimeHealth";
import { RuntimeInformation } from "./components/RuntimeInformation";
import { RuntimeTopology } from "./components/RuntimeTopology";
import { StatusPill } from "./components/StatusPill";
import { VoiceWorkspace } from "./components/VoiceWorkspace";
import { OperationsWorkspace } from "./components/OperationsWorkspace";
import { OperationsCenter } from "./components/OperationsCenter";
import { NexusCopilot } from "./components/NexusCopilot";
import { portalClient } from "./lib/portal-client";
import { displayLabel, statusTone } from "./lib/presentation";
import type { ConnectionState, GatewayEnvelope, ProviderRecord, RuntimeSnapshot } from "./lib/types";
import type { EoxAssessment } from "./lib/eox-client";

const AREAS = [
  { id: "center", label: "Operations Center", detail: "Executive Operating Loop", icon: Sparkles },
  { id: "intake", label: "Document Intelligence", detail: "Private evidence ingestion", icon: Files },
  { id: "projects", label: "Nexicron Projects", detail: "Plan, scope, and price", icon: FolderKanban },
  { id: "voice", label: "Voice Operator", detail: "Speak through governed runtime", icon: Mic2 },
  { id: "operations", label: "Mission Control", detail: "Plan, govern, and execute bounded work", icon: Network },
  { id: "information", label: "Runtime Information", detail: "Discovery and truth state", icon: ServerCog },
  { id: "health", label: "Health & Diagnostics", detail: "Independent runtime signals", icon: Activity },
  { id: "topology", label: "Runtime Topology", detail: "Live read path", icon: GitBranch },
  { id: "providers", label: "Providers", detail: "Verified provider registry", icon: ShieldCheck },
  { id: "evidence", label: "Proofs & Receipts", detail: "Runtime references", icon: FileCheck2 }
] as const;

type AreaId = typeof AREAS[number]["id"];

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown) => Array.isArray(value) ? value as Record<string, unknown>[] : [];

const STATE_PRIORITY: ConnectionState[] = ["Unauthorized", "Schema Mismatch", "Version Mismatch", "Timed Out", "Unavailable", "Unknown", "Degraded", "Retrying", "Connecting", "Healthy"];

function connectionState(snapshot: RuntimeSnapshot, failures: GatewayEnvelope[], loading: boolean): ConnectionState {
  if (loading && !Object.keys(snapshot).length) return "Connecting";
  if (loading) return "Retrying";
  const states = [...failures, ...Object.values(snapshot)].map((item) => item?.gateway.connectionState).filter(Boolean) as ConnectionState[];
  return STATE_PRIORITY.find((state) => states.includes(state)) ?? (failures.length ? "Unavailable" : "Healthy");
}

function Providers({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const providers = list(snapshot.providers?.data) as unknown as ProviderRecord[];
  const openai = providers.find((provider) => provider.id === "openai");
  return <div className="experience-grid">
    <DataPanel eyebrow="Provider registry" title="Verified runtime inventory" icon={<ShieldCheck size={18} />} className="span-2">
      {providers.length ? <div className="provider-table" role="table" aria-label="Runtime providers">
        <div className="provider-row provider-head" role="row"><span>Provider</span><span>Configured</span><span>Reachable</span><span>Verified</span><span>Hosting</span></div>
        {providers.map((provider) => <div className="provider-row" role="row" key={provider.id}>
          <div><strong>{provider.displayName}</strong><small>{provider.id}{provider.default ? " · default" : ""}</small></div>
          <StatusPill value={provider.configured ? "configured" : "unconfigured"} />
          <StatusPill value={provider.reachable ? "reachable" : "unavailable"} />
          <StatusPill value={provider.verified ? "verified" : "unverified"} />
          <span>{displayLabel(provider.hostingMode)}</span>
        </div>)}
      </div> : <EmptyRecord />}
    </DataPanel>
    <DataPanel eyebrow="Provider truth" title="Current boundary" icon={<TriangleAlert size={18} />}>
      <p className="boundary-note">The default remains <strong>mock_model</strong>. {openai?.liveInferenceVerified
        ? <>OpenAI Responses inference is verified for this Runtime process{openai.modelId ? <> using <strong>{openai.modelId}</strong></> : null}; model-native output remains non-authoritative.</>
        : <>OpenAI configuration is not represented as live capability until a Responses inference succeeds.</>}</p>
    </DataPanel>
    <DataPanel eyebrow="Limitations" title="Provider constraints" icon={<TriangleAlert size={18} />}>
      <ul className="limitation-list">{providers.flatMap((provider) => provider.limitations.map((item) => <li key={`${provider.id}-${item}`}>{provider.displayName}: {item}</li>))}</ul>
    </DataPanel>
  </div>;
}

function Evidence({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const proofs = list(snapshot.proofs?.data);
  const receipts = list(snapshot.receipts?.data);
  return <div className="experience-grid">
    <DataPanel eyebrow="Runtime evidence" title="Proof references" icon={<FileCheck2 size={18} />}>
      {proofs.length ? <div className="reference-list">{proofs.map((proof) => <article key={String(proof.id)}><strong>{String(proof.id)}</strong><span>{displayLabel(proof.type)}</span><StatusPill value={proof.verified ? "verified" : "unverified"} /></article>)}</div> : <EmptyRecord />}
      <p className="cache-policy-note">Proof responses bypass the Experience Gateway cache.</p>
    </DataPanel>
    <DataPanel eyebrow="Execution evidence" title="Receipt references" icon={<FileCheck2 size={18} />}>
      {receipts.length ? <div className="reference-list">{receipts.map((receipt) => <article key={String(receipt.id)}><strong>{String(receipt.id)}</strong></article>)}</div> : <EmptyRecord>No execution receipts exist because write execution is disabled.</EmptyRecord>}
      <p className="cache-policy-note">Receipt responses are never cached.</p>
    </DataPanel>
    <DataPanel eyebrow="Cache visibility" title="Validated response cache" icon={<RefreshCw size={18} />} className="span-2">
      <div className="cache-grid">{Object.entries(snapshot).filter(([, value]) => value?.gateway.cache.lastRefresh).map(([route, value]) => <article key={route}>
        <strong>{displayLabel(route)}</strong><span>Last refresh {value?.gateway.cache.lastRefresh ?? "unavailable"}</span><span>Age {value?.gateway.cache.age ?? 0} ms</span><span>Expires {value?.gateway.cache.expires ?? "not cached"}</span><StatusPill value={value?.gateway.cache.stale ? "stale" : value?.gateway.cache.cached ? "cached" : "fresh"} />
      </article>)}</div>
    </DataPanel>
  </div>;
}

export function App() {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>({});
  const [failures, setFailures] = useState<GatewayEnvelope[]>([]);
  const [active, setActive] = useState<AreaId>("center");
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  const refresh = (forceRefresh = false) => {
    setLoading(true);
    portalClient.snapshot(forceRefresh)
      .then((result) => { setSnapshot((current) => ({ ...current, ...result.data })); setFailures(result.failures); })
      .catch(() => setFailures([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => refresh(false), []);
  useEffect(() => { const timer = window.setInterval(() => refresh(false), 30_000); return () => window.clearInterval(timer); }, []);

  const state = connectionState(snapshot, failures, loading);
  const visibleAreas = useMemo(() => AREAS.filter((area) => `${area.label} ${area.detail}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const current = AREAS.find((area) => area.id === active) ?? AREAS[0];
  const status = record(snapshot.status?.data);
  const environment = String(status.environment ?? record(snapshot.environment?.data).environment ?? "Unavailable");
  const runtimeVersion = snapshot.version?.runtime?.runtimeVersion ?? "Unavailable";
  const lastConnection = Object.values(snapshot).map((item) => item?.gateway.lastSuccessfulConnection).filter(Boolean).sort().at(-1) ?? null;
  const lastRefresh = Object.values(snapshot).map((item) => item?.gateway.lastSuccessfulRefresh).filter(Boolean).sort().at(-1) ?? null;
  const eox = snapshot.eox?.data as EoxAssessment | null | undefined;

  return <div className="portal-shell">
    <a className="skip-link" href="#main-content">Skip to portal content</a>
    <header className="command-header">
      <div className="rail-brand"><span>{portalBrand.parentBrand}</span><strong>{portalBrand.displayName}</strong></div>
      <div className="command-truth" aria-label="Hosted and local runtime summary">
        <strong>Local-first NEXUS</strong><StatusPill value={state} tone={statusTone(state)} /><span>Hosted observation</span><b>{environment}</b><span>Gateway</span><b>{snapshot.health?.gateway.status ?? (loading ? "Connecting" : "Healthy")}</b><span>Runtime</span><b>{snapshot.health?.runtime?.status ?? state}</b><span>Version</span><b>{runtimeVersion}</b>
      </div>
      <button className="refresh-button" onClick={() => refresh(true)} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />{loading ? "Refreshing" : "Refresh"}</button>
    </header>

    <ExecutiveStatusBar snapshot={snapshot} connectionState={state} />

    {failures.length > 0 && <section className="runtime-alert" role="alert" data-tone={statusTone(state)}>
      <TriangleAlert size={18} /><div><strong>{state === "Unavailable" ? "Runtime Unavailable" : state}</strong><span>{failures[0]?.error?.message ?? "One or more runtime signals are unavailable."}</span></div><dl><div><dt>Last successful connection</dt><dd>{lastConnection ?? "None"}</dd></div><div><dt>Last successful refresh</dt><dd>{lastRefresh ?? "None"}</dd></div><div><dt>Retrying</dt><dd>{loading ? "Yes" : "No"}</dd></div></dl>
    </section>}

    <aside className={menuOpen ? "sidebar is-open" : "sidebar"}>
      <div className="product-mark"><div aria-hidden="true">{portalBrand.shortName.slice(0, 1)}</div><section><span>{portalBrand.parentBrand}</span><h1>{portalBrand.displayName}</h1><p>Private operational intelligence</p></section></div>
      <label className="nav-search"><Search size={15} /><span className="sr-only">Search portal areas</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an area" /></label>
      <nav aria-label="Portal areas">{visibleAreas.map((area) => <button key={area.id} className={active === area.id ? "active" : ""} onClick={() => { setActive(area.id); setMenuOpen(false); }}><area.icon size={17} /><span><strong>{area.label}</strong><small>{area.detail}</small></span><ChevronRight size={14} /></button>)}</nav>
      <footer><span>Local-first parity</span><p>One Experience Gateway · Shared Runtime capabilities.</p></footer>
    </aside>

    <main id="main-content">
      <header className="page-header"><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation"><Menu size={18} /></button><div><span>Experience Gateway</span><h2>{current.label}</h2><p>{current.detail}</p></div><StatusPill value={state} /></header>
      {loading && !Object.keys(snapshot).length ? <section className="loading-state"><div /><p>Connecting to the hosted runtime through the Experience Gateway…</p></section> : <>
        {active === "center" && <OperationsCenter assessment={eox ?? null} />}
        {active === "intake" && <DocumentIntake />}
        {active === "projects" && <ProjectStudio />}
        {active === "voice" && <VoiceWorkspace />}
        {active === "operations" && <OperationsWorkspace />}
        {active === "information" && <RuntimeInformation snapshot={snapshot} connectionState={state} />}
        {active === "health" && <RuntimeHealth snapshot={snapshot} connectionState={state} />}
        {active === "topology" && <RuntimeTopology snapshot={snapshot} />}
        {active === "providers" && <Providers snapshot={snapshot} />}
        {active === "evidence" && <Evidence snapshot={snapshot} />}
      </>}
    </main>

    <NexusCopilot
      activeArea={active}
      activeLabel={current.label}
      runtimeState={state}
      onNavigate={(area) => setActive(area)}
    />

    <footer className="global-footer"><span>Same-origin Experience Gateway</span><span>Validated local capability allowlist</span><span>No browser-held Runtime credential</span><span>Runtime-owned context and execution</span></footer>
  </div>;
}
