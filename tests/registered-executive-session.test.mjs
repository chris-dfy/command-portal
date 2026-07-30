import assert from "node:assert/strict";
import {
  constants as cryptoConstants,
  createHash,
  createHmac,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { test } from "node:test";
import {
  createExecutiveRegistrationMapper,
  createExecutiveSessionAuthority,
  createHumanSessionAssertion,
  createReplitAuthAdapter,
  decodeHumanSessionAssertionForTest,
  EXECUTIVE_PRINCIPAL_TYPE,
  EXECUTIVE_REGISTRY_CONTRACT,
  EXECUTIVE_REGISTRY_RECORD_TYPE,
  EXECUTIVE_SESSION_POLICY_DIGEST,
  EXECUTIVE_SCOPES,
  HUMAN_SESSION_ASSERTION_CONTRACT,
  providerSubjectBinding,
  REGISTERED_EXECUTIVE_SESSION_CONTRACT,
} from "../server/executive-session.mjs";

const BASE_TIME_SECONDS = Math.floor(
  Date.parse("2026-07-30T12:00:00Z") / 1_000,
);
const clock = () => BASE_TIME_SECONDS * 1_000;
const RAW_PROVIDER_SUBJECT = "opaque-replit-provider-subject-9342";
const PROVIDER_ISSUER = "https://replit-auth.example/issuer";
const PROVIDER_AUDIENCE = "nexus-command-nonproduction";
const PROVIDER_KEY_ID = "replit-provider-key-1";
const POLICY_DIGEST = EXECUTIVE_SESSION_POLICY_DIGEST;
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2_048,
});
const providerJwk = (alg = "RS256", overrides = {}) => ({
  ...publicKey.export({ format: "jwk" }),
  kid: PROVIDER_KEY_ID,
  use: "sig",
  alg,
  ...overrides,
});

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
  policyDigest: POLICY_DIGEST,
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

