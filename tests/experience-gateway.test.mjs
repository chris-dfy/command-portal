import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import {
  CANONICAL_OPERATIONAL_ROUTES,
  createPortalServer,
  LOCAL_CAPABILITY_ROUTES,
  REPLAY_ROUTES,
  RUNTIME_MUTATION_ROUTES,
  RUNTIME_ROUTES,
} from "../server/portal-server.mjs";

const servers = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))));

function runtimeEnvelope(data = { observed: true }, overrides = {}) {
  return {
    status: "ok",
    timestamp: "2026-07-15T00:00:00Z",
    schemaVersion: "1.0.0",
    runtimeVersion: "0.1.0",
    proofIds: ["runtime-proof-1"],
    limitations: ["read only"],
    data,
    ...overrides
  };
}

function runtimeResponse(data, options = {}) {
  return new Response(JSON.stringify(runtimeEnvelope(data, options.body)), {
    status: options.status ?? 200,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) }
  });
}

async function start(runtimeFetch, config = {}, localFetch = runtimeFetch, operationalFetch = localFetch, replayFetch = operationalFetch) {
  const server = createPortalServer({
    config: {
      port: 0,
      runtimeBaseUrl: "https://runtime.invalid",
      runtimeToken: "server-only-test-token",
      timeoutMs: 30,
      cacheTtlMs: 500,
      maxAttempts: 3,
      retryDelayMs: 0,
      ...config
    },
    runtimeFetch,
    localFetch,
    operationalFetch,
    replayFetch
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

const localResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" }
});

test("every Experience Gateway route maps to exactly one literal runtime endpoint", async () => {
  const observed = [];
  const base = await start(async (url, options) => {
    observed.push({ url, options });
    return runtimeResponse({ route: url });
  });
  for (const [gatewayPath, runtimePath] of Object.entries(RUNTIME_ROUTES)) {
    const response = await fetch(`${base}${gatewayPath}`, { headers: { "Cache-Control": "no-cache" } });
    assert.equal(response.status, 200, gatewayPath);
    const call = observed.at(-1);
    assert.equal(call.url, `https://runtime.invalid${runtimePath}`);
    assert.equal(call.options.method, "GET");
  }
  assert.equal(observed.length, Object.keys(RUNTIME_ROUTES).length);
});

test("arbitrary routes, queries, and every mutation method are rejected", async () => {
  let calls = 0;
  const base = await start(async () => { calls += 1; return runtimeResponse({}); });
  assert.equal((await fetch(`${base}/api/runtime/not-allowlisted`)).status, 404);
  assert.equal((await fetch(`${base}/api/runtime/status?target=/anything`)).status, 400);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await fetch(`${base}/api/runtime/status`, { method });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("allow"), "GET, OPTIONS");
  }
  assert.equal(calls, 0);
});

