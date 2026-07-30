import {
  constants as cryptoConstants,
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";

export const REGISTERED_EXECUTIVE_SESSION_CONTRACT =
  "nexus.registered-executive-session@1.0.0";
export const HUMAN_SESSION_ASSERTION_CONTRACT =
  "nexus.registered-executive-session-assertion@1.0.0";
export const HUMAN_SESSION_ASSERTION_ALGORITHM = "hmac-sha256";
export const HUMAN_SESSION_ASSERTION_HEADER =
  "X-NEXUS-Human-Session-Assertion";
export const EXECUTIVE_SESSION_COOKIE_NAME = "nexus_executive_session";
export const EXECUTIVE_ROLE = "executive";
export const EXECUTIVE_PRINCIPAL_TYPE = "registered_human_executive";
export const EXECUTIVE_SCOPES = Object.freeze([
  "executive_session.read",
  "executive_session.revoke",
]);
export const MAX_EXECUTIVE_SESSION_LIFETIME_SECONDS = 3_600;
export const MAX_HUMAN_ASSERTION_LIFETIME_SECONDS = 60;
export const MAX_PROVIDER_AUTHENTICATION_AGE_SECONDS = 300;
export const PROVIDER_SUBJECT_BINDING_ALGORITHM = "sha256";
export const EXECUTIVE_SESSION_POLICY_ID =
  "registered-executive-session-policy";
export const EXECUTIVE_SESSION_POLICY_VERSION = "1.0.0";
export const EXECUTIVE_SESSION_POLICY_DIGEST =
  "sha256:b2bda0a2834a9262eeaad3de1018bd5b3bf819433631b3f52310d3131b7ace25";
export const EXECUTIVE_REGISTRY_CONTRACT =
  "nexus.registered-executive-principal-registry@1.0.0";
export const EXECUTIVE_REGISTRY_RECORD_TYPE =
  "nexus_registered_executive_principal_registry";

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,191}$/;
const HEADER_NAME_PATTERN = /^[a-z0-9-]{3,80}$/;
const JWT_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const REPLIT_AUTH_JWT_ALGORITHMS = new Set(["PS256", "RS256"]);
const JWKS_MAXIMUM_BYTES = 65_536;
const JWKS_MINIMUM_REFRESH_INTERVAL_MS = 30_000;

const b64 = (value) => Buffer.from(value).toString("base64url");
const unb64 = (value) => Buffer.from(value, "base64url");
const nowSeconds = (clock) => Math.floor(clock() / 1_000);
const hmac = (value, secret) =>
  createHmac("sha256", secret).update(value).digest("base64url");
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
};
const cookieMap = (header = "") =>
  Object.fromEntries(
    String(header)
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return index < 0
          ? [item, ""]
          : [item.slice(0, index), item.slice(index + 1)];
      }),
  );
const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;
const stringArray = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 16 &&
  value.every(
    (item) => typeof item === "string" && IDENTIFIER_PATTERN.test(item),
  ) &&
  new Set(value).size === value.length
    ? [...value]
    : null;
const sameArray = (left, right) =>
  Array.isArray(left) &&
  left.length === right.length &&
  left.every((item, index) => item === right[index]);
const requireIdentifier = (value, name) => {
  const normalized = String(value ?? "").trim();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a stable public identifier.`);
  }
  return normalized;
};
const requireDigest = (value, name) => {
  const normalized = String(value ?? "").trim();
  if (!SHA256_DIGEST_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a SHA-256 digest.`);
  }
  return normalized;
};
const decodeJsonSegment = (segment, name) => {
  if (!JWT_SEGMENT_PATTERN.test(String(segment ?? ""))) {
    throw new ExecutiveSessionFailure(
      "provider_token_invalid",
      `The provider ${name} was invalid.`,
      401,
    );
  }
  try {
    const parsed = JSON.parse(unb64(segment).toString("utf8"));
    if (!record(parsed)) throw new Error("not_object");
    return parsed;
  } catch {
    throw new ExecutiveSessionFailure(
      "provider_token_invalid",
      `The provider ${name} was invalid.`,
      401,
    );
  }
};

async function readBoundedProviderBody(response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > JWKS_MAXIMUM_BYTES) {
    throw new ExecutiveSessionFailure(
      "provider_keys_invalid",
      "Replit Auth verification keys exceeded the bounded response size.",
      503,
    );
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > JWKS_MAXIMUM_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The bounded failure below remains authoritative.
        }
        throw new ExecutiveSessionFailure(
          "provider_keys_invalid",
          "Replit Auth verification keys exceeded the bounded response size.",
          503,
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, received);
}

