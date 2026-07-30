import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import {
  createExecutiveSessionAuthority,
  EXECUTIVE_PRINCIPAL_TYPE,
  EXECUTIVE_REGISTRY_CONTRACT,
  EXECUTIVE_REGISTRY_RECORD_TYPE,
  EXECUTIVE_SCOPES,
  EXECUTIVE_SESSION_POLICY_DIGEST,
  HUMAN_SESSION_ASSERTION_HEADER,
  providerSubjectBinding,
} from "../server/executive-session.mjs";
import {
  createExecutiveSessionRuntimeClient,
  validateRuntimeExecutiveSessionEnvelope,
} from "../server/executive-session-runtime.mjs";
import {
  createPortalServer,
  loadConfig,
} from "../server/portal-server.mjs";

const BASE_TIME_SECONDS = Math.floor(
  Date.parse("2026-07-30T12:00:00Z") / 1_000,
);
const clock = () => BASE_TIME_SECONDS * 1_000;
const RAW_PROVIDER_SUBJECT = "replit-provider-subject-never-retained";
const PROVIDER_ISSUER = "https://replit-auth.example/issuer";
const PROVIDER_AUDIENCE = "nexus-command-nonproduction";
const HUMAN_ASSERTION_SECRET =
  "mission-three-human-assertion-secret-material-0001";
const RUNTIME_TOKEN =
  "mission-one-runtime-service-token-material-0000001";

const registration = Object.freeze({
  registrationId: "REG-NONPROD-EXECUTIVE-1",
  principalId: "nexus-executive-nonprod-1",
  principalType: EXECUTIVE_PRINCIPAL_TYPE,
  provider: "replit-auth",
  providerIssuer: PROVIDER_ISSUER,
  providerSubjectBinding: providerSubjectBinding(
    "replit-auth",
    PROVIDER_ISSUER,
    RAW_PROVIDER_SUBJECT,
  ),
  providerSubjectClientControlled: false,
  providerSubjectRetained: false,
  tenantId: "nexicron",
  workspaceId: "primary",
  role: "executive",
  scopes: [...EXECUTIVE_SCOPES],
  policyId: "registered-executive-session-policy",
  policyVersion: "1.0.0",
  policyDigest: EXECUTIVE_SESSION_POLICY_DIGEST,
  sessionVersion: 1,
  revocationCheckpoint: 0,
  maximumSessionLifetimeSeconds: 3_600,
  authenticationMethods: ["replit-auth", "mfa"],
  state: "active",
});

const registryDocument = Object.freeze({
  recordType: EXECUTIVE_REGISTRY_RECORD_TYPE,
  schemaVersion: EXECUTIVE_REGISTRY_CONTRACT,
  registryVersion: "nonproduction-1.0.0",
  principals: [registration],
});

const configOverrides = (overrides = {}) => ({
  port: 0,
  runtimeBaseUrl: "https://runtime.invalid",
  runtimeToken: RUNTIME_TOKEN,
  runtimeTokenRef: "secret-manager:experience/runtime-read-current",
  runtimeTokenKeyId: "runtime-read-current",
  trustBootstrapRequired: true,
  contextAssertionSecret:
    "mission-one-context-assertion-secret-material-00001",
  contextAssertionSecretRef:
    "secret-manager:experience/context-assertion-current",
  contextAssertionKeyId: "context-assertion-current",
  contextAssertionIssuer: "command-portal-experience-gateway",
  contextAssertionAudience: "nexus-runtime",
  contextAssertionClientIds: "nexus-web",
  operationalTenantId: "nexicron",
  operationalWorkspaceId: "primary",
  operationalCookieSecure: true,
  executiveSessionEnabled: true,
  executiveSessionTtlSeconds: 3_600,
  executiveSessionCookieSecret:
    "mission-three-cookie-signing-secret-material-000001",
  executiveSessionCookieSecretRef:
    "secret-manager:experience/executive-cookie-current",
  executiveSessionCookieKeyId: "executive-session-cookie-current",
  humanSessionAssertionSecret: HUMAN_ASSERTION_SECRET,
  humanSessionAssertionSecretRef:
    "secret-manager:experience/executive-session-current",
  humanSessionAssertionKeyId: "executive-session-current",
  humanSessionAssertionIssuer: "command-portal-experience-gateway",
  humanSessionAssertionAudience: "nexus-runtime",
  humanSessionServiceBindingId: "command-portal-experience-gateway",
  humanSessionAssertionClientId: "nexus-web",
  humanSessionAssertionTtlSeconds: 60,
  replitAuthIssuer: PROVIDER_ISSUER,
  replitAuthAudience: PROVIDER_AUDIENCE,
  replitAuthJwksUrl: "",
  replitAuthClockSkewSeconds: 30,
  replitAuthMaxTokenLifetimeSeconds: 3_600,
  replitAuthJwksTimeoutMs: 1_000,
  replitAuthJwksCacheSeconds: 300,
  executiveSessionPolicyId: "registered-executive-session-policy",
  executiveSessionPolicyVersion: "1.0.0",
  executiveSessionPolicyDigest: EXECUTIVE_SESSION_POLICY_DIGEST,
  executiveRegistrations: registryDocument,
  timeoutMs: 1_000,
  maxAttempts: 1,
  retryDelayMs: 0,
  ...overrides,
});

