import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXECUTIVE_SESSION_POLICY_DIGEST,
  EXECUTIVE_PRINCIPAL_TYPE,
  EXECUTIVE_REGISTRY_CONTRACT,
  EXECUTIVE_REGISTRY_RECORD_TYPE,
  EXECUTIVE_SCOPES,
  providerSubjectBinding,
} from "../server/executive-session.mjs";
import {
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
  timeoutMs: 1_000,
  maxAttempts: 1,
  retryDelayMs: 0,
  ...overrides,
});

const fakeOidc = () => {
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
    async exchange({ state, nonce, codeVerifier }) {
      calls.push(["exchange", state, nonce, codeVerifier]);
      return {
        issuer: PROVIDER_ISSUER,
        audience: REPL_ID,
        subject: RAW_PROVIDER_SUBJECT,
        authnTime: BASE_TIME_SECONDS - 10,
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
    clock,
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

test("callback reduces the provider subject to the opaque binding and never retains it", async () => {
  const server = await startServer();
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
    assert.equal(callback.headers.get("location"), "/");
    const session = cookieValue(
      callback.headers.getSetCookie(),
      PROVIDER_SESSION_COOKIE_NAME,
    );
    assert.ok(session);
    const payload = JSON.parse(
      Buffer.from(session.split(".")[0], "base64url").toString("utf8"),
    );
    assert.equal(payload.binding, registration.providerSubjectBinding);
    assert.ok(!JSON.stringify(payload).includes(RAW_PROVIDER_SUBJECT));
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

test("tampered session payloads fail signature verification", () => {
  const config = loadConfig(configOverrides());
  const service = createProviderSessionService(config, { clock });
  const cookie = service
    .issueCookie(registration.providerSubjectBinding, BASE_TIME_SECONDS - 5)
    .split(";")[0]
    .slice(PROVIDER_SESSION_COOKIE_NAME.length + 1);
  const [encoded, signature] = cookie.split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
      expiresAt: BASE_TIME_SECONDS + 999_999,
    }),
  ).toString("base64url");
  const request = (value) => ({
    headers: { cookie: `${PROVIDER_SESSION_COOKIE_NAME}=${value}` },
  });
  assert.ok(service.readSession(request(cookie)));
  assert.equal(
    service.readSession(request(`${tamperedPayload}.${signature}`)),
    null,
  );
  assert.equal(service.readSession(request(`${encoded}.AAAA`)), null);
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

test("logout clears the provider session and redirects to provider end-session", async () => {
  const server = await startServer();
  try {
    const response = await fetch(serverUrl(server, "/api/auth/logout"), {
      redirect: "manual",
      headers: { host: "127.0.0.1" },
    });
    assert.equal(response.status, 303);
    assert.match(
      response.headers.get("location"),
      /^https:\/\/replit\.com\/oidc\/session\/end/,
    );
    const cleared = response.headers
      .getSetCookie()
      .find((item) => item.startsWith(`${PROVIDER_SESSION_COOKIE_NAME}=`));
    assert.match(cleared, /Max-Age=0/);
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
    /SESSION_SECRET/,
  );
  assert.throws(
    () =>
      loadConfig(
        configOverrides({ replitAuthAudience: "not-the-repl-id-audience" }),
      ),
    /REPL_ID audience/,
  );
});
