import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createPortalServer } from "../server/portal-server.mjs";

const INTERACTION_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

const config = {
  port: 0,
  runtimeBaseUrl: "https://runtime.invalid",
  runtimeToken: "server-only-test-token",
  operationalEnabled: true,
  operationalApiBaseUrl: "https://runtime.internal",
  operationalRuntimeToken: "runtime-token-at-least-24-characters",
  operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
  contextAssertionSecret: "context-assertion-secret-at-least-thirty-two-characters",
  operationalAccessKey: "operator-access-key-strong",
  operationalTenantId: "tenant-alpha",
  operationalWorkspaceId: "workspace-alpha",
  operationalUserId: "operator-1",
  operationalRole: "admin",
  operationalScopes: ["operations:read", "operations:write", "approvals:decide"],
  operationalCookieSecure: false,
};

const browserInteraction = (overrides = {}) => ({
  interaction_id: INTERACTION_ID,
  session_id: SESSION_ID,
  input: {
    modality: "text",
    text: "Publish the approved briefing",
    source_client: "nexus-command",
  },
  context: {
    active_object_ids: [],
    conversation_id: SESSION_ID,
  },
  ...overrides,
});

const runtimeResult = (overrides = {}) => ({
  interaction_id: INTERACTION_ID,
  classification: "action",
  status: "approval_required",
  response_text: "Approval is required.",
  intent: { intent_type: "operational" },
  mission_id: "MISSION-001",
  authority_decision: { decision: "approval_required", approval_id: "APPROVAL-001" },
  execution: {},
  verification: { verified: false },
  receipt_id: null,
  ...overrides,
});