const providerIdentity = (overrides = {}) => ({
  provider: "replit-auth",
  issuer: PROVIDER_ISSUER,
  audience: PROVIDER_AUDIENCE,
  subject: RAW_PROVIDER_SUBJECT,
  authnTime: BASE_TIME_SECONDS - 20,
  authnMethods: ["replit-auth", "mfa"],
  ...overrides,
});

const decodeAssertion = (token) => {
  const [encoded, signature, extra] = String(token ?? "").split(".");
  assert.ok(encoded);
  assert.ok(signature);
  assert.equal(extra, undefined);
  assert.equal(
    signature,
    createHmac("sha256", HUMAN_ASSERTION_SECRET)
      .update(encoded)
      .digest("base64url"),
  );
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
};

const timestamp = (seconds) =>
  new Date(seconds * 1_000).toISOString();

function runtimeSession(claims, state = "active") {
  const revoked = state === "revoked";
  return {
    recordType: "nexus_registered_executive_session",
    schemaVersion: "nexus.registered-executive-session@1.0.0",
    sessionId: claims.sid,
    state,
    humanIdentity: {
      registrationId: claims.registrationId,
      principalId: claims.principalId,
      principalType: "registered_human_executive",
      provider: claims.provider,
      providerIssuer: claims.providerIssuer,
      providerSubjectBinding:
        "server_verified_opaque_subject_to_preprovisioned_registration",
      providerSubjectClientControlled: false,
      providerSubjectRetained: false,
      providerAssertionVerified: true,
      humanVerified: true,
      authenticationMethods: [...claims.authenticationMethods],
      authenticationTime: timestamp(claims.authenticationTime),
    },
    serviceIdentity: {
      principalId: "command-portal-experience-gateway",
      principalType: "experience_gateway_service",
      authenticationMethod: "bound_service_credential",
      authenticatedBeforeHumanAssertion: true,
      distinctFromHumanPrincipal: true,
    },
    scopeBinding: {
      tenantId: claims.tid ?? claims.tenantId,
      workspaceId: claims.wid ?? claims.workspaceId,
      selectionOwner: "server_registration_and_runtime",
      clientControlled: false,
      exactRuntimeMatch: true,
    },
    role: claims.role,
    scopes: [...claims.scopes],
    policyBinding: {
      policyId: claims.policyId,
      policyVersion: claims.policyVersion,
      policyDigest: claims.policyDigest,
      state: "current_verified",
      clientControlled: false,
    },
    assertionBinding: {
      contractVersion:
        "nexus.registered-executive-session-assertion@1.0.0",
      algorithm: "hmac-sha256",
      keyId: "executive-session-current",
      issuer: "command-portal-experience-gateway",
      audience: "nexus-runtime",
      serviceBindingId: "command-portal-experience-gateway",
      maximumLifetimeSeconds: 60,
      singleUseRequired: true,
      tokenRetained: false,
      authorityClaimAccepted: false,
    },
    lifecycle: {
      sessionVersion: claims.sessionVersion,
      authenticatedAt: timestamp(claims.authenticationTime),
      issuedAt: timestamp(claims.sessionIssuedAt),
      expiresAt: timestamp(claims.sessionExpiresAt),
      revokedAt: revoked ? timestamp(BASE_TIME_SECONDS + 1) : null,
      maximumSessionLifetimeSeconds: 3_600,
      bounded: true,
    },
    replayAndRevocation: {
      assertionReplayState: "admitted_single_use",
      sessionReplayRef: "EXEC-SESSION-REPLAY-TEST-1",
      revocationState: state,
      revocationCheckpoint:
        claims.revocationCheckpoint + (revoked ? 1 : 0),
      durable: true,
      rejectedRequestMutatedState: false,
    },
    authorityBoundary: {
      authorityGranted: false,
      actionAuthorized: false,
      approvalRef: null,
      decisionRef: null,
      authorityGrantRefs: [],
      missionExecutionAdmitted: false,
      capabilityHealthGrantsAuthority: false,
    },
    receipt: {
      receiptId: "EXEC-SESSION-RECEIPT-TEST-1",
      receiptDigest: `sha256:${"c".repeat(64)}`,
      accountabilityRef: `accountability:executive-session/${claims.sid}`,
      replayRef: "EXEC-SESSION-REPLAY-TEST-1",
      postconditionVerified: true,
      credentialMaterialRetained: false,
      rawProviderSubjectRetained: false,
    },
    secretValuesExposed: false,
  };
}