test("Conclave, Executive Briefing, and HIF lifecycle are bounded hosted Runtime mutations", async () => {
  const observed = [];
  const base = await start(async (url, options) => {
    observed.push({ url, options });
    return runtimeResponse({ interaction: { interactionId: "INT-EOX-1" }, events: [{ type: "SpeechStarted", payload: { text: "Briefing" } }] });
  });
  assert.deepEqual(RUNTIME_MUTATION_ROUTES, {
    "/api/runtime/executive-briefing": "/runtime/executive-operating-loop/briefing",
    "/api/runtime/conclave/reviews": "/runtime/conclave/reviews",
    "/api/runtime/interactions": "/runtime/interactions"
  });
  const response = await fetch(`${base}/api/runtime/executive-briefing`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", modality: "text", speechRequested: true })
  });
  assert.equal(response.status, 200);
  assert.equal(observed[0].url, "https://runtime.invalid/runtime/executive-operating-loop/briefing");
  assert.equal(observed[0].options.method, "POST");
  assert.equal(observed[0].options.headers.Authorization, "Bearer server-only-test-token");
  assert.equal(JSON.stringify(await response.json()).includes("server-only-test-token"), false);
  assert.equal((await fetch(`${base}/api/runtime/executive-briefing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: "nexus-web", execute: true }) })).status, 400);
  const resumed = await fetch(`${base}/api/runtime/interactions/INT-EOX-1/resume`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  assert.equal(resumed.status, 200);
  assert.equal(observed.at(-1).url, "https://runtime.invalid/runtime/interactions/INT-EOX-1/resume");

  const conclave = await fetch(`${base}/api/runtime/conclave/reviews`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", proposal: "Challenge this proposal" })
  });
  assert.equal(conclave.status, 200);
  assert.equal(observed.at(-1).url, "https://runtime.invalid/runtime/conclave/reviews");
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), { clientId: "nexus-web", proposal: "Challenge this proposal" });
  assert.equal((await fetch(`${base}/api/runtime/conclave/reviews`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", proposal: "Review", execute: true })
  })).status, 400);
});

test("hosted conversational reasoning has a dedicated bounded timeout", async () => {
  const started = Date.now();
  const base = await start(async (_url, options) => new Promise((resolve, reject) => {
    const completion = setTimeout(() => resolve(runtimeResponse({ interaction: { responseText: "Verified response" }, events: [] })), 18);
    options.signal.addEventListener("abort", () => { clearTimeout(completion); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); });
  }), { timeoutMs: 5, reasoningTimeoutMs: 60 });
  const response = await fetch(`${base}/api/runtime/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", inputText: "Assess readiness", modality: "text" })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.interaction.responseText, "Verified response");
  assert.equal("data" in body.data, false);
  assert.ok(Date.now() - started >= 15);
});

test("Experience Gateway signs authoritative Runtime tenant context without exposing the secret", async () => {
  const secret = "shared-context-assertion-secret-at-least-thirty-two-characters";
  let observed;
  const base = await start(async (url, options) => {
    observed = { url, options };
    return runtimeResponse({ interaction: { responseText: "Context received" }, events: [] });
  }, { contextAssertionSecret: secret, operationalTenantId: "nexicron" });
  const response = await fetch(`${base}/api/runtime/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: "nexus-web",
      inputText: "What is Nexicron's mission?",
      modality: "text",
      metadata: { tenantId: "untrusted-browser-tenant", contextAssemblyOwner: "browser" }
    })
  });
  assert.equal(response.status, 200);
  const token = observed.options.headers["X-NEXUS-Context-Assertion"];
  const [encodedPayload, signature] = token.split(".");
  const assertion = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  assert.equal(assertion.iss, "command-portal-experience-gateway");
  assert.equal(assertion.aud, "nexus-runtime");
  assert.equal(assertion.tid, "nexicron");
  assert.equal(assertion.sub, "command-portal-observer");
  assert.deepEqual(assertion.roles, ["observer"]);
  assert.equal(assertion.clientId, "nexus-web");
  assert.equal(assertion.exp - assertion.iat, 60);
  assert.equal(signature, createHmac("sha256", secret).update(encodedPayload).digest("base64url"));
  const forwarded = JSON.parse(observed.options.body);
  assert.equal(forwarded.metadata.tenantId, "nexicron");
  assert.equal(forwarded.metadata.contextAssemblyOwner, "nexus-runtime");
  assert.equal(JSON.stringify(await response.json()).includes(secret), false);
});

test("hosted conversational reasoning reports its own timeout truthfully", async () => {
  const base = await start(async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  }), { timeoutMs: 50, reasoningTimeoutMs: 5 });
  const response = await fetch(`${base}/api/runtime/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", inputText: "Assess readiness", modality: "text" })
  });
  const body = await response.json();
  assert.equal(response.status, 504);
  assert.equal(body.gateway.connectionState, "Timed Out");
  assert.equal(body.error.code, "runtime_reasoning_timeout");
});

test("Realtime WebRTC SDP crosses the same-origin gateway without exposing either server credential", async () => {
  const offer = "v=0\r\na=offer\r\n".repeat(12);
  const answer = "v=0\r\na=answer\r\n".repeat(12);
  let observed;
  const base = await start(async (url, options) => {
    observed = { url, options };
    return new Response(answer, { status: 201, headers: { "Content-Type": "application/sdp" } });
  });
  const response = await fetch(`${base}/api/runtime/realtime/call`, {
    method: "POST", headers: { "Content-Type": "application/sdp", Accept: "application/sdp" }, body: offer
  });
  assert.equal(response.status, 201);
  assert.equal(await response.text(), answer);
  assert.equal(observed.url, "https://runtime.invalid/runtime/voice/realtime/call");
  assert.equal(observed.options.headers.Authorization, "Bearer server-only-test-token");
  assert.equal(Buffer.from(observed.options.body).toString("utf8"), offer);
  assert.equal(answer.includes("server-only-test-token"), false);
});

test("Realtime gateway rejects non-SDP and unsafe methods before contacting Runtime", async () => {
  let calls = 0;
  const base = await start(async () => { calls += 1; return runtimeResponse({}); });
  const invalid = await fetch(`${base}/api/runtime/realtime/call`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
  });
  assert.equal(invalid.status, 415);
  assert.equal((await fetch(`${base}/api/runtime/realtime/call`)).status, 405);
  assert.equal(calls, 0);
});

test("runtime credential is server-only and never serialized", async () => {
  const token = "server-only-test-token";
  let authorization;
  const base = await start(async (_url, options) => {
    authorization = options.headers.Authorization;
    return runtimeResponse({ safe: true });
  }, { runtimeToken: token });
  const text = await (await fetch(`${base}/api/runtime/status`)).text();
  assert.equal(authorization, `Bearer ${token}`);
  assert.equal(text.includes(token), false);
  assert.equal(text.includes("Authorization"), false);
  assert.equal(JSON.parse(text).gateway.secretValuesExposed, false);
});

test("unauthorized runtime is classified without exposing credentials", async () => {
  const base = await start(async () => new Response("unauthorized", { status: 401 }));
  const response = await fetch(`${base}/api/runtime/health`);
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.gateway.connectionState, "Unauthorized");
  assert.equal(body.error.code, "runtime_unauthorized");
});

test("timeout is explicit after bounded retries", async () => {
  let calls = 0;
  const base = await start(async (_url, options) => {
    calls += 1;
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  }, { timeoutMs: 5 });
  const response = await fetch(`${base}/api/runtime/health`);
  const body = await response.json();
  assert.equal(response.status, 504);
  assert.equal(body.gateway.connectionState, "Timed Out");
  assert.equal(calls, 3);
});

test("slow runtime is aborted instead of holding the browser request open", async () => {
  const started = Date.now();
  const base = await start(async (_url, options) => new Promise((_resolve, reject) => {
    const slow = setTimeout(() => _resolve(runtimeResponse({ late: true })), 500);
    options.signal.addEventListener("abort", () => { clearTimeout(slow); reject(Object.assign(new Error("slow"), { name: "AbortError" })); });
  }), { timeoutMs: 10, maxAttempts: 1 });
  const response = await fetch(`${base}/api/runtime/ready`);
  assert.equal(response.status, 504);
  assert.ok(Date.now() - started < 300);
});

test("transient failure retries and then returns a validated response", async () => {
  let calls = 0;
  const base = await start(async () => {
    calls += 1;
    if (calls < 3) throw new Error("transient network failure");
    return runtimeResponse({ recovered: true });
  });
  const body = await (await fetch(`${base}/api/runtime/diagnostics`)).json();
  assert.equal(body.ok, true);
  assert.equal(body.data.recovered, true);
  assert.equal(body.gateway.attempts, 3);
  assert.equal(calls, 3);
});