function invoke(server, { path, body, cookie, csrf, idempotencyKey = INTERACTION_ID, method = "POST" }) {
  const raw = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const request = Readable.from(raw.byteLength ? [raw] : []);
  Object.assign(request, {
    method,
    url: path,
    headers: {
      host: "portal.invalid",
      cookie,
      ...(raw.byteLength ? { "content-type": "application/json" } : {}),
      "content-length": String(raw.byteLength),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(method === "POST" ? { "idempotency-key": idempotencyKey } : {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  return new Promise((resolve) => {
    const response = {
      status: 0,
      headers: {},
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(chunk = "") {
        resolve({ status: this.status, headers: this.headers, body: JSON.parse(Buffer.from(chunk).toString("utf8")) });
      },
    };
    server.emit("request", request, response);
  });
}

test("canonical interaction lookup is a tenant-scoped read of the Runtime-retained envelope", async () => {
  let upstream;
  const lookup = {
    record_type: "nexus_interaction_lookup",
    interaction_id: INTERACTION_ID,
    found: true,
    state: "approval_required",
    transitions: [],
    latest_response: runtimeResult(),
    original_envelope: {
      ...browserInteraction(),
      actor: { actor_id: "operator-1", tenant_id: "tenant-alpha", roles: ["admin"] },
      context: { ...browserInteraction().context, workspace_id: "workspace-alpha" },
    },
  };
  const server = createPortalServer({
    config,
    operationalFetch: async (url, options) => {
      upstream = { url, options };
      return new Response(JSON.stringify(lookup), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const login = server.experienceGateway.sessionAuthority.login(config.operationalAccessKey);
  const response = await invoke(server, {
    method: "GET",
    path: `/api/operations/executive-interactions/${INTERACTION_ID}`,
    cookie: login.cookie.split(";", 1)[0],
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, lookup);
  assert.equal(upstream.url, `https://runtime.internal/executive/interactions/${INTERACTION_ID}`);
  assert.equal(upstream.options.method, "GET");
  assert.equal(upstream.options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
});

test("hosted canonical interaction gateway injects the exact authenticated actor and workspace", async () => {
  let upstream;
  const server = createPortalServer({
    config,
    operationalFetch: async (url, options) => {
      upstream = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify(runtimeResult()), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const login = server.experienceGateway.sessionAuthority.login(config.operationalAccessKey);
  const result = await invoke(server, {
    path: "/api/operations/executive-interactions",
    body: browserInteraction(),
    cookie: login.cookie.split(";", 1)[0],
    csrf: login.csrfToken,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, runtimeResult());
  assert.equal(upstream.url, "https://runtime.internal/executive/interactions");
  assert.equal(upstream.options.headers["Idempotency-Key"], INTERACTION_ID);
  assert.equal(upstream.options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.equal(upstream.options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha");
  assert.equal(upstream.options.headers["X-NEXUS-User-ID"], "operator-1");
  const [encodedAssertion] = upstream.options.headers["X-NEXUS-Context-Assertion"].split(".");
  const assertion = JSON.parse(Buffer.from(encodedAssertion, "base64url").toString("utf8"));
  assert.equal(assertion.contract, "nexus.context-assertion@3.0.0");
  assert.equal(assertion.sub, "operator-1");
  assert.equal(assertion.humanOperatorVerified, true);
  assert.deepEqual(assertion.roles, ["admin"]);
  assert.deepEqual(assertion.scopes, ["approvals:decide", "operations:read", "operations:write"]);
  assert.deepEqual(upstream.body, {
    ...browserInteraction(),
    actor: { actor_id: "operator-1", tenant_id: "tenant-alpha", roles: ["admin"] },
    context: { ...browserInteraction().context, workspace_id: "workspace-alpha" },
  });
});

test("local canonical interaction gateway injects server identity and uses the same Runtime endpoint", async () => {
  let upstream;
  const server = createPortalServer({
    config: { ...config, operationalEnabled: false, localCapabilitiesEnabled: true, localApiBaseUrl: "http://127.0.0.1:8765" },
    localFetch: async (url, options) => {
      upstream = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify(runtimeResult()), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const result = await invoke(server, {
    path: "/api/local/executive-interactions",
    body: browserInteraction(),
  });

  assert.equal(result.status, 200);
  assert.equal(upstream.url, "http://127.0.0.1:8765/executive/interactions");
  assert.equal(upstream.options.headers["Idempotency-Key"], INTERACTION_ID);
  assert.equal(upstream.options.headers["X-NEXUS-User-ID"], "operator-1");
  assert.deepEqual(upstream.body.actor, { actor_id: "operator-1", tenant_id: "tenant-alpha", roles: ["admin"] });
  assert.equal(upstream.body.context.workspace_id, "workspace-alpha");
});

test("approval continuation adds only Runtime-issued approval_id to the same canonical interaction", async () => {
  const upstream = [];
  const server = createPortalServer({
    config,
    operationalFetch: async (url, options) => {
      upstream.push({ url, options, body: JSON.parse(options.body) });
      const body = url.endsWith("/approve")
        ? { approval_id: "APPROVAL-001", status: "approved", interaction_id: INTERACTION_ID, resume_required: true }
        : runtimeResult({ status: "executed", response_text: "Executed and verified.", authority_decision: { decision: "allow", approval_id: "APPROVAL-001" }, execution: { attempted: true }, verification: { verified: true }, receipt_id: "RECEIPT-001" });
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const login = server.experienceGateway.sessionAuthority.login(config.operationalAccessKey);
  const session = { cookie: login.cookie.split(";", 1)[0], csrf: login.csrfToken };
  assert.equal((await invoke(server, {
    ...session,
    path: "/api/operations/approvals/APPROVAL-001/approve",
    body: {},
    idempotencyKey: "approve:APPROVAL-001",
  })).status, 200);
  assert.equal((await invoke(server, {
    ...session,
    path: "/api/operations/executive-interactions",
    body: browserInteraction({ approval_id: "APPROVAL-001" }),
  })).status, 200);

  assert.equal(upstream[1].url, "https://runtime.internal/executive/interactions");
  assert.equal(upstream[1].options.headers["Idempotency-Key"], INTERACTION_ID);
  assert.deepEqual(upstream[1].body, {
    ...browserInteraction({ approval_id: "APPROVAL-001" }),
    actor: { actor_id: "operator-1", tenant_id: "tenant-alpha", roles: ["admin"] },
    context: { ...browserInteraction().context, workspace_id: "workspace-alpha" },
  });
});

test("gateway rejects client-selected identity, workspace, and mismatched idempotency", async () => {
  let calls = 0;
  const server = createPortalServer({
    config,
    operationalFetch: async () => { calls += 1; return new Response("{}"); },
  });
  const login = server.experienceGateway.sessionAuthority.login(config.operationalAccessKey);
  const session = { path: "/api/operations/executive-interactions", cookie: login.cookie.split(";", 1)[0], csrf: login.csrfToken };
  const actor = await invoke(server, { ...session, body: browserInteraction({ actor: { actor_id: "attacker", tenant_id: "other", roles: ["admin"] } }) });
  const workspace = await invoke(server, { ...session, body: browserInteraction({ context: { ...browserInteraction().context, workspace_id: "other" } }) });
  const mismatch = await invoke(server, { ...session, body: browserInteraction(), idempotencyKey: "33333333-3333-4333-8333-333333333333" });
  assert.equal(actor.status, 403);
  assert.equal(actor.body.error.code, "untrusted_identity_field");
  assert.equal(workspace.status, 403);
  assert.equal(workspace.body.error.code, "untrusted_identity_field");
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.error.code, "idempotency_key_mismatch");
  assert.equal(calls, 0);
});