export class ExecutiveSessionFailure extends Error {
  constructor(code, message, status = 401, details = undefined) {
    super(message);
    this.name = "ExecutiveSessionFailure";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function providerSubjectBinding(provider, issuer, subject) {
  const providerId = requireIdentifier(provider, "provider");
  const providerIssuer = requireIdentifier(issuer, "provider issuer");
  const providerSubject = String(subject ?? "");
  if (
    providerSubject.length < 1 ||
    providerSubject.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(providerSubject)
  ) {
    throw new ExecutiveSessionFailure(
      "provider_identity_invalid",
      "The verified provider subject was invalid.",
      401,
    );
  }
  const digest = createHash("sha256")
    .update(`${providerId}\n${providerIssuer}\n${providerSubject}`, "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

function validateProviderIdentity(value, config) {
  const identity = record(value);
  const provider = String(identity?.provider ?? identity?.providerId ?? "");
  const issuer = String(identity?.issuer ?? "");
  const audience = String(identity?.audience ?? "");
  const subject = identity?.subject;
  const authnTime = Number(
    identity?.authnTime ?? identity?.authenticatedAt ?? identity?.authTime,
  );
  const authnMethods = stringArray(
    identity?.authnMethods ?? identity?.authenticationMethods,
  );
  if (
    provider !== "replit-auth" ||
    issuer !== config.replitAuthIssuer ||
    audience !== config.replitAuthAudience ||
    typeof subject !== "string" ||
    !Number.isSafeInteger(authnTime) ||
    authnTime <= 0 ||
    !authnMethods
  ) {
    throw new ExecutiveSessionFailure(
      "provider_identity_invalid",
      "Replit Auth did not establish a valid server-verified identity.",
      401,
    );
  }
  return Object.freeze({
    provider,
    issuer,
    audience,
    providerSubjectBinding: providerSubjectBinding(provider, issuer, subject),
    authnTime,
    authnMethods: Object.freeze(authnMethods),
  });
}

function safeJwksUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "COMMAND_PORTAL_REPLIT_AUTH_JWKS_URL must be a valid HTTPS URL.",
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "COMMAND_PORTAL_REPLIT_AUTH_JWKS_URL must be an HTTPS URL without credentials, query, or fragment.",
    );
  }
  return parsed.href;
}

function audienceMatches(value, expected) {
  return typeof value === "string"
    ? value === expected
    : Array.isArray(value) &&
        value.length === 1 &&
        value[0] === expected;
}

function normalizeJwtIdentity(header, payload, config, clock) {
  const current = nowSeconds(clock);
  const skew = config.replitAuthClockSkewSeconds;
  const issued = Number(payload.iat);
  const expires = Number(payload.exp);
  const notBefore = payload.nbf === undefined ? issued : Number(payload.nbf);
  const authenticated = Number(payload.auth_time ?? payload.authTime);
  const methods =
    stringArray(payload.amr) ??
    (typeof payload.firebase?.sign_in_provider === "string"
      ? [requireIdentifier(payload.firebase.sign_in_provider, "auth method")]
      : null);
  if (
    !REPLIT_AUTH_JWT_ALGORITHMS.has(header.alg) ||
    typeof header.kid !== "string" ||
    !IDENTIFIER_PATTERN.test(header.kid) ||
    payload.iss !== config.replitAuthIssuer ||
    !audienceMatches(payload.aud, config.replitAuthAudience) ||
    typeof payload.sub !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    (payload.nbf !== undefined && typeof payload.nbf !== "number") ||
    typeof (payload.auth_time ?? payload.authTime) !== "number" ||
    !Number.isSafeInteger(issued) ||
    !Number.isSafeInteger(expires) ||
    !Number.isSafeInteger(notBefore) ||
    !Number.isSafeInteger(authenticated) ||
    expires <= issued ||
    expires - issued > config.replitAuthMaxTokenLifetimeSeconds ||
    issued > current + skew ||
    notBefore > current + skew ||
    expires <= current - skew ||
    authenticated > current + skew ||
    !methods
  ) {
    throw new ExecutiveSessionFailure(
      "provider_token_claims_invalid",
      "The Replit Auth token failed issuer, audience, time, subject, or authentication-method validation.",
      401,
    );
  }
  return validateProviderIdentity(
    {
      provider: "replit-auth",
      issuer: payload.iss,
      audience: config.replitAuthAudience,
      subject: payload.sub,
      authnTime: authenticated,
      authnMethods: methods,
    },
    config,
  );
}

async function fetchJwks(config, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.replitAuthJwksTimeoutMs,
  );
  try {
    let response;
    try {
      response = await fetchImpl(config.replitAuthJwksUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      throw new ExecutiveSessionFailure(
        "provider_keys_unavailable",
        "Replit Auth verification keys are unavailable.",
        503,
      );
    }
    if (!response.ok) {
      throw new ExecutiveSessionFailure(
        "provider_keys_unavailable",
        "Replit Auth verification keys are unavailable.",
        503,
      );
    }
    let raw;
    try {
      raw = await readBoundedProviderBody(response);
    } catch (error) {
      if (error instanceof ExecutiveSessionFailure) throw error;
      throw new ExecutiveSessionFailure(
        "provider_keys_unavailable",
        "Replit Auth verification keys are unavailable.",
        503,
      );
    }
    let body;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new ExecutiveSessionFailure(
        "provider_keys_invalid",
        "Replit Auth verification keys were invalid.",
        503,
      );
    }
    if (
      !record(body) ||
      !Array.isArray(body.keys) ||
      body.keys.length === 0 ||
      body.keys.length > 20
    ) {
      throw new ExecutiveSessionFailure(
        "provider_keys_invalid",
        "Replit Auth verification keys were invalid.",
        503,
      );
    }
    return body.keys;
  } finally {
    clearTimeout(timer);
  }
}