test("successful read-only responses are cached and no-cache invalidates them", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({ generation: ++calls }));
  const first = await (await fetch(`${base}/api/runtime/status`)).json();
  const second = await (await fetch(`${base}/api/runtime/status`)).json();
  const third = await (await fetch(`${base}/api/runtime/status`, { headers: { "Cache-Control": "no-cache" } })).json();
  assert.equal(first.data.generation, 1);
  assert.equal(second.data.generation, 1);
  assert.equal(second.gateway.cache.cached, true);
  assert.equal(second.gateway.cache.stale, false);
  assert.equal(typeof second.gateway.cache.age, "number");
  assert.ok(second.gateway.cache.lastRefresh);
  assert.ok(second.gateway.cache.expires);
  assert.equal(third.data.generation, 2);
});

test("proofs, receipts, health, readiness, and diagnostics bypass cache", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({ generation: ++calls }));
  for (const route of ["proofs", "receipts", "health", "ready", "diagnostics"]) {
    const first = await (await fetch(`${base}/api/runtime/${route}`)).json();
    const second = await (await fetch(`${base}/api/runtime/${route}`)).json();
    assert.notEqual(first.data.generation, second.data.generation, route);
    assert.equal(second.gateway.cache.cached, false, route);
  }
});

test("expired validated cache degrades visibly when runtime becomes unavailable", async () => {
  let available = true;
  const base = await start(async () => {
    if (!available) throw new Error("offline");
    return runtimeResponse({ lastKnown: "validated" });
  }, { cacheTtlMs: 1, maxAttempts: 1 });
  await fetch(`${base}/api/runtime/providers`);
  await new Promise((resolve) => setTimeout(resolve, 3));
  available = false;
  const response = await fetch(`${base}/api/runtime/providers`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.lastKnown, "validated");
  assert.equal(body.gateway.connectionState, "Degraded");
  assert.equal(body.gateway.cache.stale, true);
  assert.match(body.gateway.warning, /last validated response/i);
});

test("schema mismatch is rejected explicitly and never cached", async () => {
  let calls = 0;
  const base = await start(async () => { calls += 1; return runtimeResponse({}, { body: { schemaVersion: "2.0.0" } }); });
  for (let index = 0; index < 2; index += 1) {
    const response = await fetch(`${base}/api/runtime/version`);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.gateway.connectionState, "Schema Mismatch");
  }
  assert.equal(calls, 2);
});

test("version mismatch is rejected explicitly", async () => {
  const base = await start(async () => runtimeResponse({}, { body: { runtimeVersion: "1.0.0" } }));
  const response = await fetch(`${base}/api/runtime/version`);
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.gateway.connectionState, "Version Mismatch");
});

test("disconnected runtime returns unavailable with no fabricated data", async () => {
  const base = await start(async () => { throw new Error("offline"); }, { maxAttempts: 1 });
  const response = await fetch(`${base}/api/runtime/status`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.data, null);
  assert.equal(body.gateway.connectionState, "Unavailable");
  assert.equal(body.gateway.lastSuccessfulConnection, null);
});

test("invalid runtime envelopes are unavailable to the browser", async () => {
  const base = await start(async () => new Response(JSON.stringify({ data: { fabricated: true } }), { status: 200 }));
  const response = await fetch(`${base}/api/runtime/status`);
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.data, null);
  assert.equal(body.error.code, "runtime_response_invalid");
});

test("truth-boundary regression remains fixed in every gateway envelope", async () => {
  const base = await start(async () => runtimeResponse({}));
  const body = await (await fetch(`${base}/api/runtime/status`)).json();
  assert.deepEqual(body.truth, {
    productionReady: false,
    enterpriseReady: false,
    cloudPrimary: false,
    localSourceOfTruth: true,
    defaultProvider: "mock_model",
    conclave: "available_bounded_review",
    actualTrainedSLMs: 0,
    secretValuesExposed: false
  });
});

test("local capability mode is explicit and disabled by default", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({}), {}, async () => { calls += 1; return localResponse({}); });
  const response = await fetch(`${base}/api/local/status`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "local_capabilities_disabled");
  assert.equal(body.local.enabled, false);
  assert.equal(calls, 0);
});

