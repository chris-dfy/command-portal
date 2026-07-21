import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, FileCheck2, Network, Plus, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import {
  NexusButton,
  NexusCallout,
  NexusMetric,
  NexusPanel,
  NexusStateView,
  NexusTabs,
} from "../design-system/NexusPrimitives";
import {
  localNexusClient,
  type CreateRuntimeNodeRequest,
  type CreateRuntimeNodeResult,
  type RuntimeCoordinationNode,
  type RuntimeNodeFleet,
} from "../lib/local-client";
import { StatusPill } from "./StatusPill";

type FleetState = "loading" | "ready" | "empty" | "unavailable";
type FleetTab = "fleet" | "create";

type NodeForm = {
  displayName: string;
  hostname: string;
  role: string;
  generation: string;
  environment: string;
  expectedRuntimeVersion: string;
  expectedCapabilities: string;
  credentialRef: string;
};

const EMPTY_FORM: NodeForm = {
  displayName: "",
  hostname: "",
  role: "",
  generation: "",
  environment: "pilot",
  expectedRuntimeVersion: "",
  expectedCapabilities: "",
  credentialRef: "",
};

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
  const health = record(node.healthDimensions);
  const freshness = freshnessState(node);
  return freshness === "current"
    ? text(health.componentHealth, vectorState(node, ["health"]))
    : freshness === "unknown" || freshness === "no heartbeat" ? "not observed" : freshness;
}

