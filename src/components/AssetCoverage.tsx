import { BookOpenCheck, Braces, Cable, Database, FileCheck2, Gavel, Puzzle } from "lucide-react";
import type { DomainEnvelope } from "../lib/types";
import { asRecord, displayLabel, statusTone } from "../lib/presentation";
import { StatusPill } from "./StatusPill";

const COVERAGE_GROUPS = [
  { name: "Knowledge", categories: ["knowledge"], icon: BookOpenCheck },
  { name: "Policies", categories: ["policies"], icon: Gavel },
  { name: "Handlers", categories: ["handlers"], icon: Braces },
  { name: "Connectors", categories: ["connectors"], icon: Cable },
  { name: "Specialists", categories: ["specialists"], icon: Puzzle },
  { name: "Evidence", categories: ["proofs", "receipts"], icon: FileCheck2 },
  { name: "Datasets", categories: ["data"], icon: Database }
] as const;

export function AssetCoverage({ domains }: { domains: Record<string, DomainEnvelope> }) {
  const manifest = asRecord(domains["asset-manifest"]);
  const coverage = asRecord(domains["asset-coverage"]);
  const assets = Array.isArray(manifest.assets) ? manifest.assets as Record<string, unknown>[] : [];
  const globalLimitations = Array.isArray(coverage.limitations) ? coverage.limitations.map(String) : [];
  const missing = Array.isArray(coverage.missingRequirements) ? coverage.missingRequirements.map(String) : [];

  return <section className="asset-coverage" aria-labelledby="asset-coverage-heading">
    <header className="visualization-header"><div><span>Versioned platform inventory</span><h3 id="asset-coverage-heading">Asset coverage</h3><p>Counts are registered manifest entries—not percentages, estimates, or claims of deployment.</p></div><Database size={21} /></header>
    <div className="asset-coverage__summary"><div><span>Manifest version</span><strong>{displayLabel(manifest.manifestVersion)}</strong></div><div><span>Overall coverage</span><strong>{displayLabel(coverage.coverage)}</strong></div><div><span>Verification</span><strong>{displayLabel(coverage.verificationState)}</strong></div><div><span>Registered entries</span><strong>{assets.length}</strong></div></div>
    <div className="coverage-grid">{COVERAGE_GROUPS.map((group) => {
      const items = assets.filter((asset) => group.categories.includes(String(asset.category) as never));
      const states = Array.from(new Set(items.map((item) => String(item.state ?? "unavailable"))));
      const limitations = Array.from(new Set(items.flatMap((item) => Array.isArray(item.limitations) ? item.limitations.map(String) : [])));
      const aggregate = states.includes("unavailable") ? "unavailable" : states.includes("configured_not_connected") || states.includes("candidate") ? "limited" : states[0] ?? "missing";
      return <article key={group.name} data-tone={statusTone(aggregate)}>
        <header><group.icon size={17} aria-hidden="true" /><div><span>{group.name}</span><strong>{items.length} registered</strong></div><StatusPill value={aggregate} /></header>
        <div className="inventory-strip" aria-label={`${items.length} registered ${group.name.toLowerCase()} assets`}>{items.length ? items.map((item) => <i key={String(item.id)} title={String(item.id)} data-tone={statusTone(item.state)} />) : <i className="is-empty" />}</div>
        <dl><div><dt>Verification</dt><dd>{states.length ? states.map(displayLabel).join(", ") : "No registered inventory"}</dd></div><div><dt>Limitation</dt><dd>{limitations[0] ?? globalLimitations[0] ?? "No recorded limitation"}</dd></div></dl>
      </article>;
    })}</div>
    <footer><div><span>Missing requirements</span><div>{missing.map((item) => <strong key={item}>{displayLabel(item)}</strong>)}</div></div><p>Generated candidates remain non-authoritative until reviewed, evaluated, approved, versioned, registered, deployed, and verified.</p></footer>
  </section>;
}