test("Operational Replay is a bounded same-origin passive projection", async () => {
  const observed = [];
  const projection = { run_id: "RUN-1", status: "COMPLETE", metrics: { stage_count: 1 }, stages: [{ stage_id: "stage-1" }] };
  const replayFetch = async (url, options) => {
    observed.push({ url, options });
    return new Response(JSON.stringify(projection), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  };
  const base = await start(async () => runtimeResponse({}), {
    replayEnabled: true,
    replayBaseUrl: "http://127.0.0.1:4317"
  }, async () => localResponse({}), async () => localResponse({}), replayFetch);
  const response = await fetch(`${base}/api/replay/replay.json`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), projection);
  assert.equal(observed[0].url, "http://127.0.0.1:4317/replay.json");
  assert.equal(observed[0].options.method, "GET");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(`${base}/api/replay/replay.json`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${base}/api/replay/private`)).status, 404);
  assert.equal((await fetch(`${base}/api/replay/replay.json?path=/etc/passwd`)).status, 400);
  assert.deepEqual(Object.keys(REPLAY_ROUTES).sort(), [
    "/api/replay/events",
    "/api/replay/export/audit-package.zip",
    "/api/replay/export/replay-package.zip",
    "/api/replay/export/replay-receipt.json",
    "/api/replay/export/replay.json",
    "/api/replay/export/replay.pdf",
    "/api/replay/replay.json"
  ]);
});

test("Operational Replay is disabled unless the deployment explicitly enables it", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({}), {}, undefined, undefined, async () => { calls += 1; return localResponse({}); });
  const response = await fetch(`${base}/api/replay/replay.json`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "replay_gateway_disabled");
  assert.equal(calls, 0);
});

test("enabling local capabilities does not implicitly expose Operational Replay exports", async () => {
  let replayCalls = 0;
  const base = await start(
    async () => runtimeResponse({}),
    { localCapabilitiesEnabled: true },
    async () => localResponse({}),
    async () => localResponse({}),
    async () => { replayCalls += 1; return localResponse({}); }
  );
  const response = await fetch(`${base}/api/replay/replay.json`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "replay_gateway_disabled");
  assert.equal(replayCalls, 0);
});

test("local capability allowlist maps only literal governed Runtime operations", async () => {
  const observed = [];
  const localFetch = async (url, options) => {
    observed.push({ url, options });
    return localResponse({ recordType: "local_test", runtimePath: url });
  };
  const base = await start(async () => runtimeResponse({}), {
    localCapabilitiesEnabled: true,
    localApiBaseUrl: "http://127.0.0.1:8765"
  }, localFetch);

  const postBodies = {
    "/api/local/intake/upload": { filename: "brief.txt", contentBase64: "SGVsbG8=" },
    "/api/local/intake/query": { question: "What is in the brief?" },
    "/api/local/projects": { name: "Nexicron Alpha" },
    "/api/local/missions/plan": { objective: "Plan a governed launch" },
    "/api/local/work-sessions/plan": { objective: "Plan a bounded audit" },
    "/api/local/work-sessions/start": { objective: "Start a bounded audit" },
    "/api/local/actions/dry-run": { action: "inspect local project status" },
    "/api/local/actions/execute": { action: "run approved local test", explicitRequest: true },
    "/api/local/voice-operator/route-transcript": { transcript: "Summarize project Alpha", source: "text_fallback" },
    "/api/local/interactions": { clientId: "nexus-web", inputText: "Summarize project Alpha", modality: "text" }
  };
  for (const [route, definition] of Object.entries(LOCAL_CAPABILITY_ROUTES)) {
    const response = await fetch(`${base}${route}`, {
      method: definition.method,
      headers: definition.method === "POST" ? { "Content-Type": "application/json" } : {},
      ...(definition.method === "POST" ? { body: JSON.stringify(postBodies[route]) } : {})
    });
    assert.equal(response.status, 200, route);
    const expectedBase = definition.target === "platform" ? "http://127.0.0.1:8080" : "http://127.0.0.1:8765";
    assert.equal(observed.at(-1).url, `${expectedBase}${definition.runtimePath}`);
    assert.equal(observed.at(-1).options.method, definition.method);
    assert.equal(observed.at(-1).options.headers.Authorization, undefined);
  }
});

test("operational parity routes are explicit, validated, and remain Runtime-owned", async () => {
  const observed = [];
  const base = await start(async () => runtimeResponse({}), { localCapabilitiesEnabled: true }, async (url, options) => {
    observed.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    return localResponse({ recordType: "runtime_owned_operation", secretValuesExposed: false });
  });
  const cases = [
    ["/api/local/missions/MISSION-1/execute-step", { stepId: "STEP-1" }, "/missions/MISSION-1/execute-step"],
    ["/api/local/work-sessions/WORK-1/step", {}, "/work-sessions/WORK-1/step"],
    ["/api/local/work-sessions/WORK-1/pause", {}, "/work-sessions/WORK-1/pause"],
    ["/api/local/approvals/APPROVAL-1/approve", {}, "/approvals/APPROVAL-1/approve"],
    ["/api/local/approvals/APPROVAL-1/deny", { reason: "Insufficient evidence" }, "/approvals/APPROVAL-1/deny"]
  ];
  for (const [route, body, runtimePath] of cases) {
    const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 200, route);
    assert.equal(observed.at(-1).url, `http://127.0.0.1:8765${runtimePath}`);
    assert.equal((await response.json()).local.contextAssemblyOwner, "NEXUS Runtime");
  }
  assert.equal((await fetch(`${base}/api/local/work-sessions/WORK-1`)).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/work-sessions/WORK-1");
});

test("Conclave workspace routes use the operational gateway and preserve evidence validation", async () => {
  const observed = [];
  const base = await start(async () => runtimeResponse({}), {
    localCapabilitiesEnabled: true
  }, async (url, options) => {
    observed.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return localResponse({
      recordType: "nexus_conclave_workspace", missionId: "conclave-001",
      workspaceId: "conclave-001", status: "investigation_running", tasks: [],
      specialistRegistry: [], evidence: [], operationalReplay: { stageCount: 21 },
      executionAuthorized: false, externalExecutionPerformed: false, secretValuesExposed: false
    });
  });

  const created = await fetch(`${base}/api/local/conclave/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "conclave-create-0001" },
    body: JSON.stringify({ proposal: "Investigate an unfamiliar operational asset without control." })
  });
  assert.equal(created.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/conclave/workspaces");
  assert.deepEqual(observed.at(-1).body, { proposal: "Investigate an unfamiliar operational asset without control." });
  assert.equal((await created.json()).data.executionAuthorized, false);

  assert.equal((await fetch(`${base}/api/local/conclave/workspaces/conclave-001`)).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/conclave/workspaces/conclave-001");

  const evidence = await fetch(`${base}/api/local/conclave/workspaces/conclave-001/tasks/task-001/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: "edge-runtime://node-1/observation-1", sourceClassification: "runtime_evidence",
      collector: "node-1", confidence: 0.9, claim: "A bounded observation was admitted.",
      supportingArtifacts: ["observation-1"], relationships: ["observed_on"],
      operationalContext: { controlAttempted: false }, completeTask: true
    })
  });
  assert.equal(evidence.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/conclave/workspaces/conclave-001/tasks/task-001/evidence");
  assert.equal(observed.at(-1).body.sourceClassification, "runtime_evidence");
  const beforeInvalid = observed.length;
  assert.equal((await fetch(`${base}/api/local/conclave/workspaces/conclave-001/tasks/task-001/evidence`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin: "x", sourceClassification: "unclassified", confidence: 2, claim: "x" })
  })).status, 400);
  assert.equal(observed.length, beforeInvalid);
});

