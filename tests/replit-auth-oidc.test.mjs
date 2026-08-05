import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeHumanSessionAssertionForTest,
  EXECUTIVE_SESSION_POLICY_DIGEST,
  EXECUTIVE_PRINCIPAL_TYPE,
  EXECUTIVE_REGISTRY_CONTRACT,
  EXECUTIVE_REGISTRY_RECORD_TYPE,
  EXECUTIVE_SCOPES,
  HUMAN_SESSION_ASSERTION_HEADER,
  providerSubjectBinding,
} from "../server/executive-session.mjs";
import {
  createDefaultReplitOidcClient,
  createProviderSessionIdentityVerifier,
  createProviderSessionService,
  createReplitAuthInteractiveHandler,
  PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
  PROVIDER_SESSION_COOKIE_NAME,
} from "../server/replit-auth-oidc.mjs";
import { createPortalServer, loadConfig } from "../server/portal-server.mjs";

const BASE_TIME_SECONDS = Math.floor(
  Date.parse("2026-07-30T12:00:00Z") / 1_000,
);
const clock = () => BASE_TIME_SECONDS * 1_000;
const RAW_PROVIDER_SUBJECT = "interactive-provider-subject-never-retained";
const PROVIDER_ISSUER = "https://replit.com/oidc";
const REPL_ID = "provider-owned-repl-identifier-0001";
const PROVIDER_SESSION_SECRET =
  "interactive-provider-session-secret-material-0001";

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
  authenticationMethods: ["replit-auth"],
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
  runtimeToken: "mission-one-runtime-service-token-material-0000001",
  runtimeTokenRef: "secret-manager:experience/runtime-read-current",
  runtimeTokenKeyId: "runtime-read-current",
  trustBootstrapRequired: true,
  contextAssertionSecret:
    "mission-one-context-assertion-secret-material-00001",
  contextAssertionSecretRef:
    "secret-manager:experience/context-assertion-command-portal-v1",
  contextAssertionKeyId: "context-assertion-command-portal-v1",
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
  humanSessionAssertionSecret:
    "mission-three-human-assertion-secret-material-0001",
  humanSessionAssertionSecretRef:
    "secret-manager:experience/executive-session-current",
  humanSessionAssertionKeyId: "executive-session-current",
  humanSessionAssertionIssuer: "command-portal-experience-gateway",
  humanSessionAssertionAudience: "nexus-runtime",
  humanSessionServiceBindingId: "command-portal-experience-gateway",
  humanSessionAssertionClientId: "nexus-web",
  humanSessionAssertionTtlSeconds: 60,
  replitId: REPL_ID,
  replitAuthIssuer: PROVIDER_ISSUER,
  replitAuthAudience: REPL_ID,
  replitAuthJwksUrl: "",
  replitAuthClockSkewSeconds: 30,
  replitAuthMaxTokenLifetimeSeconds: 3_600,
  replitAuthJwksTimeoutMs: 1_000,
  replitAuthJwksCacheSeconds: 300,
  executiveSessionPolicyId: "registered-executive-session-policy",
  executiveSessionPolicyVersion: "1.0.0",
  executiveSessionPolicyDigest: EXECUTIVE_SESSION_POLICY_DIGEST,
  executiveRegistrations: registryDocument,
  providerInteractiveAuthEnabled: true,
  providerSessionSecret: PROVIDER_SESSION_SECRET,
  providerSessionSecretRef:
    "secret-manager:experience/provider-session-current",
  providerSessionKeyId: "provider-session-current",
  timeoutMs: 1_000,
  maxAttempts: 1,
  retryDelayMs: 0,
  ...overrides,
});