export function createReplitAuthAdapter(
  inputConfig,
  {
    fetchImpl = globalThis.fetch,
    clock = () => Date.now(),
    providerIdentityVerifier,
  } = {},
) {
  const config = Object.freeze({
    replitAuthIssuer: requireIdentifier(
      inputConfig.replitAuthIssuer,
      "COMMAND_PORTAL_REPLIT_AUTH_ISSUER",
    ),
    replitAuthAudience: requireIdentifier(
      inputConfig.replitAuthAudience,
      "COMMAND_PORTAL_REPLIT_AUTH_AUDIENCE",
    ),
    replitAuthJwksUrl: inputConfig.replitAuthJwksUrl
      ? safeJwksUrl(inputConfig.replitAuthJwksUrl)
      : "",
    replitAuthTokenHeader: String(
      inputConfig.replitAuthTokenHeader ?? "x-replit-auth-token",
    ).toLowerCase(),
    replitAuthClockSkewSeconds: Number(
      inputConfig.replitAuthClockSkewSeconds ?? 30,
    ),
    replitAuthMaxTokenLifetimeSeconds: Number(
      inputConfig.replitAuthMaxTokenLifetimeSeconds ?? 3_600,
    ),
    replitAuthJwksTimeoutMs: Number(
      inputConfig.replitAuthJwksTimeoutMs ?? 5_000,
    ),
    replitAuthJwksCacheSeconds: Number(
      inputConfig.replitAuthJwksCacheSeconds ?? 300,
    ),
  });
  if (
    !HEADER_NAME_PATTERN.test(config.replitAuthTokenHeader) ||
    !Number.isSafeInteger(config.replitAuthClockSkewSeconds) ||
    config.replitAuthClockSkewSeconds < 0 ||
    config.replitAuthClockSkewSeconds > 120 ||
    !Number.isSafeInteger(config.replitAuthMaxTokenLifetimeSeconds) ||
    config.replitAuthMaxTokenLifetimeSeconds < 60 ||
    config.replitAuthMaxTokenLifetimeSeconds > 86_400 ||
    !Number.isSafeInteger(config.replitAuthJwksTimeoutMs) ||
    config.replitAuthJwksTimeoutMs < 100 ||
    config.replitAuthJwksTimeoutMs > 15_000 ||
    !Number.isSafeInteger(config.replitAuthJwksCacheSeconds) ||
    config.replitAuthJwksCacheSeconds < 30 ||
    config.replitAuthJwksCacheSeconds > 3_600
  ) {
    throw new Error("Replit Auth verification bounds are invalid.");
  }
  if (!providerIdentityVerifier && !config.replitAuthJwksUrl) {
    throw new Error(
      "Replit Auth requires either a server-side provider verifier or COMMAND_PORTAL_REPLIT_AUTH_JWKS_URL.",
    );
  }
  let jwks = [];
  let jwksExpiresAt = 0;
  let jwksLastAttemptAt = 0;
  let jwksLastFailure = null;
  let jwksRefreshPromise = null;
  const keys = async (force = false) => {
    const current = clock();
    if (!force && jwks.length && jwksExpiresAt > current) return jwks;
    if (jwksRefreshPromise) return jwksRefreshPromise;
    if (
      current - jwksLastAttemptAt < JWKS_MINIMUM_REFRESH_INTERVAL_MS &&
      (force || jwksLastFailure)
    ) {
      if (jwksLastFailure) throw jwksLastFailure;
      return jwks;
    }
    jwksLastAttemptAt = current;
    jwksRefreshPromise = (async () => {
      try {
        const refreshed = await fetchJwks(config, fetchImpl);
        jwks = refreshed;
        jwksExpiresAt =
          clock() + config.replitAuthJwksCacheSeconds * 1_000;
        jwksLastFailure = null;
        return jwks;
      } catch (error) {
        jwksLastFailure = error;
        throw error;
      } finally {
        jwksRefreshPromise = null;
      }
    })();
    return jwksRefreshPromise;
  };
  const verifyJwt = async (request) => {
    const token = String(request.headers[config.replitAuthTokenHeader] ?? "");
    const [encodedHeader, encodedPayload, encodedSignature, extra] =
      token.split(".");
    if (
      !encodedHeader ||
      !encodedPayload ||
      !encodedSignature ||
      extra ||
      !JWT_SEGMENT_PATTERN.test(encodedSignature)
    ) {
      throw new ExecutiveSessionFailure(
        "provider_authentication_required",
        "A valid Replit Auth provider token is required.",
        401,
      );
    }
    const header = decodeJsonSegment(encodedHeader, "token header");
    const payload = decodeJsonSegment(encodedPayload, "token payload");
    const headerFields = Object.keys(header);
    if (
      headerFields.some((field) => !["alg", "kid", "typ"].includes(field)) ||
      !REPLIT_AUTH_JWT_ALGORITHMS.has(header.alg) ||
      typeof header.kid !== "string" ||
      !IDENTIFIER_PATTERN.test(header.kid) ||
      (header.typ !== undefined && header.typ !== "JWT")
    ) {
      throw new ExecutiveSessionFailure(
        "provider_token_algorithm_invalid",
        "The Replit Auth token algorithm or key identity was invalid.",
        401,
      );
    }
    let available = await keys();
    let jwk = available.find((item) => item?.kid === header.kid);
    if (!jwk) {
      available = await keys(true);
      jwk = available.find((item) => item?.kid === header.kid);
    }
    if (
      !record(jwk) ||
      jwk.kty !== "RSA" ||
      (jwk.use !== undefined && jwk.use !== "sig") ||
      (jwk.key_ops !== undefined &&
        (!Array.isArray(jwk.key_ops) ||
          jwk.key_ops.length !== 1 ||
          jwk.key_ops[0] !== "verify")) ||
      ["d", "p", "q", "dp", "dq", "qi", "oth"].some(
        (field) => Object.hasOwn(jwk, field),
      ) ||
      jwk.alg !== header.alg
    ) {
      throw new ExecutiveSessionFailure(
        "provider_token_key_invalid",
        "The Replit Auth token key was not registered for signing.",
        401,
      );
    }
    let key;
    try {
      key = createPublicKey({ key: jwk, format: "jwk" });
    } catch {
      throw new ExecutiveSessionFailure(
        "provider_keys_invalid",
        "Replit Auth verification keys were invalid.",
        503,
      );
    }
    if (
      key.asymmetricKeyType !== "rsa" ||
      Number(key.asymmetricKeyDetails?.modulusLength ?? 0) < 2_048
    ) {
      throw new ExecutiveSessionFailure(
        "provider_token_key_invalid",
        "The Replit Auth signing key did not meet the RSA security boundary.",
        401,
      );
    }
    const valid = verifySignature(
      "sha256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      {
        key,
        padding:
          header.alg === "PS256"
            ? cryptoConstants.RSA_PKCS1_PSS_PADDING
            : cryptoConstants.RSA_PKCS1_PADDING,
        ...(header.alg === "PS256"
          ? { saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST }
          : {}),
      },
      unb64(encodedSignature),
    );
    if (!valid) {
      throw new ExecutiveSessionFailure(
        "provider_token_signature_invalid",
        "The Replit Auth token signature was invalid.",
        401,
      );
    }
    return normalizeJwtIdentity(header, payload, config, clock);
  };
  return Object.freeze({
    provider: "replit-auth",
    verify: async (request) => {
      if (providerIdentityVerifier) {
        let identity;
        try {
          identity = await providerIdentityVerifier(request);
        } catch {
          throw new ExecutiveSessionFailure(
            "provider_authentication_required",
            "Replit Auth did not establish a server-verified identity.",
            401,
          );
        }
        return validateProviderIdentity(identity, config);
      }
      return verifyJwt(request);
    },
  });
}

