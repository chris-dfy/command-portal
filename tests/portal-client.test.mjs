import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { portalClient } from "../src/lib/portal-client.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
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
