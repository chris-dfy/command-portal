import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, FileCheck2, Network, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import {
  NexusButton,
  NexusCallout,
  NexusMetric,
  NexusPanel,
  NexusStateView,
} from "../design-system/NexusPrimitives";
import {
  localNexusClient,
  type RuntimeCoordinationNode,
  type RuntimeNodeFleet,
} from "../lib/local-client";
import { EdgeAdmissionWorkspace } from "./EdgeAdmissionWorkspace";
import { StatusPill } from "./StatusPill";

type FleetState = "loading" | "ready" | "empty" | "unavailable";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const text = (value: unknown, fallback = "unknown") => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const item = record(value);
  for (const key of ["status", "state", "value", "posture"]) {
    if (typeof item[key] === "string" && String(item[key]).trim()) return String(item[key]).trim();
  }
  return fallback;
};

const strings = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
  : [];

function firstValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  return undefined;
}

function vectorState(node: RuntimeCoordinationNode, keys: string[], fallback = "unknown") {
  return text(firstValue(record(node.stateVector), keys), fallback);
}

function trustState(node: RuntimeCoordinationNode) {
  return text(node.trust, vectorState(node, ["trust", "peerTrust", "peer_trust"]));
}

function freshnessState(node: RuntimeCoordinationNode) {
  return text(node.freshness, node.lastHeartbeatAt ? "reported" : "no heartbeat");
}

function monitoredHealth(node: RuntimeCoordinationNode) {
  const freshness = freshnessState(node);
  return freshness === "current"
    ? text(record(node.healthDimensions).componentHealth, vectorState(node, ["health"]))
    : freshness === "unknown" || freshness === "no heartbeat" ? "not observed" : freshness;
}

function monitoredReadiness(node: RuntimeCoordinationNode) {
  const freshness = freshnessState(node);
  return freshness === "current"
    ? text(record(node.healthDimensions).operationalReadiness, vectorState(node, ["operationalReadiness", "readiness"]))
    : freshness === "unknown" || freshness === "no heartbeat" ? "not observed" : freshness;
}

function observedValue(node: RuntimeCoordinationNode, keys: string[], fallback = "not observed") {
  return text(firstValue(record(node.observedManifest), keys), fallback);
}

function desiredValue(node: RuntimeCoordinationNode, keys: string[], fallback = "not declared") {
  return text(firstValue(record(node.desiredConfiguration), keys), fallback);
}

function summaryValue(fleet: RuntimeNodeFleet | null, keys: string[], fallback: number) {
  const summary = fleet?.summary ?? {};
  for (const key of keys) if (typeof summary[key] === "number") return summary[key];
  return fallback;
}

function exactState(node: RuntimeCoordinationNode, keys: string[], expected: string) {
  return vectorState(node, keys).toLowerCase().replaceAll("_", " ") === expected;
}