function validateRegistration(value) {
  const item = record(value);
  if (!item) throw new Error("Executive registration must be an object.");
  const expectedFields = new Set([
    "registrationId",
    "principalId",
    "principalType",
    "provider",
    "providerIssuer",
    "providerSubjectBinding",
    "providerSubjectClientControlled",
    "providerSubjectRetained",
    "tenantId",
    "workspaceId",
    "role",
    "scopes",
    "policyId",
    "policyVersion",
    "policyDigest",
    "sessionVersion",
    "revocationCheckpoint",
    "maximumSessionLifetimeSeconds",
    "authenticationMethods",
    "state",
  ]);
  if (
    Object.keys(item).length !== expectedFields.size ||
    Object.keys(item).some((field) => !expectedFields.has(field))
  ) {
    throw new Error("Executive registration field set is invalid.");
  }
  const registration = {
    registrationId: requireIdentifier(
      item.registrationId,
      "registrationId",
    ),
    principalId: requireIdentifier(item.principalId, "principalId"),
    principalType: requireIdentifier(item.principalType, "principalType"),
    provider: requireIdentifier(item.provider, "provider"),
    providerIssuer: requireIdentifier(item.providerIssuer, "providerIssuer"),
    providerSubjectBinding: requireDigest(item.providerSubjectBinding, "providerSubjectBinding"),
    providerSubjectClientControlled: item.providerSubjectClientControlled,
    providerSubjectRetained: item.providerSubjectRetained,
    tenantId: requireIdentifier(item.tenantId, "tenantId"),
    workspaceId: requireIdentifier(item.workspaceId, "workspaceId"),
    role: requireIdentifier(item.role, "role"),
    scopes: stringArray(item.scopes),
    policyId: requireIdentifier(item.policyId, "policyId"),
    policyVersion: requireIdentifier(item.policyVersion, "policyVersion"),
    policyDigest: requireDigest(item.policyDigest, "policyDigest"),
    sessionVersion: item.sessionVersion,
    revocationCheckpoint: item.revocationCheckpoint,
    maximumSessionLifetimeSeconds: item.maximumSessionLifetimeSeconds,
    authenticationMethods: stringArray(item.authenticationMethods),
    state: String(item.state ?? ""),
  };
  if (
    registration.provider !== "replit-auth" ||
    registration.principalType !== EXECUTIVE_PRINCIPAL_TYPE ||
    registration.providerSubjectClientControlled !== false ||
    registration.providerSubjectRetained !== false ||
    registration.role !== EXECUTIVE_ROLE ||
    !registration.scopes ||
    !sameArray(registration.scopes, EXECUTIVE_SCOPES) ||
    !registration.authenticationMethods ||
    typeof item.sessionVersion !== "number" ||
    !Number.isSafeInteger(registration.sessionVersion) ||
    registration.sessionVersion < 1 ||
    typeof item.revocationCheckpoint !== "number" ||
    !Number.isSafeInteger(registration.revocationCheckpoint) ||
    registration.revocationCheckpoint < 0 ||
    typeof item.maximumSessionLifetimeSeconds !== "number" ||
    !Number.isSafeInteger(registration.maximumSessionLifetimeSeconds) ||
    registration.maximumSessionLifetimeSeconds < 60 ||
    registration.maximumSessionLifetimeSeconds > MAX_EXECUTIVE_SESSION_LIFETIME_SECONDS ||
    !["active", "suspended", "revoked"].includes(registration.state)
  ) {
    throw new Error(
      "Executive registration principal, provider, scope, lifecycle, or retention boundary is invalid.",
    );
  }
  return Object.freeze({
    ...registration,
    scopes: Object.freeze(registration.scopes),
    authenticationMethods: Object.freeze(registration.authenticationMethods),
  });
}