function monitoredReadiness(node: RuntimeCoordinationNode) {
  const health = record(node.healthDimensions);
  const freshness = freshnessState(node);
  return freshness === "current"
    ? text(health.operationalReadiness, vectorState(node, ["operationalReadiness", "readiness"]))
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

function referenceId(value: unknown, keys: string[]) {
  const item = record(value);
  return text(firstValue(item, keys), "");
}

function formatHeartbeat(value?: string | null) {
  if (!value) return "Never reported";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

function expectedCapabilities(form: NodeForm) {
  return [...new Set(form.expectedCapabilities.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];
}

export function EdgeNodeFleet() {
  const [fleet, setFleet] = useState<RuntimeNodeFleet | null>(null);
  const [fleetState, setFleetState] = useState<FleetState>("loading");
  const [tab, setTab] = useState<FleetTab>("fleet");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<NodeForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateRuntimeNodeResult | null>(null);
  const [pendingCreateKey, setPendingCreateKey] = useState<string | null>(null);
  const [pendingChallenge, setPendingChallenge] = useState<{ nodeId: string; key: string } | null>(null);
  const [reissuingChallenge, setReissuingChallenge] = useState(false);

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
  const administration = fleet?.administration;
  const administrationAvailable = administration?.governedExecutionAvailable === true
    && administration.nodeCreateAvailable === true;
  const administrationReason = administration?.reason
    ?? "Canonical governed node administration has not been verified by this Runtime.";
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
    exactState(node, ["coordinationConnectivity", "connectivity"], "connected")
      && freshnessState(node) === "current"
  )).length);
  const healthyCount = summaryValue(fleet, ["healthy", "healthyCount"], nodes.filter((node) => monitoredHealth(node) === "healthy").length);
  const readyCount = summaryValue(fleet, ["ready", "readyCount", "operationallyReady"], nodes.filter((node) => ["ready", "active"].includes(monitoredReadiness(node))).length);
  const awaitingCount = summaryValue(fleet, ["awaitingEvidence"], nodes.filter((node) => freshnessState(node) !== "current").length);
  const capabilities = expectedCapabilities(form);
  const formComplete = Object.entries(form).every(([, value]) => value.trim()) && capabilities.length > 0;

  function update<K extends keyof NodeForm>(key: K, value: NodeForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setPendingCreateKey(null);
  }

  async function createNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!administrationAvailable) {
      setError(administrationReason);
      return;
    }
    if (!formComplete) return;
    setCreating(true);
    setError(null);
    const idempotencyKey = pendingCreateKey ?? `node-create:${globalThis.crypto.randomUUID()}`;
    setPendingCreateKey(idempotencyKey);
    const payload: CreateRuntimeNodeRequest = {
      displayName: form.displayName.trim(),
      hostname: form.hostname.trim(),
      role: form.role.trim(),
      generation: form.generation.trim(),
      environment: form.environment.trim(),
      expectedRuntimeVersion: form.expectedRuntimeVersion.trim(),
      expectedCapabilities: capabilities,
      credentialRef: form.credentialRef.trim(),
      idempotencyKey,
    };
    try {
      const result = await localNexusClient.createRuntimeNode(payload);
      if (result.secretValuesExposed !== false) throw new Error("Runtime node registration failed the secret boundary.");
      setCreated(result);
      setPendingCreateKey(null);
      setForm(EMPTY_FORM);
      setSelectedNodeId(result.node.nodeId);
      setTab("fleet");
      await refresh(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Node registration was not completed.");
    } finally {
      setCreating(false);
    }
  }

  async function reissueChallenge(node: RuntimeCoordinationNode) {
    const idempotencyKey = pendingChallenge?.nodeId === node.nodeId
      ? pendingChallenge.key
      : `node-challenge:${globalThis.crypto.randomUUID()}`;
    setPendingChallenge({ nodeId: node.nodeId, key: idempotencyKey });
    setReissuingChallenge(true);
    setError(null);
    try {
      const result = await localNexusClient.reissueRuntimeNodeEnrollmentChallenge(node.nodeId, {
        idempotencyKey,
        reason: "Operator requested a fresh enrollment challenge for an unregistered node",
      });
      if (result.secretValuesExposed !== false) throw new Error("Runtime node challenge failed the secret boundary.");
      setCreated(result);
      setPendingChallenge(null);
      await refresh(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enrollment challenge was not reissued.");
    } finally {
      setReissuingChallenge(false);
    }
  }

  const receiptId = referenceId(created?.receipt, ["receiptId", "executionReceiptId", "id"]);
  const coordinationEventId = referenceId(created?.coordinationEvent, ["eventId", "id"]);

  return <NexusPanel
    className="edge-node-fleet span-2"
    eyebrow="Runtime Coordination"
    title="Edge node ecosystem"
    description="Monitor Runtime-reported trust, connectivity, health, readiness, and heartbeat evidence; node administration remains separately governed."
    icon={<ServerCog aria-hidden="true" />}
    actions={<NexusButton size="sm" onClick={() => void refresh()} loading={fleetState === "loading"}><RefreshCw size={14} />Refresh fleet</NexusButton>}
  >
    <div className="edge-fleet-boundary"><ShieldCheck size={16} aria-hidden="true" /><p><strong>Authorized scope only.</strong> Monitoring is tenant/workspace scoped. A node record never proves deployment, peer trust, connectivity, health, readiness, or completed enrollment.</p></div>

    {!administrationAvailable && <NexusCallout tone="attention" title="Governed node administration is blocked">
      {administrationReason} Monitoring and authenticated node reporting remain available; no administrative mutation is attempted.
    </NexusCallout>}

    <div className="nx-metrics edge-fleet-metrics" aria-label="Runtime node fleet summary">
      <NexusMetric label="Known nodes" value={summaryValue(fleet, ["total", "nodeCount"], nodes.length)} detail="Desired node records" />
      <NexusMetric label="Connected" value={connectedCount} detail="Runtime-reported connectivity" tone={connectedCount ? "success" : "neutral"} />
      <NexusMetric label="Healthy" value={healthyCount} detail="Independent health dimension" tone={healthyCount ? "success" : "neutral"} />
      <NexusMetric label="Ready" value={readyCount} detail="Independent readiness dimension" tone={readyCount ? "success" : "neutral"} />
      <NexusMetric label="Awaiting evidence" value={awaitingCount} detail="Manifest or heartbeat absent" tone={awaitingCount ? "attention" : "neutral"} />
    </div>

    {created && <NexusCallout tone="success" title={`Node record created: ${created.node.nodeId}`}>
      The desired record is complete; registration, deployment, and operational readiness remain unverified until the node completes signed enrollment and supplies Runtime health evidence.{receiptId ? ` Receipt ${receiptId}.` : ""}{coordinationEventId ? ` Coordination event ${coordinationEventId}.` : ""}{created.node.enrollment?.challengeId ? ` One-time challenge ${created.node.enrollment.challengeId}, expiring ${formatHeartbeat(created.node.enrollment.expiresAt)}.` : ""}
    </NexusCallout>}
    {error && <NexusCallout tone="critical" title="Runtime Coordination unavailable">{error}</NexusCallout>}

    <NexusTabs
      className="edge-fleet-tabs"
      label="Edge node workspace"
      active={tab}
      onChange={(next) => setTab(next as FleetTab)}
      items={[
        { id: "fleet", label: `Fleet (${nodes.length})`, controls: "edge-fleet-panel" },
        { id: "create", label: "Create node", controls: "edge-create-panel" },
      ]}
    />

    {tab === "fleet" && <div id="edge-fleet-panel" role="tabpanel" className="edge-fleet-panel" aria-label="Known node records">
      {fleetState === "loading" ? <NexusStateView state="loading" title="Loading authorized node scope" detail="NEXUS is requesting the current Runtime Coordination projection." />
        : fleetState === "unavailable" ? <NexusStateView state="failure" title="Fleet state unavailable" detail="No node state was inferred or fabricated." actions={<NexusButton onClick={() => void refresh()}>Try again</NexusButton>} />
          : fleetState === "empty" ? <NexusStateView state="empty" title="No node records" detail={administrationAvailable ? "Create a desired node record. Registration, deployment, and connection remain separate evidenced steps." : "Fleet monitoring is active, but governed node creation is blocked by the listed constitutional prerequisites."} actions={<NexusButton variant="primary" onClick={() => setTab("create")}><Plus size={14} />Review node creation</NexusButton>} />
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
                <header><div><span className="nx-eyebrow">Node inspector</span><h3 id="edge-node-inspector-title">{selectedNode.displayName}</h3><code>{selectedNode.nodeId}</code></div><div><StatusPill value={vectorState(selectedNode, ["registration"], "unknown")} />{vectorState(selectedNode, ["registration"]) === "unregistered" && <NexusButton size="sm" onClick={() => void reissueChallenge(selectedNode)} loading={reissuingChallenge} disabled={!administrationAvailable} title={administrationAvailable ? "Issue a governed replacement challenge" : administrationReason}><FileCheck2 size={14} />{administrationAvailable ? "Issue new challenge" : "Challenge unavailable"}</NexusButton>}</div></header>
                <dl className="edge-node-state-vector">
                  <div><dt><ServerCog size={14} />Process</dt><dd><StatusPill value={vectorState(selectedNode, ["process"])} /></dd></div>
                  <div><dt><ShieldCheck size={14} />Registration</dt><dd><StatusPill value={vectorState(selectedNode, ["registration"])} /></dd></div>
                  <div><dt><FileCheck2 size={14} />Configuration</dt><dd><StatusPill value={vectorState(selectedNode, ["configuration"])} /></dd></div>
                  <div><dt><ShieldCheck size={14} />Trust</dt><dd><StatusPill value={trustState(selectedNode)} /></dd></div>
                  <div><dt><Network size={14} />Connectivity</dt><dd><StatusPill value={vectorState(selectedNode, ["coordinationConnectivity", "connectivity"])} /></dd></div>
                  <div><dt><Activity size={14} />Health</dt><dd><StatusPill value={vectorState(selectedNode, ["health"])} /></dd></div>
                  <div><dt><ServerCog size={14} />Readiness</dt><dd><StatusPill value={vectorState(selectedNode, ["readiness", "operationalReadiness", "operational_readiness"])} /></dd></div>
                  <div><dt><ShieldCheck size={14} />Administration</dt><dd><StatusPill value={vectorState(selectedNode, ["administration"])} /></dd></div>
                  <div><dt><Activity size={14} />Observed health</dt><dd><StatusPill value={monitoredHealth(selectedNode)} /></dd></div>
                  <div><dt><ServerCog size={14} />Observed readiness</dt><dd><StatusPill value={monitoredReadiness(selectedNode)} /></dd></div>
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
    </div>}

    {tab === "create" && <div id="edge-create-panel" role="tabpanel" className="edge-create-panel" aria-label="Create runtime node">
      <form onSubmit={(event) => void createNode(event)}>
        <header><span className="nx-eyebrow">Desired configuration</span><h3>Create a Runtime node</h3><p>The form is ready, but submission remains disabled until canonical Authority, Mission, Decision, Replay, verification, and Accountability services are available.</p></header>
        <div className="edge-create-grid">
          <label><span>Display name</span><input required maxLength={120} value={form.displayName} onChange={(event) => update("displayName", event.target.value)} placeholder="Plant gateway east" /></label>
          <label><span>Hostname</span><input required maxLength={253} spellCheck={false} value={form.hostname} onChange={(event) => update("hostname", event.target.value)} placeholder="edge-gateway-east-01" /></label>
          <label><span>Runtime role</span><input required maxLength={120} value={form.role} onChange={(event) => update("role", event.target.value)} placeholder="Operational Edge Runtime" /></label>
          <label><span>Hardware generation</span><input required maxLength={80} value={form.generation} onChange={(event) => update("generation", event.target.value)} placeholder="arm64-industrial-v1" /></label>
          <label><span>Environment</span><select required value={form.environment} onChange={(event) => update("environment", event.target.value)}><option value="development">Development</option><option value="test">Test</option><option value="proving_ground">Proving ground</option><option value="pilot">Pilot</option><option value="production">Production</option></select></label>
          <label><span>Expected Runtime version</span><input required maxLength={80} pattern="[0-9]+\.[0-9]+\.[0-9]+" spellCheck={false} value={form.expectedRuntimeVersion} onChange={(event) => update("expectedRuntimeVersion", event.target.value)} placeholder="1.9.0" /></label>
          <label className="edge-create-wide"><span>Expected capabilities</span><textarea required value={form.expectedCapabilities} onChange={(event) => update("expectedCapabilities", event.target.value)} placeholder="nexus.edge.runtime.host, nexus.edge.runtime.heartbeat" /><small>Comma- or space-separated registered NEXUS capability identifiers.</small></label>
          <label className="edge-create-wide"><span>Credential reference</span><input required maxLength={255} autoComplete="off" spellCheck={false} value={form.credentialRef} onChange={(event) => update("credentialRef", event.target.value)} placeholder="vault:nexus/runtime-nodes/edge-gateway-east-01" /><small>Reference identifier only. Never paste a password, token, key, or credential value.</small></label>
        </div>
        <footer><NexusButton type="submit" variant="primary" loading={creating} disabled={!formComplete || !administrationAvailable}><Plus size={15} />{administrationAvailable ? "Create node record" : "Creation unavailable"}</NexusButton><p>Production ready: false · Enterprise ready: false · No deployment claimed</p></footer>
      </form>
    </div>}

    {strings(fleet?.limitations).length > 0 && <footer className="edge-fleet-limitations"><strong>Fleet limitations</strong><ul>{strings(fleet?.limitations).map((item) => <li key={item}>{item}</li>)}</ul></footer>}
  </NexusPanel>;
}