test("Runtime Coordination exposes fleet reads and exact governed admission routes only", async () => {
  const observed = [];
  const base = await start(async () => runtimeResponse({}), { localCapabilitiesEnabled: true }, async (url, options) => {
    observed.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith("/runtime-coordination/nodes")) return localResponse({
      recordType: "runtime_node_fleet",
      nodes: [{ nodeId: "NEXUS-EDGE-0002", enrollment: { status: "pending", challengeId: "raw-one-time-value" }, credentialRef: "must-not-reach-browser" }],
      summary: { total: 1 }, secretValuesExposed: false
    });
    return localResponse({ recordType: "runtime_projection", secretValuesExposed: false });
  });

  const listed = await fetch(`${base}/api/local/runtime-coordination/nodes`);
  assert.equal(listed.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/runtime-coordination/nodes");
  assert.equal(observed.at(-1).options.method, "GET");
  const listedText = await listed.text();
  assert.equal(listedText.includes("raw-one-time-value"), false);
  assert.equal(listedText.includes("must-not-reach-browser"), false);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/nodes/NEXUS-EDGE-0002`)).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/runtime-coordination/nodes/NEXUS-EDGE-0002");

  assert.equal((await fetch(`${base}/api/local/runtime-coordination/admissions`)).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/runtime-coordination/admissions");

  const admissionIntent = {
    missionId: "MISSION-EDGE-001",
    intent: {
      displayName: "Plant gateway east",
      nodeClass: "edge_runtime_node",
      requestedCapabilities: ["nexus.edge.runtime.host", "nexus.edge.runtime.heartbeat"],
      operationalPurpose: "Provide governed Runtime Coordination at the east plant.",
      location: "East plant",
      deploymentMetadata: { profile: "raspberry-pi" },
      evidenceRefs: ["EVIDENCE-EDGE-001"]
    }
  };
  const idempotencyKey = "edge-admission:request-001";
  const created = await fetch(`${base}/api/local/runtime-coordination/admissions`, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(admissionIntent)
  });
  assert.equal(created.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/runtime-coordination/admissions");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], idempotencyKey);
  assert.deepEqual(observed.at(-1).body, admissionIntent);
  assert.equal((await created.json()).truth.enterpriseReady, false);

  for (const [route, method] of [
    ["/api/local/runtime-coordination/admissions/ADMISSION-001", "GET"],
    ["/api/local/runtime-coordination/admissions/ADMISSION-001/receipt", "GET"],
    ["/api/local/runtime-coordination/admissions/ADMISSION-001/replay", "GET"],
  ]) {
    assert.equal((await fetch(`${base}${route}`, { method })).status, 200);
  }

  for (const action of ["cancel", "challenge/reissue"]) {
    const key = `edge-admission:${action.replace("/", "-")}-001`;
    const expectedVersion = action === "cancel" ? 7 : 8;
    const response = await fetch(`${base}/api/local/runtime-coordination/admissions/ADMISSION-001/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ expectedVersion, reason: `Operator requested ${action}` })
    });
    assert.equal(response.status, 200);
    assert.equal(observed.at(-1).url, `http://127.0.0.1:8765/runtime-coordination/admissions/ADMISSION-001/${action}`);
    assert.equal(observed.at(-1).options.headers["Idempotency-Key"], key);
    assert.deepEqual(observed.at(-1).body, { expectedVersion, reason: `Operator requested ${action}` });
  }

  const callsBeforeRejectedRequests = observed.length;
  for (const payload of [
    { ...admissionIntent, tenantId: "browser-tenant" },
    { ...admissionIntent, workspaceId: "browser-workspace" },
    { ...admissionIntent, requestingPrincipalId: "browser-principal" },
    { ...admissionIntent, authorityGrantId: "browser-authority" },
    { ...admissionIntent, nodeId: "NEXUS-EDGE-BROWSER" },
    { ...admissionIntent, intent: { ...admissionIntent.intent, verificationState: "verified" } },
    { ...admissionIntent, intent: { ...admissionIntent.intent, deploymentMetadata: { tenantId: "browser-tenant" } } },
    { ...admissionIntent, intent: { ...admissionIntent.intent, requestedCapabilities: ["vendor.device.control"] } },
  ]) {
    const response = await fetch(`${base}/api/local/runtime-coordination/admissions`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(payload)
    });
    assert.equal(response.status, 400);
  }
  const mismatched = await fetch(`${base}/api/local/runtime-coordination/admissions`, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ ...admissionIntent, idempotencyKey: "edge-admission:different" })
  });
  assert.equal(mismatched.status, 400);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/nodes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 405);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/admissions/ADMISSION-001/claim`)).status, 404);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/admissions/ADMISSION-001/proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 404);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/nodes/NEXUS-EDGE-0002/enrollment-challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 404);
  assert.equal(observed.length, callsBeforeRejectedRequests);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/nodes`, { method: "DELETE" })).status, 405);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/nodes?tenant=other`)).status, 400);
});

test("operational payloads cannot smuggle client-side governance decisions", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({}), { localCapabilitiesEnabled: true }, async () => { calls += 1; return localResponse({}); });
  const response = await fetch(`${base}/api/local/actions/execute`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "change production", explicitRequest: true, approved: true })
  });
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("HIF interaction events use the shared platform Runtime boundary", async () => {
  const observed = [];
  const base = await start(async () => runtimeResponse({}), {
    localCapabilitiesEnabled: true,
    platformRuntimeBaseUrl: "http://127.0.0.1:8080"
  }, async (url, options) => {
    observed.push({ url, options });
    return localResponse({ status: "ok", data: { interaction: { interactionId: "INT-1" }, events: [] } });
  });
  const created = await fetch(`${base}/api/local/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", inputText: "Brief me", presentation: { navigate: "projects", focus: "alpha" } })
  });
  assert.equal(created.status, 200);
  assert.equal(observed[0].url, "http://127.0.0.1:8080/runtime/interactions");
  assert.equal((await fetch(`${base}/api/local/interactions/INT-1/events`)).status, 200);
  assert.equal(observed[1].url, "http://127.0.0.1:8080/runtime/interactions/INT-1/events");
  assert.equal((await fetch(`${base}/api/local/interactions/INT-1/interrupt`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "barge_in" })
  })).status, 200);
  assert.equal(observed[2].url, "http://127.0.0.1:8080/runtime/interactions/INT-1/interrupt");
});

