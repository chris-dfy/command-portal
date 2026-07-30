import assert from "node:assert/strict";
import { test } from "node:test";
import { createReplitAuthIdentityVerifier } from "../server/replit-auth-provider.mjs";
import {
  createExecutiveRegistrationMapper,
  createReplitAuthAdapter,
  EXECUTIVE_PRINCIPAL_TYPE,
  EXECUTIVE_REGISTRY_CONTRACT,
  EXECUTIVE_REGISTRY_RECORD_TYPE,
  EXECUTIVE_SCOPES,
  EXECUTIVE_SESSION_POLICY_DIGEST,
  providerSubjectBinding,
} from "../server/executive-session.mjs";

const BASE_TIME = Date.parse("2026-07-30T12:00:00Z");
const clock = () => BASE_TIME;
const ISSUER = "https://replit.com/oidc";
const AUDIENCE = "repl-audience-nonproduction";
const HUMAN_SUBJECT = "opaque-replit-provider-subject-9342";

const config = Object.freeze({
  replitDeployment: true,
  replitDomains: ["portal.example.replit.app"],
  replitAuthIssuer: ISSUER,
  replitAuthAudience: AUDIENCE,
  replitAuthTokenHeader: "x-replit-auth-token",
  replitAuthClockSkewSeconds: 30,
  replitAuthMaxTokenLifetimeSeconds: 3_600,
  replitAuthJwksTimeoutMs: 1_000,
  replitAuthJwksCacheSeconds: 300,
  humanSessionServiceBindingId: "command-portal-experience-gateway",
  operationalUserId: "nexus-workspace-service",
  contextAssertionIssuer: "command-portal-experience-gateway",
});

const request = (headers = {}) => ({
  url: "/api/executive-session/login",
  headers: {
    host: "portal.example.replit.app",
    "x-replit-user-id": HUMAN_SUBJECT,
    "x-replit-user-name": "registered-executive",
    ...headers,
  },
});

const rejects = async (verifier, req) => assert.rejects(() => verifier(req));

test("platform-verified identity resolves to a replit-auth provider identity without raw token trust", async () => {
  const verifier = createReplitAuthIdentityVerifier(config, { clock });
  const identity = await verifier(request({
    "x-replit-auth-token": "browser.controlled.token",
  }));
  assert.equal(identity.provider, "replit-auth");
  assert.equal(identity.issuer, ISSUER);
  assert.equal(identity.audience, AUDIENCE);
  assert.equal(identity.subject, HUMAN_SUBJECT);
  assert.equal(identity.authnTime, Math.floor(BASE_TIME / 1000));
  assert.deepEqual([...identity.authnMethods], ["replit-auth"]);
});

test("unauthenticated requests fail closed: no verified identity headers means no human", async () => {
  const verifier = createReplitAuthIdentityVerifier(config, { clock });
  await rejects(verifier, request({ "x-replit-user-id": "", "x-replit-user-name": "" }));
  await rejects(verifier, { url: "/api/executive-session/login", headers: { host: "portal.example.replit.app" } });
  await rejects(verifier, request({ "x-replit-user-id": undefined, "x-replit-user-name": "someone" }));
});

test("forged or tampered identities outside the managed ingress are never trusted", async () => {
  const unmanaged = createReplitAuthIdentityVerifier(
    { ...config, replitDeployment: false },
    { clock },
  );
  await rejects(unmanaged, request());

  const unbound = createReplitAuthIdentityVerifier(
    { ...config, replitDomains: [] },
    { clock },
  );
  await rejects(unbound, request());

  const verifier = createReplitAuthIdentityVerifier(config, { clock });
  await rejects(verifier, request({ host: "attacker.example" }));
  await rejects(verifier, request({ "x-replit-user-id": ["array", "smuggled"] }));
  await rejects(verifier, request({ "x-replit-user-id": "-leading-invalid" }));
});

test("the Experience Gateway service principal is never accepted as a human identity", async () => {
  const verifier = createReplitAuthIdentityVerifier(config, { clock });
  for (const subject of [
    config.humanSessionServiceBindingId,
    config.operationalUserId,
    config.contextAssertionIssuer,
  ]) {
    await rejects(verifier, request({ "x-replit-user-id": subject }));
    await rejects(verifier, request({ "x-replit-user-name": subject }));
  }
});

const registration = Object.freeze({
  registrationId: "REG-NONPROD-EXECUTIVE-1",
  principalId: "nexus-executive-nonprod-1",
  principalType: EXECUTIVE_PRINCIPAL_TYPE,
  provider: "replit-auth",
  providerIssuer: ISSUER,
  providerSubjectBinding: providerSubjectBinding("replit-auth", ISSUER, HUMAN_SUBJECT),
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

test("the adapter reduces the verified subject to an opaque binding and normalizes the method to replit-auth", async () => {
  const adapter = createReplitAuthAdapter(config, {
    clock,
    providerIdentityVerifier: createReplitAuthIdentityVerifier(config, { clock }),
  });
  const identity = await adapter.verify(request());
  assert.equal(identity.provider, "replit-auth");
  assert.equal(identity.issuer, ISSUER);
  assert.equal(identity.audience, AUDIENCE);
  assert.equal("subject" in identity, false);
  assert.match(identity.providerSubjectBinding, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual([...identity.authnMethods], ["replit-auth"]);

  const mapper = createExecutiveRegistrationMapper(registryDocument);
  const mapped = mapper.resolve(identity);
  assert.equal(mapped.principalId, registration.principalId);
  assert.equal(mapped.role, "executive");
});

test("wrong issuer or wrong audience from the provider seam fails closed as invalid identity", async () => {
  for (const drift of [
    { replitAuthIssuer: "https://forged-issuer.example" },
    { replitAuthAudience: "forged-audience" },
  ]) {
    const adapter = createReplitAuthAdapter(config, {
      clock,
      providerIdentityVerifier: createReplitAuthIdentityVerifier(
        { ...config, ...drift },
        { clock },
      ),
    });
    await assert.rejects(
      () => adapter.verify(request()),
      (error) => error.code === "provider_identity_invalid",
    );
  }
});

test("a missing subject from the provider seam fails closed as authentication required", async () => {
  const adapter = createReplitAuthAdapter(config, {
    clock,
    providerIdentityVerifier: async () => ({
      provider: "replit-auth",
      issuer: ISSUER,
      audience: AUDIENCE,
      authnTime: Math.floor(BASE_TIME / 1000),
      authnMethods: ["replit-auth"],
    }),
  });
  await assert.rejects(
    () => adapter.verify(request()),
    (error) => error.code === "provider_identity_invalid",
  );
});

test("an unregistered verified identity never maps to a NEXUS principal", async () => {
  const mapper = createExecutiveRegistrationMapper(registryDocument);
  const adapter = createReplitAuthAdapter(config, {
    clock,
    providerIdentityVerifier: createReplitAuthIdentityVerifier(config, { clock }),
  });
  const identity = await adapter.verify(
    request({ "x-replit-user-id": "some-other-unregistered-subject" }),
  );
  assert.throws(
    () => mapper.resolve(identity),
    (error) => error.code === "executive_registration_required",
  );
});
