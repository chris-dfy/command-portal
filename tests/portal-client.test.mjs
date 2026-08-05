import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  asCapabilityRegistryProjection,
  portalClient,
} from "../src/lib/portal-client.ts";

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

const gatewayEnvelope = ({
  route,
  ok = true,
  connectionState = "Healthy",
  data = { verified: true },
  error,
} = {}) => ({
  ok,
  data: ok ? data : null,
  runtime: ok ? {
    status: connectionState === "Degraded" ? "not_ready" : "ok",
    timestamp: "2026-07-31T00:00:00.000Z",
    schemaVersion: "1.0.0",
    runtimeVersion: "0.1.0",
    proofIds: [],
    limitations: [],
  } : null,
  gateway: {
    status: connectionState === "Healthy"
      ? "Healthy"
      : connectionState === "Connecting" || connectionState === "Retrying"
        ? connectionState
        : "Degraded",
    connectionState,
    route: `/api/runtime/${route}`,
    runtimeUrl: "https://nexus-runtime-dev.fly.dev",
    lastSuccessfulConnection: ok ? "2026-07-31T00:00:00.000Z" : null,
    lastSuccessfulRefresh: ok ? "2026-07-31T00:00:00.000Z" : null,
    cache: {
      lastRefresh: null,
      age: null,
      stale: false,
      expires: null,
      cached: false,
    },
    readOnly: true,
    secretValuesExposed: false,
  },
  truth: {
    productionReady: false,
    enterpriseReady: false,
    cloudPrimary: false,
    localSourceOfTruth: true,
    defaultProvider: "mock_model",
    conclave: "unavailable",
    actualTrainedSLMs: 0,
    secretValuesExposed: false,
  },
  ...(error ? { error } : {}),
});

const rejectsWithEnvelope = (code, connectionState) => (error) => {
  assert.equal(error?.envelope?.error?.code, code);
  assert.equal(error?.envelope?.gateway?.connectionState, connectionState);
  return true;
};

function assertCoordinatorFailure(result, code, connectionState) {
  assert.deepEqual(result.data, {});
  assert.equal(result.failures.length, 1);
  const [failure] = result.failures;
  assert.equal(failure.ok, false);
  assert.equal(failure.data, null);
  assert.equal(failure.runtime, null);
  assert.equal(failure.gateway.route, "/api/runtime/bootstrap");
  assert.equal(failure.gateway.connectionState, connectionState);
  assert.equal(failure.error.code, code);
}

const validCapabilityRegistryProjection = () => ({
  recordType: "nexus_live_capability_registry_projection",
  schemaVersion: "nexus.live-capability-registry@1.0.0",
  owner: "context_runtime",
  generatedAt: "2026-07-31T00:00:00.000Z",
  constitutionalBasis: {},
  verificationPolicy: {},
  capabilityRegistryContract: {
    recordType: "nexus_capability_registry_contract_identity",
    schemaVersion: "nexus.live-capability-registry@1.0.0",
    schemaDigest: `sha256:${"a".repeat(64)}`,
    validatorVersion: "nexus.capability-registry-validator@1.0.0",
  },
  sourceIdentity: {
    rootRevision: "b".repeat(40),
    runtimeRevision: "c".repeat(40),
    rootRevisionVerified: true,
    runtimeRevisionVerified: true,
    verificationMethod: "program_alpha_source_attestation",
    sourceTreeDigest: `sha256:${"d".repeat(64)}`,
    sourceTreeClean: true,
    environmentRevisionMatched: true,
  },
  summary: {},
  verificationReceipts: [],
  limitations: [],
  secretValuesExposed: false,
  authority: {
    authorityGranted: false,
    executionAuthorityIntroduced: false,
  },
  capabilities: [],
  connectors: [],
  actions: [],
  executiveContinuity: {
    impediments: [],
  },
});

test("portal registry validation requires an exact verified Runtime revision identity", () => {
  const valid = validCapabilityRegistryProjection();
  assert.equal(asCapabilityRegistryProjection(valid), valid);
  for (const sourceIdentity of [
    { ...valid.sourceIdentity, runtimeRevision: "short" },
    { ...valid.sourceIdentity, runtimeRevisionVerified: false },
    { ...valid.sourceIdentity, runtimeRevision: undefined },
  ]) {
    assert.equal(asCapabilityRegistryProjection({
      ...valid,
      sourceIdentity,
    }), null);
  }
});

