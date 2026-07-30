// Mission 3 additive provider integration: interactive Replit Auth (OIDC).
//
// This module implements the Replit-supported server-side sign-in flow with
// `openid-client` and reduces the provider identity to the pre-existing
// opaque `sha256:` provider-subject binding at the earliest possible moment:
// inside the OAuth callback, before anything is persisted. The Gateway never
// retains, exposes, or forwards the raw provider subject or any provider
// token. The browser only ever holds an authenticated-encrypted, HttpOnly
// session cookie; the reduced binding remains confidential to the server.
//
// The interactive flow only authenticates a human at the provider. It grants
// no Authority, Decision, Mission, approval, or action authorization, and it
// does not select identity, tenant, workspace, role, scope, or policy: those
// remain owned exclusively by the server-side registration mapping consumed
// by POST /api/executive-session/login.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import {
  ExecutiveSessionFailure,
  MAX_PROVIDER_AUTHENTICATION_AGE_SECONDS,
  providerSubjectBinding,
} from "./executive-session.mjs";

export const PROVIDER_SESSION_COOKIE_NAME = "nexus_provider_auth";
export const PROVIDER_AUTH_TRANSACTION_COOKIE_NAME = "nexus_provider_txn";
const PROVIDER_SESSION_VERSION = 1;
const TRANSACTION_TTL_SECONDS = 300;
const PROVIDER_SESSION_CONTRACT = "nexus.replit-auth-provider-session@1.0.0";
const PROVIDER_TRANSACTION_CONTRACT =
  "nexus.replit-auth-provider-transaction@1.0.0";
const PROVIDER_SESSION_SEAL_PURPOSE = "provider-session";
const PROVIDER_TRANSACTION_SEAL_PURPOSE = "provider-transaction";
const BINDING_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,512}$/;
const SEALED_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const OIDC_RESPONSE_MAXIMUM_BYTES = 1_048_576;

const nowSeconds = (clock) => Math.floor(clock() / 1_000);

function sealContext(purpose) {
  return Buffer.from(`nexus.replit-auth.cookie-seal@1\u0000${purpose}`, "utf8");
}

function sealKey(secret, purpose) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.alloc(0),
      sealContext(purpose),
      32,
    ),
  );
}

function sealed(secret, purpose, payload) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(secret, purpose), nonce);
  cipher.setAAD(sealContext(purpose));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