export function createExecutiveRegistrationMapper(document) {
  const root = Array.isArray(document)
    ? {
        recordType: EXECUTIVE_REGISTRY_RECORD_TYPE,
        schemaVersion: EXECUTIVE_REGISTRY_CONTRACT,
        registryVersion: "compatibility-input-not-for-deployment",
        principals: document,
      }
    : record(document);
  const expectedRootFields = new Set([
    "recordType",
    "schemaVersion",
    "registryVersion",
    "principals",
  ]);
  if (
    !root ||
    Object.keys(root).length !== expectedRootFields.size ||
    Object.keys(root).some((field) => !expectedRootFields.has(field)) ||
    root.recordType !== EXECUTIVE_REGISTRY_RECORD_TYPE ||
    root.schemaVersion !== EXECUTIVE_REGISTRY_CONTRACT ||
    !IDENTIFIER_PATTERN.test(String(root.registryVersion ?? "")) ||
    !Array.isArray(root.principals) ||
    root.principals.length < 1 ||
    root.principals.length > 100
  ) {
    throw new Error(
      "The bounded server-owned executive principal registry is invalid.",
    );
  }
  const items = root.principals.map(validateRegistration);
  for (const field of [
    "registrationId",
    "providerSubjectBinding",
    "principalId",
  ]) {
    if (new Set(items.map((item) => item[field])).size !== items.length) {
      throw new Error(`Executive registrations contain duplicate ${field}.`);
    }
  }
  const byBinding = new Map(
    items.map((item) => [
      `${item.provider}\u0000${item.providerIssuer}\u0000${item.providerSubjectBinding}`,
      item,
    ]),
  );
  return Object.freeze({
    resolve: (identity) => {
      const key = `${identity?.provider ?? ""}\u0000${identity?.issuer ?? ""}\u0000${identity?.providerSubjectBinding ?? ""}`;
      const registration = byBinding.get(key);
      if (!registration || registration.state !== "active") {
        throw new ExecutiveSessionFailure(
          "executive_registration_required",
          "The verified provider identity has no active NEXUS executive registration.",
          403,
        );
      }
      if (!sameArray(identity.authnMethods, registration.authenticationMethods)) {
        throw new ExecutiveSessionFailure(
          "authentication_method_mismatch",
          "The verified authentication methods do not match the server-owned NEXUS registration.",
          403,
        );
      }
      return registration;
    },
    publicMetadata: () =>
      items.map((item) => ({
        registrationId: item.registrationId,
        principalId: item.principalId,
        principalType: item.principalType,
        provider: item.provider,
        providerIssuer: item.providerIssuer,
        tenantId: item.tenantId,
        workspaceId: item.workspaceId,
        role: item.role,
        scopes: [...item.scopes],
        policyId: item.policyId,
        policyVersion: item.policyVersion,
        policyDigest: item.policyDigest,
        sessionVersion: item.sessionVersion,
        revocationCheckpoint: item.revocationCheckpoint,
        maximumSessionLifetimeSeconds: item.maximumSessionLifetimeSeconds,
        authenticationMethods: [...item.authenticationMethods],
        state: item.state,
      })),
    document: () => ({
      recordType: root.recordType,
      schemaVersion: root.schemaVersion,
      registryVersion: root.registryVersion,
      principals: items.map((item) => ({ ...item })),
    }),
  });
}