const fakeOidc = (identityOverrides = {}) => {
  const calls = [];
  return {
    calls,
    async authorizationRedirect({ redirectUri }) {
      calls.push(["authorize", redirectUri]);
      return {
        url: `${PROVIDER_ISSUER}/auth?client_id=${REPL_ID}`,
        state: "state-token-value-0001",
        nonce: "nonce-token-value-0001",
        codeVerifier: "verifier-token-value-000000000000000001",
      };
    },
    async exchange({ currentUrl, state, nonce, codeVerifier }) {
      calls.push(["exchange", currentUrl, state, nonce, codeVerifier]);
      return {
        issuer: PROVIDER_ISSUER,
        audience: REPL_ID,
        subject: RAW_PROVIDER_SUBJECT,
        authnTime: BASE_TIME_SECONDS - 10,
        ...identityOverrides,
      };
    },
    endSessionUrl({ postLogoutRedirectUri }) {
      return `${PROVIDER_ISSUER}/session/end?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;
    },
  };
};

function startServer(overrides = {}, options = {}) {
  const server = createPortalServer({
    config: configOverrides(overrides),
    clock: options.clock ?? clock,
    runtimeFetch: options.runtimeFetch
      ?? (async () => {
        throw new Error("Runtime must not be reached in this test.");
      }),
    providerInteractiveOidc: options.oidc ?? fakeOidc(),
    ...options.serverOptions,
  });
  return new Promise((resolveStart) => {
    server.listen(0, "127.0.0.1", () => resolveStart(server));
  });
}

const serverUrl = (server, path) =>
  `http://127.0.0.1:${server.address().port}${path}`;

const stop = (server) =>
  new Promise((resolveStop) => server.close(resolveStop));

function cookieValue(setCookieHeaders, name) {
  for (const header of setCookieHeaders) {
    if (header.startsWith(`${name}=`)) {
      return header.split(";")[0].slice(name.length + 1);
    }
  }
  return "";
}

const timestamp = (seconds) => new Date(seconds * 1_000).toISOString();

function runtimeVerificationEnvelope(assertion) {
  const session = {
    recordType: "nexus_registered_executive_session",
    schemaVersion: "nexus.registered-executive-session@1.0.0",
    sessionId: assertion.sid,
    state: "active",
    humanIdentity: {
      registrationId: assertion.registrationId,
      principalId: assertion.principalId,
      principalType: "registered_human_executive",
      provider: assertion.provider,
      providerIssuer: assertion.providerIssuer,
      providerSubjectBinding:
        "server_verified_opaque_subject_to_preprovisioned_registration",
      providerSubjectClientControlled: false,
      providerSubjectRetained: false,
      providerAssertionVerified: true,
      humanVerified: true,
      authenticationMethods: [...assertion.authenticationMethods],
      authenticationTime: timestamp(assertion.authenticationTime),
    },
    serviceIdentity: {
      principalId: "command-portal-experience-gateway",
      principalType: "experience_gateway_service",
      authenticationMethod: "bound_service_credential",
      authenticatedBeforeHumanAssertion: true,
      distinctFromHumanPrincipal: true,
    },
    scopeBinding: {
      tenantId: assertion.tid,
      workspaceId: assertion.wid,
      selectionOwner: "server_registration_and_runtime",
      clientControlled: false,
      exactRuntimeMatch: true,
    },
    role: assertion.role,
    scopes: [...assertion.scopes],
    policyBinding: {
      policyId: assertion.policyId,
      policyVersion: assertion.policyVersion,
      policyDigest: assertion.policyDigest,
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
      sessionVersion: assertion.sessionVersion,
      authenticatedAt: timestamp(assertion.authenticationTime),
      issuedAt: timestamp(assertion.sessionIssuedAt),
      expiresAt: timestamp(assertion.sessionExpiresAt),
      revokedAt: null,
      maximumSessionLifetimeSeconds: 3_600,
      bounded: true,
    },
    replayAndRevocation: {
      assertionReplayState: "admitted_single_use",
      sessionReplayRef: "EXEC-SESSION-REPLAY-BOOTSTRAP-1",
      revocationState: "active",
      revocationCheckpoint: assertion.revocationCheckpoint,
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
      receiptId: "EXEC-SESSION-RECEIPT-BOOTSTRAP-1",
      receiptDigest: `sha256:${"c".repeat(64)}`,
      accountabilityRef:
        `accountability:executive-session/${assertion.sid}`,
      replayRef: "EXEC-SESSION-REPLAY-BOOTSTRAP-1",
      postconditionVerified: true,
      credentialMaterialRetained: false,
      rawProviderSubjectRetained: false,
    },
    secretValuesExposed: false,
  };
  return {
    status: "executive_session_verified",
    timestamp: timestamp(BASE_TIME_SECONDS),
    schemaVersion: "1.0.0",
    runtimeVersion: "0.1.0",
    proofIds: [],
    limitations: [],
    data: { session },
    secretValuesExposed: false,
  };
}

test("interactive login redirects to the provider with a bound transaction cookie", async () => {
  const server = await startServer();
  try {
    const response = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
    });
    assert.equal(response.status, 303);
    assert.match(
      response.headers.get("location"),
      /^https:\/\/replit\.com\/oidc\/auth/,
    );
    const cookies = response.headers.getSetCookie();
    const transaction = cookieValue(
      cookies,
      PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
    );
    assert.ok(transaction.includes("."));
    const header = cookies.find((item) =>
      item.startsWith(`${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=`),
    );
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Lax/);
    assert.match(header, /Secure/);
  } finally {
    await stop(server);
  }
});