test("project scope estimate planning and compile use one dynamic Runtime project contract", async () => {
  const observed = [];
  const base = await start(async () => runtimeResponse({}), {
    localCapabilitiesEnabled: true
  }, async (url, options) => {
    observed.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return localResponse({ projectId: "PROJECT-1", truth: "runtime-owned" });
  });

  for (const action of ["scope", "estimate", "planning-model", "sources", "evidence", "artifacts"]) {
    assert.equal((await fetch(`${base}/api/local/projects/PROJECT-1/${action}`)).status, 200);
  }
  const compile = await fetch(`${base}/api/local/projects/PROJECT-1/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactType: "roadmap", options: { defaultPhaseDurationWeeks: 2, assumptions: ["Operator supplied"] } })
  });
  assert.equal(compile.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/projects/PROJECT-1/compile");
  assert.deepEqual(observed.at(-1).body, { artifactType: "roadmap", options: { defaultPhaseDurationWeeks: 2, assumptions: ["Operator supplied"] } });
  const body = await compile.json();
  assert.equal(body.local.contextAssemblyOwner, "NEXUS Runtime");
});

test("local gateway rejects arbitrary routes methods queries and unsafe payloads before Runtime", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({}), { localCapabilitiesEnabled: true }, async () => { calls += 1; return localResponse({}); });
  assert.equal((await fetch(`${base}/api/local/arbitrary`)).status, 404);
  assert.equal((await fetch(`${base}/api/local/status?path=/etc/passwd`)).status, 400);
  assert.equal((await fetch(`${base}/api/local/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 405);
  assert.equal((await fetch(`${base}/api/local/intake/upload`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: "../secret.txt", contentBase64: "SGVsbG8=" })
  })).status, 400);
  assert.equal((await fetch(`${base}/api/local/projects/PROJECT-1/compile`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artifactType: "unknown", options: {} })
  })).status, 400);
  assert.equal(calls, 0);
});

test("local capability failures preserve truth boundaries and hide server configuration", async () => {
  const secret = "server-only-test-token";
  const base = await start(async () => runtimeResponse({}), {
    runtimeToken: secret,
    localCapabilitiesEnabled: true,
    localApiBaseUrl: "http://localhost:8765"
  }, async () => { throw new Error(`offline ${secret}`); });
  const text = await (await fetch(`${base}/api/local/status`)).text();
  const body = JSON.parse(text);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "local_runtime_unavailable");
  assert.equal(text.includes(secret), false);
  assert.equal(body.truth.localSourceOfTruth, true);
  assert.equal(body.truth.productionReady, false);
});