function activeClaims(claims, config, current) {
  const registrations = Array.isArray(config.executiveRegistrations)
    ? config.executiveRegistrations
    : config.executiveRegistrations?.principals;
  const registration = Array.isArray(registrations)
    ? registrations.find(
      (item) => item?.registrationId === claims?.registrationId,
    )
    : null;
  return (
    record(claims) &&
    record(registration) &&
    registration.state === "active" &&
    claims.v === 1 &&
    claims.contract === REGISTERED_EXECUTIVE_SESSION_CONTRACT &&
    typeof claims.sid === "string" &&
    IDENTIFIER_PATTERN.test(claims.sid) &&
    typeof claims.registrationId === "string" &&
    typeof claims.principalId === "string" &&
    claims.principalType === EXECUTIVE_PRINCIPAL_TYPE &&
    claims.provider === "replit-auth" &&
    claims.providerIssuer === config.replitAuthIssuer &&
    SHA256_DIGEST_PATTERN.test(claims.providerSubjectBinding) &&
    claims.providerAssertionVerified === true &&
    claims.humanVerified === true &&
    typeof claims.tenantId === "string" &&
    typeof claims.workspaceId === "string" &&
    claims.role === EXECUTIVE_ROLE &&
    sameArray(claims.scopes, EXECUTIVE_SCOPES) &&
    typeof claims.policyId === "string" &&
    typeof claims.policyVersion === "string" &&
    SHA256_DIGEST_PATTERN.test(claims.policyDigest) &&
    Number.isSafeInteger(claims.sessionVersion) &&
    Number.isSafeInteger(claims.revocationCheckpoint) &&
    stringArray(claims.authenticationMethods) !== null &&
    Number.isSafeInteger(claims.authenticationTime) &&
    Number.isSafeInteger(claims.sessionIssuedAt) &&
    Number.isSafeInteger(claims.sessionExpiresAt) &&
    claims.authenticationTime <=
      claims.sessionIssuedAt &&
    claims.sessionIssuedAt - claims.authenticationTime <=
      MAX_PROVIDER_AUTHENTICATION_AGE_SECONDS &&
    claims.sessionIssuedAt <=
      current + config.replitAuthClockSkewSeconds &&
    claims.sessionExpiresAt > claims.sessionIssuedAt &&
    claims.sessionExpiresAt - claims.sessionIssuedAt <= registration.maximumSessionLifetimeSeconds &&
    claims.sessionExpiresAt > current &&
    claims.principalId === registration.principalId &&
    claims.principalType === registration.principalType &&
    claims.provider === registration.provider &&
    claims.providerIssuer === registration.providerIssuer &&
    claims.providerSubjectBinding === registration.providerSubjectBinding &&
    claims.tenantId === registration.tenantId &&
    claims.workspaceId === registration.workspaceId &&
    claims.role === registration.role &&
    sameArray(claims.scopes, registration.scopes) &&
    claims.policyId === registration.policyId &&
    claims.policyVersion === registration.policyVersion &&
    claims.policyDigest === registration.policyDigest &&
    claims.sessionVersion === registration.sessionVersion &&
    claims.revocationCheckpoint === registration.revocationCheckpoint &&
    sameArray(claims.authenticationMethods, registration.authenticationMethods) &&
    claims.authorityGranted === false &&
    claims.actionAuthorized === false &&
    claims.decisionCreated === false &&
    claims.missionCreated === false
  );
}