test("portal client preserves a structurally valid degraded readiness response in one attempt", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(gatewayEnvelope({
      route: "ready",
      connectionState: "Degraded",
      data: {
        processReady: true,
        platformContractReady: false,
      },
    })), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await portalClient.get("ready");
  assert.equal(result.ok, true);
  assert.equal(result.gateway.connectionState, "Degraded");
  assert.equal(result.data.processReady, true);
  assert.equal(calls, 1);
});

test("portal client accepts compatible Runtime patches but rejects minor-version drift", async () => {
  const compatible = gatewayEnvelope({ route: "version" });
  compatible.runtime.runtimeVersion = "0.1.1";
  globalThis.fetch = async () => new Response(JSON.stringify(compatible), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(
    (await portalClient.get("version")).runtime.runtimeVersion,
    "0.1.1",
  );

  for (const runtimeVersion of ["0.2.0", "0.1.x"]) {
    const incompatible = gatewayEnvelope({ route: "version" });
    incompatible.runtime.runtimeVersion = runtimeVersion;
    globalThis.fetch = async () => new Response(JSON.stringify(incompatible), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    await assert.rejects(
      portalClient.get("version"),
      rejectsWithEnvelope("gateway_response_invalid", "Unknown"),
    );
  }
});

test("portal client fails malformed and route-mismatched JSON closed as Unknown", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    data: { fabricated: true },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(
    portalClient.get("health"),
    rejectsWithEnvelope("gateway_response_invalid", "Unknown"),
  );

  globalThis.fetch = async () => new Response(JSON.stringify(gatewayEnvelope({
    route: "status",
  })), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(
    portalClient.get("health"),
    rejectsWithEnvelope("gateway_response_invalid", "Unknown"),
  );

  globalThis.fetch = async () => new Response(JSON.stringify(gatewayEnvelope({
    route: "health",
    ok: false,
    connectionState: "Healthy",
    error: {
      code: "inconsistent_failure",
      message: "A failure cannot claim a healthy connection.",
    },
  })), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(
    portalClient.get("health"),
    rejectsWithEnvelope("gateway_response_invalid", "Unknown"),
  );

  const incompatible = gatewayEnvelope({ route: "health" });
  incompatible.runtime.schemaVersion = "2.0.0";
  globalThis.fetch = async () => new Response(JSON.stringify(incompatible), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(
    portalClient.get("health"),
    rejectsWithEnvelope("gateway_response_invalid", "Unknown"),
  );
});

test("portal client preserves a valid unauthorized failure envelope", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify(gatewayEnvelope({
    route: "health",
    ok: false,
    connectionState: "Unauthorized",
    error: {
      code: "runtime_unauthorized",
      message: "Runtime rejected the server credential.",
    },
  })), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });

  await assert.rejects(
    portalClient.get("health"),
    rejectsWithEnvelope("runtime_unauthorized", "Unauthorized"),
  );
});

test("portal client classifies transport failure and parent-boundary expiry without hanging", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("network unavailable");
  };
  await assert.rejects(
    portalClient.get("health"),
    rejectsWithEnvelope("gateway_unreachable", "Unavailable"),
  );

  const parent = new AbortController();
  let started = false;
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    started = true;
    options.signal.addEventListener("abort", () => {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    }, { once: true });
  });
  const pending = assert.rejects(
    portalClient.get("health", false, parent.signal),
    rejectsWithEnvelope("gateway_snapshot_timed_out", "Timed Out"),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, true);
  parent.abort();
  await pending;
});

test("a corrupt bootstrap aggregate yields one coordinator failure without replacing prior snapshot data", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    recordType: "nexus_experience_runtime_bootstrap",
    schemaVersion: "1.0.0",
    data: { fabricated: true },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const result = await portalClient.snapshot(true);

  assertCoordinatorFailure(result, "gateway_bootstrap_response_invalid", "Unknown");
});

test("an unreachable bootstrap yields one precise coordinator failure with empty replacement data", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Gateway network boundary is unavailable.");
  };

  const result = await portalClient.snapshot(true);

  assertCoordinatorFailure(result, "gateway_unreachable", "Unavailable");
});

test("a timed-out bootstrap yields one precise coordinator failure with empty replacement data", async () => {
  globalThis.setTimeout = (callback, delay, ...args) => originalSetTimeout(
    callback,
    delay === 20_000 ? 1 : delay,
    ...args,
  );
  globalThis.fetch = async (_input, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    }, { once: true });
  });

  const result = await portalClient.snapshot(true);

  assertCoordinatorFailure(result, "gateway_snapshot_timed_out", "Timed Out");
});
