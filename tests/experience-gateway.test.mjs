import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createPortalServer, LOCAL_CAPABILITY_ROUTES, RUNTIME_MUTATION_ROUTES, RUNTIME_ROUTES } from "../server/portal-server.mjs";

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

async function start(runtimeFetch, config = {}, localFetch = runtimeFetch, operationalFetch = localFetch) {
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
    operationalFetch
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

test("Executive Briefing and its HIF lifecycle are the only bounded hosted Runtime presentation mutations", async () => {
  const observed = [];
  const base = await start(async (url, options) => {
    observed.push({ url, options });
    return runtimeResponse({ interaction: { interactionId: "INT-EOX-1" }, events: [{ type: "SpeechStarted", payload: { text: "Briefing" } }] });
  });
  assert.deepEqual(RUNTIME_MUTATION_ROUTES, { "/api/runtime/executive-briefing": "/runtime/executive-operating-loop/briefing" });
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
    conclave: "staged",
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
  assert.equal((await fetch(`${base}/api/operations/missions`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/missions/history?limit=8");
  assert.equal(observed.at(-1).options.headers.Authorization, `Bearer ${config.operationalRuntimeToken}`);
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.equal((await fetch(`${base}/api/operations/missions/plan`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ objective: "Plan alpha" })
  })).status, 403);
  assert.equal((await fetch(`${base}/api/operations/missions/plan`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": loginBody.session.csrfToken }, body: JSON.stringify({ objective: "Plan alpha" })
  })).status, 400);
  const mutation = await fetch(`${base}/api/operations/missions/plan`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": loginBody.session.csrfToken, "Idempotency-Key": "operation-12345" },
    body: JSON.stringify({ objective: "Plan alpha" })
  });
  assert.equal(mutation.status, 200);
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], "operation-12345");
  const body = await mutation.json();
  assert.equal(body.operational.productionMultiTenantReady, false);
  assert.equal(JSON.stringify(body).includes(config.operationalRuntimeToken), false);
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