export function createExecutiveSessionAuthority(
  config,
  clock = () => Date.now(),
) {
  const revoked = new Map();
  const cookie = (value, maxAge) =>
    `${EXECUTIVE_SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${
      config.executiveSessionCookieSecure ? "; Secure" : ""
    }`;
  const encode = (claims) => {
    const {
      providerSubjectBinding: _serverOnlyProviderSubjectBinding,
      ...browserClaims
    } = claims;
    const payload = b64(JSON.stringify(browserClaims));
    return `${payload}.${hmac(payload, config.executiveSessionCookieSecret)}`;
  };
  const isRevoked = (claims, current) => {
    const expires = revoked.get(claims.sid);
    if (expires === undefined) return false;
    if (expires <= current) {
      revoked.delete(claims.sid);
      return false;
    }
    return true;
  };
  const decode = (token) => {
    const [payload, signature, extra] = String(token ?? "").split(".");
    if (
      !payload ||
      !signature ||
      extra ||
      !safeEqual(
        signature,
        hmac(payload, config.executiveSessionCookieSecret),
      )
    ) {
      return null;
    }
    try {
      const storedClaims = JSON.parse(unb64(payload).toString("utf8"));
      const registrations = Array.isArray(config.executiveRegistrations)
        ? config.executiveRegistrations
        : config.executiveRegistrations?.principals;
      const registration = Array.isArray(registrations)
        ? registrations.find(
            (item) =>
              item?.registrationId === storedClaims?.registrationId,
          )
        : null;
      const claims = registration
        ? {
            ...storedClaims,
            providerSubjectBinding: registration.providerSubjectBinding,
          }
        : storedClaims;
      const current = nowSeconds(clock);
      return activeClaims(claims, config, current) &&
        !isRevoked(claims, current)
        ? claims
        : null;
    } catch {
      return null;
    }
  };
  const csrf = (claims) =>
    hmac(
      `csrf:${claims.sid}:${claims.sessionVersion}:${claims.sessionExpiresAt}`,
      config.executiveSessionCookieSecret,
    );
  const revoke = (claims) => {
    if (
      typeof claims?.sid === "string" &&
      Number.isSafeInteger(claims.sessionExpiresAt)
    ) {
      revoked.set(claims.sid, claims.sessionExpiresAt);
    }
  };
  return Object.freeze({
    issue: (identity, registration) => {
      const issued = nowSeconds(clock);
      if (
        identity.provider !== registration.provider ||
        identity.issuer !== registration.providerIssuer ||
        identity.providerSubjectBinding !== registration.providerSubjectBinding ||
        !sameArray(identity.authnMethods, registration.authenticationMethods) ||
        !Number.isSafeInteger(identity.authnTime) ||
        identity.authnTime > issued ||
        issued - identity.authnTime > MAX_PROVIDER_AUTHENTICATION_AGE_SECONDS
      ) {
        throw new ExecutiveSessionFailure(
          "provider_authentication_stale_or_mismatched",
          "A fresh provider authentication matching the server-owned registration is required.",
          401,
        );
      }
      const sessionLifetime = Math.min(
        config.executiveSessionTtlSeconds,
        registration.maximumSessionLifetimeSeconds,
      );
      const claims = Object.freeze({
        v: 1,
        contract: REGISTERED_EXECUTIVE_SESSION_CONTRACT,
        sid: `EXEC-SESSION-${randomBytes(18).toString("base64url")}`,
        registrationId: registration.registrationId,
        principalId: registration.principalId,
        principalType: registration.principalType,
        provider: registration.provider,
        providerIssuer: registration.providerIssuer,
        providerSubjectBinding: identity.providerSubjectBinding,
        providerAssertionVerified: true,
        humanVerified: true,
        tenantId: registration.tenantId,
        workspaceId: registration.workspaceId,
        role: registration.role,
        scopes: Object.freeze([...registration.scopes]),
        policyId: registration.policyId,
        policyVersion: registration.policyVersion,
        policyDigest: registration.policyDigest,
        sessionVersion: registration.sessionVersion,
        revocationCheckpoint: registration.revocationCheckpoint,
        authenticationMethods: Object.freeze([
          ...identity.authnMethods,
        ]),
        authenticationTime: identity.authnTime,
        sessionIssuedAt: issued,
        sessionExpiresAt: issued + sessionLifetime,
        authorityGranted: false,
        actionAuthorized: false,
        decisionCreated: false,
        missionCreated: false,
      });
      return {
        claims,
        cookie: cookie(encode(claims), sessionLifetime),
        csrfToken: csrf(claims),
      };
    },
    authenticate: (request) =>
      decode(
        cookieMap(request.headers.cookie)[EXECUTIVE_SESSION_COOKIE_NAME],
      ),
    csrfValid: (request, claims) =>
      Boolean(
        claims &&
          !isRevoked(claims, nowSeconds(clock)) &&
          safeEqual(request.headers["x-csrf-token"], csrf(claims)),
    ),
    revoke,
    clearCookie: () => cookie("", 0),
    csrfToken: csrf,
    publicSession: (claims, runtimeVerified = false) =>
      claims
        ? {
            authenticated: true,
            sessionId: claims.sid,
            registrationId: claims.registrationId,
            principalId: claims.principalId,
            principalType: claims.principalType,
            provider: claims.provider,
            providerIssuer: claims.providerIssuer,
            tenantId: claims.tenantId,
            workspaceId: claims.workspaceId,
            role: claims.role,
            scopes: [...claims.scopes],
            policyId: claims.policyId,
            policyVersion: claims.policyVersion,
            policyDigest: claims.policyDigest,
            sessionVersion: claims.sessionVersion,
            revocationCheckpoint: claims.revocationCheckpoint,
            authenticationMethods: [...claims.authenticationMethods],
            authenticationTime: new Date(
              claims.authenticationTime * 1_000,
            ).toISOString(),
            issuedAt: new Date(
              claims.sessionIssuedAt * 1_000,
            ).toISOString(),
            expiresAt: new Date(
              claims.sessionExpiresAt * 1_000,
            ).toISOString(),
            runtimeVerified,
            authorityGranted: false,
            actionAuthorized: false,
            decisionCreated: false,
            missionCreated: false,
            secretValuesExposed: false,
          }
        : {
            authenticated: false,
            runtimeVerified: false,
            authorityGranted: false,
            actionAuthorized: false,
            decisionCreated: false,
            missionCreated: false,
            secretValuesExposed: false,
          },
  });
}