test("default OIDC adapter binds PKCE, nonce, state, max-age, timeout, and byte ceiling", async () => {
  const customFetch = Symbol("customFetch");
  let discoveryArguments;
  let authorizationParameters;
  let grantArguments;
  const clientModule = {
    customFetch,
    async discovery(...args) {
      discoveryArguments = args;
      return { discovered: true };
    },
    randomPKCECodeVerifier: () =>
      "verifier-token-value-000000000000000001",
    randomState: () => "state-token-value-0001",
    randomNonce: () => "nonce-token-value-0001",
    calculatePKCECodeChallenge: async () =>
      "challenge-token-value-0001",
    buildAuthorizationUrl(_configuration, parameters) {
      authorizationParameters = parameters;
      return new URL(`${PROVIDER_ISSUER}/auth`);
    },
    async authorizationCodeGrant(
      configuration,
      currentUrl,
      checks,
    ) {
      grantArguments = { configuration, currentUrl, checks };
      return {
        claims: () => ({
          iss: PROVIDER_ISSUER,
          aud: REPL_ID,
          sub: RAW_PROVIDER_SUBJECT,
          auth_time: BASE_TIME_SECONDS - 10,
        }),
      };
    },
    buildEndSessionUrl: () =>
      new URL(`${PROVIDER_ISSUER}/session/end`),
  };
  const adapter = await createDefaultReplitOidcClient(
    loadConfig(configOverrides()),
    {
      clientModule,
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    },
  );
  assert.equal(discoveryArguments[0].href, PROVIDER_ISSUER);
  assert.equal(discoveryArguments[1], REPL_ID);
  assert.equal(discoveryArguments[4].timeout, 1);
  assert.equal(
    typeof discoveryArguments[4][customFetch],
    "function",
  );
  const boundedResponse = await discoveryArguments[4][customFetch](
    "https://provider.invalid/configuration",
    {},
  );
  assert.deepEqual(await boundedResponse.json(), { ok: true });

  await assert.rejects(
    createDefaultReplitOidcClient(
      loadConfig(configOverrides()),
      {
        clientModule: {
          ...clientModule,
          async discovery(...args) {
            await args[4][customFetch](
              "https://provider.invalid/oversized",
              {},
            );
            return { discovered: true };
          },
        },
        fetchImpl: async () =>
          new Response("bounded", {
            status: 200,
            headers: { "Content-Length": "1048577" },
          }),
      },
    ),
    /exceeded the bounded size/,
  );

  const redirectPlan = await adapter.authorizationRedirect({
    redirectUri:
      "https://command-portal.replit.app/api/auth/callback",
  });
  assert.equal(authorizationParameters.max_age, 300);
  assert.equal(authorizationParameters.state, redirectPlan.state);
  assert.equal(authorizationParameters.nonce, redirectPlan.nonce);
  assert.equal(authorizationParameters.code_challenge_method, "S256");
  assert.equal(
    authorizationParameters.code_challenge,
    "challenge-token-value-0001",
  );
  const identity = await adapter.exchange({
    currentUrl:
      "https://command-portal.replit.app/api/auth/callback?code=value",
    state: redirectPlan.state,
    nonce: redirectPlan.nonce,
    codeVerifier: redirectPlan.codeVerifier,
  });
  assert.equal(grantArguments.checks.expectedState, redirectPlan.state);
  assert.equal(grantArguments.checks.expectedNonce, redirectPlan.nonce);
  assert.equal(
    grantArguments.checks.pkceCodeVerifier,
    redirectPlan.codeVerifier,
  );
  assert.equal(grantArguments.checks.maxAge, 300);
  assert.equal(identity.subject, RAW_PROVIDER_SUBJECT);
});

test("callback reduces the provider subject to the opaque binding and never retains it", async () => {
  const oidc = fakeOidc();
  const server = await startServer({}, { oidc });
  try {
    const login = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
    });
    const transaction = cookieValue(
      login.headers.getSetCookie(),
      PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
    );
    const callback = await fetch(
      serverUrl(
        server,
        "/api/auth/callback?code=authorization-code&state=state-token-value-0001",
      ),
      {
        redirect: "manual",
        headers: {
          cookie: `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${transaction}`,
        },
      },
    );
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/settings");
    assert.deepEqual(oidc.calls[1], [
      "exchange",
      `${serverUrl(server, "")}/api/auth/callback?code=authorization-code&state=state-token-value-0001`,
      "state-token-value-0001",
      "nonce-token-value-0001",
      "verifier-token-value-000000000000000001",
    ]);
    const session = cookieValue(
      callback.headers.getSetCookie(),
      PROVIDER_SESSION_COOKIE_NAME,
    );
    assert.ok(session);
    const serverSession =
      server.experienceGateway.providerInteractiveAuth.sessionService
        .readSession({
          headers: {
            cookie: `${PROVIDER_SESSION_COOKIE_NAME}=${session}`,
          },
        });
    assert.equal(
      serverSession.binding,
      registration.providerSubjectBinding,
    );
    for (const segment of session.split(".").slice(1)) {
      const decoded = Buffer.from(segment, "base64url").toString("utf8");
      assert.ok(!decoded.includes("sha256:"));
      assert.ok(!decoded.includes(registration.providerSubjectBinding));
      assert.ok(!decoded.includes(RAW_PROVIDER_SUBJECT));
    }
    assert.ok(!session.includes(registration.providerSubjectBinding));
    assert.ok(!session.includes(RAW_PROVIDER_SUBJECT));
    assert.ok(
      !Buffer.from(session, "utf8").toString("base64").includes(
        Buffer.from(RAW_PROVIDER_SUBJECT).toString("base64"),
      ),
    );
  } finally {
    await stop(server);
  }
});

test("callback rejects missing, future, and stale provider authentication time", async () => {
  for (const authnTime of [
    null,
    BASE_TIME_SECONDS + 1,
    BASE_TIME_SECONDS - 301,
  ]) {
    const server = await startServer(
      {},
      { oidc: fakeOidc({ authnTime }) },
    );
    try {
      const login = await fetch(serverUrl(server, "/api/auth/login"), {
        redirect: "manual",
      });
      const transaction = cookieValue(
        login.headers.getSetCookie(),
        PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
      );
      const callback = await fetch(
        serverUrl(
          server,
          "/api/auth/callback?code=authorization-code&state=state-token-value-0001",
        ),
        {
          redirect: "manual",
          headers: {
            cookie: `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${transaction}`,
          },
        },
      );
      assert.equal(callback.status, 401);
      assert.equal(
        (await callback.json()).error.code,
        "provider_identity_invalid",
      );
    } finally {
      await stop(server);
    }
  }
});

