// Mission 3 additive provider integration: interactive Replit Auth (OIDC).
//
// This module implements the Replit-supported server-side sign-in flow with
// `openid-client` and reduces the provider identity to the pre-existing
// opaque `sha256:` provider-subject binding at the earliest possible moment:
// inside the OAuth callback, before anything is persisted. The Gateway never
// retains, exposes, or forwards the raw provider subject or any provider
// token. The browser only ever holds an HMAC-signed, HttpOnly session cookie
// whose payload already contains the reduced binding.
//
// The interactive flow only authenticates a human at the provider. It grants
// no Authority, Decision, Mission, approval, or action authorization, and it
// does not select identity, tenant, workspace, role, scope, or policy: those
// remain owned exclusively by the server-side registration mapping consumed
// by POST /api/executive-session/login.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  ExecutiveSessionFailure,
  providerSubjectBinding,
} from "./executive-session.mjs";

export const PROVIDER_SESSION_COOKIE_NAME = "nexus_provider_auth";
export const PROVIDER_AUTH_TRANSACTION_COOKIE_NAME = "nexus_provider_txn";
const PROVIDER_SESSION_VERSION = 1;
const TRANSACTION_TTL_SECONDS = 300;
const BINDING_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,512}$/;

const nowSeconds = (clock) => Math.floor(clock() / 1_000);

function sign(secret, encoded) {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

function sealed(secret, payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(secret, encoded)}`;
}

function opened(secret, token) {
  const [encoded, signature, extra] = String(token ?? "").split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = sign(secret, encoded);
  const provided = Buffer.from(String(signature));
  const wanted = Buffer.from(expected);
  if (provided.byteLength !== wanted.byteLength) return null;
  if (!timingSafeEqual(provided, wanted)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
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
  const forwardedProto = String(request.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol =
    forwardedProto || (request.socket?.encrypted ? "https" : "http");
  const forwardedHost = String(request.headers["x-forwarded-host"] ?? "")
    .split(",")[0]
    .trim();
  const host = (forwardedHost || String(request.headers.host ?? "")).trim();
  if (!host || /[^A-Za-z0-9.:\-\[\]]/.test(host)) return null;
  const bareHost = host.toLowerCase().replace(/:\d+$/, "");
  const loopback =
    bareHost === "127.0.0.1" || bareHost === "localhost" || bareHost === "::1";
  if (config.replitDomains.length > 0 && config.replitDomains.includes(bareHost)) {
    return `https://${bareHost}`;
  }
  const candidate = `${protocol}://${host}`;
  if (config.allowedOrigins.includes(candidate)) return candidate;
  if (loopback && !config.replitDeployment) return candidate;
  return null;
}

export function createProviderSessionService(config, { clock = () => Date.now() } = {}) {
  const secret = String(config.providerSessionSecret ?? "");
  if (secret.length < 32) {
    throw new Error(
      "Interactive Replit Auth requires SESSION_SECRET with at least 32 characters.",
    );
  }
  const ttl = Number(config.providerSessionTtlSeconds ?? 3_600);
  if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 86_400) {
    throw new Error("Provider session lifetime is outside the accepted bounds.");
  }
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
        issuedAuthnTime > current + 60
      ) {
        throw new ExecutiveSessionFailure(
          "provider_identity_invalid",
          "The provider authentication time was invalid.",
          401,
        );
      }
      const payload = {
        v: PROVIDER_SESSION_VERSION,
        binding: String(binding),
        authnTime: issuedAuthnTime,
        issuedAt: current,
        expiresAt: current + ttl,
      };
      return `${PROVIDER_SESSION_COOKIE_NAME}=${sealed(secret, payload)}; ${cookieAttributes(config, { sameSite: "Strict", maxAge: ttl })}`;
    },
    readSession(request) {
      const token = readCookie(request, PROVIDER_SESSION_COOKIE_NAME);
      if (!token) return null;
      const payload = opened(secret, token);
      const current = nowSeconds(clock);
      if (
        !payload ||
        payload.v !== PROVIDER_SESSION_VERSION ||
        !BINDING_PATTERN.test(String(payload.binding ?? "")) ||
        !Number.isSafeInteger(payload.authnTime) ||
        !Number.isSafeInteger(payload.issuedAt) ||
        !Number.isSafeInteger(payload.expiresAt) ||
        payload.authnTime <= 0 ||
        payload.issuedAt > current + 60 ||
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

async function defaultOidc(config) {
  const client = await import("openid-client");
  const discovered = await client.discovery(
    new URL(config.replitAuthIssuer),
    config.replitId,
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
        },
      );
      const claims = tokens.claims();
      // Tokens are consumed for verification only and are dropped here.
      return {
        issuer: String(claims?.iss ?? ""),
        audience: claims?.aud,
        subject: typeof claims?.sub === "string" ? claims.sub : "",
        authnTime: Number(claims?.auth_time ?? nowSeconds(() => Date.now())),
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
  let oidcPromise = null;
  const oidcClient = () => {
    if (oidc) return Promise.resolve(oidc);
    if (!oidcPromise) {
      oidcPromise = defaultOidc(config).catch((error) => {
        oidcPromise = null;
        throw error;
      });
    }
    return oidcPromise;
  };

  const transactionCookie = (payload, maxAge) =>
    `${PROVIDER_AUTH_TRANSACTION_COOKIE_NAME}=${sealed(secret, payload)}; ${cookieAttributes(config, { sameSite: "Lax", maxAge })}`;

  async function handle(request, response) {
    const url = new URL(request.url, "http://portal.invalid");
    const pathname = url.pathname;
    if (request.method !== "GET") {
      return failure(response, 405, "method_not_allowed", "Interactive provider authentication routes accept GET only.");
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
        readCookie(request, PROVIDER_AUTH_TRANSACTION_COOKIE_NAME),
      );
      const current = nowSeconds(clock);
      const state = url.searchParams.get("state") ?? "";
      if (
        !transaction ||
        transaction.v !== PROVIDER_SESSION_VERSION ||
        typeof transaction.state !== "string" ||
        typeof transaction.nonce !== "string" ||
        typeof transaction.codeVerifier !== "string" ||
        typeof transaction.origin !== "string" ||
        !Number.isSafeInteger(transaction.expiresAt) ||
        transaction.expiresAt <= current ||
        state !== transaction.state
      ) {
        return failure(response, 401, "provider_transaction_invalid", "The sign-in transaction was missing, expired, or did not match.", { "Set-Cookie": clearTransaction });
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
        identity.subject.length < 1
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
        const authnTime = Number.isSafeInteger(identity.authnTime) && identity.authnTime > 0
          ? Math.min(identity.authnTime, current)
          : current;
        sessionCookie = sessionService.issueCookie(binding, authnTime);
      } catch {
        return failure(response, 401, "provider_identity_invalid", "Replit Auth did not establish a valid verified identity.", { "Set-Cookie": clearTransaction });
      }
      return redirect(response, "/", {
        "Set-Cookie": [clearTransaction, sessionCookie],
      });
    }
    if (pathname === "/api/auth/logout") {
      const origin = requestOrigin(request, config);
      let destination = "/";
      if (origin) {
        try {
          const provider = await oidcClient();
          destination =
            provider.endSessionUrl({ postLogoutRedirectUri: origin }) ?? "/";
        } catch {
          destination = "/";
        }
      }
      return redirect(response, destination, {
        "Set-Cookie": sessionService.clearCookie(),
      });
    }
    return failure(response, 404, "route_not_allowlisted", "This interactive provider authentication route is not allowlisted.");
  }

  return Object.freeze({ handle, sessionService });
}
