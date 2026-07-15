import { Activity, BookOpenCheck, Eye, FileCheck2, Gavel, LockKeyhole, Network, Workflow } from "lucide-react";
import type { DomainEnvelope, PortalMeta } from "../lib/types";
import { asItems, asRecord, displayLabel, statusTone } from "../lib/presentation";

type Props = {
  domains: Record<string, DomainEnvelope>;
  meta?: PortalMeta;
};

export function ExecutiveStatusBar({ domains, meta }: Props) {
  const status = asRecord(domains.status);
  const matrixValue = asRecord(domains["runtime-matrix"]).matrix;
  const matrix = Array.isArray(matrixValue) ? matrixValue as Record<string, unknown>[] : [];
  const matrixStatus = (id: string) => matrix.find((item) => item.capabilityId === id)?.status;
  const manifest = asRecord(domains["asset-manifest"]);
  const assets = Array.isArray(manifest.assets) ? manifest.assets as Record<string, unknown>[] : [];
  const knowledgeCount = assets.filter((asset) => asset.category === "knowledge").length;
  const evidenceCount = asItems(domains.proofs).length + asItems(domains.receipts).length;
  const runtimeValue = status.runtime === "not_connected" ? "Awaiting secure connection" : displayLabel(status.runtime);
  const items = [
    { title: "Runtime", value: runtimeValue, description: "Hosted runtime pending", icon: Activity },
    { title: "Knowledge", value: `${knowledgeCount} registered item${knowledgeCount === 1 ? "" : "s"}`, description: "Fixture inventory only", icon: BookOpenCheck },
    { title: "Governance", value: displayLabel(matrixStatus("governance")), description: "Local verification", icon: Gavel },
    { title: "Execution", value: "Bounded local only", description: displayLabel(matrixStatus("execution")), icon: Workflow },
    { title: "Evidence", value: `${evidenceCount} local record${evidenceCount === 1 ? "" : "s"}`, description: "Proof and receipt ledger", icon: FileCheck2 },
    { title: "Security", value: meta?.secretValuesExposed === false ? "Secrets isolated" : "Unavailable", description: "Server-held credential", icon: LockKeyhole },
    { title: "Connection", value: displayLabel(meta?.connectionState), description: meta?.dataMode === "contract_fixture" ? "Contract fixture" : "Runtime observation", icon: Network },
    { title: "Operator mode", value: "Observation only", description: "Read-only controls", icon: Eye }
  ];

  return <section className="executive-status-bar" aria-label="Executive system status">
    {items.map((item) => <article key={item.title} data-tone={statusTone(item.value)} aria-label={`${item.title}: ${item.value}. ${item.description}`}>
      <item.icon size={15} aria-hidden="true" />
      <div><span>{item.title}</span><strong>{item.value}</strong><small>{item.description}</small></div>
    </article>)}
  </section>;
}