export function createHumanSessionAssertion(
  config,
  claims,
  clock = () => Date.now(),
) {
  const current = nowSeconds(clock);
  if (!activeClaims(claims, config, current)) {
    throw new ExecutiveSessionFailure(
      "executive_session_invalid",
      "The registered executive session is invalid or expired.",
      401,
    );
  }
  const ttl = Math.min(
    config.humanSessionAssertionTtlSeconds,
    MAX_HUMAN_ASSERTION_LIFETIME_SECONDS,
    claims.sessionExpiresAt - current,
  );
  if (ttl < 1) {
    throw new ExecutiveSessionFailure(
      "executive_session_expired",
      "The registered executive session has expired.",
      401,
    );
  }
  const payload = {
    v: 1,
    contract: HUMAN_SESSION_ASSERTION_CONTRACT,
    alg: HUMAN_SESSION_ASSERTION_ALGORITHM,
    kid: config.humanSessionAssertionKeyId,
    iss: config.humanSessionAssertionIssuer,
    aud: config.humanSessionAssertionAudience,
    jti: randomUUID(),
    serviceBindingId: config.humanSessionServiceBindingId,
    clientId: config.humanSessionAssertionClientId,
    sid: claims.sid,
    sessionVersion: claims.sessionVersion,
    registrationId: claims.registrationId,
    principalId: claims.principalId,
    principalType: claims.principalType,
    provider: claims.provider,
    providerIssuer: claims.providerIssuer,
    providerSubjectBinding: claims.providerSubjectBinding,
    providerAssertionVerified: true,
    humanVerified: true,
    authenticationMethods: [...claims.authenticationMethods],
    authenticationTime: claims.authenticationTime,
    tid: claims.tenantId,
    wid: claims.workspaceId,
    role: claims.role,
    scopes: [...claims.scopes],
    policyId: claims.policyId,
    policyVersion: claims.policyVersion,
    policyDigest: claims.policyDigest,
    revocationCheckpoint: claims.revocationCheckpoint,
    iat: current,
    nbf: current,
    exp: current + ttl,
    sessionIssuedAt: claims.sessionIssuedAt,
    sessionExpiresAt: claims.sessionExpiresAt,
    authorityGranted: false,
    actionAuthorized: false,
  };
  const encoded = b64(JSON.stringify(payload));
  return `${encoded}.${hmac(encoded, config.humanSessionAssertionSecret)}`;
}

export function decodeHumanSessionAssertionForTest(token) {
  const [payload] = String(token ?? "").split(".");
  return JSON.parse(unb64(payload).toString("utf8"));
}