test("callback rejects a mismatched or missing transaction", async () => {
  const server = await startServer();
  try {
    const missing = await fetch(
      serverUrl(server, "/api/auth/callback?code=value&state=state-token-value-0001"),
      { redirect: "manual" },
    );
    assert.equal(missing.status, 401);
    const body = await missing.json();
    assert.equal(body.error.code, "provider_transaction_invalid");
    assert.equal(body.secretValuesExposed, false);

    const login = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
    });
    const transaction = cookieValue(
      login.headers.getSetCookie(),
      PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
    );
    const forgedState = await fetch(
      serverUrl(server, "/api/auth/callback?code=value&state=attacker-state"),
      {
        redirect: "manual",
        headers: {
          cookie: `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${transaction}`,
        },
      },
    );
    assert.equal(forgedState.status, 401);
  } finally {
    await stop(server);
  }
});

test("callback rejects transaction tamper, expiry, and configuration drift", async () => {
  let currentMilliseconds = BASE_TIME_SECONDS * 1_000;
  const source = await startServer(
    {},
    { clock: () => currentMilliseconds },
  );
  let transaction;
  try {
    const login = await fetch(serverUrl(source, "/api/auth/login"), {
      redirect: "manual",
    });
    transaction = cookieValue(
      login.headers.getSetCookie(),
      PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
    );
    const segments = transaction.split(".");
    const first = segments[2][0];
    segments[2] =
      `${first === "A" ? "B" : "A"}${segments[2].slice(1)}`;
    const tampered = await fetch(
      serverUrl(
        source,
        "/api/auth/callback?code=value&state=state-token-value-0001",
      ),
      {
        redirect: "manual",
        headers: {
          cookie:
            `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${segments.join(".")}`,
        },
      },
    );
    assert.equal(tampered.status, 401);

    currentMilliseconds += 301_000;
    const expired = await fetch(
      serverUrl(
        source,
        "/api/auth/callback?code=value&state=state-token-value-0001",
      ),
      {
        redirect: "manual",
        headers: {
          cookie:
            `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${transaction}`,
        },
      },
    );
    assert.equal(expired.status, 401);
  } finally {
    await stop(source);
  }

  const origin = await startServer();
  try {
    const login = await fetch(serverUrl(origin, "/api/auth/login"), {
      redirect: "manual",
    });
    transaction = cookieValue(
      login.headers.getSetCookie(),
      PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
    );
  } finally {
    await stop(origin);
  }
  const changed = await startServer({
    providerSessionKeyId: "provider-session-next",
  });
  try {
    const rejected = await fetch(
      serverUrl(
        changed,
        "/api/auth/callback?code=value&state=state-token-value-0001",
      ),
      {
        redirect: "manual",
        headers: {
          cookie:
            `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${transaction}`,
        },
      },
    );
    assert.equal(rejected.status, 401);
  } finally {
    await stop(changed);
  }
});

test("unauthenticated executive login is refused without a provider session", async () => {
  const server = await startServer();
  try {
    const response = await fetch(
      serverUrl(server, "/api/executive-session/login"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: serverUrl(server, ""),
        },
        body: "{}",
      },
    );
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, "provider_authentication_required");
  } finally {
    await stop(server);
  }
});

test("a provider-authenticated session lets executive login reach registration mapping and runtime verification", async () => {
  let runtimeCalls = 0;
  const server = await startServer({}, {
    runtimeFetch: async () => {
      runtimeCalls += 1;
      throw new Error("Runtime unavailable in this bounded test.");
    },
  });
  try {
    const login = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
    });
    const transaction = cookieValue(
      login.headers.getSetCookie(),
      PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
    );
    const callback = await fetch(
      serverUrl(
        server,
        "/api/auth/callback?code=authorization-code&state=state-token-value-0001",
      ),
      {
        redirect: "manual",
        headers: {
          cookie: `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${transaction}`,
        },
      },
    );
    const session = cookieValue(
      callback.headers.getSetCookie(),
      PROVIDER_SESSION_COOKIE_NAME,
    );
    const executiveLogin = await fetch(
      serverUrl(server, "/api/executive-session/login"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: serverUrl(server, ""),
          cookie: `${PROVIDER_SESSION_COOKIE_NAME}=${session}`,
        },
        body: "{}",
      },
    );
    // Identity verification and registration mapping succeed; establishment
    // then correctly requires the Runtime receipt, which this bounded test
    // does not provide.
    assert.ok(executiveLogin.status !== 401);
    assert.ok(executiveLogin.status !== 403);
    assert.ok(runtimeCalls >= 1);
    const body = await executiveLogin.json();
    assert.ok(!JSON.stringify(body).includes(RAW_PROVIDER_SUBJECT));
  } finally {
    await stop(server);
  }
});