function runtimeEnvelope(claims, state, status) {
  return {
    status,
    timestamp: timestamp(BASE_TIME_SECONDS),
    schemaVersion: "1.0.0",
    runtimeVersion: "0.1.0",
    proofIds: [],
    limitations: [],
    data: { session: runtimeSession(claims, state) },
    secretValuesExposed: false,
  };
}

function assertionClaims() {
  const identity = {
    provider: "replit-auth",
    issuer: PROVIDER_ISSUER,
    audience: PROVIDER_AUDIENCE,
    providerSubjectBinding: registration.providerSubjectBinding,
    authnTime: BASE_TIME_SECONDS - 20,
    authnMethods: ["replit-auth", "mfa"],
  };
  const config = loadConfig(configOverrides());
  return {
    config,
    claims: createExecutiveSessionAuthority(config, clock).issue(
      identity,
      registration,
    ).claims,
  };
}

const servers = [];
afterEach(
  async () =>
    Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise((resolve) => server.close(resolve)),
      ),
    ),
);

async function start(runtimeFetch, identityVerifier = async () => providerIdentity()) {
  const server = createPortalServer({
    config: configOverrides(),
    runtimeFetch,
    providerIdentityVerifier: identityVerifier,
    clock,
  });
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("login, read, and revoke preserve separate human/service identities and expose only sanitized session state", async () => {
  const calls = [];
  let admittedClaims;
  const assertionIds = [];
  const runtimeFetch = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    assert.equal(options.headers.Authorization, `Bearer ${RUNTIME_TOKEN}`);
    if (path === "/runtime/executive-sessions/verify") {
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), {});
      admittedClaims = decodeAssertion(
        options.headers[HUMAN_SESSION_ASSERTION_HEADER],
      );
      assertionIds.push(admittedClaims.jti);
      return new Response(
        JSON.stringify(
          runtimeEnvelope(
            admittedClaims,
            "active",
            "executive_session_verified",
          ),
        ),
        { status: 201 },
      );
    }
    if (path === `/runtime/executive-sessions/${admittedClaims.sid}`) {
      assert.equal(options.method, "GET");
      const readClaims = decodeAssertion(
        options.headers[HUMAN_SESSION_ASSERTION_HEADER],
      );
      assertionIds.push(readClaims.jti);
      assert.equal(readClaims.sid, admittedClaims.sid);
      assert.deepEqual(readClaims.scopes, [
        "executive_session.read",
        "executive_session.revoke",
      ]);
      assert.equal(options.body, undefined);
      return new Response(
        JSON.stringify(runtimeEnvelope(admittedClaims, "active", "ok")),
        { status: 200 },
      );
    }
    if (
      path ===
      `/runtime/executive-sessions/${admittedClaims.sid}/revoke`
    ) {
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), {
        reason: "user_requested_session_revocation",
      });
      const revokeClaims = decodeAssertion(
        options.headers[HUMAN_SESSION_ASSERTION_HEADER],
      );
      assertionIds.push(revokeClaims.jti);
      assert.equal(revokeClaims.sid, admittedClaims.sid);
      return new Response(
        JSON.stringify(
          runtimeEnvelope(
            revokeClaims,
            "revoked",
            "executive_session_revoked",
          ),
        ),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected Runtime path: ${path}`);
  };

  const base = await start(runtimeFetch);
  const login = await fetch(`${base}/api/executive-session/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      "X-Replit-User-Id": "attacker-selected-human",
      "X-NEXUS-Tenant-ID": "attacker-tenant",
      "X-NEXUS-Workspace-ID": "attacker-workspace",
      "X-NEXUS-Role": "admin",
      "X-NEXUS-Scopes": "actions:execute",
    },
    body: "{}",
  });
  assert.equal(login.status, 201);
  const loginBody = await login.json();
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];
  assert.equal(loginBody.session.state, "active");
  assert.equal(
    loginBody.session.humanIdentity.principalId,
    registration.principalId,
  );
  assert.equal(
    loginBody.session.serviceIdentity.principalId,
    "command-portal-experience-gateway",
  );
  assert.equal(
    loginBody.session.serviceIdentity.distinctFromHumanPrincipal,
    true,
  );
  assert.deepEqual(loginBody.session.scopeBinding, {
    tenantId: "nexicron",
    workspaceId: "primary",
    selectionOwner: "server_registration_and_runtime",
    clientControlled: false,
    exactRuntimeMatch: true,
  });
  assert.equal(loginBody.session.role, "executive");
  assert.deepEqual(loginBody.session.scopes, EXECUTIVE_SCOPES);
  assert.equal(loginBody.session.authorityBoundary.authorityGranted, false);
  assert.equal(loginBody.session.authorityBoundary.actionAuthorized, false);
  assert.equal(
    loginBody.session.authorityBoundary.missionExecutionAdmitted,
    false,
  );
  assert.equal(loginBody.sessionAccess.providerTokenRetained, false);
  assert.equal(loginBody.sessionAccess.providerSubjectRetained, false);
  assert.equal(loginBody.executiveSession.authenticationGrantsAuthority, false);
  const serializedLogin = JSON.stringify(loginBody);
  assert.equal(serializedLogin.includes(RAW_PROVIDER_SUBJECT), false);
  assert.equal(
    serializedLogin.includes(registration.providerSubjectBinding),
    false,
  );
  assert.equal(serializedLogin.includes(HUMAN_ASSERTION_SECRET), false);
  assert.equal(serializedLogin.includes(RUNTIME_TOKEN), false);

  const read = await fetch(`${base}/api/executive-session`, {
    headers: { Cookie: cookie },
  });
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.session.state, "active");
  assert.equal(readBody.executiveSession.runtimeVerified, true);

  const revoke = await fetch(`${base}/api/executive-session/revoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: base,
      "X-CSRF-Token": loginBody.sessionAccess.csrfToken,
    },
    body: "{}",
  });
  assert.equal(revoke.status, 200);
  const revokeBody = await revoke.json();
  assert.equal(revokeBody.session.state, "revoked");
  assert.equal(
    revokeBody.session.replayAndRevocation.revocationCheckpoint,
    1,
  );
  assert.match(revoke.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(new Set(assertionIds).size, 3);
  assert.deepEqual(
    calls.map((call) => call.path),
    [
      "/runtime/executive-sessions/verify",
      `/runtime/executive-sessions/${admittedClaims.sid}`,
      `/runtime/executive-sessions/${admittedClaims.sid}/revoke`,
    ],
  );

  const afterRevocation = await fetch(`${base}/api/executive-session`, {
    headers: { Cookie: cookie },
  });
  assert.equal(afterRevocation.status, 200);
  assert.equal((await afterRevocation.json()).session.authenticated, false);
  assert.match(afterRevocation.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(calls.length, 3);
});

test("route boundary rejects client-controlled claims, unregistered humans, invalid methods, CSRF failures, and Runtime rejection without mutation", async () => {
  let runtimeCalls = 0;
  const runtimeFetch = async () => {
    runtimeCalls += 1;
    return new Response(
      JSON.stringify({
        status: "rejected",
        timestamp: timestamp(BASE_TIME_SECONDS),
        schemaVersion: "1.0.0",
        runtimeVersion: "0.1.0",
        proofIds: [],
        limitations: [],
        data: {
          reasonCode: "assertion_replay",
          reason: "unsafe upstream detail must not be reflected",
          rejectedRequestMutatedState: false,
          authorityGranted: false,
          actionAuthorized: false,
          secretValuesExposed: false,
        },
        secretValuesExposed: false,
      }),
      { status: 409 },
    );
  };
  const base = await start(runtimeFetch);

  for (const origin of [undefined, "https://attacker.example"]) {
    const denied = await fetch(`${base}/api/executive-session/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: "{}",
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, "origin_denied");
  }
  assert.equal(runtimeCalls, 0);

  const smuggled = await fetch(`${base}/api/executive-session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      tenantId: "attacker-tenant",
      workspaceId: "attacker-workspace",
      role: "admin",
      scopes: ["actions:execute"],
    }),
  });
  assert.equal(smuggled.status, 400);
  assert.equal(runtimeCalls, 0);

  const replayed = await fetch(`${base}/api/executive-session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: "{}",
  });
  assert.equal(replayed.status, 409);
  const replayedBody = await replayed.json();
  assert.equal(replayedBody.error.code, "assertion_replay");
  assert.equal(
    replayedBody.error.message,
    "The Runtime rejected the Registered Executive session.",
  );
  assert.equal(
    JSON.stringify(replayedBody).includes("unsafe upstream detail"),
    false,
  );

  const wrongMethod = await fetch(`${base}/api/executive-session/login`);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");

  const unknown = await fetch(`${base}/api/executive-session/unknown`);
  assert.equal(unknown.status, 404);

  const noSessionRevoke = await fetch(
    `${base}/api/executive-session/revoke`,
    { method: "POST", headers: { Origin: base }, body: "{}" },
  );
  assert.equal(noSessionRevoke.status, 401);

  const unregisteredBase = await start(
    async () => {
      throw new Error("Runtime must not be called.");
    },
    async () => providerIdentity({ subject: "unregistered-subject" }),
  );
  const unregistered = await fetch(
    `${unregisteredBase}/api/executive-session/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: unregisteredBase,
      },
      body: "{}",
    },
  );
  assert.equal(unregistered.status, 403);
  assert.equal(
    (await unregistered.json()).error.code,
    "executive_registration_required",
  );
});

test("revoke requires the in-memory CSRF binding before any fresh Runtime assertion is sent", async () => {
  let admittedClaims;
  let runtimeCalls = 0;
  const runtimeFetch = async (url, options) => {
    runtimeCalls += 1;
    assert.equal(
      new URL(url).pathname,
      "/runtime/executive-sessions/verify",
    );
    admittedClaims = decodeAssertion(
      options.headers[HUMAN_SESSION_ASSERTION_HEADER],
    );
    return new Response(
      JSON.stringify(
        runtimeEnvelope(
          admittedClaims,
          "active",
          "executive_session_verified",
        ),
      ),
      { status: 201 },
    );
  };
  const base = await start(runtimeFetch);
  const login = await fetch(`${base}/api/executive-session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: "{}",
  });
  assert.equal(login.status, 201);
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];
  const denied = await fetch(`${base}/api/executive-session/revoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: base,
      "X-CSRF-Token": "forged-csrf-token",
    },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "csrf_invalid");
  assert.equal(runtimeCalls, 1);

  const query = await fetch(
    `${base}/api/executive-session?tenantId=attacker`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(query.status, 400);
  assert.equal((await query.json()).error.code, "query_not_allowed");
  assert.equal(runtimeCalls, 1);
});

test("Runtime session projection validation fails closed across identity, service, scope, role, policy, lifecycle, replay, revocation, and Authority boundaries", () => {
  const { config, claims } = assertionClaims();
  const base = runtimeEnvelope(
    claims,
    "active",
    "executive_session_verified",
  );
  assert.equal(
    validateRuntimeExecutiveSessionEnvelope(
      base,
      claims,
      config,
      "active",
      "executive_session_verified",
    ).sessionId,
    claims.sid,
  );

  const mutations = [
    (session) => {
      session.humanIdentity.principalId = "forged-human";
    },
    (session) => {
      session.humanIdentity.providerSubjectBinding =
        registration.providerSubjectBinding;
    },
    (session) => {
      session.serviceIdentity.principalId = claims.principalId;
      session.serviceIdentity.distinctFromHumanPrincipal = false;
    },
    (session) => {
      session.serviceIdentity.authenticatedBeforeHumanAssertion = false;
    },
    (session) => {
      session.scopeBinding.tenantId = "other-tenant";
    },
    (session) => {
      session.scopeBinding.workspaceId = "other-workspace";
    },
    (session) => {
      session.role = "admin";
    },
    (session) => {
      session.scopes = ["executive_session.read"];
    },
    (session) => {
      session.policyBinding.policyId = "other-policy";
    },
    (session) => {
      session.policyBinding.policyVersion = "2.0.0";
    },
    (session) => {
      session.policyBinding.policyDigest = `sha256:${"d".repeat(64)}`;
    },
    (session) => {
      session.assertionBinding.algorithm = "none";
    },
    (session) => {
      session.assertionBinding.keyId = "other-key";
    },
    (session) => {
      session.assertionBinding.issuer = "other-issuer";
    },
    (session) => {
      session.assertionBinding.audience = "other-audience";
    },
    (session) => {
      session.assertionBinding.serviceBindingId = "other-service";
    },
    (session) => {
      session.lifecycle.sessionVersion = 2;
    },
    (session) => {
      session.lifecycle.maximumSessionLifetimeSeconds = 3_599;
    },
    (session) => {
      session.replayAndRevocation.assertionReplayState = "admitted_reuse";
    },
    (session) => {
      session.replayAndRevocation.revocationCheckpoint = 1;
    },
    (session) => {
      session.authorityBoundary.authorityGranted = true;
    },
    (session) => {
      session.authorityBoundary.actionAuthorized = true;
    },
    (session) => {
      session.authorityBoundary.missionExecutionAdmitted = true;
    },
    (session) => {
      session.authorityBoundary.decisionRef = "DECISION-FORGED";
    },
    (session) => {
      session.receipt.postconditionVerified = false;
    },
    (session) => {
      session.receipt.rawProviderSubjectRetained = true;
    },
    (session) => {
      session.secretValuesExposed = true;
    },
  ];

  for (const mutate of mutations) {
    const candidate = structuredClone(base);
    mutate(candidate.data.session);
    assert.throws(
      () =>
        validateRuntimeExecutiveSessionEnvelope(
          candidate,
          claims,
          config,
          "active",
          "executive_session_verified",
        ),
      (error) =>
        error.code === "executive_session_runtime_response_invalid",
    );
  }
});

test("Runtime client creates a fresh assertion for verify/read/revoke and classifies expiry, revocation, replay, timeout, and malformed responses", async () => {
  const { config, claims } = assertionClaims();
  const assertionIds = [];
  let mode = "active";
  const runtimeFetch = async (url, options) => {
    const path = new URL(url).pathname;
    const requestClaims = decodeAssertion(
      options.headers[HUMAN_SESSION_ASSERTION_HEADER],
    );
    assertionIds.push(requestClaims.jti);
    assert.equal(requestClaims.sid, claims.sid);
    assert.deepEqual(requestClaims.scopes, EXECUTIVE_SCOPES);
    if (mode === "timeout") {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }
    if (mode === "malformed") {
      return new Response("{", { status: 200 });
    }
    if (mode === "oversized") {
      return new Response(new Uint8Array(1_048_577), { status: 200 });
    }
    if (mode === "replay") {
      return new Response(
        JSON.stringify({
          status: "rejected",
          timestamp: timestamp(BASE_TIME_SECONDS),
          schemaVersion: "1.0.0",
          runtimeVersion: "0.1.0",
          proofIds: [],
          limitations: [],
          data: {
            reasonCode: "assertion_replay",
            reason: "already used",
          },
          secretValuesExposed: false,
        }),
        { status: 409 },
      );
    }
    const state = mode;
    const status = path.endsWith("/verify")
      ? "executive_session_verified"
      : path.endsWith("/revoke")
        ? "executive_session_revoked"
        : "ok";
    return new Response(
      JSON.stringify(runtimeEnvelope(claims, state, status)),
      { status: path.endsWith("/verify") ? 201 : 200 },
    );
  };
  const client = createExecutiveSessionRuntimeClient(
    { ...config, timeoutMs: 20 },
    { runtimeFetch, clock },
  );

  assert.equal((await client.verify(claims)).state, "active");
  assert.equal((await client.get(claims)).state, "active");
  mode = "revoked";
  assert.equal((await client.revoke(claims)).state, "revoked");
  assert.equal(new Set(assertionIds).size, 3);

  mode = "expired";
  await assert.rejects(
    client.get(claims),
    (error) => error.code === "session_expired",
  );
  mode = "revoked";
  await assert.rejects(
    client.get(claims),
    (error) => error.code === "session_revoked",
  );
  mode = "replay";
  await assert.rejects(
    client.get(claims),
    (error) => error.code === "assertion_replay",
  );
  mode = "malformed";
  await assert.rejects(
    client.get(claims),
    (error) =>
      error.code === "executive_session_runtime_response_invalid",
  );
  mode = "oversized";
  await assert.rejects(
    client.get(claims),
    (error) =>
      error.code === "executive_session_runtime_response_too_large",
  );
  mode = "timeout";
  await assert.rejects(
    client.get(claims),
    (error) => error.code === "executive_session_runtime_timed_out",
  );
});

test("configuration pins the accepted policy and purpose-bound identities and rejects trust or registration drift", () => {
  assert.equal(
    loadConfig(configOverrides()).executiveSessionPolicyDigest,
    EXECUTIVE_SESSION_POLICY_DIGEST,
  );
  const invalidOverrides = [
    { operationalCookieSecure: false },
    { executiveSessionPolicyId: "other-policy" },
    { executiveSessionPolicyVersion: "2.0.0" },
    { executiveSessionPolicyDigest: `sha256:${"e".repeat(64)}` },
    { humanSessionAssertionKeyId: "other-key" },
    { humanSessionAssertionIssuer: "other-issuer" },
    { humanSessionAssertionAudience: "other-audience" },
    { humanSessionServiceBindingId: "other-service" },
    { humanSessionAssertionClientId: "other-client" },
    {
      humanSessionAssertionSecret:
        "mission-one-context-assertion-secret-material-00001",
    },
    {
      executiveRegistrations: {
        ...registryDocument,
        principals: [
          {
            ...registration,
            principalId: "command-portal-experience-gateway",
          },
        ],
      },
    },
  ];
  for (const mutation of invalidOverrides) {
    assert.throws(() => loadConfig(configOverrides(mutation)));
  }

  for (const registrationMutation of [
    { tenantId: "other-tenant" },
    { workspaceId: "other-workspace" },
    { policyId: "other-policy" },
    { policyVersion: "2.0.0" },
    { policyDigest: `sha256:${"f".repeat(64)}` },
  ]) {
    assert.throws(() =>
      loadConfig(
        configOverrides({
          executiveRegistrations: {
            ...registryDocument,
            principals: [{ ...registration, ...registrationMutation }],
          },
        }),
      ));
  }
});

test("managed Replit configuration derives provider trust only from canonical issuer and REPL_ID", () => {
  const managedIssuer = "https://replit.com/oidc";
  const managedAudience = "repl-managed-nonproduction";
  const managedRegistration = {
    ...registration,
    providerIssuer: managedIssuer,
    providerSubjectBinding: providerSubjectBinding(
      "replit-auth",
      managedIssuer,
      RAW_PROVIDER_SUBJECT,
    ),
  };
  const managedOverrides = {
    replitDeployment: true,
    replitId: managedAudience,
    replitDomains: "portal.example.replit.app",
    replitAuthIssuer: managedIssuer,
    replitAuthAudience: managedAudience,
    executiveRegistrations: {
      ...registryDocument,
      principals: [managedRegistration],
    },
  };
  const managed = loadConfig(configOverrides(managedOverrides));
  assert.equal(managed.replitAuthIssuer, managedIssuer);
  assert.equal(managed.replitAuthAudience, managed.replitId);

  for (const mutation of [
    { replitAuthAudience: "forged-audience" },
    { replitId: "" },
    { replitId: "-malformed-provider-resource" },
  ]) {
    assert.throws(() =>
      loadConfig(configOverrides({
        ...managedOverrides,
        ...mutation,
      })),
    );
  }

  const forgedIssuer = "https://forged-issuer.example";
  assert.throws(() =>
    loadConfig(configOverrides({
      ...managedOverrides,
      replitAuthIssuer: forgedIssuer,
      executiveRegistrations: {
        ...registryDocument,
        principals: [{
          ...managedRegistration,
          providerIssuer: forgedIssuer,
          providerSubjectBinding: providerSubjectBinding(
            "replit-auth",
            forgedIssuer,
            RAW_PROVIDER_SUBJECT,
          ),
        }],
      },
    })),
  );
});