function opened(secret, purpose, token) {
  const [version, encodedNonce, encodedCiphertext, encodedTag, extra] =
    String(token ?? "").split(".");
  if (
    version !== "v1"
    || !encodedNonce
    || !encodedCiphertext
    || !encodedTag
    || extra !== undefined
    || !SEALED_SEGMENT_PATTERN.test(encodedNonce)
    || !SEALED_SEGMENT_PATTERN.test(encodedCiphertext)
    || !SEALED_SEGMENT_PATTERN.test(encodedTag)
  ) {
    return null;
  }
  try {
    const nonce = Buffer.from(encodedNonce, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    if (nonce.byteLength !== 12 || tag.byteLength !== 16) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      sealKey(secret, purpose),
      nonce,
    );
    decipher.setAAD(sealContext(purpose));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]);
    const parsed = JSON.parse(plaintext.toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function exactFields(value, fields) {
  return (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && Object.keys(value).every((field) => fields.includes(field))
  );
}

function providerConfigurationDigest(config, ttl) {
  const canonical = JSON.stringify({
    provider: "replit-auth",
    issuer: config.replitAuthIssuer,
    audience: config.replitAuthAudience,
    clientId: config.replitId,
    secretRef: config.providerSessionSecretRef,
    keyId: config.providerSessionKeyId,
    ttl,
    cookieSecure: config.executiveSessionCookieSecure,
    replitDeployment: config.replitDeployment,
    replitDomains: [...config.replitDomains],
    replitDevDomain: config.replitDevDomain || "",
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function readCookie(request, name) {
  for (const part of String(request.headers.cookie ?? "").split(";")) {
    const item = part.trim();
    if (item.startsWith(`${name}=`)) return item.slice(name.length + 1);
  }
  return "";
}

function cookieAttributes(config, { sameSite, maxAge }) {
  return [
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${maxAge}`,
    ...(config.executiveSessionCookieSecure ? ["Secure"] : []),
  ].join("; ");
}

function requestOrigin(request, config) {
  const proxyAttested =
    config.replitDeployment
    || Boolean(config.replitDevDomain)
    || config.replitDomains.length > 0;
  const forwardedProto = proxyAttested
    ? String(request.headers["x-forwarded-proto"] ?? "")
      .split(",")[0]
      .trim()
      .toLowerCase()
    : "";
  const protocol =
    forwardedProto || (request.socket?.encrypted ? "https" : "http");
  if (protocol !== "http" && protocol !== "https") return null;
  const forwardedHost = proxyAttested
    ? String(request.headers["x-forwarded-host"] ?? "")
      .split(",")[0]
      .trim()
    : "";
  const host = (forwardedHost || String(request.headers.host ?? "")).trim();
  if (!host || /[^A-Za-z0-9.:\-\[\]]/.test(host)) return null;
  const bareHost = host.toLowerCase().replace(/:\d+$/, "");
  const loopback =
    bareHost === "127.0.0.1" || bareHost === "localhost" || bareHost === "::1";
  const publishedReplitHost = config.replitDomains.includes(bareHost);
  const developmentReplitHost =
    Boolean(config.replitDevDomain)
    && bareHost === config.replitDevDomain;
  if (publishedReplitHost || developmentReplitHost) {
    // Replit terminates TLS at its ingress. Its exact configured host is
    // trusted only with the corresponding deployment mode and an attested
    // forwarded HTTPS protocol; neither the Host header nor a secure local
    // socket can silently manufacture that provider-owned deployment state.
    if (forwardedProto !== "https") return null;
    if (publishedReplitHost) {
      return config.replitDeployment ? `https://${bareHost}` : null;
    }
    return !config.replitDeployment ? `https://${bareHost}` : null;
  }
  if (config.replitDeployment) return null;
  const candidate = `${protocol}://${host}`;
  if (config.allowedOrigins.includes(candidate)) return candidate;
  if (loopback && !config.replitDeployment) return candidate;
  return null;
}

export function createProviderSessionService(config, { clock = () => Date.now() } = {}) {
  const secret = String(config.providerSessionSecret ?? "");
  if (secret.length < 32) {
    throw new Error(
      "Interactive Replit Auth requires COMMAND_PORTAL_PROVIDER_SESSION_SECRET with at least 32 characters.",
    );
  }
  const ttl = Number(config.providerSessionTtlSeconds ?? 3_600);
  if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 86_400) {
    throw new Error("Provider session lifetime is outside the accepted bounds.");
  }
  const configurationDigest = providerConfigurationDigest(config, ttl);
  const sessionFields = [
    "v",
    "contract",
    "provider",
    "issuer",
    "audience",
    "clientId",
    "configurationDigest",
    "binding",
    "authnTime",
    "issuedAt",
    "expiresAt",
  ];
  return Object.freeze({
    issueCookie(binding, authnTime) {
      if (!BINDING_PATTERN.test(String(binding ?? ""))) {
        throw new ExecutiveSessionFailure(
          "provider_identity_invalid",
          "The reduced provider-subject binding was invalid.",
          401,
        );
      }
      const current = nowSeconds(clock);
      const issuedAuthnTime = Number(authnTime);
      if (
        !Number.isSafeInteger(issuedAuthnTime) ||
        issuedAuthnTime <= 0 ||
        issuedAuthnTime > current ||
        current - issuedAuthnTime > MAX_PROVIDER_AUTHENTICATION_AGE_SECONDS
      ) {
        throw new ExecutiveSessionFailure(
          "provider_identity_invalid",
          "The provider authentication time was invalid.",
          401,
        );
      }
      const payload = {
        v: PROVIDER_SESSION_VERSION,
        contract: PROVIDER_SESSION_CONTRACT,
        provider: "replit-auth",
        issuer: config.replitAuthIssuer,
        audience: config.replitAuthAudience,
        clientId: config.replitId,
        configurationDigest,
        binding: String(binding),
        authnTime: issuedAuthnTime,
        issuedAt: current,
        expiresAt: current + ttl,
      };
      return `${PROVIDER_SESSION_COOKIE_NAME}=${sealed(
        secret,
        PROVIDER_SESSION_SEAL_PURPOSE,
        payload,
      )}; ${cookieAttributes(config, { sameSite: "Strict", maxAge: ttl })}`;
    },
    readSession(request) {
      const token = readCookie(request, PROVIDER_SESSION_COOKIE_NAME);
      if (!token) return null;
      const payload = opened(secret, PROVIDER_SESSION_SEAL_PURPOSE, token);
      const current = nowSeconds(clock);
      if (
        !payload ||
        !exactFields(payload, sessionFields) ||
        payload.v !== PROVIDER_SESSION_VERSION ||
        payload.contract !== PROVIDER_SESSION_CONTRACT ||
        payload.provider !== "replit-auth" ||
        payload.issuer !== config.replitAuthIssuer ||
        payload.audience !== config.replitAuthAudience ||
        payload.clientId !== config.replitId ||
        payload.configurationDigest !== configurationDigest ||
        !BINDING_PATTERN.test(String(payload.binding ?? "")) ||
        !Number.isSafeInteger(payload.authnTime) ||
        !Number.isSafeInteger(payload.issuedAt) ||
        !Number.isSafeInteger(payload.expiresAt) ||
        payload.authnTime <= 0 ||
        payload.authnTime > payload.issuedAt ||
        payload.issuedAt > current ||
        payload.expiresAt - payload.issuedAt !== ttl ||
        payload.expiresAt <= payload.issuedAt ||
        payload.expiresAt <= current
      ) {
        return null;
      }
      return Object.freeze({
        binding: payload.binding,
        authnTime: payload.authnTime,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
      });
    },
    clearCookie() {
      return `${PROVIDER_SESSION_COOKIE_NAME}=; ${cookieAttributes(config, { sameSite: "Strict", maxAge: 0 })}`;
    },
  });
}

// providerIdentityVerifier for createReplitAuthAdapter: consumes only the
// signed, server-issued provider session. It never sees a raw subject; the
// identity it emits carries the already-reduced opaque binding.
export function createProviderSessionIdentityVerifier(config, sessionService) {
  return async (request) => {
    const session = sessionService.readSession(request);
    if (!session) {
      throw new ExecutiveSessionFailure(
        "provider_authentication_required",
        "A verified Replit Auth sign-in is required before session establishment.",
        401,
      );
    }
    return {
      provider: "replit-auth",
      issuer: config.replitAuthIssuer,
      audience: config.replitAuthAudience,
      subjectBinding: session.binding,
      authnTime: session.authnTime,
      authnMethods: ["replit-auth"],
    };
  };
}

async function boundedOidcFetch(fetchImpl, input, init) {
  const response = await fetchImpl(input, init);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declared)
    && declared > OIDC_RESPONSE_MAXIMUM_BYTES
  ) {
    throw new Error("Replit Auth response exceeded the bounded size.");
  }
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > OIDC_RESPONSE_MAXIMUM_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The bounded failure remains authoritative.
        }
        throw new Error("Replit Auth response exceeded the bounded size.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const bounded = new Response(
    received > 0 ? Buffer.concat(chunks, received) : null,
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    },
  );
  if (response.url) {
    Object.defineProperty(bounded, "url", {
      configurable: true,
      value: response.url,
    });
  }
  return bounded;
}