test("hosted operational gateway requires a signed session CSRF scope and idempotency", async () => {
  const observed = [];
  const operationalFetch = async (url, options) => {
    observed.push({ url, options });
    return localResponse({ recordType: "hosted_runtime_result", secretValuesExposed: false });
  };
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: ["operations:read", "operations:write", "actions:simulate"],
    operationalCookieSecure: false,
    localCapabilitiesEnabled: false
  };
  const base = await start(async () => runtimeResponse({}), config, async () => localResponse({}), operationalFetch);
  assert.equal((await fetch(`${base}/api/operations/missions`)).status, 401);
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey })
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  assert.equal(loginBody.session.authenticated, true);
  assert.equal(loginBody.session.tenantId, "tenant-alpha");
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${base}/api/operations/missions`, { headers: {
    Cookie: cookie,
    "X-NEXUS-User-ID": "browser-controlled-identity",
    "X-NEXUS-Role": "observer",
    "X-NEXUS-Scopes": "operations:write"
  } })).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/missions");
  assert.equal(observed.at(-1).options.headers.Authorization, `Bearer ${config.operationalRuntimeToken}`);
  assert.equal(observed.at(-1).options.headers["X-NEXUS-User-ID"], "operator-1");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Role"], "admin");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Scopes"], "operations:read,operations:write,actions:simulate");
  const callsBeforeLegacyPlan = observed.length;
  assert.equal((await fetch(`${base}/api/operations/missions/plan`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ objective: "Plan alpha" })
  })).status, 404);
  assert.equal((await fetch(`${base}/api/operations/missions/plan`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": loginBody.session.csrfToken, "Idempotency-Key": "legacy-plan-12345" }, body: JSON.stringify({ objective: "Plan alpha" })
  })).status, 404);
  assert.equal(observed.length, callsBeforeLegacyPlan);

  assert.equal((await fetch(`${base}/api/operations/conclave/workspaces`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ proposal: "Investigate an unfamiliar asset through an Edge Runtime." })
  })).status, 403);
  assert.equal((await fetch(`${base}/api/operations/conclave/workspaces`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": loginBody.session.csrfToken }, body: JSON.stringify({ proposal: "Investigate an unfamiliar asset through an Edge Runtime." })
  })).status, 400);

  const conclaveMutation = await fetch(`${base}/api/operations/conclave/workspaces`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": loginBody.session.csrfToken, "Idempotency-Key": "conclave-operation-12345" },
    body: JSON.stringify({ proposal: "Investigate an unfamiliar asset through an Edge Runtime." })
  });
  assert.equal(conclaveMutation.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/conclave/workspaces");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], "conclave-operation-12345");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), { proposal: "Investigate an unfamiliar asset through an Edge Runtime." });
  const body = await conclaveMutation.json();
  assert.equal(body.operational.productionMultiTenantReady, false);
  assert.equal(JSON.stringify(body).includes(config.operationalRuntimeToken), false);
});

test("authenticated hosted reads use the canonical Runtime contracts without Replay fallback", async () => {
  const observed = [];
  let replayFallbackCalls = 0;
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: ["operations:read", "operations:write", "knowledge:promote"],
    operationalCookieSecure: false,
    replayEnabled: true,
  };
  const base = await start(
    async () => runtimeResponse({}),
    config,
    async () => localResponse({}),
    async (url, options) => {
      observed.push({ url, options });
      return localResponse({ recordType: "canonical_runtime_projection", secretValuesExposed: false });
    },
    async () => {
      replayFallbackCalls += 1;
      return localResponse({ fabricatedFallback: true });
    },
  );
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey: config.operationalAccessKey }),
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const routes = [
    ["/capabilities/readiness", "/capabilities/readiness"],
    ["/missions", "/missions"],
    ["/conclave/workspaces", "/conclave/workspaces"],
    ["/operational-replay", "/operational-replay"],
    ["/operational-replay/REPLAY-001", "/operational-replay/REPLAY-001"],
    ["/operational-replay/REPLAY-001/events", "/operational-replay/REPLAY-001/events"],
    ["/operational-replay/REPLAY-001/stages/stage-17", "/operational-replay/REPLAY-001/stages/stage-17"],
    ["/operational-replay/REPLAY-001/stages/stage-17/explain", "/operational-replay/REPLAY-001/stages/stage-17/explain"],
    ["/operational-replay/failures", "/operational-replay/failures"],
    ["/operational-replay/missions/MISSION-001", "/operational-replay/missions/MISSION-001"],
    ["/operational-replay/receipts/RECEIPT-001", "/operational-replay/receipts/RECEIPT-001"],
    ["/receipts", "/receipts"],
    ["/receipts/RECEIPT-001", "/receipts/RECEIPT-001"],
    ["/receipts/missions/MISSION-001", "/receipts/missions/MISSION-001"],
    ["/mission-store", "/mission-store"],
    ["/knowledge/acquisitions", "/knowledge/acquisitions"],
    ["/knowledge/promotion-candidates", "/knowledge/promotion-candidates"],
    ["/knowledge/store", "/knowledge/store"],
    ["/knowledge/receipts", "/knowledge/receipts"],
  ];
  for (const [portalPath, runtimePath] of routes) {
    const response = await fetch(`${base}/api/operations${portalPath}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, portalPath);
    const call = observed.at(-1);
    assert.equal(call.url, `http://127.0.0.1:9876${runtimePath}`, portalPath);
    assert.equal(call.options.method, "GET", portalPath);
    assert.equal(call.options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha", portalPath);
    assert.equal(call.options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha", portalPath);
  }
  assert.equal(replayFallbackCalls, 0);
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/missions"].GET, "/missions");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/runtime/baselines"].POST, "/runtime/baselines");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/knowledge/promotions"].POST, "/knowledge/promotions");

  const baselineKey = "runtime-baseline-0001";
  const baseline = await fetch(`${base}/api/operations/runtime/baselines`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": baselineKey,
    },
    body: JSON.stringify({ expectedDeployedCommit: "0123456789abcdef0123456789abcdef01234567" }),
  });
  assert.equal(baseline.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/runtime/baselines");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], baselineKey);
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), {
    expectedDeployedCommit: "0123456789abcdef0123456789abcdef01234567",
  });

  const promotionKey = "knowledge-promotion-0001";
  const promotion = await fetch(`${base}/api/operations/knowledge/promotions`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": promotionKey,
    },
    body: JSON.stringify({ candidateId: "candidate-runtime-baseline-001" }),
  });
  assert.equal(promotion.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/knowledge/promotions");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], promotionKey);
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Scopes"], "operations:read,operations:write,knowledge:promote");
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), { candidateId: "candidate-runtime-baseline-001" });

  const candidateKey = "promotion-candidate-0001";
  const candidate = await fetch(`${base}/api/operations/knowledge/acquisitions/MISSION-001/promotion-candidates`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": candidateKey,
    },
    body: JSON.stringify({ expectedMissionVersion: 7 }),
  });
  assert.equal(candidate.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/knowledge/acquisitions/MISSION-001/promotion-candidates");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], candidateKey);
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), { expectedMissionVersion: 7 });

  const callsBeforeRejectedMutations = observed.length;
  assert.equal((await fetch(`${base}/api/operations/runtime/baselines`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": "runtime-baseline-0002" },
    body: JSON.stringify({ expectedDeployedCommit: "0123456789abcdef0123456789abcdef01234567" }),
  })).status, 403);
  assert.equal((await fetch(`${base}/api/operations/knowledge/promotions`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": "knowledge-promotion-0002",
    },
    body: JSON.stringify({ candidateId: "candidate-runtime-baseline-001", tenantId: "browser-tenant" }),
  })).status, 403);
  assert.equal((await fetch(`${base}/api/operations/knowledge/acquisitions/MISSION-001/promotion-candidates`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": "promotion-candidate-0002",
    },
    body: JSON.stringify({ expectedMissionVersion: { metadata: { tenantId: "browser-tenant" } } }),
  })).status, 403);
  assert.equal(observed.length, callsBeforeRejectedMutations);
});