test("published mode uses the interactive OIDC provider session and ignores forged identity headers", async () => {
  const deploymentHost = "command-portal.replit.app";
  const deploymentOrigin = `https://${deploymentHost}`;
  let runtimeCalls = 0;
  const config = loadConfig(
    configOverrides({
      replitDeployment: true,
      replitDomains: deploymentHost,
    }),
  );
  const server = createPortalServer({
    config,
    clock,
    providerInteractiveOidc: fakeOidc(),
    runtimeFetch: async () => {
      runtimeCalls += 1;
      throw new Error("Runtime unavailable in this bounded test.");
    },
  });
  await new Promise((resolveStart) => {
    server.listen(0, "127.0.0.1", resolveStart);
  });
  const proxyHeaders = {
    "x-forwarded-host": deploymentHost,
    "x-forwarded-proto": "https",
  };
  try {
    const login = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
      headers: proxyHeaders,
    });
    assert.equal(login.status, 303);
    const transaction = cookieValue(
      login.headers.getSetCookie(),
      PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
    );
    const callback = await fetch(
      serverUrl(
        server,
        "/api/auth/callback?code=authorization-code&state=state-token-value-0001",
      ),
      {
        redirect: "manual",
        headers: {
          ...proxyHeaders,
          cookie: `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${transaction}`,
        },
      },
    );
    assert.equal(callback.status, 303);
    const providerSession = cookieValue(
      callback.headers.getSetCookie(),
      PROVIDER_SESSION_COOKIE_NAME,
    );
    const executiveLogin = await fetch(
      serverUrl(server, "/api/executive-session/login"),
      {
        method: "POST",
        headers: {
          ...proxyHeaders,
          origin: deploymentOrigin,
          "content-type": "application/json",
          cookie: `${PROVIDER_SESSION_COOKIE_NAME}=${providerSession}`,
          "x-replit-user-id": "forged-browser-controlled-subject",
          "x-replit-user-name": "forged-browser-controlled-name",
        },
        body: "{}",
      },
    );
    assert.ok(executiveLogin.status !== 401);
    assert.ok(executiveLogin.status !== 403);
    assert.ok(runtimeCalls >= 1);

    const forgedHeadersOnly = await fetch(
      serverUrl(server, "/api/executive-session/login"),
      {
        method: "POST",
        headers: {
          ...proxyHeaders,
          origin: deploymentOrigin,
          "content-type": "application/json",
          "x-replit-user-id": RAW_PROVIDER_SUBJECT,
          "x-replit-user-name": "attacker",
        },
        body: "{}",
      },
    );
    assert.equal(forgedHeadersOnly.status, 401);
  } finally {
    await stop(server);
  }
});

test("published callback must return on the transaction's exact HTTPS origin", async () => {
  const deploymentHost = "command-portal.replit.app";
  const oidc = fakeOidc();
  const config = loadConfig(
    configOverrides({
      replitDeployment: true,
      replitDomains: deploymentHost,
    }),
  );
  const server = createPortalServer({
    config,
    clock,
    providerInteractiveOidc: oidc,
  });
  await new Promise((resolveStart) => {
    server.listen(0, "127.0.0.1", resolveStart);
  });
  try {
    const login = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
      headers: {
        "x-forwarded-host": deploymentHost,
        "x-forwarded-proto": "https",
      },
    });
    const transaction = cookieValue(
      login.headers.getSetCookie(),
      PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
    );
    for (const headers of [
      {
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      },
      {
        "x-forwarded-host": deploymentHost,
        "x-forwarded-proto": "http",
      },
    ]) {
      const rejected = await fetch(
        serverUrl(
          server,
          "/api/auth/callback?code=value&state=state-token-value-0001",
        ),
        {
          redirect: "manual",
          headers: {
            ...headers,
            cookie:
              `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${transaction}`,
          },
        },
      );
      assert.equal(rejected.status, 403);
      assert.equal((await rejected.json()).error.code, "origin_denied");
    }
    assert.equal(oidc.calls.length, 1);
  } finally {
    await stop(server);
  }
});

test("provider sign-in can bootstrap while registered executive sessions stay disabled", async () => {
  const config = loadConfig(
    configOverrides({
      executiveSessionEnabled: false,
      executiveSessionCookieSecret: "",
      humanSessionAssertionSecret: "",
      executiveRegistrations: undefined,
    }),
  );
  const server = createPortalServer({
    config,
    clock,
    providerInteractiveOidc: fakeOidc(),
  });
  assert.ok(server.experienceGateway.providerInteractiveAuth);
  assert.equal(server.experienceGateway.executiveProviderAdapter, null);
  await new Promise((resolveStart) => {
    server.listen(0, "127.0.0.1", resolveStart);
  });
  try {
    const providerLogin = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
    });
    assert.equal(providerLogin.status, 303);
    const executiveLogin = await fetch(
      serverUrl(server, "/api/executive-session/login"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: serverUrl(server, ""),
        },
        body: "{}",
      },
    );
    assert.equal(executiveLogin.status, 503);
    const body = await executiveLogin.json();
    assert.equal(body.error.code, "executive_session_disabled");
  } finally {
    await stop(server);
  }
});