export async function createDefaultReplitOidcClient(
  config,
  {
    clientModule,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  const client = clientModule ?? await import("openid-client");
  const requestTimeoutSeconds = Math.max(
    1,
    Math.ceil(Number(config.timeoutMs) / 1_000),
  );
  const providerFetch = (input, init) =>
    boundedOidcFetch(fetchImpl, input, init);
  const discovered = await client.discovery(
    new URL(config.replitAuthIssuer),
    config.replitId,
    undefined,
    undefined,
    {
      timeout: requestTimeoutSeconds,
      [client.customFetch]: providerFetch,
    },
  );
  return {
    async authorizationRedirect({ redirectUri }) {
      const codeVerifier = client.randomPKCECodeVerifier();
      const state = client.randomState();
      const nonce = client.randomNonce();
      const url = client.buildAuthorizationUrl(discovered, {
        redirect_uri: redirectUri,
        scope: "openid",
        response_type: "code",
        state,
        nonce,
        max_age: MAX_PROVIDER_AUTHENTICATION_AGE_SECONDS,
        code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: "S256",
        prompt: "login consent",
      });
      return { url: url.href, state, nonce, codeVerifier };
    },
    async exchange({ currentUrl, state, nonce, codeVerifier }) {
      const tokens = await client.authorizationCodeGrant(
        discovered,
        new URL(currentUrl),
        {
          pkceCodeVerifier: codeVerifier,
          expectedState: state,
          expectedNonce: nonce,
          maxAge: MAX_PROVIDER_AUTHENTICATION_AGE_SECONDS,
        },
      );
      const claims = tokens.claims();
      // Tokens are consumed for verification only and are dropped here.
      return {
        issuer: String(claims?.iss ?? ""),
        audience: claims?.aud,
        subject: typeof claims?.sub === "string" ? claims.sub : "",
        authnTime:
          typeof claims?.auth_time === "number" ? claims.auth_time : null,
      };
    },
    endSessionUrl({ postLogoutRedirectUri }) {
      try {
        return client.buildEndSessionUrl(discovered, {
          client_id: config.replitId,
          post_logout_redirect_uri: postLogoutRedirectUri,
        }).href;
      } catch {
        return null;
      }
    },
  };
}

function sendJson(response, status, body, extraHeaders = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": raw.byteLength,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(raw);
}

function redirect(response, location, extraHeaders = {}) {
  response.writeHead(303, {
    Location: location,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": 0,
    ...extraHeaders,
  });
  response.end();
}

function failure(response, status, code, message, extraHeaders = {}) {
  sendJson(
    response,
    status,
    {
      ok: false,
      error: { code, message },
      providerSubjectRetained: false,
      providerTokenRetained: false,
      authorityGranted: false,
      actionAuthorized: false,
      secretValuesExposed: false,
    },
    extraHeaders,
  );
}

export function createReplitAuthInteractiveHandler(
  config,
  { clock = () => Date.now(), oidc } = {},
) {
  const sessionService = createProviderSessionService(config, { clock });
  const secret = String(config.providerSessionSecret);
  const configurationDigest = providerConfigurationDigest(
    config,
    config.providerSessionTtlSeconds,
  );
  const transactionFields = [
    "v",
    "contract",
    "configurationDigest",
    "state",
    "nonce",
    "codeVerifier",
    "origin",
    "issuedAt",
    "expiresAt",
    "challenge",
  ];
  let oidcPromise = null;
  const oidcClient = () => {
    if (oidc) return Promise.resolve(oidc);
    if (!oidcPromise) {
      oidcPromise = createDefaultReplitOidcClient(config).catch((error) => {
        oidcPromise = null;
        throw error;
      });
    }
    return oidcPromise;
  };

  const transactionCookie = (payload, maxAge) =>
    `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${sealed(
      secret,
      PROVIDER_TRANSACTION_SEAL_PURPOSE,
      payload,
    )}; ${cookieAttributes(config, { sameSite: "Lax", maxAge })}`;

  async function handle(request, response) {
    const url = new URL(request.url, "http://portal.invalid");
    const pathname = url.pathname;
    const expectedMethod =
      pathname === "/api/auth/logout" ? "POST" : "GET";
    if (request.method !== expectedMethod) {
      return failure(
        response,
        405,
        "method_not_allowed",
        pathname === "/api/auth/logout"
          ? "Provider sign-out requires same-origin POST."
          : "Interactive provider authentication routes accept GET only.",
      );
    }
    if (pathname === "/api/auth/session") {
      const session = sessionService.readSession(request);
      return sendJson(response, 200, {
        ok: true,
        provider: "replit-auth",
        authenticated: Boolean(session),
        providerSubjectRetained: false,
        providerTokenRetained: false,
        authorityGranted: false,
        actionAuthorized: false,
        secretValuesExposed: false,
      });
    }
    if (pathname === "/api/auth/login") {
      const origin = requestOrigin(request, config);
      if (!origin) {
        return failure(response, 403, "origin_denied", "Interactive sign-in requires a recognized request origin.");
      }
      let redirectPlan;
      try {
        const provider = await oidcClient();
        redirectPlan = await provider.authorizationRedirect({
          redirectUri: `${origin}/api/auth/callback`,
        });
      } catch {
        return failure(response, 503, "provider_unavailable", "Replit Auth sign-in could not be started.");
      }
      if (
        !SAFE_TOKEN_PATTERN.test(String(redirectPlan.state ?? "")) ||
        !SAFE_TOKEN_PATTERN.test(String(redirectPlan.nonce ?? "")) ||
        !SAFE_TOKEN_PATTERN.test(String(redirectPlan.codeVerifier ?? ""))
      ) {
        return failure(response, 503, "provider_unavailable", "Replit Auth sign-in could not be started.");
      }
      const current = nowSeconds(clock);
      const transaction = {
        v: PROVIDER_SESSION_VERSION,
        contract: PROVIDER_TRANSACTION_CONTRACT,
        configurationDigest,
        state: redirectPlan.state,
        nonce: redirectPlan.nonce,
        codeVerifier: redirectPlan.codeVerifier,
        origin,
        issuedAt: current,
        expiresAt: current + TRANSACTION_TTL_SECONDS,
        challenge: randomBytes(8).toString("hex"),
      };
      return redirect(response, redirectPlan.url, {
        "Set-Cookie": transactionCookie(transaction, TRANSACTION_TTL_SECONDS),
      });
    }
    if (pathname === "/api/auth/callback") {
      const clearTransaction = transactionCookie({ v: 0 }, 0);
      const transaction = opened(
        secret,
        PROVIDER_TRANSACTION_SEAL_PURPOSE,
        readCookie(request, PROVIDER_AUTH_TRANSACTION_COOKIE_NAME),
      );
      const current = nowSeconds(clock);
      const state = url.searchParams.get("state") ?? "";
      if (
        !transaction ||
        !exactFields(transaction, transactionFields) ||
        transaction.v !== PROVIDER_SESSION_VERSION ||
        transaction.contract !== PROVIDER_TRANSACTION_CONTRACT ||
        transaction.configurationDigest !== configurationDigest ||
        typeof transaction.state !== "string" ||
        typeof transaction.nonce !== "string" ||
        typeof transaction.codeVerifier !== "string" ||
        typeof transaction.origin !== "string" ||
        !Number.isSafeInteger(transaction.issuedAt) ||
        !Number.isSafeInteger(transaction.expiresAt) ||
        transaction.issuedAt > current ||
        transaction.expiresAt - transaction.issuedAt !==
          TRANSACTION_TTL_SECONDS ||
        transaction.expiresAt <= current ||
        state !== transaction.state
      ) {
        return failure(response, 401, "provider_transaction_invalid", "The sign-in transaction was missing, expired, or did not match.", { "Set-Cookie": clearTransaction });
      }
      const currentOrigin = requestOrigin(request, config);
      if (!currentOrigin || currentOrigin !== transaction.origin) {
        return failure(
          response,
          403,
          "origin_denied",
          "The sign-in callback did not arrive on its bound origin.",
          { "Set-Cookie": clearTransaction },
        );
      }
      let identity;
      try {
        const provider = await oidcClient();
        identity = await provider.exchange({
          currentUrl: `${transaction.origin}${request.url}`,
          state: transaction.state,
          nonce: transaction.nonce,
          codeVerifier: transaction.codeVerifier,
        });
      } catch {
        return failure(response, 401, "provider_exchange_failed", "Replit Auth could not verify the sign-in response.", { "Set-Cookie": clearTransaction });
      }
      const audienceOk =
        identity.audience === config.replitAuthAudience ||
        (Array.isArray(identity.audience) &&
          identity.audience.length === 1 &&
          identity.audience[0] === config.replitAuthAudience);
      if (
        identity.issuer !== config.replitAuthIssuer ||
        !audienceOk ||
        typeof identity.subject !== "string" ||
        identity.subject.length < 1 ||
        !Number.isSafeInteger(identity.authnTime) ||
        identity.authnTime <= 0 ||
        identity.authnTime > current ||
        current - identity.authnTime >
          MAX_PROVIDER_AUTHENTICATION_AGE_SECONDS
      ) {
        return failure(response, 401, "provider_identity_invalid", "Replit Auth did not establish a valid verified identity.", { "Set-Cookie": clearTransaction });
      }
      // Immediate reduction: the raw provider subject exists only inside this
      // scope and is discarded after hashing into the opaque binding.
      let sessionCookie;
      try {
        const binding = providerSubjectBinding(
          "replit-auth",
          identity.issuer,
          identity.subject,
        );
        sessionCookie = sessionService.issueCookie(binding, identity.authnTime);
      } catch {
        return failure(response, 401, "provider_identity_invalid", "Replit Auth did not establish a valid verified identity.", { "Set-Cookie": clearTransaction });
      }
      return redirect(response, "/settings", {
        "Set-Cookie": [clearTransaction, sessionCookie],
      });
    }
    if (pathname === "/api/auth/logout") {
      const origin = requestOrigin(request, config);
      const suppliedOrigin = String(request.headers.origin ?? "").trim();
      if (!origin || suppliedOrigin !== origin) {
        return failure(
          response,
          403,
          "origin_denied",
          "Provider sign-out requires a verified same-origin request.",
        );
      }
      if (!sessionService.readSession(request)) {
        return failure(
          response,
          401,
          "provider_authentication_required",
          "Provider sign-out requires an active verified provider session.",
        );
      }
      let destination;
      try {
        const provider = await oidcClient();
        destination =
          provider.endSessionUrl({ postLogoutRedirectUri: origin });
        const parsed = new URL(destination);
        if (
          parsed.protocol !== "https:"
          || parsed.origin !== new URL(config.replitAuthIssuer).origin
        ) {
          throw new Error("Provider end-session origin did not match.");
        }
      } catch {
        return failure(
          response,
          503,
          "provider_unavailable",
          "Replit Auth sign-out could not be started.",
        );
      }
      return sendJson(
        response,
        200,
        {
          ok: true,
          providerLogoutUrl: destination,
          providerSessionCleared: true,
          providerSubjectRetained: false,
          providerTokenRetained: false,
          authorityGranted: false,
          actionAuthorized: false,
          secretValuesExposed: false,
        },
        { "Set-Cookie": sessionService.clearCookie() },
      );
    }
    return failure(response, 404, "route_not_allowlisted", "This interactive provider authentication route is not allowlisted.");
  }

  return Object.freeze({ handle, sessionService });
}