test("hosted Runtime Coordination keeps fleet reads and requires the admission request scope", async () => {
  const observed = [];
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: ["operations:read"],
    operationalCookieSecure: false
  };
  const base = await start(async () => runtimeResponse({}), config, async () => localResponse({}), async (url, options) => {
    observed.push({ url, options });
    return localResponse({ recordType: "runtime_node_fleet", nodes: [], summary: {}, limitations: [], secretValuesExposed: false });
  });
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey })
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const listed = await fetch(`${base}/api/operations/runtime-coordination/nodes`, { headers: { Cookie: cookie } });
  assert.equal(listed.status, 200);
  assert.equal(observed[0].url, "http://127.0.0.1:9876/runtime-coordination/nodes");
  assert.equal(observed[0].options.headers["X-NEXUS-User-ID"], "operator-1");
  assert.equal(observed[0].options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.equal(observed[0].options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha");
  assert.equal(observed[0].options.headers["X-NEXUS-Role"], "admin");
  assert.equal(observed[0].options.headers["X-NEXUS-Scopes"], "operations:read");
  const denied = await fetch(`${base}/api/operations/runtime-coordination/admissions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": "edge-admission:request-001" },
    body: JSON.stringify({})
  });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "scope_denied");
  const promotionDenied = await fetch(`${base}/api/operations/knowledge/promotions`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": "knowledge-promotion-0003",
    },
    body: JSON.stringify({ candidateId: "candidate-runtime-baseline-001" }),
  });
  assert.equal(promotionDenied.status, 403);
  assert.equal((await promotionDenied.json()).error.code, "scope_denied");
  assert.equal(observed.length, 1);
});

test("hosted admission proxy derives identity, preserves one idempotency key, and excludes node proof ingress", async () => {
  const observed = [];
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: ["operations:read", "edge:node_admission:request"],
    operationalCookieSecure: false
  };
  const base = await start(async () => runtimeResponse({}), config, async () => localResponse({}), async (url, options) => {
    observed.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return localResponse({
      recordType: "nexus_edge_node_admission", admissionRequestId: "ADMISSION-001", missionId: "MISSION-EDGE-001",
      intent: { displayName: "Plant gateway east", nodeClass: "edge_runtime_node", requestedCapabilities: ["nexus.edge.runtime.host"], operationalPurpose: "Governed operations" },
      lifecycleState: "CHALLENGE_ISSUED", challenge: { state: "issued", challengeId: "raw-one-time-value" },
      credentialRef: "must-not-reach-browser", secretValuesExposed: false
    });
  });
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey })
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const key = "edge-admission:request-001";
  const intent = {
    missionId: "MISSION-EDGE-001",
    intent: {
      displayName: "Plant gateway east", nodeClass: "edge_runtime_node",
      requestedCapabilities: ["nexus.edge.runtime.host"], operationalPurpose: "Governed operations",
      evidenceRefs: []
    },
    idempotencyKey: key
  };
  const created = await fetch(`${base}/api/operations/runtime-coordination/admissions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": key },
    body: JSON.stringify(intent)
  });
  assert.equal(created.status, 200);
  const createdText = await created.text();
  assert.equal(createdText.includes("raw-one-time-value"), false);
  assert.equal(createdText.includes("must-not-reach-browser"), false);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/runtime-coordination/admissions");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], key);
  assert.equal(observed.at(-1).options.headers["X-NEXUS-User-ID"], "operator-1");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha");
  assert.equal("idempotencyKey" in observed.at(-1).body, false);
  assert.deepEqual(observed.at(-1).body, { missionId: intent.missionId, intent: intent.intent });

  const callCount = observed.length;
  const trusted = await fetch(`${base}/api/operations/runtime-coordination/admissions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": key },
    body: JSON.stringify({ ...intent, tenantId: "browser-tenant" })
  });
  assert.equal(trusted.status, 403);
  const mismatch = await fetch(`${base}/api/operations/runtime-coordination/admissions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": key },
    body: JSON.stringify({ ...intent, idempotencyKey: "edge-admission:different" })
  });
  assert.equal(mismatch.status, 400);
  assert.equal((await fetch(`${base}/api/operations/runtime-coordination/admissions/ADMISSION-001/claim`, { headers: { Cookie: cookie } })).status, 404);
  assert.equal((await fetch(`${base}/api/operations/runtime-coordination/admissions/ADMISSION-001/proof`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": "edge-admission:proof-001" }, body: "{}"
  })).status, 404);
  assert.equal(observed.length, callCount);
});

test("hosted operational gateway is disabled by default and rejects arbitrary forwarding", async () => {
  const disabled = await start(async () => runtimeResponse({}));
  assert.equal((await fetch(`${disabled}/api/session`)).status, 503);
  const configured = await start(async () => runtimeResponse({}), {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalCookieSecure: false
  });
  const login = await fetch(`${configured}/api/session/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: "operator-access-key-strong" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${configured}/api/operations/arbitrary`, { headers: { Cookie: cookie } })).status, 404);
});

test("replay gateway routes resolve to allowlisted runtime paths with validated IDs and stages", async () => {
  const observed = [];
  const base = await start(async (url, options) => {
    observed.push({ url, options });
    return runtimeResponse({ replay: true });
  });
  const list = await fetch(`${base}/api/runtime/replay`, { headers: { "Cache-Control": "no-cache" } });
  assert.equal(list.status, 200);
  assert.equal(observed.at(-1).url, "https://runtime.invalid/runtime/replay");
  const detail = await fetch(`${base}/api/runtime/replay/REPLAY-001`);
  assert.equal(detail.status, 200);
  assert.equal(observed.at(-1).url, "https://runtime.invalid/runtime/replay/REPLAY-001");
  const events = await fetch(`${base}/api/runtime/replay/REPLAY-001/events`);
  assert.equal(events.status, 200);
  assert.equal(observed.at(-1).url, "https://runtime.invalid/runtime/replay/REPLAY-001/events");
  const explain = await fetch(`${base}/api/runtime/replay/REPLAY-001/stages/observation/explain`);
  assert.equal(explain.status, 200);
  assert.equal(observed.at(-1).url, "https://runtime.invalid/runtime/replay/REPLAY-001/stages/observation/explain");
  const priorCalls = observed.length;
  assert.equal((await fetch(`${base}/api/runtime/replay/REPLAY-001/stages/invalid-stage/explain`)).status, 404);
  assert.equal((await fetch(`${base}/api/runtime/replay/REPLAY-001/stages/observation/explain/extra`)).status, 404);
  assert.equal((await fetch(`${base}/api/runtime/replay/bad%2F..%2Fpath`)).status, 404);
  assert.equal((await fetch(`${base}/api/runtime/replay/REPLAY-001?limit=5`)).status, 400);
  assert.equal((await fetch(`${base}/api/runtime/replay/REPLAY-001`, { method: "POST" })).status, 405);
  assert.equal(observed.length, priorCalls);
});