function formatHeartbeat(value?: string | null) {
  if (!value) return "Never reported";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

export function EdgeNodeFleet() {
  const [fleet, setFleet] = useState<RuntimeNodeFleet | null>(null);
  const [fleetState, setFleetState] = useState<FleetState>("loading");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setFleetState("loading");
    try {
      const next = await localNexusClient.runtimeNodes();
      if (next.secretValuesExposed !== false) throw new Error("Runtime node response failed the secret boundary.");
      const nodes = Array.isArray(next.nodes) ? next.nodes : [];
      setFleet({ ...next, nodes });
      setSelectedNodeId((current) => nodes.some((node) => node.nodeId === current) ? current : nodes[0]?.nodeId ?? "");
      setFleetState(nodes.length ? "ready" : "empty");
      setError(null);
    } catch (reason) {
      setFleetState("unavailable");
      setError(reason instanceof Error ? reason.message : "Runtime node fleet is unavailable.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const nodes = fleet?.nodes ?? [];
  const visibleNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return nodes;
    return nodes.filter((node) => {
      const desired = record(node.desiredConfiguration);
      return [node.nodeId, node.displayName, desired.hostname, desired.role, desired.environment]
        .some((value) => text(value, "").toLowerCase().includes(normalized));
    });
  }, [nodes, query]);
  const selectedNode = nodes.find((node) => node.nodeId === selectedNodeId) ?? null;
  const connectedCount = summaryValue(fleet, ["connected", "connectedCount"], nodes.filter((node) => (
    exactState(node, ["coordinationConnectivity", "connectivity"], "connected") && freshnessState(node) === "current"
  )).length);
  const healthyCount = summaryValue(fleet, ["healthy", "healthyCount"], nodes.filter((node) => monitoredHealth(node) === "healthy").length);
  const readyCount = summaryValue(fleet, ["ready", "readyCount", "operationallyReady"], nodes.filter((node) => ["ready", "active"].includes(monitoredReadiness(node))).length);
  const awaitingCount = summaryValue(fleet, ["awaitingEvidence"], nodes.filter((node) => freshnessState(node) !== "current").length);

  return <>
    <NexusPanel
      className="edge-node-fleet span-2"
      eyebrow="Runtime Coordination"
      title="Edge node ecosystem"
      description="Monitor Runtime-reported trust, connectivity, health, readiness, heartbeat evidence, and lineage independently from governed admission."
      icon={<ServerCog aria-hidden="true" />}
      actions={<NexusButton size="sm" onClick={() => void refresh()} loading={fleetState === "loading"}><RefreshCw size={14} />Refresh fleet</NexusButton>}
    >
      <div className="edge-fleet-boundary"><ShieldCheck size={16} aria-hidden="true" /><p><strong>Authorized scope only.</strong> A fleet record never proves deployment, peer trust, connectivity, health, readiness, admission, or completed enrollment.</p></div>
      <div className="nx-metrics edge-fleet-metrics" aria-label="Runtime node fleet summary">
        <NexusMetric label="Known nodes" value={summaryValue(fleet, ["total", "nodeCount"], nodes.length)} detail="Runtime fleet records" />
        <NexusMetric label="Connected" value={connectedCount} detail="Runtime-reported connectivity" tone={connectedCount ? "success" : "neutral"} />
        <NexusMetric label="Healthy" value={healthyCount} detail="Independent health dimension" tone={healthyCount ? "success" : "neutral"} />
        <NexusMetric label="Ready" value={readyCount} detail="Independent readiness dimension" tone={readyCount ? "success" : "neutral"} />
        <NexusMetric label="Awaiting evidence" value={awaitingCount} detail="Manifest or heartbeat absent" tone={awaitingCount ? "attention" : "neutral"} />
      </div>
      {error && <NexusCallout tone="critical" title="Runtime Coordination unavailable">{error}</NexusCallout>}
      <div id="edge-fleet-panel" className="edge-fleet-panel" aria-label="Known node records">
        {fleetState === "loading" ? <NexusStateView state="loading" title="Loading authorized node scope" detail="NEXUS is requesting the current Runtime Coordination projection." />
          : fleetState === "unavailable" ? <NexusStateView state="failure" title="Fleet state unavailable" detail="No node state was inferred or fabricated." actions={<NexusButton onClick={() => void refresh()}>Try again</NexusButton>} />
            : fleetState === "empty" ? <NexusStateView state="empty" title="No admitted node records" detail="Fleet monitoring remains ready. Start a separate Mission-bound governed admission request below." />
              : <div className="edge-fleet-layout">
                <section className="edge-fleet-roster" aria-labelledby="edge-fleet-roster-title">
                  <header><div><span className="nx-eyebrow">Fleet inventory</span><h3 id="edge-fleet-roster-title">Known node records</h3></div><label><span className="sr-only">Filter nodes</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by node, host, role, or environment" /></label></header>
                  <div className="edge-fleet-table-wrap">
                    <table className="edge-fleet-table">
                      <caption className="sr-only">Runtime-reported node state dimensions</caption>
                      <thead><tr><th scope="col">Node</th><th scope="col">Trust</th><th scope="col">Connectivity</th><th scope="col">Health</th><th scope="col">Readiness</th><th scope="col">Heartbeat</th></tr></thead>
                      <tbody>{visibleNodes.map((node) => <tr key={node.nodeId} data-selected={node.nodeId === selectedNodeId}>
                        <th scope="row"><button type="button" aria-pressed={node.nodeId === selectedNodeId} onClick={() => setSelectedNodeId(node.nodeId)}><strong>{node.displayName}</strong><small>{node.nodeId}</small></button></th>
                        <td><StatusPill value={trustState(node)} /></td>
                        <td><StatusPill value={vectorState(node, ["coordinationConnectivity", "connectivity"])} /></td>
                        <td><StatusPill value={monitoredHealth(node)} /></td>
                        <td><StatusPill value={monitoredReadiness(node)} /></td>
                        <td><span>{formatHeartbeat(node.lastHeartbeatAt)}</span><small>{freshnessState(node)}</small></td>
                      </tr>)}</tbody>
                    </table>
                    {!visibleNodes.length && <NexusStateView state="empty" title="No matching nodes" detail="Change the fleet filter to restore the authorized inventory." />}
                  </div>
                </section>

                {selectedNode && <aside className="edge-node-inspector" aria-labelledby="edge-node-inspector-title">
                  <header><div><span className="nx-eyebrow">Node inspector</span><h3 id="edge-node-inspector-title">{selectedNode.displayName}</h3><code>{selectedNode.nodeId}</code></div><StatusPill value={vectorState(selectedNode, ["registration"], "unknown")} /></header>
                  <dl className="edge-node-state-vector">
                    <div><dt><ServerCog size={14} />Process</dt><dd><StatusPill value={vectorState(selectedNode, ["process"])} /></dd></div>
                    <div><dt><ShieldCheck size={14} />Registration</dt><dd><StatusPill value={vectorState(selectedNode, ["registration"])} /></dd></div>
                    <div><dt><FileCheck2 size={14} />Configuration</dt><dd><StatusPill value={vectorState(selectedNode, ["configuration"])} /></dd></div>
                    <div><dt><ShieldCheck size={14} />Trust</dt><dd><StatusPill value={trustState(selectedNode)} /></dd></div>
                    <div><dt><Network size={14} />Connectivity</dt><dd><StatusPill value={vectorState(selectedNode, ["coordinationConnectivity", "connectivity"])} /></dd></div>
                    <div><dt><Activity size={14} />Health</dt><dd><StatusPill value={monitoredHealth(selectedNode)} /></dd></div>
                    <div><dt><ServerCog size={14} />Readiness</dt><dd><StatusPill value={monitoredReadiness(selectedNode)} /></dd></div>
                    <div><dt><ShieldCheck size={14} />Fleet posture</dt><dd><StatusPill value={text(selectedNode.posture)} /></dd></div>
                  </dl>
                  <section><h4>Desired configuration</h4><dl><div><dt>Hostname</dt><dd>{desiredValue(selectedNode, ["hostname"])}</dd></div><div><dt>Role</dt><dd>{desiredValue(selectedNode, ["role"])}</dd></div><div><dt>Environment</dt><dd>{desiredValue(selectedNode, ["environment"])}</dd></div><div><dt>Expected Runtime</dt><dd>{desiredValue(selectedNode, ["expectedRuntimeVersion", "expected_runtime_version", "runtimeVersion", "runtime_version"])}</dd></div></dl></section>
                  <section><h4>Observed manifest</h4>{selectedNode.observedManifest ? <dl><div><dt>Hostname</dt><dd>{observedValue(selectedNode, ["hostname"])}</dd></div><div><dt>Runtime</dt><dd>{observedValue(selectedNode, ["runtimeVersion", "runtime_version"])}</dd></div><div><dt>Capabilities</dt><dd>{strings(firstValue(record(selectedNode.observedManifest), ["capabilities"])).join(", ") || "None reported"}</dd></div><div><dt>Last heartbeat</dt><dd>{formatHeartbeat(selectedNode.lastHeartbeatAt)}</dd></div></dl> : <NexusStateView state="empty" title="Manifest not observed" detail="The node record exists, but no trusted Runtime manifest has been admitted." />}</section>
                  <section><h4><FileCheck2 size={14} />Evidence, journal, and Replay</h4><div className="edge-node-references">{[
                    ...strings(selectedNode.evidenceRefs).map((id) => ["Evidence", id]),
                    ...strings(selectedNode.receiptRefs).map((id) => ["Receipt", id]),
                    ...strings(selectedNode.coordinationEventRefs).map((id) => ["Coordination", id]),
                    ...strings(selectedNode.replayRefs).map((id) => ["Operational Replay", id]),
                  ].map(([kind, id]) => <p key={`${kind}-${id}`}><span>{kind}</span><code>{id}</code></p>)}</div>{![selectedNode.evidenceRefs, selectedNode.receiptRefs, selectedNode.coordinationEventRefs, selectedNode.replayRefs].some((items) => strings(items).length) && <p className="boundary-note">No Evidence, receipt, coordination event, or Replay reference was reported for this node.</p>}</section>
                  {strings(selectedNode.limitations).length > 0 && <section><h4>Limitations</h4><ul>{strings(selectedNode.limitations).map((item) => <li key={item}>{item}</li>)}</ul></section>}
                </aside>}
              </div>}
      </div>
      {strings(fleet?.limitations).length > 0 && <footer className="edge-fleet-limitations"><strong>Fleet limitations</strong><ul>{strings(fleet?.limitations).map((item) => <li key={item}>{item}</li>)}</ul></footer>}
    </NexusPanel>
    <EdgeAdmissionWorkspace capability={fleet?.admissionCapability} onFleetRefresh={() => void refresh(true)} />
  </>;
}