test("bootstrap callback cookie survives the fail-closed to final-config Runtime session transition", async () => {
  const bootstrapConfig = loadConfig(
    configOverrides({
      executiveSessionEnabled: false,
      executiveSessionCookieSecret: "",
      humanSessionAssertionSecret: "",
      executiveRegistrations: undefined,
    }),
  );
  const bootstrap = createPortalServer({
    config: bootstrapConfig,
    clock,
    providerInteractiveOidc: fakeOidc(),
  });
  await new Promise((resolveStart) => {
    bootstrap.listen(0, "127.0.0.1", resolveStart);
  });
  let providerSession;
  try {
    const login = await fetch(serverUrl(bootstrap, "/api/auth/login"), {
      redirect: "manual",
    });
    const transaction = cookieValue(
      login.headers.getSetCookie(),
      PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
    );
    const callback = await fetch(
      serverUrl(
        bootstrap,
        "/api/auth/callback?code=authorization-code&state=state-token-value-0001",
      ),
      {
        redirect: "manual",
        headers: {
          cookie: `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${transaction}`,
        },
      },
    );
    assert.equal(callback.status, 303);
    providerSession = cookieValue(
      callback.headers.getSetCookie(),
      PROVIDER_SESSION_COOKIE_NAME,
    );
    assert.ok(providerSession);
  } finally {
    await stop(bootstrap);
  }

  let runtimeVerified = false;
  const finalServer = createPortalServer({
    config: configOverrides(),
    clock,
    providerInteractiveOidc: fakeOidc(),
    runtimeFetch: async (url, options) => {
      assert.equal(
        url,
        "https://runtime.invalid/runtime/executive-sessions/verify",
      );
      assert.equal(
        options.headers.Authorization,
        "Bearer mission-one-runtime-service-token-material-0000001",
      );
      const assertion = decodeHumanSessionAssertionForTest(
        options.headers[HUMAN_SESSION_ASSERTION_HEADER],
      );
      runtimeVerified = true;
      return new Response(
        JSON.stringify(runtimeVerificationEnvelope(assertion)),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  });
  await new Promise((resolveStart) => {
    finalServer.listen(0, "127.0.0.1", resolveStart);
  });
  try {
    const established = await fetch(
      serverUrl(finalServer, "/api/executive-session/login"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: serverUrl(finalServer, ""),
          cookie: `${PROVIDER_SESSION_COOKIE_NAME}=${providerSession}`,
        },
        body: "{}",
      },
    );
    assert.equal(established.status, 201);
    assert.equal(runtimeVerified, true);
    const body = await established.json();
    assert.equal(body.executiveSession.runtimeVerified, true);
    assert.equal(body.session.authorityBoundary.authorityGranted, false);
    assert.equal(body.executiveSession.secretValuesExposed, false);
  } finally {
    await stop(finalServer);
  }
});

test("development login accepts only the exact provider-owned REPLIT_DEV_DOMAIN", async () => {
  const developmentHost = "workspace-command-portal.replit.dev";
  const server = await startServer({ replitDevDomain: developmentHost });
  try {
    const accepted = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
      headers: {
        "x-forwarded-host": developmentHost,
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(accepted.status, 303);

    for (const rejectedHost of [
      `attacker.${developmentHost}`,
      "workspace-command-portal.replit.dev.attacker.example",
      "workspace-command-portal.replit.app",
    ]) {
      const rejected = await fetch(serverUrl(server, "/api/auth/login"), {
        redirect: "manual",
        headers: {
          "x-forwarded-host": rejectedHost,
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(rejected.status, 403);
    }
    for (const forwardedProto of ["", "http"]) {
      const rejected = await fetch(serverUrl(server, "/api/auth/login"), {
        redirect: "manual",
        headers: {
          "x-forwarded-host": developmentHost,
          ...(forwardedProto
            ? { "x-forwarded-proto": forwardedProto }
            : {}),
        },
      });
      assert.equal(rejected.status, 403);
    }
  } finally {
    await stop(server);
  }
});

test("published provider hosts require deployed mode and forwarded HTTPS", async () => {
  const deploymentHost = "command-portal.replit.app";
  for (const [replitDeployment, forwardedProto] of [
    [false, "https"],
    [true, ""],
    [true, "http"],
  ]) {
    const server = await startServer({
      replitDeployment,
      replitDomains: deploymentHost,
    });
    try {
      const rejected = await fetch(serverUrl(server, "/api/auth/login"), {
        redirect: "manual",
        headers: {
          "x-forwarded-host": deploymentHost,
          ...(forwardedProto
            ? { "x-forwarded-proto": forwardedProto }
            : {}),
        },
      });
      assert.equal(rejected.status, 403);
    } finally {
      await stop(server);
    }
  }
});

test("published provider auth ignores legacy allowed-origin fallbacks", async () => {
  const deploymentHost = "command-portal.replit.app";
  const server = await startServer({
    replitDeployment: true,
    replitDomains: deploymentHost,
    allowedOrigins: "https://legacy-alternate.example",
  });
  try {
    const rejected = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
      headers: {
        "x-forwarded-host": "legacy-alternate.example",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).error.code, "origin_denied");
  } finally {
    await stop(server);
  }
});

test("forged provider-session cookies and client-selected identity are rejected", async () => {
  const server = await startServer();
  try {
    const forgedPayload = Buffer.from(
      JSON.stringify({
        v: 1,
        binding: registration.providerSubjectBinding,
        authnTime: BASE_TIME_SECONDS - 5,
        issuedAt: BASE_TIME_SECONDS - 5,
        expiresAt: BASE_TIME_SECONDS + 3_600,
      }),
    ).toString("base64url");
    const forgedCookie = `${forgedPayload}.forged-signature-value`;
    const forged = await fetch(
      serverUrl(server, "/api/executive-session/login"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: serverUrl(server, ""),
          cookie: `${PROVIDER_SESSION_COOKIE_NAME}=${forgedCookie}`,
        },
        body: "{}",
      },
    );
    assert.equal(forged.status, 401);

    const clientSelected = await fetch(
      serverUrl(server, "/api/executive-session/login"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: serverUrl(server, ""),
          "x-replit-user-id": RAW_PROVIDER_SUBJECT,
          "x-replit-user-name": "attacker",
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(clientSelected.status, 401);
  } finally {
    await stop(server);
  }
});

test("provider session is confidential and fails closed on tamper, expiry, and configuration drift", () => {
  const config = loadConfig(configOverrides());
  const service = createProviderSessionService(config, { clock });
  const cookie = service
    .issueCookie(registration.providerSubjectBinding, BASE_TIME_SECONDS - 5)
    .split(";")[0]
    .slice(PROVIDER_SESSION_COOKIE_NAME.length + 1);
  const request = (value) => ({
    headers: { cookie: `${PROVIDER_SESSION_COOKIE_NAME}=${value}` },
  });
  assert.ok(service.readSession(request(cookie)));
  assert.ok(!cookie.includes(registration.providerSubjectBinding));
  const segments = cookie.split(".");
  const first = segments[2][0];
  segments[2] =
    `${first === "A" ? "B" : "A"}${segments[2].slice(1)}`;
  assert.equal(service.readSession(request(segments.join("."))), null);

  const shorterLifetime = createProviderSessionService(
    { ...config, providerSessionTtlSeconds: 600 },
    { clock },
  );
  assert.equal(shorterLifetime.readSession(request(cookie)), null);
  const changedKeyId = createProviderSessionService(
    { ...config, providerSessionKeyId: "provider-session-next" },
    { clock },
  );
  assert.equal(changedKeyId.readSession(request(cookie)), null);
  const changedAudience = createProviderSessionService(
    {
      ...config,
      replitAuthAudience: "different-provider-client",
      replitId: "different-provider-client",
    },
    { clock },
  );
  assert.equal(changedAudience.readSession(request(cookie)), null);
  const expired = createProviderSessionService(config, {
    clock: () =>
      (BASE_TIME_SECONDS + config.providerSessionTtlSeconds + 1) * 1_000,
  });
  assert.equal(expired.readSession(request(cookie)), null);
});

test("provider transaction and provider session cookies cannot substitute for each other", async () => {
  const server = await startServer();
  try {
    const login = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
    });
    const transaction = cookieValue(
      login.headers.getSetCookie(),
      PROVIDER_AUTH_TRANSACTION_COOKIE_NAME,
    );
    const service =
      server.experienceGateway.providerInteractiveAuth.sessionService;
    assert.equal(
      service.readSession({
        headers: {
          cookie: `${PROVIDER_SESSION_COOKIE_NAME}=${transaction}`,
        },
      }),
      null,
    );
    for (const segment of transaction.split(".").slice(1)) {
      const decoded = Buffer.from(segment, "base64url").toString("utf8");
      assert.ok(!decoded.includes("verifier-token-value"));
      assert.ok(!decoded.includes("state-token-value"));
    }
  } finally {
    await stop(server);
  }
});

test("the session verifier emits only the reduced binding", async () => {
  const config = loadConfig(configOverrides());
  const service = createProviderSessionService(config, { clock });
  const cookie = service
    .issueCookie(registration.providerSubjectBinding, BASE_TIME_SECONDS - 5)
    .split(";")[0];
  const verifier = createProviderSessionIdentityVerifier(config, service);
  const identity = await verifier({ headers: { cookie } });
  assert.equal(identity.subject, undefined);
  assert.equal(identity.subjectBinding, registration.providerSubjectBinding);
  assert.equal(identity.provider, "replit-auth");
  await assert.rejects(() => verifier({ headers: {} }));
});

test("provider logout requires same-origin POST and a verified provider session", async () => {
  const server = await startServer();
  try {
    const providerCookie =
      server.experienceGateway.providerInteractiveAuth.sessionService
        .issueCookie(
          registration.providerSubjectBinding,
          BASE_TIME_SECONDS - 5,
        )
        .split(";")[0];
    for (const request of [
      { method: "GET", headers: { cookie: providerCookie } },
      {
        method: "POST",
        headers: { cookie: providerCookie },
      },
      {
        method: "POST",
        headers: {
          cookie: providerCookie,
          origin: "https://attacker.example",
        },
      },
      {
        method: "POST",
        headers: { origin: serverUrl(server, "") },
      },
    ]) {
      const rejected = await fetch(
        serverUrl(server, "/api/auth/logout"),
        {
          ...request,
          redirect: "manual",
        },
      );
      assert.ok([401, 403, 405].includes(rejected.status));
      assert.equal(rejected.headers.get("location"), null);
      assert.equal(rejected.headers.get("set-cookie"), null);
    }
    const response = await fetch(
      serverUrl(server, "/api/auth/logout"),
      {
        method: "POST",
        redirect: "manual",
        headers: {
          cookie: providerCookie,
          origin: serverUrl(server, ""),
        },
      },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(
      body.providerLogoutUrl,
      /^https:\/\/replit\.com\/oidc\/session\/end/,
    );
    assert.equal(body.providerSessionCleared, true);
    assert.equal(body.authorityGranted, false);
    assert.equal(body.secretValuesExposed, false);
    const cleared = response.headers
      .getSetCookie()
      .find((item) => item.startsWith(`${PROVIDER_SESSION_COOKIE_NAME}=`));
    assert.match(cleared, /Max-Age=0/);
  } finally {
    await stop(server);
  }
});

test("provider logout refuses to strand an active Registered Executive session", async () => {
  const server = await startServer();
  try {
    const issued = server.experienceGateway.executiveSessionAuthority.issue(
      {
        provider: "replit-auth",
        issuer: PROVIDER_ISSUER,
        audience: REPL_ID,
        providerSubjectBinding: registration.providerSubjectBinding,
        authnTime: BASE_TIME_SECONDS - 5,
        authnMethods: ["replit-auth"],
      },
      registration,
    );
    const executiveCookie = issued.cookie.split(";")[0];
    const providerCookie =
      server.experienceGateway.providerInteractiveAuth.sessionService
        .issueCookie(
          registration.providerSubjectBinding,
          BASE_TIME_SECONDS - 5,
        )
        .split(";")[0];
    const combinedCookies = `${executiveCookie}; ${providerCookie}`;
    const blocked = await fetch(serverUrl(server, "/api/auth/logout"), {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: combinedCookies,
        origin: serverUrl(server, ""),
      },
    });
    assert.equal(blocked.status, 409);
    assert.equal(
      (await blocked.json()).error.code,
      "executive_session_revocation_required",
    );
    assert.equal(blocked.headers.get("set-cookie"), null);

    server.experienceGateway.executiveSessionAuthority.revoke(issued.claims);
    const afterRevocation = await fetch(
      serverUrl(server, "/api/auth/logout"),
      {
        method: "POST",
        redirect: "manual",
        headers: {
          cookie: combinedCookies,
          origin: serverUrl(server, ""),
        },
      },
    );
    assert.equal(afterRevocation.status, 200);
    assert.match(
      (await afterRevocation.json()).providerLogoutUrl,
      /^https:\/\/replit\.com\/oidc\/session\/end/,
    );
  } finally {
    await stop(server);
  }
});

test("the sanitized session endpoint reports authentication state without identity data", async () => {
  const server = await startServer();
  try {
    const anonymous = await fetch(serverUrl(server, "/api/auth/session"));
    assert.equal(anonymous.status, 200);
    const anonymousBody = await anonymous.json();
    assert.equal(anonymousBody.authenticated, false);
    assert.equal(anonymousBody.secretValuesExposed, false);
    assert.equal(anonymousBody.providerSubjectRetained, false);
    assert.equal(anonymousBody.providerTokenRetained, false);
    assert.equal(anonymousBody.authorityGranted, false);

    const config = loadConfig(configOverrides());
    const service = createProviderSessionService(config, { clock });
    const cookie = service
      .issueCookie(registration.providerSubjectBinding, BASE_TIME_SECONDS - 5)
      .split(";")[0];
    const authenticated = await fetch(serverUrl(server, "/api/auth/session"), {
      headers: { cookie },
    });
    const body = await authenticated.json();
    assert.equal(body.authenticated, true);
    assert.ok(!JSON.stringify(body).includes("sha256:"));
    assert.ok(!JSON.stringify(body).includes(RAW_PROVIDER_SUBJECT));
  } finally {
    await stop(server);
  }
});

test("interactive auth routes stay disabled without opt-in", async () => {
  const server = await startServer({
    providerInteractiveAuthEnabled: false,
    providerSessionSecret: "",
    replitAuthAudience: "nexus-command-nonproduction",
    replitAuthJwksUrl: "https://replit.invalid/jwks",
    replitId: "",
  });
  try {
    const response = await fetch(serverUrl(server, "/api/auth/login"), {
      redirect: "manual",
    });
    assert.equal(response.status, 404);
  } finally {
    await stop(server);
  }
});

test("published Registered Executive sessions reject an interactive-auth downgrade", () => {
  assert.throws(
    () =>
      loadConfig(
        configOverrides({
          replitDeployment: true,
          replitDomains: "command-portal.replit.app",
          providerInteractiveAuthEnabled: false,
          providerSessionSecret: "",
        }),
      ),
    /require the attested interactive Replit Auth path/,
  );
});

test("interactive auth demands the distinct purpose-bound session secret", () => {
  assert.throws(
    () =>
      loadConfig(
        configOverrides({
          providerSessionSecret:
            "mission-three-cookie-signing-secret-material-000001",
        }),
      ),
    /purpose-bound and distinct/,
  );
  assert.throws(
    () => loadConfig(configOverrides({ providerSessionSecret: "short" })),
    /COMMAND_PORTAL_PROVIDER_SESSION_SECRET/,
  );
  assert.throws(
    () => loadConfig(configOverrides({ providerSessionSecretRef: "" })),
    /secret-manager reference/,
  );
  assert.throws(
    () =>
      loadConfig(
        configOverrides({
          operationalEnabled: true,
          operationalRuntimeToken:
            "purpose-bound-operational-runtime-token-material",
          operationalSessionSecret: PROVIDER_SESSION_SECRET,
        }),
      ),
    /purpose-bound and distinct/,
  );
  assert.throws(
    () =>
      loadConfig(
        configOverrides({ replitAuthAudience: "not-the-repl-id-audience" }),
      ),
    /REPL_ID audience/,
  );
});
