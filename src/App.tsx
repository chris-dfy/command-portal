import { useEffect, useMemo, useState } from "react";
import { Activity, Boxes, BrainCircuit, ChevronRight, Database, FileCheck2, GitBranch, Layers3, Menu, RefreshCw, Search, ServerCog, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { portalBrand } from "./brand";
import { AssetCoverage } from "./components/AssetCoverage";
import { DataPanel, EmptyRecord } from "./components/DataPanel";
import { ExecutivePageBrief } from "./components/ExecutivePageBrief";
import { ExecutiveStatusBar } from "./components/ExecutiveStatusBar";
import { MissionOverview } from "./components/MissionOverview";
import { RuntimeTopology } from "./components/RuntimeTopology";
import { SixLayerArchitecture } from "./components/SixLayerArchitecture";
import { StatusPill } from "./components/StatusPill";
import { portalClient } from "./lib/portal-client";
import { asItems, asRecord, displayLabel as label } from "./lib/presentation";
import type { DomainEnvelope, PortalEnvelope, PortalSnapshot } from "./lib/types";

const AREAS = [
  { id: "overview", label: "Mission Overview", detail: "Executive operating picture", icon: Activity },
  { id: "verification", label: "Verification", detail: "Runtime evidence", icon: ShieldCheck },
  { id: "evidence", label: "Evidence", detail: "Claims and receipts", icon: FileCheck2 },
  { id: "architecture", label: "Architecture", detail: "Six layers and asset coverage", icon: Layers3 },
  { id: "topology", label: "Runtime Topology", detail: "Current verified path", icon: GitBranch },
  { id: "specialists", label: "Specialists", detail: "Maturity registry", icon: BrainCircuit },
  { id: "system", label: "System", detail: "Connection and limits", icon: ServerCog }
] as const;

type AreaId = typeof AREAS[number]["id"];
type Detail = PortalEnvelope<Record<string, unknown>>;

function Metric({ name, value, tone }: { name: string; value: unknown; tone?: string }) {
  return <article className="metric" data-tone={tone}><span>{name}</span><strong>{label(value)}</strong></article>;
}

function Verification({ domains }: { domains: Record<string, DomainEnvelope> }) {
  const verification = asRecord(domains["runtime-verification"]);
  const matrix = asRecord(domains["runtime-matrix"]).matrix;
  const rows = Array.isArray(matrix) ? matrix as Record<string, unknown>[] : [];
  return <div className="area-grid">
    <ExecutivePageBrief happening="Local runtime evidence is complete with limitations." matters="Every capability claim must remain tied to persisted proof." next="Repeat verification after the hosted runtime is connected." blocked="Hosted verification and rollback evidence are not available." />
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
  return <div className="area-grid evidence-grid"><ExecutivePageBrief happening="The ledger contains bounded local fixture evidence." matters="Proof and receipts prevent preview states from appearing completed." next="Record hosted acceptance evidence during Phase 5X-C." blocked="Fixture records do not prove live or hosted operation." />{groups.map(({ key, title, kind }) => {
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
  const manifest = asRecord(domains["asset-manifest"]);
  const assetCount = Array.isArray(manifest.assets) ? manifest.assets.length : 0;
  return <div className="architecture-experience"><ExecutivePageBrief happening={`Six runtime layers and ${assetCount} manifest entries are visible.`} matters="Leadership can see verified layers and physical asset gaps separately." next="Close named dependencies before promoting any capability." blocked="Conclave, external connectors, and hosted acceptance remain incomplete." /><SixLayerArchitecture domains={domains} /><AssetCoverage domains={domains} /></div>;
}

function Specialists({ domains }: { domains: Record<string, DomainEnvelope> }) {
  const registry = asRecord(domains.specialists);
  const specialists = Array.isArray(registry.items) ? registry.items as Record<string, unknown>[] : [];
  const hosting = asRecord(domains["model-hosting"]);
  return <div className="area-grid">
    <ExecutivePageBrief happening={`${specialists.length} specialist profiles are registered; no trained SLM exists.`} matters="Profiles, RAG, tools, and trained models are distinct maturity classes." next="Review and evaluate candidates before any later promotion." blocked="No verified trained, hosted, or edge model asset is present." />
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
    <ExecutivePageBrief happening={`The portal reports ${label(snapshotMeta.connectionState)} in ${label(snapshotMeta.dataMode)} mode.`} matters="Security remains enforced while hosted connectivity is absent." next="Deploy, issue the scoped read identity, and begin Phase 5X-C acceptance." blocked="The external runtime endpoint and portal read identity are missing." />
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
    <header className="command-header">
      <div className="rail-brand"><span>{portalBrand.parentBrand}</span><strong>{portalBrand.displayName}</strong></div>
      <div className="command-truth">
        <StatusPill value="read only" tone="good" />
        <StatusPill value={snapshot?.meta.connectionState ?? "unavailable"} />
        <span>{snapshot?.meta.dataMode === "contract_fixture" ? "Contract Fixture" : label(snapshot?.meta.dataMode)}</span><span>Production: false</span><span>Enterprise: false</span><span>Cloud primary: false</span>
      </div>
      <button className="refresh-button" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />{loading ? "Refreshing" : "Refresh"}</button>
    </header>

    <ExecutiveStatusBar domains={domains} meta={snapshot?.meta} />

    {data?.referenceFixture && <div className="fixture-banner" role="status"><TriangleAlert size={16} /><strong>{data.fixtureLabel ?? "CONTRACT FIXTURE — NON-LIVE DATA"}</strong><span>Values demonstrate the API contract; they are not current runtime observations.</span></div>}

    <aside className={menuOpen ? "sidebar is-open" : "sidebar"}>
      <div className="product-mark"><div aria-hidden="true">{portalBrand.shortName.slice(0, 1)}</div><section><span>{portalBrand.parentBrand}</span><h1>{portalBrand.displayName}</h1><p>Read-only runtime intelligence</p></section></div>
      <label className="nav-search"><Search size={15} /><span className="sr-only">Search portal areas</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an area" /></label>
      <nav aria-label="Portal areas">{visibleAreas.map((area) => <button key={area.id} className={active === area.id ? "active" : ""} onClick={() => { setActive(area.id); setMenuOpen(false); }}><area.icon size={17} /><span><strong>{area.label}</strong><small>{area.detail}</small></span><ChevronRight size={14} /></button>)}</nav>
      <footer><span>Phase 5X-B.5</span><p>Executive experience layer · Hosted connection acceptance pending.</p></footer>
    </aside>

    <main id="main-content">
      <header className="page-header"><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation"><Menu size={18} /></button><div><span>Executive operating system</span><h2>{current.label}</h2><p>{current.detail}</p></div><StatusPill value={snapshot?.meta.dataMode ?? "unavailable"} /></header>
      {error ? <section className="error-state"><TriangleAlert size={28} /><h3>Runtime values unavailable</h3><p>{error}</p><small>No operational data has been fabricated.</small><button onClick={refresh}>Try again</button></section> : !snapshot?.data ? <section className="loading-state"><div /><p>Reading allowlisted portal domains…</p></section> : <>
        {active === "overview" && <MissionOverview domains={domains} meta={snapshot.meta} />}
        {active === "verification" && <Verification domains={domains} />}
        {active === "evidence" && <Evidence domains={domains} openDetail={openDetail} />}
        {active === "architecture" && <Architecture domains={domains} />}
        {active === "topology" && <div className="topology-experience"><ExecutivePageBrief happening="The supplied provider-to-portal path is visible." matters="Connection truth is separated from architectural intent." next="Establish the secure hosted runtime path and verify every hop." blocked="OpenAI connectivity and live external inference remain unverified." /><RuntimeTopology domains={domains} meta={snapshot.meta} /></div>}
        {active === "specialists" && <Specialists domains={domains} />}
        {active === "system" && <System domains={domains} snapshotMeta={snapshot.meta} />}
      </>}
    </main>

    <footer className="global-footer"><span>Same-origin BFF</span><span>No action controls</span><span>No browser-held runtime credential</span><span>Phase 5X-C pending</span></footer>

    {detail && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setDetail(null)}><dialog open aria-label="Evidence record detail" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Validated record</span><h3>Evidence drill-down</h3></div><button onClick={() => setDetail(null)} aria-label="Close detail"><X size={17} /></button></header><pre>{JSON.stringify(detail.data, null, 2)}</pre><footer><StatusPill value={detail.meta.sourceOfTruth} /><span>Secret values exposed: false</span></footer></dialog></div>}
  </div>;
}
