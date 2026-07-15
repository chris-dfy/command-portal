import { useEffect, useMemo, useState } from "react";
import { Activity, Boxes, BrainCircuit, CheckCircle2, ChevronRight, Database, FileCheck2, Layers3, Menu, RefreshCw, Search, ServerCog, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { portalBrand } from "./brand";
import { DataPanel, EmptyRecord } from "./components/DataPanel";
import { StatusPill } from "./components/StatusPill";
import { portalClient } from "./lib/portal-client";
import type { DomainEnvelope, PortalEnvelope, PortalSnapshot } from "./lib/types";

const AREAS = [
  { id: "overview", label: "Overview", detail: "Operational posture", icon: Activity },
  { id: "verification", label: "Verification", detail: "Runtime evidence", icon: ShieldCheck },
  { id: "evidence", label: "Evidence", detail: "Claims and receipts", icon: FileCheck2 },
  { id: "architecture", label: "Architecture", detail: "Layers and assets", icon: Layers3 },
  { id: "specialists", label: "Specialists", detail: "Maturity registry", icon: BrainCircuit },
  { id: "system", label: "System", detail: "Connection and limits", icon: ServerCog }
] as const;

type AreaId = typeof AREAS[number]["id"];
type Detail = PortalEnvelope<Record<string, unknown>>;

const asRecord = (domain?: DomainEnvelope) => (domain?.data ?? {}) as Record<string, unknown>;
const asItems = (domain?: DomainEnvelope) => {
  const value = asRecord(domain).items;
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
};
const label = (value: unknown) => String(value ?? "unavailable").replaceAll("_", " ");

function Metric({ name, value, tone }: { name: string; value: unknown; tone?: string }) {
  return <article className="metric" data-tone={tone}><span>{name}</span><strong>{label(value)}</strong></article>;
}

function Overview({ domains }: { domains: Record<string, DomainEnvelope> }) {
  const status = asRecord(domains.status);
  const readiness = asRecord(domains.readiness);
  const exposure = asRecord(domains.exposure);
  return <div className="area-grid">
    <DataPanel eyebrow="Executive operations" title="Active posture" icon={<Activity size={18} />} className="span-2">
      <div className="metric-grid">
        <Metric name="Runtime" value={status.runtime} />
        <Metric name="Portal phase" value={status.phase} />
        <Metric name="Hosted acceptance" value={status.hostedAcceptance} />
        <Metric name="Source of truth" value="local" tone="good" />
      </div>
    </DataPanel>
    <DataPanel eyebrow="Readiness" title="Delivery gates" icon={<CheckCircle2 size={18} />}>
      <dl className="definition-list">
        <div><dt>Phase 5X-A</dt><dd>{label(readiness.phase5XA)}</dd></div>
        <div><dt>Phase 5X-B</dt><dd>{label(readiness.phase5XB)}</dd></div>
        <div><dt>Phase 5X-C</dt><dd>{label(readiness.phase5XC)}</dd></div>
      </dl>
    </DataPanel>
    <DataPanel eyebrow="Hosted boundary" title="Exposure state" icon={<ServerCog size={18} />}>
      <dl className="definition-list">
        <div><dt>Portal</dt><dd>{label(exposure.portal)}</dd></div>
        <div><dt>Runtime</dt><dd>{label(exposure.runtime)}</dd></div>
        <div><dt>Credential</dt><dd>{label(exposure.credential)}</dd></div>
      </dl>
    </DataPanel>
  </div>;
}

function Verification({ domains }: { domains: Record<string, DomainEnvelope> }) {
  const verification = asRecord(domains["runtime-verification"]);
  const matrix = asRecord(domains["runtime-matrix"]).matrix;
  const rows = Array.isArray(matrix) ? matrix as Record<string, unknown>[] : [];
  return <div className="area-grid">
    <DataPanel eyebrow="Phase 5W-V" title="Runtime verification center" icon={<ShieldCheck size={18} />} className="span-2">
      <div className="metric-grid compact">
        <Metric name="Acceptance" value={verification.status} />
        <Metric name="Environment" value={verification.environment} />
        <Metric name="Run" value={verification.runId} />
        <Metric name="Drill-down" value={verification.drilldownAvailable ? "available" : "unavailable"} />
      </div>
    </DataPanel>
    <DataPanel eyebrow="Capability proof" title="Verification matrix" icon={<Boxes size={18} />} className="span-2">
      {rows.length ? <div className="matrix-list">{rows.map((row) => <div key={String(row.capabilityId)}><span>{label(row.capabilityId)}</span><StatusPill value={String(row.status)} /></div>)}</div> : <EmptyRecord />}
    </DataPanel>
  </div>;
}

function Evidence({ domains, openDetail }: { domains: Record<string, DomainEnvelope>; openDetail: (kind: "proof" | "receipt" | "claim", id: string) => void }) {
  const groups = [
    { key: "claims", title: "Claim ledger", kind: "claim" as const },
    { key: "proofs", title: "Proof ledger", kind: "proof" as const },
    { key: "receipts", title: "Receipt ledger", kind: "receipt" as const }
  ];
  return <div className="area-grid evidence-grid">{groups.map(({ key, title, kind }) => {
    const items = asItems(domains[key]);
    return <DataPanel key={key} eyebrow="Evidence" title={title} icon={<FileCheck2 size={18} />}>
      {items.length ? <div className="record-list">{items.map((item) => {
        const id = String(item.id ?? "unknown");
        return <button key={id} onClick={() => openDetail(kind, id)}><div><strong>{String(item.title ?? item.claim ?? id)}</strong><span>{id}</span></div><StatusPill value={String(item.status ?? "recorded")} /><ChevronRight size={15} /></button>;
      })}</div> : <EmptyRecord />}
    </DataPanel>;
  })}</div>;
}

function Architecture({ domains }: { domains: Record<string, DomainEnvelope> }) {
  const capabilities = asItems(domains.capabilities);
  const coverage = asRecord(domains["asset-coverage"]);
  const manifest = asRecord(domains["asset-manifest"]);
  const assets = Array.isArray(manifest.assets) ? manifest.assets as Record<string, unknown>[] : [];
  const categories = new Set(assets.map((item) => String(item.category)));
  return <div className="area-grid">
    <DataPanel eyebrow="Six-layer system" title="Capability states" icon={<Layers3 size={18} />} className="span-2">
      {capabilities.length ? <div className="matrix-list">{capabilities.map((item) => <div key={String(item.id)}><span>{label(item.id)}</span><StatusPill value={String(item.state)} /><small>{label(item.environment)}</small></div>)}</div> : <EmptyRecord />}
    </DataPanel>
    <DataPanel eyebrow="Provisioning doctrine" title="Platform asset coverage" icon={<Database size={18} />}>
      <div className="hero-value">{label(coverage.coverage)}</div>
      <p>Nothing is treated as authoritative until present, registered, configured, authorized, tested, deployed, verified, and proof-linked.</p>
      <StatusPill value={String(coverage.verificationState ?? "unavailable")} />
    </DataPanel>
    <DataPanel eyebrow={`Manifest ${label(manifest.manifestVersion)}`} title="Registered categories" icon={<Boxes size={18} />}>
      <div className="hero-value">{categories.size || label(asRecord(domains["asset-manifest"]).categories)}</div>
      <p>Versioned asset categories are disclosed with provenance, state, proof references, and limitations.</p>
      <div className="tag-list">{Array.from(categories).slice(0, 16).map((item) => <span key={item}>{item}</span>)}</div>
    </DataPanel>
  </div>;
}

function Specialists({ domains }: { domains: Record<string, DomainEnvelope> }) {
  const registry = asRecord(domains.specialists);
  const specialists = Array.isArray(registry.items) ? registry.items as Record<string, unknown>[] : [];
  const hosting = asRecord(domains["model-hosting"]);
  return <div className="area-grid">
    <DataPanel eyebrow="Specialist runtime" title="Maturity registry" icon={<BrainCircuit size={18} />} className="span-2">
      <p className="boundary-note">Prompt profiles, tool-backed agents, RAG specialists, and trained models remain distinct asset classes.</p>
      <div className="specialist-list">{specialists.map((item) => <article key={String(item.id)}><div><strong>{label(item.id)}</strong><span>Trained model: {item.trainedModel ? "yes" : "no"}</span></div><StatusPill value={String(item.maturity)} /></article>)}</div>
    </DataPanel>
    <DataPanel eyebrow="Model truth" title="Actual trained SLMs" icon={<Database size={18} />}>
      <div className="hero-value">{String(registry.actualTrainedSLMs ?? 0)}</div><p>No trained model is claimed without a verified physical asset.</p>
    </DataPanel>
    <DataPanel eyebrow="Hosting registry" title="Deployment posture" icon={<ServerCog size={18} />}>
      <dl className="definition-list"><div><dt>Default provider</dt><dd>{label(hosting.defaultProvider)}</dd></div><div><dt>Hosted models</dt><dd>{label(hosting.hostedModels)}</dd></div><div><dt>Edge models</dt><dd>{label(hosting.edgeModels)}</dd></div></dl>
    </DataPanel>
  </div>;
}

function System({ domains, snapshotMeta }: { domains: Record<string, DomainEnvelope>; snapshotMeta: PortalEnvelope<PortalSnapshot>["meta"] }) {
  const limitations = asRecord(domains.limitations).items;
  const hosted = asRecord(domains["hosted-readiness"]);
  const missing = Array.isArray(hosted.missing) ? hosted.missing : [];
  return <div className="area-grid">
    <DataPanel eyebrow="Connection" title="Portal diagnostics" icon={<ServerCog size={18} />}>
      <dl className="definition-list"><div><dt>Mode</dt><dd>{label(snapshotMeta.dataMode)}</dd></div><div><dt>Connection</dt><dd>{label(snapshotMeta.connectionState)}</dd></div><div><dt>Cache</dt><dd>{snapshotMeta.cached ? "cached" : "direct"}</dd></div><div><dt>Read-only</dt><dd>enforced</dd></div></dl>
    </DataPanel>
    <DataPanel eyebrow="Security" title="Browser boundary" icon={<ShieldCheck size={18} />}>
      <ul className="check-list"><li>Fixed same-origin GET allowlist</li><li>Runtime credential remains server-only</li><li>No generic proxy or mutation forwarding</li><li>Bounded timeout and response size</li></ul>
    </DataPanel>
    <DataPanel eyebrow="Phase 5X-C" title="Hosted readiness" icon={<TriangleAlert size={18} />} className="span-2">
      <StatusPill value={String(hosted.status ?? "pending")} />
      <div className="missing-list">{missing.map((item) => <p key={String(item)}><TriangleAlert size={14} />{label(item)}</p>)}</div>
    </DataPanel>
    <DataPanel eyebrow="Truth boundary" title="Known limitations" icon={<TriangleAlert size={18} />} className="span-2">
      {Array.isArray(limitations) ? <ul className="limitation-list">{limitations.map((item) => <li key={String(item)}>{String(item)}</li>)}</ul> : <EmptyRecord />}
    </DataPanel>
  </div>;
}

export function App() {
  const [snapshot, setSnapshot] = useState<PortalEnvelope<PortalSnapshot> | null>(null);
  const [active, setActive] = useState<AreaId>("overview");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  const refresh = () => {
    setLoading(true);
    portalClient.snapshot().then((value) => { setSnapshot(value); setError(""); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Portal unavailable")).finally(() => setLoading(false));
  };
  useEffect(refresh, []);
  useEffect(() => { const timer = window.setInterval(refresh, 30_000); return () => window.clearInterval(timer); }, []);

  const visibleAreas = useMemo(() => AREAS.filter((area) => `${area.label} ${area.detail}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const data = snapshot?.data;
  const domains = data?.domains ?? {};
  const current = AREAS.find((area) => area.id === active) ?? AREAS[0];
  const openDetail = (kind: "proof" | "receipt" | "claim", id: string) => portalClient.detail(kind, id).then(setDetail).catch((reason) => setError(reason instanceof Error ? reason.message : "Evidence record unavailable"));

  return <div className="portal-shell">
    <a className="skip-link" href="#main-content">Skip to portal content</a>
    <header className="status-rail">
      <div className="rail-brand"><span>{portalBrand.parentBrand}</span><strong>{portalBrand.displayName}</strong></div>
      <div className="rail-signals">
        <StatusPill value="read only" tone="good" />
        <StatusPill value={snapshot?.meta.connectionState ?? "unavailable"} />
        <span>Local source of truth</span><span>Production: false</span><span>Enterprise: false</span>
      </div>
      <button className="refresh-button" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />{loading ? "Refreshing" : "Refresh"}</button>
    </header>

    {data?.referenceFixture && <div className="fixture-banner" role="status"><TriangleAlert size={16} /><strong>{data.fixtureLabel ?? "CONTRACT FIXTURE — NON-LIVE DATA"}</strong><span>Values demonstrate the API contract; they are not current runtime observations.</span></div>}

    <aside className={menuOpen ? "sidebar is-open" : "sidebar"}>
      <div className="product-mark"><div aria-hidden="true">{portalBrand.shortName.slice(0, 1)}</div><section><span>{portalBrand.parentBrand}</span><h1>{portalBrand.displayName}</h1><p>Read-only runtime intelligence</p></section></div>
      <label className="nav-search"><Search size={15} /><span className="sr-only">Search portal areas</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an area" /></label>
      <nav aria-label="Portal areas">{visibleAreas.map((area) => <button key={area.id} className={active === area.id ? "active" : ""} onClick={() => { setActive(area.id); setMenuOpen(false); }}><area.icon size={17} /><span><strong>{area.label}</strong><small>{area.detail}</small></span><ChevronRight size={14} /></button>)}</nav>
      <footer><span>Phase 5X-B</span><p>Hosted connection acceptance pending.</p></footer>
    </aside>

    <main id="main-content">
      <header className="page-header"><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation"><Menu size={18} /></button><div><span>Operational visibility</span><h2>{current.label}</h2><p>{current.detail}</p></div><StatusPill value={snapshot?.meta.dataMode ?? "unavailable"} /></header>
      {error ? <section className="error-state"><TriangleAlert size={28} /><h3>Runtime values unavailable</h3><p>{error}</p><small>No operational data has been fabricated.</small><button onClick={refresh}>Try again</button></section> : !snapshot?.data ? <section className="loading-state"><div /><p>Reading allowlisted portal domains…</p></section> : <>
        {active === "overview" && <Overview domains={domains} />}
        {active === "verification" && <Verification domains={domains} />}
        {active === "evidence" && <Evidence domains={domains} openDetail={openDetail} />}
        {active === "architecture" && <Architecture domains={domains} />}
        {active === "specialists" && <Specialists domains={domains} />}
        {active === "system" && <System domains={domains} snapshotMeta={snapshot.meta} />}
      </>}
    </main>

    <footer className="global-footer"><span>Same-origin BFF</span><span>No action controls</span><span>No browser-held runtime credential</span><span>Phase 5X-C pending</span></footer>

    {detail && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setDetail(null)}><dialog open aria-label="Evidence record detail" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Validated record</span><h3>Evidence drill-down</h3></div><button onClick={() => setDetail(null)} aria-label="Close detail"><X size={17} /></button></header><pre>{JSON.stringify(detail.data, null, 2)}</pre><footer><StatusPill value={detail.meta.sourceOfTruth} /><span>Secret values exposed: false</span></footer></dialog></div>}
  </div>;
}