const config = Object.freeze({
  replitAuthIssuer: PROVIDER_ISSUER,
  replitAuthAudience: PROVIDER_AUDIENCE,
  replitAuthJwksUrl: "https://replit-auth.example/.well-known/jwks.json",
  replitAuthTokenHeader: "x-replit-auth-token",
  replitAuthClockSkewSeconds: 30,
  replitAuthMaxTokenLifetimeSeconds: 3_600,
  replitAuthJwksTimeoutMs: 1_000,
  replitAuthJwksCacheSeconds: 300,
  executiveRegistrations: registryDocument,
  executiveSessionCookieSecret:
    "executive-cookie-secret-at-least-thirty-two-characters",
  executiveSessionCookieSecure: true,
  executiveSessionTtlSeconds: 3_600,
  humanSessionAssertionSecret:
    "human-assertion-secret-distinct-at-least-thirty-two",
  humanSessionAssertionKeyId: "executive-session-current",
  humanSessionAssertionIssuer: "command-portal-experience-gateway",
  humanSessionAssertionAudience: "nexus-runtime",
  humanSessionServiceBindingId: "command-portal-experience-gateway",
  humanSessionAssertionClientId: "nexus-web",
  humanSessionAssertionTtlSeconds: 60,
});

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const providerToken = (
  overrides = {},
  headerOverrides = {},
  key = privateKey,
  signatureAlgorithm = undefined,
) => {
  const header = { alg: "RS256", typ: "JWT", kid: PROVIDER_KEY_ID, ...headerOverrides };
  const payload = {
    iss: PROVIDER_ISSUER,
    aud: PROVIDER_AUDIENCE,
    sub: RAW_PROVIDER_SUBJECT,
    iat: BASE_TIME_SECONDS - 10,
    nbf: BASE_TIME_SECONDS - 10,
    exp: BASE_TIME_SECONDS + 3_590,
    auth_time: BASE_TIME_SECONDS - 20,
    amr: ["replit-auth", "mfa"],
    ...overrides,
  };
  const input = `${encode(header)}.${encode(payload)}`;
  const algorithm = signatureAlgorithm ?? header.alg;
  const signingKey = algorithm === "PS256"
    ? {
        key,
        padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
        saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST,
      }
    : {
        key,
        padding: cryptoConstants.RSA_PKCS1_PADDING,
      };
  return `${input}.${sign("sha256", Buffer.from(input), signingKey).toString("base64url")}`;
};
const request = (token = "", additional = {}) => ({
  url: "/api/executive-session/login",
  headers: {
    ...(token ? { "x-replit-auth-token": token } : {}),
    ...additional,
  },
});
const jwksFetch = async () =>
  new Response(JSON.stringify({ keys: [providerJwk()] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

test("Replit Auth JWT identity is verified server-side and immediately reduced to an opaque binding", async () => {
  const adapter = createReplitAuthAdapter(config, {
    fetchImpl: jwksFetch,
    clock,
  });
  const identity = await adapter.verify(request(providerToken()));
  assert.deepEqual(identity, {
    provider: "replit-auth",
    issuer: PROVIDER_ISSUER,
    audience: PROVIDER_AUDIENCE,
    providerSubjectBinding: registration.providerSubjectBinding,
    authnTime: BASE_TIME_SECONDS - 20,
    authnMethods: ["replit-auth", "mfa"],
  });
  const serialized = JSON.stringify(identity);
  assert.equal(serialized.includes(RAW_PROVIDER_SUBJECT), false);
});

test("Replit Auth fallback verifies both advertised RS256 and PS256 with algorithm-specific RSA padding", async () => {
  for (const algorithm of ["RS256", "PS256"]) {
    const adapter = createReplitAuthAdapter(config, {
      fetchImpl: async () =>
        new Response(JSON.stringify({ keys: [providerJwk(algorithm)] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      clock,
    });
    const identity = await adapter.verify(
      request(providerToken({}, { alg: algorithm })),
    );
    assert.equal(identity.providerSubjectBinding, registration.providerSubjectBinding);
  }

  const psAdapter = createReplitAuthAdapter(config, {
    fetchImpl: async () =>
      new Response(JSON.stringify({ keys: [providerJwk("PS256")] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    clock,
  });
  await assert.rejects(
    psAdapter.verify(
      request(providerToken({}, { alg: "PS256" }, privateKey, "RS256")),
    ),
    (error) => error.code === "provider_token_signature_invalid",
  );

  const rsAdapter = createReplitAuthAdapter(config, {
    fetchImpl: async () =>
      new Response(JSON.stringify({ keys: [providerJwk("RS256")] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    clock,
  });
  await assert.rejects(
    rsAdapter.verify(
      request(providerToken({}, { alg: "RS256" }, privateKey, "PS256")),
    ),
    (error) => error.code === "provider_token_signature_invalid",
  );
});

test("JWKS reads are byte-bounded and unknown-key refreshes are negatively cached without blocking rotation", async () => {
  const oversized = createReplitAuthAdapter(config, {
    fetchImpl: async () =>
      new Response(new Uint8Array(65_537), { status: 200 }),
    clock,
  });
  await assert.rejects(
    oversized.verify(request(providerToken())),
    (error) => error.code === "provider_keys_invalid",
  );

  let boundedFetches = 0;
  const bounded = createReplitAuthAdapter(config, {
    fetchImpl: async () => {
      boundedFetches += 1;
      return jwksFetch();
    },
    clock,
  });
  for (const kid of ["unknown-provider-key-1", "unknown-provider-key-2"]) {
    await assert.rejects(
      bounded.verify(request(providerToken({}, { kid }))),
      (error) => error.code === "provider_token_key_invalid",
    );
  }
  assert.equal(boundedFetches, 1);

  let failedFetches = 0;
  const unavailable = createReplitAuthAdapter(config, {
    fetchImpl: async () => {
      failedFetches += 1;
      throw new Error("provider unavailable");
    },
    clock,
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      unavailable.verify(request(providerToken())),
      (error) => error.code === "provider_keys_unavailable",
    );
  }
  assert.equal(failedFetches, 1);

  const rotated = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  const rotatedKid = "replit-provider-key-2";
  const rotatedJwk = {
    ...rotated.publicKey.export({ format: "jwk" }),
    kid: rotatedKid,
    use: "sig",
    alg: "RS256",
  };
  let currentMilliseconds = BASE_TIME_SECONDS * 1_000;
  let activeKeys = [providerJwk()];
  let rotationFetches = 0;
  const rotating = createReplitAuthAdapter(config, {
    fetchImpl: async () => {
      rotationFetches += 1;
      return new Response(JSON.stringify({ keys: activeKeys }), {
        status: 200,
      });
    },
    clock: () => currentMilliseconds,
  });
  await rotating.verify(request(providerToken()));
  activeKeys = [rotatedJwk];
  currentMilliseconds += 31_000;
  await rotating.verify(
    request(
      providerToken(
        {},
        { kid: rotatedKid },
        rotated.privateKey,
      ),
    ),
  );
  assert.equal(rotationFetches, 2);
});

test("unsigned client identity headers never select a human, tenant, workspace, role, or scope", async () => {
  const adapter = createReplitAuthAdapter(config, {
    fetchImpl: jwksFetch,
    clock,
  });
  await assert.rejects(
    adapter.verify(
      request("", {
        "x-replit-user-id": RAW_PROVIDER_SUBJECT,
        "x-nexus-tenant-id": "attacker-tenant",
        "x-nexus-workspace-id": "attacker-workspace",
        "x-nexus-role": "admin",
        "x-nexus-scopes": "actions:execute",
      }),
    ),
    (error) => error.code === "provider_authentication_required",
  );
});

test("forged signatures, unknown keys, algorithms, issuers, audiences, times, and methods fail closed", async () => {
  const adapter = createReplitAuthAdapter(config, {
    fetchImpl: jwksFetch,
    clock,
  });
  const forged = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  const negatives = [
    [providerToken({}, {}, forged.privateKey), "provider_token_signature_invalid"],
    [providerToken({}, { kid: "unknown-provider-key" }), "provider_token_key_invalid"],
    [providerToken({}, { alg: "RS512" }), "provider_token_algorithm_invalid"],
    [providerToken({ iss: "https://forged-issuer.example" }), "provider_token_claims_invalid"],
    [providerToken({ aud: "forged-audience" }), "provider_token_claims_invalid"],
    [
      providerToken({ aud: [PROVIDER_AUDIENCE, "forged-audience"] }),
      "provider_token_claims_invalid",
    ],
    [providerToken({ exp: BASE_TIME_SECONDS - 31 }), "provider_token_claims_invalid"],
    [providerToken({ nbf: BASE_TIME_SECONDS + 31 }), "provider_token_claims_invalid"],
    [providerToken({ iat: BASE_TIME_SECONDS - 4_000 }), "provider_token_claims_invalid"],
    [
      providerToken({ iat: String(BASE_TIME_SECONDS - 10) }),
      "provider_token_claims_invalid",
    ],
    [
      providerToken({ auth_time: String(BASE_TIME_SECONDS - 20) }),
      "provider_token_claims_invalid",
    ],
    [providerToken({ amr: [] }), "provider_token_claims_invalid"],
    [
      providerToken({ amr: ["replit-auth", "mfa", "mfa"] }),
      "provider_token_claims_invalid",
    ],
    [
      providerToken({}, { crit: ["forged-extension"] }),
      "provider_token_algorithm_invalid",
    ],
    [
      providerToken({}, { typ: "not-a-jwt" }),
      "provider_token_algorithm_invalid",
    ],
  ];
  for (const [token, code] of negatives) {
    await assert.rejects(
      adapter.verify(request(token)),
      (error) => error.code === code,
      code,
    );
  }

  for (const jwk of [
    providerJwk("PS256"),
    providerJwk("RS256", { alg: undefined }),
    providerJwk("RS256", { use: "enc" }),
    providerJwk("RS256", { key_ops: ["sign"] }),
    providerJwk("RS256", { kid: "different-provider-key" }),
  ]) {
    const mismatched = createReplitAuthAdapter(config, {
      fetchImpl: async () =>
        new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      clock,
    });
    await assert.rejects(
      mismatched.verify(request(providerToken())),
      (error) => error.code === "provider_token_key_invalid",
    );
  }
});

test("the Agent-provisioned verifier seam is strict and ignores verifier-supplied privilege claims", async () => {
  const adapter = createReplitAuthAdapter(
    { ...config, replitAuthJwksUrl: "" },
    {
      clock,
      providerIdentityVerifier: async () => ({
        provider: "replit-auth",
        issuer: PROVIDER_ISSUER,
        audience: PROVIDER_AUDIENCE,
        subject: RAW_PROVIDER_SUBJECT,
        authnTime: BASE_TIME_SECONDS - 20,
        authnMethods: ["replit-auth", "mfa"],
        tenantId: "browser-selected-tenant",
        workspaceId: "browser-selected-workspace",
        role: "admin",
        scopes: ["actions:execute"],
        authorityGranted: true,
      }),
    },
  );
  const identity = await adapter.verify(request());
  assert.deepEqual(Object.keys(identity).sort(), [
    "audience",
    "authnMethods",
    "authnTime",
    "issuer",
    "provider",
    "providerSubjectBinding",
  ]);
});

test("server registration maps only the verified binding and rejects unregistered or inactive humans", () => {
  const mapper = createExecutiveRegistrationMapper(registryDocument);
  const identity = {
    provider: "replit-auth",
    issuer: PROVIDER_ISSUER,
    providerSubjectBinding: registration.providerSubjectBinding,
    authnMethods: ["replit-auth", "mfa"],
  };
  assert.equal(mapper.resolve(identity).principalId, registration.principalId);
  assert.throws(
    () =>
      mapper.resolve({
        ...identity,
        providerSubjectBinding: `sha256:${"b".repeat(64)}`,
      }),
    (error) => error.code === "executive_registration_required",
  );
  const inactive = {
    ...registryDocument,
    principals: [{ ...registration, state: "revoked" }],
  };
  assert.throws(
    () => createExecutiveRegistrationMapper(inactive).resolve(identity),
    (error) => error.code === "executive_registration_required",
  );
});

test("registration schema rejects raw subjects, aliases, elevated roles/scopes, policy drift, and duplicate bindings", () => {
  for (const mutation of [
    { providerSubject: RAW_PROVIDER_SUBJECT },
    { accountId: "forbidden-alias" },
    { roles: ["executive"] },
    { role: "admin" },
    { scopes: [...EXECUTIVE_SCOPES, "actions:execute"] },
    { principalType: "experience_gateway_service" },
    { providerSubjectClientControlled: true },
    { providerSubjectRetained: true },
    { policyDigest: "not-a-digest" },
    { sessionVersion: 0 },
    { sessionVersion: "1" },
    { sessionVersion: true },
    { revocationCheckpoint: "0" },
    { revocationCheckpoint: false },
    { maximumSessionLifetimeSeconds: 3_601 },
    { maximumSessionLifetimeSeconds: "3600" },
    { maximumSessionLifetimeSeconds: true },
    { authenticationMethods: [] },
    { authenticationMethods: ["replit-auth", "mfa", "mfa"] },
  ]) {
    assert.throws(
      () =>
        createExecutiveRegistrationMapper({
          ...registryDocument,
          principals: [{ ...registration, ...mutation }],
        }),
      undefined,
      JSON.stringify(mutation),
    );
  }
  assert.throws(() =>
    createExecutiveRegistrationMapper({
      ...registryDocument,
      principals: [registration, { ...registration, registrationId: "REG-NONPROD-EXECUTIVE-2" }],
    }));
});

test("signed browser session is bounded, revocable, config-bound, and exposes no provider subject or Authority", () => {
  const identity = {
    provider: "replit-auth",
    issuer: PROVIDER_ISSUER,
    audience: PROVIDER_AUDIENCE,
    providerSubjectBinding: registration.providerSubjectBinding,
    authnTime: BASE_TIME_SECONDS - 20,
    authnMethods: ["replit-auth", "mfa"],
  };
  const authority = createExecutiveSessionAuthority(config, clock);
  const issued = authority.issue(identity, registration);
  assert.match(issued.cookie, /^nexus_executive_session=[^.]+\.[^;]+;/);
  for (const attribute of [
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=3600",
    "Secure",
  ]) {
    assert.match(issued.cookie, new RegExp(attribute.replace("/", "\\/")));
  }
  const cookie = issued.cookie.split(";", 1)[0];
  const cookiePayload = JSON.parse(
    Buffer.from(
      cookie.slice(cookie.indexOf("=") + 1).split(".")[0],
      "base64url",
    ).toString("utf8"),
  );
  assert.equal(
    JSON.stringify(cookiePayload).includes(
      registration.providerSubjectBinding,
    ),
    false,
  );
  const claims = authority.authenticate({ headers: { cookie } });
  assert.ok(claims);
  assert.equal(claims.principalId, registration.principalId);
  assert.equal(claims.tenantId, registration.tenantId);
  assert.equal(claims.workspaceId, registration.workspaceId);
  assert.equal(claims.role, "executive");
  assert.deepEqual(claims.scopes, EXECUTIVE_SCOPES);
  assert.equal(claims.authorityGranted, false);
  assert.equal(claims.actionAuthorized, false);

  const publicState = authority.publicSession(claims, true);
  const serialized = JSON.stringify(publicState);
  assert.equal(serialized.includes(RAW_PROVIDER_SUBJECT), false);
  assert.equal(serialized.includes(registration.providerSubjectBinding), false);
  assert.equal(publicState.authorityGranted, false);
  assert.equal(publicState.actionAuthorized, false);
  assert.equal(publicState.decisionCreated, false);
  assert.equal(publicState.missionCreated, false);

  const token = cookie.slice(cookie.indexOf("=") + 1);
  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  assert.equal(
    authority.authenticate({
      headers: { cookie: `nexus_executive_session=${tampered}` },
    }),
    null,
  );
  authority.revoke(claims);
  assert.equal(authority.authenticate({ headers: { cookie } }), null);

  for (const identityMutation of [
    { authnTime: BASE_TIME_SECONDS - 301 },
    { authnTime: BASE_TIME_SECONDS + 1 },
    { issuer: "https://other-provider.example" },
    { providerSubjectBinding: `sha256:${"b".repeat(64)}` },
    { authnMethods: ["replit-auth"] },
  ]) {
    assert.throws(
      () => authority.issue({ ...identity, ...identityMutation }, registration),
      (error) =>
        error.code === "provider_authentication_stale_or_mismatched",
    );
  }
});

test("tenant, workspace, role, scope, policy, version, and revocation changes invalidate prior cookies", () => {
  const identity = {
    provider: "replit-auth",
    issuer: PROVIDER_ISSUER,
    audience: PROVIDER_AUDIENCE,
    providerSubjectBinding: registration.providerSubjectBinding,
    authnTime: BASE_TIME_SECONDS - 20,
    authnMethods: ["replit-auth", "mfa"],
  };
  const issuer = createExecutiveSessionAuthority(config, clock);
  const cookie = issuer.issue(identity, registration).cookie.split(";", 1)[0];
  for (const mutation of [
    { tenantId: "other-tenant" },
    { workspaceId: "other-workspace" },
    { role: "other-role" },
    { scopes: ["executive_session.read"] },
    { policyId: "other-policy" },
    { policyVersion: "2.0.0" },
    { policyDigest: `sha256:${"b".repeat(64)}` },
    { sessionVersion: 2 },
    { revocationCheckpoint: 1 },
  ]) {
    const changed = {
      ...config,
      executiveRegistrations: {
        ...registryDocument,
        principals: [{ ...registration, ...mutation }],
      },
    };
    assert.equal(
      createExecutiveSessionAuthority(changed, clock).authenticate({
        headers: { cookie },
      }),
      null,
      JSON.stringify(mutation),
    );
  }
});

test("expired human sessions fail closed before a Runtime assertion can be created", () => {
  let currentMilliseconds = BASE_TIME_SECONDS * 1_000;
  const mutableClock = () => currentMilliseconds;
  const identity = {
    provider: "replit-auth",
    issuer: PROVIDER_ISSUER,
    audience: PROVIDER_AUDIENCE,
    providerSubjectBinding: registration.providerSubjectBinding,
    authnTime: BASE_TIME_SECONDS - 20,
    authnMethods: ["replit-auth", "mfa"],
  };
  const authority = createExecutiveSessionAuthority(config, mutableClock);
  const issued = authority.issue(identity, registration);
  const cookie = issued.cookie.split(";", 1)[0];
  currentMilliseconds += 3_601_000;
  assert.equal(authority.authenticate({ headers: { cookie } }), null);
  assert.throws(
    () =>
      createHumanSessionAssertion(
        config,
        issued.claims,
        mutableClock,
      ),
    (error) => error.code === "executive_session_invalid",
  );
});

test("human-session assertions exactly match the Runtime contract, are short-lived and single-use, and carry no Authority", () => {
  const identity = {
    provider: "replit-auth",
    issuer: PROVIDER_ISSUER,
    audience: PROVIDER_AUDIENCE,
    providerSubjectBinding: registration.providerSubjectBinding,
    authnTime: BASE_TIME_SECONDS - 20,
    authnMethods: ["replit-auth", "mfa"],
  };
  const claims = createExecutiveSessionAuthority(config, clock).issue(
    identity,
    registration,
  ).claims;
  const first = createHumanSessionAssertion(config, claims, clock);
  const second = createHumanSessionAssertion(config, claims, clock);
  assert.notEqual(first, second);
  const payload = decodeHumanSessionAssertionForTest(first);
  assert.deepEqual(Object.keys(payload).sort(), [
    "actionAuthorized",
    "alg",
    "aud",
    "authenticationMethods",
    "authenticationTime",
    "authorityGranted",
    "clientId",
    "contract",
    "exp",
    "humanVerified",
    "iat",
    "iss",
    "jti",
    "kid",
    "nbf",
    "policyDigest",
    "policyId",
    "policyVersion",
    "principalId",
    "principalType",
    "provider",
    "providerAssertionVerified",
    "providerIssuer",
    "providerSubjectBinding",
    "registrationId",
    "revocationCheckpoint",
    "role",
    "scopes",
    "serviceBindingId",
    "sessionExpiresAt",
    "sessionIssuedAt",
    "sessionVersion",
    "sid",
    "tid",
    "v",
    "wid",
  ].sort());
  assert.equal(payload.contract, HUMAN_SESSION_ASSERTION_CONTRACT);
  assert.equal(payload.kid, "executive-session-current");
  assert.equal(payload.iss, "command-portal-experience-gateway");
  assert.equal(payload.aud, "nexus-runtime");
  assert.equal(payload.serviceBindingId, "command-portal-experience-gateway");
  assert.equal(payload.clientId, "nexus-web");
  assert.equal(payload.principalType, EXECUTIVE_PRINCIPAL_TYPE);
  assert.equal(payload.role, "executive");
  assert.deepEqual(payload.scopes, EXECUTIVE_SCOPES);
  assert.equal(payload.exp - payload.iat, 60);
  assert.equal(payload.nbf, payload.iat);
  assert.equal(payload.authorityGranted, false);
  assert.equal(payload.actionAuthorized, false);
  assert.equal(JSON.stringify(payload).includes(RAW_PROVIDER_SUBJECT), false);

  const [encoded, signature] = first.split(".");
  assert.equal(
    signature,
    createHmac("sha256", config.humanSessionAssertionSecret)
      .update(encoded)
      .digest("base64url"),
  );
  assert.equal(claims.contract, REGISTERED_EXECUTIVE_SESSION_CONTRACT);
});

test("provider subject bindings are stable, issuer-bound, provider-bound, and never raw", () => {
  const first = providerSubjectBinding(
    "replit-auth",
    PROVIDER_ISSUER,
    RAW_PROVIDER_SUBJECT,
  );
  assert.equal(first, registration.providerSubjectBinding);
  assert.notEqual(
    first,
    providerSubjectBinding(
      "replit-auth",
      "https://other-issuer.example",
      RAW_PROVIDER_SUBJECT,
    ),
  );
  assert.notEqual(
    first,
    providerSubjectBinding(
      "other-provider",
      PROVIDER_ISSUER,
      RAW_PROVIDER_SUBJECT,
    ),
  );
  assert.equal(
    first,
    `sha256:${createHash("sha256")
      .update(`replit-auth\n${PROVIDER_ISSUER}\n${RAW_PROVIDER_SUBJECT}`)
      .digest("hex")}`,
  );
  assert.equal(first.includes(RAW_PROVIDER_SUBJECT), false);
});
