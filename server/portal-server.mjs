import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID } from "node:crypto";
import { createSessionAuthority, requiredScope } from "./operational-auth.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(ROOT, "dist");

export const SUPPORTED_SCHEMA_VERSION = "1.0.0";
export const SUPPORTED_RUNTIME_VERSION = "0.1.0";
const CONTEXT_ASSERTION_AUDIENCE = "nexus-runtime";
const CONTEXT_ASSERTION_ISSUER = "command-portal-experience-gateway";

export const RUNTIME_ROUTES = Object.freeze({
  "/api/runtime/status": "/runtime/status",
  "/api/runtime/health": "/health",
  "/api/runtime/ready": "/ready",
  "/api/runtime/version": "/runtime/version",
  "/api/runtime/providers": "/runtime/providers",
  "/api/runtime/capabilities": "/runtime/capabilities",
  "/api/runtime/proofs": "/runtime/proofs",
  "/api/runtime/receipts": "/runtime/receipts",
  "/api/runtime/environment": "/runtime/environment",
  "/api/runtime/diagnostics": "/runtime/diagnostics",
  "/api/runtime/governance": "/runtime/governance",
  "/api/runtime/connectors": "/runtime/connectors",
  "/api/runtime/realtime-voice": "/runtime/voice/realtime/status",
  "/api/runtime/conclave": "/runtime/conclave/status",
  "/api/runtime/eox": "/runtime/executive-operating-loop",
  "/api/runtime/replay": "/runtime/replay"
});

const REPLAY_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;
const REPLAY_STAGES = new Set(["observation", "evidence", "representation", "conclave", "authority", "decision", "receipt"]);

export function resolveRuntimeReadRoute(pathname) {
  if (RUNTIME_ROUTES[pathname]) return RUNTIME_ROUTES[pathname];
  const detail = pathname.match(/^\/api\/runtime\/replay\/([^/]+)$/);
  if (detail) return REPLAY_ID_PATTERN.test(detail[1]) ? `/runtime/replay/${detail[1]}` : null;
  const events = pathname.match(/^\/api\/runtime\/replay\/([^/]+)\/events$/);
  if (events) return REPLAY_ID_PATTERN.test(events[1]) ? `/runtime/replay/${events[1]}/events` : null;
  const explain = pathname.match(/^\/api\/runtime\/replay\/([^/]+)\/stages\/([^/]+)\/explain$/);
  if (explain) return REPLAY_ID_PATTERN.test(explain[1]) && REPLAY_STAGES.has(explain[2]) ? `/runtime/replay/${explain[1]}/stages/${explain[2]}/explain` : null;
  return null;
}

export const RUNTIME_MUTATION_ROUTES = Object.freeze({
  "/api/runtime/executive-briefing": "/runtime/executive-operating-loop/briefing",
  "/api/runtime/conclave/reviews": "/runtime/conclave/reviews",
  "/api/runtime/interactions": "/runtime/interactions"
});

function resolveRuntimeMutation(pathname) {
  if (RUNTIME_MUTATION_ROUTES[pathname]) return RUNTIME_MUTATION_ROUTES[pathname];
  const match = pathname.match(/^\/api\/runtime\/interactions\/([A-Z0-9-]+)\/(interrupt|resume|presentation-complete)$/);
  return match ? `/runtime/interactions/${match[1]}/${match[2]}` : null;
}

export const LOCAL_CAPABILITY_ROUTES = Object.freeze({
  "/api/local/status": { method: "GET", runtimePath: "/health" },
  "/api/local/intake/history": { method: "GET", runtimePath: "/intake/history?limit=30" },
  "/api/local/intake/upload": { method: "POST", runtimePath: "/intake/upload" },
  "/api/local/intake/query": { method: "POST", runtimePath: "/intake/query" },
  "/api/local/projects": { method: "POST", runtimePath: "/projects" },
  "/api/local/projects/artifact-types": { method: "GET", runtimePath: "/projects/artifact-types" },
  "/api/local/client-capabilities": { method: "GET", runtimePath: "/client-capabilities" },
  "/api/local/missions": { method: "GET", runtimePath: "/missions/history?limit=8" },
  "/api/local/missions/plan": { method: "POST", runtimePath: "/missions/plan" },
  "/api/local/conclave/workspaces": { method: "GET", runtimePath: "/conclave/workspaces" },
  "/api/local/work-sessions": { method: "GET", runtimePath: "/work-sessions?limit=8" },
  "/api/local/work-sessions/plan": { method: "POST", runtimePath: "/work-sessions/plan" },
  "/api/local/work-sessions/start": { method: "POST", runtimePath: "/work-sessions/start" },
  "/api/local/approvals": { method: "GET", runtimePath: "/approvals?limit=12" },
  "/api/local/actions/dry-run": { method: "POST", runtimePath: "/actions/dry-run" },
  "/api/local/actions/execute": { method: "POST", runtimePath: "/actions/execute" },
  "/api/local/connectors": { method: "GET", runtimePath: "/connectors" },
  "/api/local/connectors/health": { method: "GET", runtimePath: "/connectors/health" },
  "/api/local/proofs": { method: "GET", runtimePath: "/proof/recent?limit=8" },
  "/api/local/receipts": { method: "GET", runtimePath: "/receipts?limit=12" },
  "/api/local/voice/status": { method: "GET", runtimePath: "/voice/status" },
  "/api/local/voice-operator/status": { method: "GET", runtimePath: "/voice-operator/status" },
  "/api/local/voice-operator/history": { method: "GET", runtimePath: "/voice-operator/history?limit=8" },
  "/api/local/voice-operator/receipts": { method: "GET", runtimePath: "/voice-operator/receipts?limit=8" },
  "/api/local/voice-operator/route-transcript": { method: "POST", runtimePath: "/voice-operator/route-transcript" },
  "/api/local/interactions/status": { method: "GET", runtimePath: "/runtime/interactions/status", target: "platform" },
  "/api/local/interactions": { method: "POST", runtimePath: "/runtime/interactions", target: "platform" }
});

export const REPLAY_ROUTES = Object.freeze({
  "/api/replay/replay.json": "/replay.json",
  "/api/replay/events": "/events",
  "/api/replay/export/replay-package.zip": "/export/replay-package.zip",
  "/api/replay/export/replay.pdf": "/export/replay.pdf",
  "/api/replay/export/replay.json": "/export/replay.json",
  "/api/replay/export/audit-package.zip": "/export/audit-package.zip",
  "/api/replay/export/replay-receipt.json": "/export/replay-receipt.json"
});

const PROJECT_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;
const PROJECT_READ_ACTIONS = new Set(["sources", "evidence", "scope", "estimate", "planning-model", "artifacts"]);
const PROJECT_ARTIFACT_TYPES = new Set(["roadmap", "project_plan", "scope_of_work", "proposal", "backlog", "risk_register", "status_report", "executive_briefing"]);
const ADMISSION_ID_PATTERN = /^[A-Za-z0-9_.:@-]{1,160}$/;
const OPERATIONAL_RECORD_ID_PATTERN = /^[A-Za-z0-9_.:@-]{1,160}$/;
const RUNTIME_CAPABILITY_PATTERN = /^nexus\.[A-Za-z0-9][A-Za-z0-9._:-]{0,158}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;
const RESERVED_ADMISSION_METADATA_KEYS = new Set([
  "tenantid", "workspaceid", "principalid", "requestingprincipalid", "authoritygrantid",
  "decisionid", "accountabilityid", "nodeid", "operationalassetid", "verificationstate",
  "approvalstate", "approved", "truststate", "lifecyclestate", "credential", "credentialref",
  "challenge", "proof", "receipt", "replay",
]);
const RUNTIME_COORDINATION_SECRET_FIELDS = new Set([
  "challengeid", "challengevalue", "rawchallenge", "challengesecret", "challengehash",
  "challengeverifier", "credential", "credentialref", "credentialvalue", "privatekey",
  "authoritytoken", "sessionsecret", "sessiontoken", "runtimeaccesstoken", "runtimetoken",
  "operatoraccesskey", "accesskey", "password", "privatekeymaterial", "authoritysigningmaterial",
  "enrollmentchallengesecret", "authorization", "token", "accesstoken", "refreshtoken", "secret",
  "signingkey",
]);
const UNTRUSTED_OPERATIONAL_FIELDS = new Set([
  "identity", "tenant", "tenantid", "workspace", "workspaceid", "principal", "principalid",
  "requestingprincipal", "requestingprincipalid", "user", "userid", "role", "roles", "scope", "scopes",
  "authority", "authorities", "authoritygrant", "authoritygrantid", "approval", "approvals", "approvalid",
  "approvalrequired", "approvalgranted", "approved", "approvalstate", "decisionid", "evidencevalidity",
  "evidencevalid", "evidencevalidation", "evidenceverified", "missionowner", "missionownership",
  "verification", "verified", "verificationstate", "verificationstatus", "principalrole", "servicerole",
  "authorizationrole", "authenticatedrole",
]);

const CACHEABLE_ROUTES = new Set([
  "/api/runtime/status",
  "/api/runtime/version",
  "/api/runtime/providers",
  "/api/runtime/capabilities",
  "/api/runtime/environment",
  "/api/runtime/governance",
  "/api/runtime/connectors"
]);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".zip": "application/zip"
};
const ABSENT_BROWSER_METADATA = new Set([
  "/service-worker.js", "/sw.js", "/manifest.json", "/manifest.webmanifest",
]);

const TRUTH = Object.freeze({
  productionReady: false,
  enterpriseReady: false,
  cloudPrimary: false,
  localSourceOfTruth: true,
  defaultProvider: "mock_model",
  conclave: "available_bounded_review",
  actualTrainedSLMs: 0,
  secretValuesExposed: false
});

const integer = (value, fallback, minimum = 1) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
};

const enabled = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

function safeRuntimeUrl(value) {
  const parsed = new URL(value);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("COMMAND_PORTAL_RUNTIME_API_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.");
  }
  return parsed.href.replace(/\/$/, "");
}

function safeLocalApiUrl(value) {
  const parsed = new URL(value);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("COMMAND_PORTAL_LOCAL_API_BASE_URL must be a loopback HTTP(S) URL without credentials, query, or fragment.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    throw new Error("COMMAND_PORTAL_LOCAL_API_BASE_URL must target the private loopback interface.");
  }
  return parsed.href.replace(/\/$/, "");
}

function safeOperationalApiUrl(value) {
  const parsed = new URL(value);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("COMMAND_PORTAL_OPERATIONAL_API_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.");
  }
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname.toLowerCase());
  if (parsed.protocol !== "https:" && !loopback) throw new Error("Hosted operational Runtime traffic requires HTTPS.");
  return parsed.href.replace(/\/$/, "");
}

function safeReplayApiUrl(value) {
  const parsed = new URL(value);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("COMMAND_PORTAL_REPLAY_API_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.");
  }
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname.toLowerCase());
  if (parsed.protocol !== "https:" && !loopback) throw new Error("Hosted Operational Replay traffic requires HTTPS.");
  return parsed.href.replace(/\/$/, "");
}

function requiredSecret(value, name, minimum = 24) {
  const secret = String(value ?? "");
  if (secret.length < minimum) throw new Error(`${name} is required and must contain at least ${minimum} characters when hosted operations are enabled.`);
  return secret;
}

function optionalSecret(value, name, minimum = 32) {
  const secret = String(value ?? "");
  if (secret && secret.length < minimum) throw new Error(`${name} must contain at least ${minimum} characters when configured.`);
  return secret;
}

const encodeBase64Url = (value) => Buffer.from(value).toString("base64url");

export function createTenantContextAssertion(config, claims, clientId, clock = () => Date.now()) {
  if (!config.contextAssertionSecret) return "";
  const issuedAt = Math.floor(clock() / 1000);
  const payload = {
    v: 1,
    iss: CONTEXT_ASSERTION_ISSUER,
    aud: CONTEXT_ASSERTION_AUDIENCE,
    tid: claims?.tenantId ?? config.operationalTenantId,
    sub: claims?.sub ?? config.contextAssertionPrincipalId,
    roles: claims?.role ? [claims.role] : ["observer"],
    clientId,
    iat: issuedAt,
    exp: issuedAt + 60,
    jti: randomUUID()
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", config.contextAssertionSecret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function loadConfig(overrides = {}) {
  const runtimeBaseUrl = safeRuntimeUrl(String(
    overrides.runtimeBaseUrl ?? process.env.COMMAND_PORTAL_RUNTIME_API_BASE_URL ?? "https://nexus-runtime-dev.fly.dev"
  ));
  const runtimeToken = String(overrides.runtimeToken ?? process.env.COMMAND_PORTAL_RUNTIME_READ_TOKEN ?? "");
  if (!runtimeToken) throw new Error("COMMAND_PORTAL_RUNTIME_READ_TOKEN is required and must remain server-only.");
  const localApiBaseUrl = safeLocalApiUrl(String(
    overrides.localApiBaseUrl ?? process.env.COMMAND_PORTAL_LOCAL_API_BASE_URL ?? "http://127.0.0.1:8765"
  ));
  const platformRuntimeBaseUrl = safeLocalApiUrl(String(
    overrides.platformRuntimeBaseUrl ?? process.env.COMMAND_PORTAL_PLATFORM_RUNTIME_API_BASE_URL ?? "http://127.0.0.1:8080"
  ));
  const localCapabilitiesEnabled = enabled(overrides.localCapabilitiesEnabled ?? process.env.COMMAND_PORTAL_LOCAL_CAPABILITIES_ENABLED);
  const replayEnabled = enabled(overrides.replayEnabled ?? process.env.COMMAND_PORTAL_REPLAY_ENABLED);
  const replayBaseUrl = safeReplayApiUrl(String(
    overrides.replayBaseUrl ?? process.env.COMMAND_PORTAL_REPLAY_API_BASE_URL ?? "http://127.0.0.1:4317"
  ));
  const operationalEnabled = enabled(overrides.operationalEnabled ?? process.env.COMMAND_PORTAL_OPERATIONAL_ENABLED);
  if (operationalEnabled && (localCapabilitiesEnabled || replayEnabled)) {
    throw new Error("Hosted operational mode cannot coexist with local capability or legacy Replay gateways.");
  }
  const operationalApiBaseUrl = safeOperationalApiUrl(String(
    overrides.operationalApiBaseUrl ?? process.env.COMMAND_PORTAL_OPERATIONAL_API_BASE_URL ?? "https://nexus-operations.invalid"
  ));
  const operationalScopes = String(overrides.operationalScopes ?? process.env.COMMAND_PORTAL_OPERATIONAL_SCOPES ?? "operations:read,operations:write,actions:simulate,actions:execute,approvals:decide,evidence:write,knowledge:promote,edge:node_admission:request")
    .split(",").map((item) => item.trim()).filter(Boolean);
  return Object.freeze({
    port: integer(overrides.port ?? process.env.PORT, 4173, 0),
    runtimeBaseUrl,
    runtimePublicUrl: new URL(runtimeBaseUrl).origin,
    runtimeToken,
    localCapabilitiesEnabled,
    localApiBaseUrl,
    platformRuntimeBaseUrl,
    replayEnabled,
    replayBaseUrl,
    replayMaxResponseBytes: integer(overrides.replayMaxResponseBytes ?? process.env.COMMAND_PORTAL_REPLAY_MAX_RESPONSE_BYTES, 26_214_400),
    allowedOrigins: String(overrides.allowedOrigins ?? process.env.COMMAND_PORTAL_ALLOWED_ORIGINS ?? "")
      .split(",").map((item) => item.trim()).filter(Boolean),
    timeoutMs: integer(overrides.timeoutMs ?? process.env.COMMAND_PORTAL_REQUEST_TIMEOUT_MS, 8_000),
    reasoningTimeoutMs: integer(overrides.reasoningTimeoutMs ?? process.env.COMMAND_PORTAL_REASONING_TIMEOUT_MS, 35_000),
    realtimeTimeoutMs: integer(overrides.realtimeTimeoutMs ?? process.env.COMMAND_PORTAL_REALTIME_TIMEOUT_MS, 25_000),
    cacheTtlMs: integer(overrides.cacheTtlMs ?? process.env.COMMAND_PORTAL_CACHE_TTL_MS, 15_000),
    maxResponseBytes: integer(overrides.maxResponseBytes ?? process.env.COMMAND_PORTAL_MAX_RESPONSE_BYTES, 1_048_576),
    localMaxRequestBytes: integer(overrides.localMaxRequestBytes ?? process.env.COMMAND_PORTAL_LOCAL_MAX_REQUEST_BYTES, 37_748_736),
    localMaxResponseBytes: integer(overrides.localMaxResponseBytes ?? process.env.COMMAND_PORTAL_LOCAL_MAX_RESPONSE_BYTES, 5_242_880),
    localTimeoutMs: integer(overrides.localTimeoutMs ?? process.env.COMMAND_PORTAL_LOCAL_REQUEST_TIMEOUT_MS, 30_000),
    operationalEnabled,
    operationalApiBaseUrl,
    operationalRuntimeToken: operationalEnabled ? requiredSecret(overrides.operationalRuntimeToken ?? process.env.COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN, "COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN") : "",
    operationalSessionSecret: operationalEnabled ? requiredSecret(overrides.operationalSessionSecret ?? process.env.COMMAND_PORTAL_SESSION_SECRET, "COMMAND_PORTAL_SESSION_SECRET", 32) : "disabled-session-secret-not-used",
    operationalAccessKey: operationalEnabled ? requiredSecret(overrides.operationalAccessKey ?? process.env.COMMAND_PORTAL_OPERATOR_ACCESS_KEY, "COMMAND_PORTAL_OPERATOR_ACCESS_KEY", 16) : "disabled-access-key",
    operationalUserId: String(overrides.operationalUserId ?? process.env.COMMAND_PORTAL_OPERATOR_USER_ID ?? "operator-alpha"),
    operationalTenantId: String(overrides.operationalTenantId ?? process.env.COMMAND_PORTAL_TENANT_ID ?? "nexicron"),
    operationalWorkspaceId: String(overrides.operationalWorkspaceId ?? process.env.COMMAND_PORTAL_WORKSPACE_ID ?? "primary"),
    operationalRole: String(overrides.operationalRole ?? process.env.COMMAND_PORTAL_OPERATOR_ROLE ?? "admin"),
    contextAssertionSecret: optionalSecret(overrides.contextAssertionSecret ?? process.env.NEXUS_CONTEXT_ASSERTION_SECRET, "NEXUS_CONTEXT_ASSERTION_SECRET"),
    contextAssertionPrincipalId: String(overrides.contextAssertionPrincipalId ?? process.env.COMMAND_PORTAL_CONTEXT_PRINCIPAL_ID ?? "command-portal-observer"),
    operationalScopes,
    operationalSessionTtlSeconds: integer(overrides.operationalSessionTtlSeconds ?? process.env.COMMAND_PORTAL_SESSION_TTL_SECONDS, 3600, 300),
    operationalCookieSecure: enabled(overrides.operationalCookieSecure ?? process.env.COMMAND_PORTAL_COOKIE_SECURE, true),
    maxAttempts: integer(overrides.maxAttempts, 3),
    retryDelayMs: integer(overrides.retryDelayMs, 100, 0)
  });
}

class GatewayFailure extends Error {
  constructor(code, message, state, status, retryable = false, details = undefined) {
    super(message);
    this.name = "GatewayFailure";
    this.code = code;
    this.state = state;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const nowIso = () => new Date().toISOString();

function structuredLog(event, fields = {}) {
  console.log(JSON.stringify({ timestamp: nowIso(), event, ...fields }));
}

function requestOriginAllowed(request, config, originRequired = false) {
  const origin = request.headers.origin;
  if (!origin) return !(originRequired && config.operationalCookieSecure);
  if (origin === "null") return false;
  const forwardedProto = String(request.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
  const protocol = forwardedProto || (request.socket.encrypted ? "https" : "http");
  const selfOrigin = request.headers.host ? `${protocol}://${request.headers.host}` : "";
  return origin === selfOrigin || config.allowedOrigins.includes(origin);
}

function cacheMetadata(entry, cached, stale = false) {
  if (!entry) return { lastRefresh: null, age: null, stale: false, expires: null, cached: false };
  return {
    lastRefresh: new Date(entry.refreshedAt).toISOString(),
    age: Math.max(0, Date.now() - entry.refreshedAt),
    stale,
    expires: new Date(entry.expiresAt).toISOString(),
    cached
  };
}

function gatewayMetadata(config, tracker, route, state, entry, additions = {}) {
  return {
    status: state === "Healthy" ? "Healthy" : state === "Connecting" || state === "Retrying" ? state : "Degraded",
    connectionState: state,
    route,
    runtimeUrl: config.runtimePublicUrl,
    lastSuccessfulConnection: tracker.lastSuccessfulConnection,
    lastSuccessfulRefresh: tracker.lastSuccessfulRefresh,
    cache: cacheMetadata(entry, false),
    readOnly: true,
    secretValuesExposed: false,
    ...additions
  };
}

function sendJson(response, status, body, extraHeaders = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": raw.byteLength,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
    ...extraHeaders
  });
  response.end(raw);
}

function localEnvelope(config, route, data, additions = {}) {
  return {
    ok: true,
    data,
    local: {
      mode: "local_first",
      route,
      runtimeUrl: new URL(config.localApiBaseUrl).origin,
      enabled: true,
      authoritative: "NEXUS Runtime",
      contextAssemblyOwner: "NEXUS Runtime",
      secretValuesExposed: false,
      ...additions
    },
    truth: TRUTH
  };
}

function localFailure(config, route, code, message, state = "Unavailable") {
  return {
    ok: false,
    data: null,
    local: {
      mode: "local_first",
      route,
      runtimeUrl: new URL(config.localApiBaseUrl).origin,
      enabled: config.localCapabilitiesEnabled,
      authoritative: "NEXUS Runtime",
      contextAssemblyOwner: "NEXUS Runtime",
      connectionState: state,
      secretValuesExposed: false
    },
    truth: TRUTH,
    error: { code, message }
  };
}

function operationalEnvelope(config, route, data, claims) {
  return {
    ok: true, data,
    operational: {
      mode: "hosted_single_workspace_alpha", route,
      runtimeUrl: new URL(config.operationalApiBaseUrl).origin,
      enabled: true, authenticated: true, userId: claims.sub,
      tenantId: claims.tenantId, workspaceId: claims.workspaceId, role: claims.role,
      authoritative: "NEXUS Runtime", contextAssemblyOwner: "NEXUS Runtime",
      productionMultiTenantReady: false, secretValuesExposed: false
    },
    truth: TRUTH
  };
}

function operationalFailure(config, route, code, message, status = "Unavailable", details = undefined) {
  return {
    ok: false, data: null,
    operational: {
      mode: "hosted_single_workspace_alpha", route, enabled: config.operationalEnabled,
      authenticated: false, connectionState: status, authoritative: "NEXUS Runtime",
      contextAssemblyOwner: "NEXUS Runtime", productionMultiTenantReady: false,
      secretValuesExposed: false
    },
    truth: TRUTH, error: { code, message, ...(details ? { details } : {}) }
  };
}

function resolveLocalCapability(pathname, method) {
  if (pathname === "/api/local/runtime-coordination/nodes") {
    return method === "GET"
      ? { method, runtimePath: "/runtime-coordination/nodes" }
      : { methodMismatch: true, allowed: "GET" };
  }
  const runtimeNode = pathname.match(/^\/api\/local\/runtime-coordination\/nodes\/([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)$/);
  if (runtimeNode) {
    return method === "GET"
      ? { method, runtimePath: `/runtime-coordination/nodes/${runtimeNode[1]}` }
      : { methodMismatch: true, allowed: "GET" };
  }
  if (pathname === "/api/local/runtime-coordination/admissions") {
    return ["GET", "POST"].includes(method)
      ? { method, runtimePath: "/runtime-coordination/admissions" }
      : { methodMismatch: true, allowed: "GET, POST" };
  }
  const admission = pathname.match(/^\/api\/local\/runtime-coordination\/admissions\/([^/]+)(?:\/(cancel|challenge\/reissue|receipt|replay))?$/);
  if (admission) {
    let admissionRequestId;
    try { admissionRequestId = decodeURIComponent(admission[1]); } catch { return null; }
    if (!ADMISSION_ID_PATTERN.test(admissionRequestId)) return null;
    const action = admission[2] ?? "read";
    const expectedMethod = ["read", "receipt", "replay"].includes(action) ? "GET" : "POST";
    if (method !== expectedMethod) return { methodMismatch: true, allowed: expectedMethod };
    const encodedId = encodeURIComponent(admissionRequestId);
    return {
      method,
      runtimePath: `/runtime-coordination/admissions/${encodedId}${action === "read" ? "" : `/${action}`}`,
    };
  }
  const direct = LOCAL_CAPABILITY_ROUTES[pathname];
  if (pathname === "/api/local/conclave/workspaces" && method === "POST") {
    return { method, runtimePath: "/conclave/workspaces" };
  }
  if (direct) return direct.method === method ? direct : { methodMismatch: true, allowed: direct.method };
  const match = pathname.match(/^\/api\/local\/projects\/([A-Za-z0-9_.:-]{1,160})\/(sources|evidence|scope|estimate|planning-model|artifacts|compile)$/);
  if (!match) {
    const conclaveWorkspace = pathname.match(/^\/api\/local\/conclave\/workspaces\/([A-Za-z0-9_.:-]{1,160})$/);
    if (conclaveWorkspace) {
      return method === "GET"
        ? { method, runtimePath: `/conclave/workspaces/${conclaveWorkspace[1]}` }
        : { methodMismatch: true, allowed: "GET" };
    }
    const conclaveEvidence = pathname.match(/^\/api\/local\/conclave\/workspaces\/([A-Za-z0-9_.:-]{1,160})\/tasks\/([A-Za-z0-9_.:-]{1,160})\/evidence$/);
    if (conclaveEvidence) {
      return method === "POST"
        ? { method, runtimePath: `/conclave/workspaces/${conclaveEvidence[1]}/tasks/${conclaveEvidence[2]}/evidence` }
        : { methodMismatch: true, allowed: "POST" };
    }
    const interaction = pathname.match(/^\/api\/local\/interactions\/([A-Z0-9-]+)\/(events|interrupt|presentation-complete)$/);
    if (interaction) {
      const expectedMethod = interaction[2] === "events" ? "GET" : "POST";
      if (method !== expectedMethod) return { methodMismatch: true, allowed: expectedMethod };
      return { method: expectedMethod, runtimePath: `/runtime/interactions/${interaction[1]}/${interaction[2]}`, target: "platform" };
    }
    const mission = pathname.match(/^\/api\/local\/missions\/([A-Za-z0-9_.:-]{1,160})\/execute-step$/);
    if (mission) return method === "POST" ? { method, runtimePath: `/missions/${mission[1]}/execute-step` } : { methodMismatch: true, allowed: "POST" };
    const approval = pathname.match(/^\/api\/local\/approvals\/([A-Za-z0-9_.:-]{1,160})\/(approve|deny)$/);
    if (approval) return method === "POST" ? { method, runtimePath: `/approvals/${approval[1]}/${approval[2]}` } : { methodMismatch: true, allowed: "POST" };
    const session = pathname.match(/^\/api\/local\/work-sessions\/([A-Za-z0-9_.:-]{1,160})(?:\/(step|continue|pause|cancel|receipt))?$/);
    if (session) {
      const action = session[2] ?? "read";
      const expectedMethod = ["read", "receipt"].includes(action) ? "GET" : "POST";
      if (method !== expectedMethod) return { methodMismatch: true, allowed: expectedMethod };
      return { method, runtimePath: `/work-sessions/${session[1]}${action === "read" ? "" : `/${action}`}` };
    }
    return null;
  }
  if (!PROJECT_ID_PATTERN.test(match[1])) return null;
  const [, projectId, action] = match;
  const expectedMethod = action === "compile" ? "POST" : "GET";
  if (method !== expectedMethod) return { methodMismatch: true, allowed: expectedMethod };
  if (expectedMethod === "GET" && !PROJECT_READ_ACTIONS.has(action)) return null;
  return { method: expectedMethod, runtimePath: `/projects/${projectId}/${action}` };
}

export const CANONICAL_OPERATIONAL_ROUTES = Object.freeze({
  "/api/operations/capabilities/readiness": Object.freeze({ GET: "/capabilities/readiness" }),
  "/api/operations/missions": Object.freeze({ GET: "/missions" }),
  "/api/operations/conclave/workspaces": Object.freeze({ GET: "/conclave/workspaces", POST: "/conclave/workspaces" }),
  "/api/operations/operational-replay": Object.freeze({ GET: "/operational-replay" }),
  "/api/operations/operational-replay/failures": Object.freeze({ GET: "/operational-replay/failures" }),
  "/api/operations/receipts": Object.freeze({ GET: "/receipts" }),
  "/api/operations/mission-store": Object.freeze({ GET: "/mission-store" }),
  "/api/operations/knowledge/intake": Object.freeze({ POST: "/knowledge/intake" }),
  "/api/operations/knowledge/acquisitions": Object.freeze({ GET: "/knowledge/acquisitions" }),
  "/api/operations/knowledge/promotion-candidates": Object.freeze({ GET: "/knowledge/promotion-candidates" }),
  "/api/operations/knowledge/promotions": Object.freeze({ GET: "/knowledge/promotions", POST: "/knowledge/promotions" }),
  "/api/operations/knowledge/store": Object.freeze({ GET: "/knowledge/store" }),
  "/api/operations/knowledge/receipts": Object.freeze({ GET: "/knowledge/receipts" }),
  "/api/operations/runtime/baselines": Object.freeze({ GET: "/runtime/baselines", POST: "/runtime/baselines" }),
  "/api/operations/governance/readiness": Object.freeze({ GET: "/governance/readiness" }),
  "/api/operations/authority/readiness": Object.freeze({ GET: "/authority/readiness" }),
  "/api/operations/runtime-coordination/nodes": Object.freeze({ GET: "/runtime-coordination/nodes" }),
  "/api/operations/runtime-coordination/events": Object.freeze({ GET: "/runtime-coordination/events" }),
  "/api/operations/runtime-coordination/admissions": Object.freeze({ GET: "/runtime-coordination/admissions", POST: "/runtime-coordination/admissions" }),
});

function operationalMethod(route, method) {
  const runtimePath = route?.[method];
  if (runtimePath) return { method, runtimePath, canonicalHosted: true };
  if (!route) return null;
  return { methodMismatch: true, allowed: Object.keys(route).join(", ") };
}

function operationalIdentifier(raw) {
  let identifier;
  try { identifier = decodeURIComponent(raw); } catch { return null; }
  return OPERATIONAL_RECORD_ID_PATTERN.test(identifier) ? encodeURIComponent(identifier) : null;
}

export function resolveOperationalCapability(pathname, method) {
  const direct = operationalMethod(CANONICAL_OPERATIONAL_ROUTES[pathname], method);
  if (direct) return direct;

  const replayStageExplanation = pathname.match(/^\/api\/operations\/operational-replay\/([^/]+)\/stages\/([^/]+)\/explain$/);
  if (replayStageExplanation) {
    const replayId = operationalIdentifier(replayStageExplanation[1]);
    const stageId = operationalIdentifier(replayStageExplanation[2]);
    if (!replayId || !stageId) return null;
    return operationalMethod({ GET: `/operational-replay/${replayId}/stages/${stageId}/explain` }, method);
  }
  const replayStage = pathname.match(/^\/api\/operations\/operational-replay\/([^/]+)\/stages\/([^/]+)$/);
  if (replayStage) {
    const replayId = operationalIdentifier(replayStage[1]);
    const stageId = operationalIdentifier(replayStage[2]);
    if (!replayId || !stageId) return null;
    return operationalMethod({ GET: `/operational-replay/${replayId}/stages/${stageId}` }, method);
  }
  const replayEvents = pathname.match(/^\/api\/operations\/operational-replay\/([^/]+)\/events$/);
  if (replayEvents) {
    const replayId = operationalIdentifier(replayEvents[1]);
    if (!replayId) return null;
    return operationalMethod({ GET: `/operational-replay/${replayId}/events` }, method);
  }
  const missionReplay = pathname.match(/^\/api\/operations\/operational-replay\/missions\/([^/]+)$/);
  if (missionReplay) {
    const missionId = operationalIdentifier(missionReplay[1]);
    if (!missionId) return null;
    return operationalMethod({ GET: `/operational-replay/missions/${missionId}` }, method);
  }
  const receiptReplay = pathname.match(/^\/api\/operations\/operational-replay\/receipts\/([^/]+)$/);
  if (receiptReplay) {
    const receiptId = operationalIdentifier(receiptReplay[1]);
    if (!receiptId) return null;
    return operationalMethod({ GET: `/operational-replay/receipts/${receiptId}` }, method);
  }
  const replay = pathname.match(/^\/api\/operations\/operational-replay\/([^/]+)$/);
  if (replay) {
    const replayId = operationalIdentifier(replay[1]);
    if (!replayId) return null;
    return operationalMethod({ GET: `/operational-replay/${replayId}` }, method);
  }
  const missionReceipts = pathname.match(/^\/api\/operations\/receipts\/missions\/([^/]+)$/);
  if (missionReceipts) {
    const missionId = operationalIdentifier(missionReceipts[1]);
    if (!missionId) return null;
    return operationalMethod({ GET: `/receipts/missions/${missionId}` }, method);
  }
  const receiptProofs = pathname.match(/^\/api\/operations\/receipts\/([^/]+)\/proofs$/);
  if (receiptProofs) {
    const receiptId = operationalIdentifier(receiptProofs[1]);
    if (!receiptId) return null;
    return operationalMethod({ GET: `/receipts/${receiptId}/proofs` }, method);
  }
  const receipt = pathname.match(/^\/api\/operations\/receipts\/([^/]+)$/);
  if (receipt) {
    const receiptId = operationalIdentifier(receipt[1]);
    if (!receiptId) return null;
    return operationalMethod({ GET: `/receipts/${receiptId}` }, method);
  }
  const conclaveEvidence = pathname.match(/^\/api\/operations\/conclave\/workspaces\/([^/]+)\/tasks\/([^/]+)\/evidence$/);
  if (conclaveEvidence) {
    const missionId = operationalIdentifier(conclaveEvidence[1]);
    const taskId = operationalIdentifier(conclaveEvidence[2]);
    if (!missionId || !taskId) return null;
    return operationalMethod({ POST: `/conclave/workspaces/${missionId}/tasks/${taskId}/evidence` }, method);
  }
  const conclaveWorkspace = pathname.match(/^\/api\/operations\/conclave\/workspaces\/([^/]+)$/);
  if (conclaveWorkspace) {
    const missionId = operationalIdentifier(conclaveWorkspace[1]);
    if (!missionId) return null;
    return operationalMethod({ GET: `/conclave/workspaces/${missionId}` }, method);
  }
  const promotionCandidate = pathname.match(/^\/api\/operations\/knowledge\/acquisitions\/([^/]+)\/promotion-candidates$/);
  if (promotionCandidate) {
    const missionId = operationalIdentifier(promotionCandidate[1]);
    if (!missionId) return null;
    return operationalMethod({ POST: `/knowledge/acquisitions/${missionId}/promotion-candidates` }, method);
  }
  const acquisition = pathname.match(/^\/api\/operations\/knowledge\/acquisitions\/([^/]+)$/);
  if (acquisition) {
    const missionId = operationalIdentifier(acquisition[1]);
    if (!missionId) return null;
    return operationalMethod({ GET: `/knowledge/acquisitions/${missionId}` }, method);
  }
  const candidate = pathname.match(/^\/api\/operations\/knowledge\/promotion-candidates\/([^/]+)$/);
  if (candidate) {
    const candidateId = operationalIdentifier(candidate[1]);
    if (!candidateId) return null;
    return operationalMethod({ GET: `/knowledge/promotion-candidates/${candidateId}` }, method);
  }
  const knowledgeVersions = pathname.match(/^\/api\/operations\/knowledge\/store\/([^/]+)\/versions$/);
  if (knowledgeVersions) {
    const recordId = operationalIdentifier(knowledgeVersions[1]);
    if (!recordId) return null;
    return operationalMethod({ GET: `/knowledge/store/${recordId}/versions` }, method);
  }
  const knowledgeRecord = pathname.match(/^\/api\/operations\/knowledge\/store\/([^/]+)$/);
  if (knowledgeRecord) {
    const recordId = operationalIdentifier(knowledgeRecord[1]);
    if (!recordId) return null;
    return operationalMethod({ GET: `/knowledge/store/${recordId}` }, method);
  }
  const knowledgeReceipt = pathname.match(/^\/api\/operations\/knowledge\/receipts\/([^/]+)$/);
  if (knowledgeReceipt) {
    const receiptId = operationalIdentifier(knowledgeReceipt[1]);
    if (!receiptId) return null;
    return operationalMethod({ GET: `/knowledge/receipts/${receiptId}` }, method);
  }
  const missionStoreDetail = pathname.match(/^\/api\/operations\/mission-store\/([^/]+)$/);
  if (missionStoreDetail) {
    const missionId = operationalIdentifier(missionStoreDetail[1]);
    if (!missionId) return null;
    return operationalMethod({ GET: `/mission-store/${missionId}` }, method);
  }
  const missionDetail = pathname.match(/^\/api\/operations\/missions\/([^/]+)$/);
  if (missionDetail && missionDetail[1] !== "plan") {
    const missionId = operationalIdentifier(missionDetail[1]);
    if (!missionId) return null;
    return operationalMethod({ GET: `/missions/${missionId}` }, method);
  }
  const baseline = pathname.match(/^\/api\/operations\/runtime\/baselines\/([^/]+)$/);
  if (baseline) {
    const baselineId = operationalIdentifier(baseline[1]);
    if (!baselineId) return null;
    return operationalMethod({ GET: `/runtime/baselines/${baselineId}` }, method);
  }
  const runtimeNode = pathname.match(/^\/api\/operations\/runtime-coordination\/nodes\/([^/]+)$/);
  if (runtimeNode) {
    const nodeId = operationalIdentifier(runtimeNode[1]);
    if (!nodeId) return null;
    return operationalMethod({ GET: `/runtime-coordination/nodes/${nodeId}` }, method);
  }
  const admission = pathname.match(/^\/api\/operations\/runtime-coordination\/admissions\/([^/]+)(?:\/(cancel|challenge\/reissue|receipt|replay))?$/);
  if (admission) {
    const admissionId = operationalIdentifier(admission[1]);
    if (!admissionId) return null;
    const action = admission[2] ?? "read";
    const expectedMethod = ["read", "receipt", "replay"].includes(action) ? "GET" : "POST";
    return operationalMethod({
      [expectedMethod]: `/runtime-coordination/admissions/${admissionId}${action === "read" ? "" : `/${action}`}`,
    }, method);
  }
  return null;
}

async function readJsonBody(request, maximumBytes) {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (declared > maximumBytes) throw new GatewayFailure("request_too_large", "Request exceeded the local capability size limit.", "Unknown", 413);
  if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    throw new GatewayFailure("content_type_invalid", "Local capability requests require application/json.", "Unknown", 415);
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > maximumBytes) throw new GatewayFailure("request_too_large", "Request exceeded the local capability size limit.", "Unknown", 413);
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not_object");
    return parsed;
  } catch {
    throw new GatewayFailure("request_invalid", "Request body must be a JSON object.", "Unknown", 400);
  }
}

async function readRawBody(request, maximumBytes, contentType) {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (declared > maximumBytes) throw new GatewayFailure("request_too_large", "Realtime session offer exceeded the gateway limit.", "Unknown", 413);
  if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith(contentType)) {
    throw new GatewayFailure("content_type_invalid", `Realtime session offers require ${contentType}.`, "Unknown", 415);
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > maximumBytes) throw new GatewayFailure("request_too_large", "Realtime session offer exceeded the gateway limit.", "Unknown", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function strictKeys(payload, allowed) {
  const unknown = Object.keys(payload).filter((key) => !allowed.has(key));
  if (unknown.length) throw new GatewayFailure("request_invalid", `Unsupported request field: ${unknown[0]}.`, "Unknown", 400);
}

function rejectUntrustedOperationalFields(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectUntrustedOperationalFields(item, [...trail, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (UNTRUSTED_OPERATIONAL_FIELDS.has(normalized)) {
      throw new GatewayFailure(
        "untrusted_identity_field",
        `Request field ${[...trail, key].join(".")} cannot select or strengthen Runtime identity, approval, or Authority.`,
        "Unauthorized",
        403,
      );
    }
    rejectUntrustedOperationalFields(item, [...trail, key]);
  }
}

function optionalProjectId(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const projectId = String(value).trim();
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new GatewayFailure("request_invalid", "Project ID is invalid.", "Unknown", 400);
  return projectId;
}

function boundedText(value, field, maximum, required = true) {
  const text = String(value ?? "").trim();
  if ((required && !text) || text.length > maximum) throw new GatewayFailure("request_invalid", `${field} is invalid.`, "Unknown", 400);
  return text || undefined;
}

function idempotencyKey(value) {
  const key = boundedText(value, "idempotencyKey", 160);
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new GatewayFailure("request_invalid", "idempotencyKey is invalid.", "Unknown", 400);
  }
  return key;
}

function sanitizedMutationPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("idempotencyKey" in payload)) return payload;
  const { idempotencyKey: _idempotencyKey, ...sanitized } = payload;
  return sanitized;
}

function sanitizeOperationalResponse(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeOperationalResponse(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return RUNTIME_COORDINATION_SECRET_FIELDS.has(normalized)
      ? []
      : [[key, sanitizeOperationalResponse(item)]];
  }));
}

function structuredOperationalFailure(value) {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const missingDependencies = Array.isArray(body.missingDependencies)
    ? body.missingDependencies.filter((item) => typeof item === "string").slice(0, 64)
    : undefined;
  return {
    ...(typeof body.reason === "string" ? { reason: body.reason.slice(0, 1_000) } : {}),
    ...(missingDependencies ? { missingDependencies } : {}),
    ...(typeof body.retryable === "boolean" ? { retryable: body.retryable } : {}),
    ...(typeof body.requiredNextAction === "string" ? { requiredNextAction: body.requiredNextAction.slice(0, 1_000) } : {}),
    ...(typeof body.capabilityId === "string" ? { capabilityId: body.capabilityId.slice(0, 160) } : {}),
    ...(typeof body.state === "string" ? { capabilityState: body.state.slice(0, 80) } : {}),
  };
}

function validateLocalPayload(runtimePath, payload, maximumBytes) {
  if (runtimePath === "/runtime/baselines") {
    strictKeys(payload, new Set(["expectedDeployedCommit"]));
    const expectedDeployedCommit = boundedText(payload.expectedDeployedCommit, "expectedDeployedCommit", 160, false);
    if (expectedDeployedCommit && !OPERATIONAL_RECORD_ID_PATTERN.test(expectedDeployedCommit)) {
      throw new GatewayFailure("request_invalid", "expectedDeployedCommit is invalid.", "Unknown", 400);
    }
    return expectedDeployedCommit ? { expectedDeployedCommit } : {};
  }
  if (runtimePath === "/knowledge/promotions") {
    strictKeys(payload, new Set(["candidateId"]));
    const candidateId = boundedText(payload.candidateId, "candidateId", 160);
    if (!OPERATIONAL_RECORD_ID_PATTERN.test(candidateId)) {
      throw new GatewayFailure("request_invalid", "candidateId is invalid.", "Unknown", 400);
    }
    return { candidateId };
  }
  if (/^\/knowledge\/acquisitions\/[A-Za-z0-9_.%:@-]+\/promotion-candidates$/.test(runtimePath)) {
    strictKeys(payload, new Set(["expectedMissionVersion"]));
    const expectedMissionVersion = payload.expectedMissionVersion;
    if (expectedMissionVersion === undefined) return {};
    if (typeof expectedMissionVersion === "number") {
      if (!Number.isFinite(expectedMissionVersion)) {
        throw new GatewayFailure("request_invalid", "expectedMissionVersion is invalid.", "Unknown", 400);
      }
      return { expectedMissionVersion };
    }
    if (typeof expectedMissionVersion === "string") {
      return { expectedMissionVersion: boundedText(expectedMissionVersion, "expectedMissionVersion", 160) };
    }
    throw new GatewayFailure("request_invalid", "expectedMissionVersion is invalid.", "Unknown", 400);
  }
  if (runtimePath === "/knowledge/intake") {
    strictKeys(payload, new Set([
      "missionId", "taskId", "origin", "sourceClassification", "collector", "confidence", "claim",
      "supportingArtifacts", "relationships", "operationalContext", "completeTask",
    ]));
    const missionId = boundedText(payload.missionId, "missionId", 160);
    const taskId = boundedText(payload.taskId, "taskId", 160);
    if (!OPERATIONAL_RECORD_ID_PATTERN.test(missionId) || !OPERATIONAL_RECORD_ID_PATTERN.test(taskId)) {
      throw new GatewayFailure("request_invalid", "missionId or taskId is invalid.", "Unknown", 400);
    }
    const sourceClassification = boundedText(payload.sourceClassification, "sourceClassification", 80);
    if (!["model_native", "platform_knowledge", "tenant_knowledge", "retrieved_evidence", "live_external_source", "runtime_evidence"].includes(sourceClassification)) {
      throw new GatewayFailure("request_invalid", "sourceClassification is not registered.", "Unknown", 400);
    }
    const confidence = Number(payload.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new GatewayFailure("request_invalid", "confidence must be between zero and one.", "Unknown", 400);
    }
    const supportingArtifacts = payload.supportingArtifacts ?? [];
    const relationships = payload.relationships ?? [];
    if (!Array.isArray(supportingArtifacts) || supportingArtifacts.length > 100 || supportingArtifacts.some((item) => typeof item !== "string" || item.length > 2_000)) {
      throw new GatewayFailure("request_invalid", "supportingArtifacts is invalid.", "Unknown", 400);
    }
    if (!Array.isArray(relationships) || relationships.length > 100 || relationships.some((item) => typeof item !== "string" || item.length > 500)) {
      throw new GatewayFailure("request_invalid", "relationships is invalid.", "Unknown", 400);
    }
    const operationalContext = payload.operationalContext ?? {};
    if (!operationalContext || typeof operationalContext !== "object" || Array.isArray(operationalContext) || Object.keys(operationalContext).length > 100) {
      throw new GatewayFailure("request_invalid", "operationalContext is invalid.", "Unknown", 400);
    }
    if (payload.completeTask !== undefined && typeof payload.completeTask !== "boolean") {
      throw new GatewayFailure("request_invalid", "completeTask must be a boolean.", "Unknown", 400);
    }
    return {
      missionId,
      taskId,
      origin: boundedText(payload.origin, "origin", 2_000),
      sourceClassification,
      ...(payload.collector ? { collector: boundedText(payload.collector, "collector", 240) } : {}),
      confidence,
      claim: boundedText(payload.claim, "claim", 8_000),
      supportingArtifacts,
      relationships,
      operationalContext,
      completeTask: payload.completeTask === true,
    };
  }
  if (runtimePath === "/conclave/workspaces") {
    strictKeys(payload, new Set(["proposal"]));
    return { proposal: boundedText(payload.proposal, "proposal", 8_000) };
  }
  if (/^\/conclave\/workspaces\/[A-Za-z0-9_.:-]+\/tasks\/[A-Za-z0-9_.:-]+\/evidence$/.test(runtimePath)) {
    strictKeys(payload, new Set([
      "origin", "sourceClassification", "collector", "confidence", "claim",
      "supportingArtifacts", "relationships", "operationalContext", "completeTask",
    ]));
    const sourceClassification = boundedText(payload.sourceClassification, "sourceClassification", 80);
    if (!["model_native", "platform_knowledge", "tenant_knowledge", "retrieved_evidence", "live_external_source", "runtime_evidence"].includes(sourceClassification)) {
      throw new GatewayFailure("request_invalid", "sourceClassification is not registered.", "Unknown", 400);
    }
    const confidence = Number(payload.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new GatewayFailure("request_invalid", "confidence must be between zero and one.", "Unknown", 400);
    }
    const supportingArtifacts = payload.supportingArtifacts ?? [];
    const relationships = payload.relationships ?? [];
    if (!Array.isArray(supportingArtifacts) || supportingArtifacts.length > 100 || supportingArtifacts.some((item) => typeof item !== "string" || item.length > 2_000)) {
      throw new GatewayFailure("request_invalid", "supportingArtifacts is invalid.", "Unknown", 400);
    }
    if (!Array.isArray(relationships) || relationships.length > 100 || relationships.some((item) => typeof item !== "string" || item.length > 500)) {
      throw new GatewayFailure("request_invalid", "relationships is invalid.", "Unknown", 400);
    }
    const operationalContext = payload.operationalContext ?? {};
    if (!operationalContext || typeof operationalContext !== "object" || Array.isArray(operationalContext) || Object.keys(operationalContext).length > 100) {
      throw new GatewayFailure("request_invalid", "operationalContext is invalid.", "Unknown", 400);
    }
    return {
      origin: boundedText(payload.origin, "origin", 2_000),
      sourceClassification,
      collector: boundedText(payload.collector, "collector", 240, false),
      confidence,
      claim: boundedText(payload.claim, "claim", 8_000),
      supportingArtifacts,
      relationships,
      operationalContext,
      completeTask: payload.completeTask === true,
    };
  }
  if (runtimePath === "/runtime-coordination/admissions") {
    strictKeys(payload, new Set(["missionId", "intent", "idempotencyKey"]));
    const missionId = boundedText(payload.missionId, "missionId", 160);
    if (!PROJECT_ID_PATTERN.test(missionId)) throw new GatewayFailure("request_invalid", "missionId is invalid.", "Unknown", 400);
    const intent = payload.intent && typeof payload.intent === "object" && !Array.isArray(payload.intent) ? payload.intent : null;
    if (!intent) throw new GatewayFailure("request_invalid", "intent is invalid.", "Unknown", 400);
    strictKeys(intent, new Set([
      "displayName", "nodeClass", "requestedCapabilities", "operationalPurpose",
      "location", "deploymentMetadata", "evidenceRefs",
    ]));
    if (!Array.isArray(intent.requestedCapabilities) || !intent.requestedCapabilities.length || intent.requestedCapabilities.length > 64) {
      throw new GatewayFailure("request_invalid", "requestedCapabilities must contain between 1 and 64 registered capability identifiers.", "Unknown", 400);
    }
    const requestedCapabilities = intent.requestedCapabilities.map((item) => boundedText(item, "requestedCapability", 160));
    if (requestedCapabilities.some((item) => !RUNTIME_CAPABILITY_PATTERN.test(item)) || new Set(requestedCapabilities).size !== requestedCapabilities.length) {
      throw new GatewayFailure("request_invalid", "requestedCapabilities must be unique NEXUS capability identifiers.", "Unknown", 400);
    }
    const evidenceRefs = intent.evidenceRefs === undefined ? [] : intent.evidenceRefs;
    if (!Array.isArray(evidenceRefs) || evidenceRefs.length > 64) throw new GatewayFailure("request_invalid", "evidenceRefs is invalid.", "Unknown", 400);
    const sanitizedEvidenceRefs = evidenceRefs.map((item) => boundedText(item, "evidenceRef", 160));
    if (sanitizedEvidenceRefs.some((item) => !PROJECT_ID_PATTERN.test(item)) || new Set(sanitizedEvidenceRefs).size !== sanitizedEvidenceRefs.length) {
      throw new GatewayFailure("request_invalid", "evidenceRefs must contain unique reference identifiers.", "Unknown", 400);
    }
    const metadata = intent.deploymentMetadata === undefined ? undefined : intent.deploymentMetadata;
    if (metadata !== undefined && (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || Object.keys(metadata).length > 24)) {
      throw new GatewayFailure("request_invalid", "deploymentMetadata is invalid.", "Unknown", 400);
    }
    const deploymentMetadata = metadata === undefined ? undefined : Object.fromEntries(Object.entries(metadata).map(([key, value]) => {
      const safeKey = boundedText(key, "deploymentMetadata key", 80);
      const normalizedKey = safeKey.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!/^[A-Za-z0-9_.:-]+$/.test(safeKey) || RESERVED_ADMISSION_METADATA_KEYS.has(normalizedKey) || !["string", "number", "boolean"].includes(typeof value) && value !== null) {
        throw new GatewayFailure("request_invalid", "deploymentMetadata contains an invalid entry.", "Unknown", 400);
      }
      if (typeof value === "string" && value.length > 500) throw new GatewayFailure("request_invalid", "deploymentMetadata contains an invalid entry.", "Unknown", 400);
      return [safeKey, value];
    }));
    return {
      missionId,
      intent: {
        displayName: boundedText(intent.displayName, "displayName", 120),
        nodeClass: boundedText(intent.nodeClass, "nodeClass", 80),
        requestedCapabilities,
        operationalPurpose: boundedText(intent.operationalPurpose, "operationalPurpose", 1_000),
        ...(intent.location ? { location: boundedText(intent.location, "location", 240) } : {}),
        ...(deploymentMetadata ? { deploymentMetadata } : {}),
        evidenceRefs: sanitizedEvidenceRefs,
      },
      ...(payload.idempotencyKey !== undefined ? { idempotencyKey: idempotencyKey(payload.idempotencyKey) } : {}),
    };
  }
  if (/^\/runtime-coordination\/admissions\/[A-Za-z0-9_.%:@-]+\/(cancel|challenge\/reissue)$/.test(runtimePath)) {
    strictKeys(payload, new Set(["idempotencyKey", "expectedVersion", "reason"]));
    if (!Number.isInteger(payload.expectedVersion) || payload.expectedVersion < 1) {
      throw new GatewayFailure("request_invalid", "expectedVersion must be a positive integer.", "Unknown", 400);
    }
    return {
      expectedVersion: payload.expectedVersion,
      reason: boundedText(payload.reason, "reason", 500),
      ...(payload.idempotencyKey !== undefined ? { idempotencyKey: idempotencyKey(payload.idempotencyKey) } : {}),
    };
  }
  if (runtimePath === "/intake/upload") {
    strictKeys(payload, new Set(["filename", "contentBase64", "projectId"]));
    const filename = boundedText(payload.filename, "filename", 240);
    if (/[\\/]/.test(filename)) throw new GatewayFailure("request_invalid", "filename must not include a path.", "Unknown", 400);
    const contentBase64 = String(payload.contentBase64 ?? "");
    if (!contentBase64 || contentBase64.length > maximumBytes || !/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)) {
      throw new GatewayFailure("request_invalid", "contentBase64 is invalid or exceeds the local limit.", "Unknown", 400);
    }
    return { filename, contentBase64, projectId: optionalProjectId(payload.projectId) };
  }
  if (runtimePath === "/intake/query") {
    strictKeys(payload, new Set(["question", "projectId", "sourceIds"]));
    const sourceIds = Array.isArray(payload.sourceIds) ? payload.sourceIds.slice(0, 50).map((item) => boundedText(item, "sourceId", 160)) : undefined;
    return { question: boundedText(payload.question, "question", 4_000), projectId: optionalProjectId(payload.projectId), sourceIds };
  }
  if (runtimePath === "/projects") {
    strictKeys(payload, new Set(["name"]));
    return { name: boundedText(payload.name, "name", 200) };
  }
  if (["/missions/plan", "/work-sessions/plan", "/work-sessions/start"].includes(runtimePath)) {
    strictKeys(payload, new Set(["objective"]));
    return { objective: boundedText(payload.objective, "objective", 4_000) };
  }
  if (/^\/missions\/[A-Za-z0-9_.:-]+\/execute-step$/.test(runtimePath)) {
    strictKeys(payload, new Set(["stepId"]));
    return { stepId: boundedText(payload.stepId, "stepId", 160) };
  }
  if (/^\/work-sessions\/[A-Za-z0-9_.:-]+\/(step|continue|pause|cancel)$/.test(runtimePath)) {
    strictKeys(payload, new Set());
    return {};
  }
  if (/^\/approvals\/[A-Za-z0-9_.:-]+\/approve$/.test(runtimePath)) {
    strictKeys(payload, new Set());
    return {};
  }
  if (/^\/approvals\/[A-Za-z0-9_.:-]+\/deny$/.test(runtimePath)) {
    strictKeys(payload, new Set(["reason"]));
    return { reason: boundedText(payload.reason, "reason", 1_000) };
  }
  if (["/actions/dry-run", "/actions/execute"].includes(runtimePath)) {
    strictKeys(payload, new Set(["action", "profile", "explicitRequest"]));
    const profile = payload.profile === undefined ? undefined : boundedText(payload.profile, "profile", 100);
    return {
      action: boundedText(payload.action, "action", 4_000),
      ...(profile ? { profile } : {}),
      ...(runtimePath === "/actions/execute" ? { explicitRequest: payload.explicitRequest === true } : {})
    };
  }
  if (runtimePath.endsWith("/compile")) {
    strictKeys(payload, new Set(["artifactType", "options"]));
    const artifactType = boundedText(payload.artifactType, "artifactType", 80).toLowerCase();
    if (!PROJECT_ARTIFACT_TYPES.has(artifactType)) throw new GatewayFailure("request_invalid", "Artifact type is not registered.", "Unknown", 400);
    const options = payload.options && typeof payload.options === "object" && !Array.isArray(payload.options) ? payload.options : {};
    strictKeys(options, new Set(["defaultPhaseDurationWeeks", "targetDate", "teamCapacity", "assumptions"]));
    const weeks = options.defaultPhaseDurationWeeks === undefined ? undefined : Number(options.defaultPhaseDurationWeeks);
    if (weeks !== undefined && (!Number.isFinite(weeks) || weeks < 0.5 || weeks > 520)) throw new GatewayFailure("request_invalid", "defaultPhaseDurationWeeks is invalid.", "Unknown", 400);
    const assumptions = Array.isArray(options.assumptions) ? options.assumptions.slice(0, 10).map((item) => boundedText(item, "assumption", 1_000)) : [];
    return { artifactType, options: { defaultPhaseDurationWeeks: weeks, targetDate: boundedText(options.targetDate, "targetDate", 100, false), teamCapacity: boundedText(options.teamCapacity, "teamCapacity", 500, false), assumptions } };
  }
  if (runtimePath === "/voice-operator/route-transcript") {
    strictKeys(payload, new Set(["transcript", "source"]));
    const source = String(payload.source ?? "text_fallback");
    if (!["browser_speech", "text_fallback"].includes(source)) throw new GatewayFailure("request_invalid", "Voice source is invalid.", "Unknown", 400);
    return { transcript: boundedText(payload.transcript, "transcript", 4_000), source };
  }
  if (runtimePath === "/runtime/interactions") {
    strictKeys(payload, new Set(["clientId", "inputText", "modality", "kind", "subject", "conversationId", "stream", "speechRequested", "presentation", "metadata"]));
    const presentation = payload.presentation && typeof payload.presentation === "object" && !Array.isArray(payload.presentation) ? payload.presentation : {};
    const metadata = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : {};
    strictKeys(presentation, new Set(["presentationMode", "avatarMove", "navigate", "highlight", "focus"]));
    return {
      clientId: boundedText(payload.clientId, "clientId", 128), inputText: boundedText(payload.inputText, "inputText", 20_000),
      modality: boundedText(payload.modality ?? "text", "modality", 40), kind: boundedText(payload.kind ?? "converse", "kind", 80),
      subject: boundedText(payload.subject, "subject", 500, false), conversationId: boundedText(payload.conversationId, "conversationId", 160, false),
      stream: payload.stream !== false, speechRequested: payload.speechRequested !== false, presentation, metadata
    };
  }
  if (runtimePath.endsWith("/interrupt")) {
    strictKeys(payload, new Set(["reason"]));
    return { reason: boundedText(payload.reason ?? "user_requested", "reason", 200) };
  }
  if (runtimePath.endsWith("/presentation-complete")) {
    strictKeys(payload, new Set());
    return {};
  }
  throw new GatewayFailure("route_not_allowlisted", "This local capability route is not allowlisted.", "Unknown", 404);
}

async function fetchLocalCapability(resolved, payload, request, config, localFetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.localTimeoutMs);
  try {
    let response;
    try {
      const baseUrl = resolved.target === "platform" ? config.platformRuntimeBaseUrl : config.localApiBaseUrl;
      const forwardedPayload = sanitizedMutationPayload(payload);
      response = await localFetch(`${baseUrl}${resolved.runtimePath}`, {
        method: resolved.method,
        headers: {
          Accept: "application/json",
          ...(resolved.method === "POST" ? { "Content-Type": "application/json" } : {}),
          ...(resolved.method === "POST" && request.headers["idempotency-key"] ? { "Idempotency-Key": String(request.headers["idempotency-key"]) } : {}),
        },
        ...(resolved.method === "POST" ? { body: JSON.stringify(forwardedPayload) } : {}),
        signal: controller.signal,
        redirect: "error"
      });
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) throw new GatewayFailure("local_runtime_timed_out", "Local NEXUS Runtime request timed out.", "Timed Out", 504);
      throw new GatewayFailure("local_runtime_unavailable", "Private local NEXUS Runtime is unavailable.", "Unavailable", 503);
    }
    if (!response.ok) throw new GatewayFailure("local_runtime_error", `Private local NEXUS Runtime returned status ${response.status}.`, "Unavailable", 502);
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength > config.localMaxResponseBytes) throw new GatewayFailure("local_response_too_large", "Local Runtime response exceeded the gateway limit.", "Unknown", 502);
    try {
      const body = JSON.parse(raw.toString("utf8"));
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not_object");
      return sanitizeOperationalResponse(body);
    } catch {
      throw new GatewayFailure("local_response_invalid", "Local Runtime returned invalid JSON.", "Unknown", 502);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOperationalCapability(resolved, payload, claims, request, config, operationalFetch) {
  if (resolved.target === "platform") throw new GatewayFailure("operational_route_staged", "This platform interaction route is not yet bound to the hosted execution Runtime.", "Unavailable", 501);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.localTimeoutMs);
  try {
    const requestId = String(request.headers["x-request-id"] ?? randomUUID());
    const headers = {
      Accept: "application/json", Authorization: `Bearer ${config.operationalRuntimeToken}`,
      "X-Request-ID": requestId, "X-NEXUS-User-ID": claims.sub,
      "X-NEXUS-Tenant-ID": claims.tenantId, "X-NEXUS-Workspace-ID": claims.workspaceId,
      "X-NEXUS-Role": claims.role, "X-NEXUS-Scopes": claims.scopes.join(",")
    };
    if (resolved.method === "POST") {
      headers["Content-Type"] = "application/json";
      headers["Idempotency-Key"] = String(payload?.idempotencyKey ?? request.headers["idempotency-key"] ?? "");
    }
    let response;
    try {
      response = await operationalFetch(`${config.operationalApiBaseUrl}${resolved.runtimePath}`, {
        method: resolved.method, headers,
        ...(resolved.method === "POST" ? { body: JSON.stringify(sanitizedMutationPayload(payload)) } : {}),
        signal: controller.signal, redirect: "error"
      });
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) throw new GatewayFailure("operational_runtime_timed_out", "Hosted NEXUS Runtime request timed out.", "Timed Out", 504);
      throw new GatewayFailure("operational_runtime_unavailable", "Hosted operational NEXUS Runtime is unavailable.", "Unavailable", 503);
    }
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength > config.localMaxResponseBytes) throw new GatewayFailure("operational_response_too_large", "Hosted Runtime response exceeded the gateway limit.", "Unknown", 502);
    let body;
    try { body = JSON.parse(raw.toString("utf8")); }
    catch { throw new GatewayFailure("operational_response_invalid", "Hosted Runtime returned invalid JSON.", "Unknown", 502); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not_object");
    const sanitized = sanitizeOperationalResponse(body);
    if ([401, 403].includes(response.status)) throw new GatewayFailure("operational_runtime_unauthorized", "Hosted Runtime rejected the gateway identity.", "Unauthorized", 502);
    if (!response.ok) {
      const upstreamCode = typeof sanitized.error === "string" ? sanitized.error : "operational_runtime_error";
      const upstreamMessage = [sanitized.message, sanitized.reason].find((item) => typeof item === "string" && item.trim());
      const safeStatus = [400, 404, 409, 422, 429, 503].includes(response.status) ? response.status : 502;
      throw new GatewayFailure(
        upstreamCode.slice(0, 160),
        upstreamMessage?.slice(0, 1_000) ?? `Hosted operational Runtime returned status ${response.status}.`,
        response.status === 503 ? "Unavailable" : "Unknown",
        safeStatus,
        sanitized.retryable === true,
        structuredOperationalFailure(sanitized),
      );
    }
    return sanitized;
  } catch (error) {
    if (error instanceof GatewayFailure) throw error;
    throw new GatewayFailure("operational_response_invalid", "Hosted Runtime returned invalid JSON.", "Unknown", 502);
  } finally { clearTimeout(timer); }
}

async function handleSessionApi(request, response, config, sessionAuthority) {
  const url = new URL(request.url, "http://portal.invalid");
  if (!requestOriginAllowed(request, config, request.method === "POST")) return sendJson(response, 403, operationalFailure(config, url.pathname, "origin_denied", "Request origin is not allowed."));
  if (!config.operationalEnabled) return sendJson(response, 503, operationalFailure(config, url.pathname, "operational_gateway_disabled", "Hosted operational mode is not enabled."));
  if (url.pathname === "/api/session" && request.method === "GET") return sendJson(response, 200, { ok: true, session: sessionAuthority.publicSession(sessionAuthority.authenticate(request)), truth: TRUTH });
  if (url.pathname === "/api/session/login" && request.method === "POST") {
    const payload = await readJsonBody(request, 8_192); strictKeys(payload, new Set(["accessKey"]));
    const result = sessionAuthority.login(boundedText(payload.accessKey, "accessKey", 512), request.socket.remoteAddress);
    if (result.status !== 200) return sendJson(response, result.status, operationalFailure(config, url.pathname, result.error, "Authentication failed.", "Unauthorized"));
    structuredLog("operational_session_started", { userId: result.claims.sub, tenantId: result.claims.tenantId, workspaceId: result.claims.workspaceId });
    return sendJson(response, 200, { ok: true, session: sessionAuthority.publicSession(result.claims), truth: TRUTH }, { "Set-Cookie": result.cookie });
  }
  if (url.pathname === "/api/session/logout" && request.method === "POST") {
    const claims = sessionAuthority.authenticate(request);
    if (!claims || !sessionAuthority.csrfValid(request, claims)) return sendJson(response, 403, operationalFailure(config, url.pathname, "csrf_invalid", "Session verification failed.", "Unauthorized"));
    sessionAuthority.revoke(claims);
    return sendJson(response, 200, { ok: true, session: { authenticated: false }, truth: TRUTH }, { "Set-Cookie": sessionAuthority.clearCookie() });
  }
  return sendJson(response, 404, operationalFailure(config, url.pathname, "route_not_allowlisted", "This session route is not allowlisted."));
}

async function handleOperationalApi(request, response, config, operationalFetch, sessionAuthority) {
  const url = new URL(request.url, "http://portal.invalid");
  if (!requestOriginAllowed(request, config, request.method === "POST")) return sendJson(response, 403, operationalFailure(config, url.pathname, "origin_denied", "Request origin is not allowed."));
  if (!config.operationalEnabled) return sendJson(response, 503, operationalFailure(config, url.pathname, "operational_gateway_disabled", "Hosted operational mode is not enabled."));
  if (url.search) return sendJson(response, 400, operationalFailure(config, url.pathname, "query_not_allowed", "Operational routes do not accept browser query parameters."));
  const claims = sessionAuthority.authenticate(request);
  if (!claims) return sendJson(response, 401, operationalFailure(config, url.pathname, "session_required", "An authenticated operational session is required.", "Unauthorized"));
  const resolved = resolveOperationalCapability(url.pathname, request.method);
  if (!resolved) return sendJson(response, 404, operationalFailure(config, url.pathname, "route_not_allowlisted", "This hosted operation is not allowlisted."));
  if (resolved.methodMismatch) return sendJson(response, 405, operationalFailure(config, url.pathname, "method_not_allowed", "Method is not allowed for this hosted operation."), { Allow: resolved.allowed });
  const scope = requiredScope(resolved.runtimePath, resolved.method);
  if (!claims.scopes.includes(scope)) return sendJson(response, 403, operationalFailure(config, url.pathname, "scope_denied", `Session lacks required scope: ${scope}.`, "Unauthorized"));
  if (resolved.method === "POST") {
    if (!sessionAuthority.csrfValid(request, claims)) return sendJson(response, 403, operationalFailure(config, url.pathname, "csrf_invalid", "CSRF verification failed.", "Unauthorized"));
    if (!IDEMPOTENCY_KEY_PATTERN.test(String(request.headers["idempotency-key"] ?? ""))) return sendJson(response, 400, operationalFailure(config, url.pathname, "idempotency_key_required", "A valid Idempotency-Key is required for hosted mutations."));
  }
  try {
    const rawPayload = resolved.method === "POST" ? await readJsonBody(request, config.localMaxRequestBytes) : undefined;
    if (resolved.method === "POST") rejectUntrustedOperationalFields(rawPayload);
    const payload = resolved.method === "POST" ? validateLocalPayload(resolved.runtimePath, rawPayload, config.localMaxRequestBytes) : undefined;
    if (resolved.method === "POST" && payload?.idempotencyKey && payload.idempotencyKey !== request.headers["idempotency-key"]) {
      throw new GatewayFailure("idempotency_key_mismatch", "Idempotency-Key must exactly match the request body.", "Unknown", 400);
    }
    const data = await fetchOperationalCapability(resolved, payload, claims, request, config, operationalFetch);
    structuredLog("experience_gateway_hosted_operation", { route: url.pathname, runtimePath: resolved.runtimePath, method: resolved.method, userId: claims.sub, tenantId: claims.tenantId, workspaceId: claims.workspaceId, scope, status: 200 });
    return sendJson(response, 200, operationalEnvelope(config, url.pathname, data, claims));
  } catch (error) {
    const failure = error instanceof GatewayFailure ? error : new GatewayFailure("operational_gateway_error", "Hosted operation failed safely.", "Unknown", 500);
    return sendJson(response, failure.status, operationalFailure(config, url.pathname, failure.code, failure.message, failure.state, failure.details));
  }
}

async function handleLocalApi(request, response, config, localFetch) {
  const url = new URL(request.url, "http://portal.invalid");
  if (!requestOriginAllowed(request, config)) return sendJson(response, 403, localFailure(config, url.pathname, "origin_denied", "Request origin is not allowed."));
  if (!config.localCapabilitiesEnabled) return sendJson(response, 503, localFailure(config, url.pathname, "local_capabilities_disabled", "Local capability mode is not enabled."));
  if (url.search) return sendJson(response, 400, localFailure(config, url.pathname, "query_not_allowed", "Local capability routes do not accept browser query parameters."));
  if (request.method === "OPTIONS") {
    response.writeHead(204, { Allow: "GET, POST, OPTIONS", "Cache-Control": "no-store" });
    return response.end();
  }
  const resolved = resolveLocalCapability(url.pathname, request.method);
  if (!resolved) return sendJson(response, 404, localFailure(config, url.pathname, "route_not_allowlisted", "This local capability route is not allowlisted."));
  if (resolved.methodMismatch) return sendJson(response, 405, localFailure(config, url.pathname, "method_not_allowed", "Method is not allowed for this local capability."), { Allow: `${resolved.allowed}, OPTIONS` });
  try {
    const rawPayload = resolved.method === "POST" ? await readJsonBody(request, config.localMaxRequestBytes) : undefined;
    const payload = resolved.method === "POST" ? validateLocalPayload(resolved.runtimePath, rawPayload, config.localMaxRequestBytes) : undefined;
    if (resolved.method === "POST" && /^\/runtime-coordination\/admissions(?:\/[^/]+\/(?:cancel|challenge\/reissue))?$/.test(resolved.runtimePath)) {
      const requestKey = String(request.headers["idempotency-key"] ?? "");
      if (!IDEMPOTENCY_KEY_PATTERN.test(requestKey)) throw new GatewayFailure("idempotency_key_required", "A valid Idempotency-Key is required for admission mutations.", "Unknown", 400);
      if (payload?.idempotencyKey && payload.idempotencyKey !== requestKey) throw new GatewayFailure("idempotency_key_mismatch", "Idempotency-Key must exactly match the request body.", "Unknown", 400);
    }
    const data = await fetchLocalCapability(resolved, payload, request, config, localFetch);
    structuredLog("experience_gateway_local_capability", { route: url.pathname, runtimePath: resolved.runtimePath, method: resolved.method, status: 200 });
    const runtimeUrl = new URL(resolved.target === "platform" ? config.platformRuntimeBaseUrl : config.localApiBaseUrl).origin;
    return sendJson(response, 200, localEnvelope(config, url.pathname, data, { connectionState: "Healthy", runtimeUrl }));
  } catch (error) {
    const failure = error instanceof GatewayFailure ? error : new GatewayFailure("local_gateway_error", "The local capability request failed safely.", "Unknown", 500);
    return sendJson(response, failure.status, localFailure(config, url.pathname, failure.code, failure.message, failure.state));
  }
}

async function handleReplayApi(request, response, config, replayFetch) {
  const url = new URL(request.url, "http://portal.invalid");
  if (!requestOriginAllowed(request, config)) return sendJson(response, 403, { ok: false, error: { code: "origin_denied", message: "Request origin is not allowed." }, truth: TRUTH });
  if (!config.replayEnabled) return sendJson(response, 503, { ok: false, error: { code: "replay_gateway_disabled", message: "Runtime-owned Operational Replay is not configured for this deployment." }, truth: TRUTH });
  if (url.search) return sendJson(response, 400, { ok: false, error: { code: "query_not_allowed", message: "Operational Replay routes do not accept browser query parameters." }, truth: TRUTH });
  if (request.method === "OPTIONS") {
    response.writeHead(204, { Allow: "GET, OPTIONS", "Cache-Control": "no-store" });
    return response.end();
  }
  if (request.method !== "GET") return sendJson(response, 405, { ok: false, error: { code: "method_not_allowed", message: "Operational Replay is a passive read-only surface." }, truth: TRUTH }, { Allow: "GET, OPTIONS" });
  const replayPath = REPLAY_ROUTES[url.pathname];
  if (!replayPath) return sendJson(response, 404, { ok: false, error: { code: "route_not_allowlisted", message: "This Operational Replay route is not allowlisted." }, truth: TRUTH });

  const controller = new AbortController();
  const streaming = replayPath === "/events";
  const timer = streaming ? null : setTimeout(() => controller.abort(), config.localTimeoutMs);
  response.on("close", () => controller.abort());
  try {
    const upstream = await replayFetch(`${config.replayBaseUrl}${replayPath}`, {
      method: "GET",
      headers: { Accept: streaming ? "text/event-stream" : "application/json, application/pdf, application/zip" },
      signal: controller.signal,
      redirect: "error",
      cache: "no-store"
    });
    if (!upstream.ok || !upstream.body) {
      return sendJson(response, upstream.status === 404 ? 404 : 503, { ok: false, error: { code: "replay_unavailable", message: `Operational Replay returned status ${upstream.status}.` }, truth: TRUTH });
    }
    const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
    if (!streaming && declaredLength > config.replayMaxResponseBytes) {
      return sendJson(response, 502, { ok: false, error: { code: "replay_response_too_large", message: "Operational Replay response exceeded the gateway size limit." }, truth: TRUTH });
    }
    const headers = {
      "Content-Type": upstream.headers.get("content-type") ?? (streaming ? "text/event-stream; charset=utf-8" : "application/octet-stream"),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(streaming ? { Connection: "keep-alive", "X-Accel-Buffering": "no" } : {}),
      ...(upstream.headers.get("content-disposition") ? { "Content-Disposition": upstream.headers.get("content-disposition") } : {}),
      ...(!streaming && declaredLength ? { "Content-Length": declaredLength } : {})
    };
    response.writeHead(200, headers);
    let received = 0;
    for await (const chunk of upstream.body) {
      received += chunk.byteLength;
      if (!streaming && received > config.replayMaxResponseBytes) throw new GatewayFailure("replay_response_too_large", "Operational Replay response exceeded the gateway size limit.", "Unknown", 502);
      response.write(Buffer.from(chunk));
    }
    structuredLog("experience_gateway_operational_replay", { route: url.pathname, replayPath, streaming, status: 200 });
    return response.end();
  } catch (error) {
    if (response.headersSent) return response.end();
    const timedOut = error?.name === "AbortError" && !response.destroyed;
    return sendJson(response, timedOut ? 504 : 503, { ok: false, error: { code: timedOut ? "replay_timed_out" : "replay_unavailable", message: timedOut ? "Operational Replay timed out." : "Operational Replay is unavailable." }, truth: TRUTH });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function validateRuntimeEnvelope(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GatewayFailure("runtime_response_invalid", "Runtime response was not a JSON object.", "Unknown", 502);
  }
  for (const field of ["status", "timestamp", "schemaVersion", "runtimeVersion", "proofIds", "limitations", "data"]) {
    if (!(field in body)) throw new GatewayFailure("runtime_response_invalid", `Runtime response omitted required field: ${field}.`, "Unknown", 502);
  }
  if (typeof body.status !== "string" || typeof body.timestamp !== "string" || !Array.isArray(body.proofIds) || !Array.isArray(body.limitations)) {
    throw new GatewayFailure("runtime_response_invalid", "Runtime response field types are invalid.", "Unknown", 502);
  }
  if (body.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new GatewayFailure("runtime_schema_mismatch", `Runtime schema ${body.schemaVersion} is incompatible with ${SUPPORTED_SCHEMA_VERSION}.`, "Schema Mismatch", 502);
  }
  const supported = SUPPORTED_RUNTIME_VERSION.split(".").slice(0, 2).join(".");
  const received = String(body.runtimeVersion).split(".").slice(0, 2).join(".");
  if (received !== supported) {
    throw new GatewayFailure("runtime_version_mismatch", `Runtime version ${body.runtimeVersion} is incompatible with ${SUPPORTED_RUNTIME_VERSION}.`, "Version Mismatch", 502);
  }
  return body;
}

async function fetchRuntime(runtimePath, config, runtimeFetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    let response;
    try {
      response = await runtimeFetch(`${config.runtimeBaseUrl}${runtimePath}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${config.runtimeToken}` },
        signal: controller.signal,
        redirect: "error"
      });
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) {
        throw new GatewayFailure("runtime_timed_out", "Runtime request timed out.", "Timed Out", 504, true);
      }
      throw new GatewayFailure("runtime_unavailable", "Runtime is unavailable.", "Unavailable", 503, true);
    }
    if (response.status === 401 || response.status === 403) {
      throw new GatewayFailure("runtime_unauthorized", "Runtime rejected the server credential.", "Unauthorized", 502);
    }
    if (!response.ok) {
      throw new GatewayFailure("runtime_unavailable", `Runtime returned status ${response.status}.`, "Unavailable", 503, response.status >= 500 || response.status === 429);
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > config.maxResponseBytes) {
      throw new GatewayFailure("runtime_response_too_large", "Runtime response exceeded the gateway size limit.", "Unknown", 502);
    }
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength > config.maxResponseBytes) {
      throw new GatewayFailure("runtime_response_too_large", "Runtime response exceeded the gateway size limit.", "Unknown", 502);
    }
    let body;
    try { body = JSON.parse(raw.toString("utf8")); }
    catch { throw new GatewayFailure("runtime_response_invalid", "Runtime returned invalid JSON.", "Unknown", 502); }
    return validateRuntimeEnvelope(body);
  } finally {
    clearTimeout(timer);
  }
}

async function handleRuntimeMutation(request, response, config, runtimeFetch, tracker, sessionAuthority, clock) {
  const url = new URL(request.url, "http://portal.invalid");
  if (!requestOriginAllowed(request, config)) return sendJson(response, 403, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("origin_denied", "Request origin is not allowed.", "Unknown", 403)));
  const runtimePath = resolveRuntimeMutation(url.pathname);
  if (!runtimePath) return sendJson(response, 404, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("route_not_allowlisted", "This Runtime mutation is not allowlisted.", "Unknown", 404)));
  if (request.method !== "POST") return sendJson(response, 405, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("method_not_allowed", "This bounded Runtime route requires POST.", "Unknown", 405)), { Allow: "POST" });
  const raw = await readJsonBody(request, 16_384);
  let payload;
  if (runtimePath.endsWith("/interrupt")) {
    strictKeys(raw, new Set(["reason"])); payload = { reason: boundedText(raw.reason ?? "user_barge_in", "reason", 200) };
  } else if (runtimePath.endsWith("/resume") || runtimePath.endsWith("/presentation-complete")) {
    strictKeys(raw, new Set()); payload = {};
  } else if (runtimePath === "/runtime/interactions") {
    strictKeys(raw, new Set(["clientId", "inputText", "modality", "kind", "subject", "conversationId", "stream", "speechRequested", "presentation", "metadata"]));
    const clientId = boundedText(raw.clientId, "clientId", 128);
    const metadata = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? { ...raw.metadata } : {};
    for (const reserved of ["tenantId", "trustedTenantContext", "operator", "roles", "subjectId", "issuer", "assertionId"]) delete metadata[reserved];
    const assertion = createTenantContextAssertion(config, sessionAuthority.authenticate(request), clientId, clock);
    payload = {
      clientId,
      inputText: boundedText(raw.inputText, "inputText", 20_000),
      modality: boundedText(raw.modality ?? "text", "modality", 40),
      kind: boundedText(raw.kind ?? "converse", "kind", 80),
      speechRequested: raw.speechRequested !== false,
      stream: raw.stream !== false,
      ...(raw.subject ? { subject: boundedText(raw.subject, "subject", 240) } : {}),
      ...(raw.conversationId ? { conversationId: boundedText(raw.conversationId, "conversationId", 160) } : {}),
      ...(raw.presentation && typeof raw.presentation === "object" && !Array.isArray(raw.presentation) ? { presentation: raw.presentation } : {}),
      metadata: {
        ...metadata,
        contextAssemblyOwner: "nexus-runtime",
        ...(assertion ? { tenantId: sessionAuthority.authenticate(request)?.tenantId ?? config.operationalTenantId } : {})
      }
    };
  } else if (runtimePath === "/runtime/conclave/reviews") {
    strictKeys(raw, new Set(["clientId", "proposal"]));
    payload = {
      clientId: boundedText(raw.clientId, "clientId", 128),
      proposal: boundedText(raw.proposal, "proposal", 8_000),
    };
  } else {
    strictKeys(raw, new Set(["clientId", "modality", "speechRequested"]));
    payload = { clientId: boundedText(raw.clientId, "clientId", 128), modality: boundedText(raw.modality ?? "text", "modality", 40), speechRequested: raw.speechRequested !== false };
  }
  const timeoutMs = runtimePath === "/runtime/interactions" ? config.reasoningTimeoutMs : config.timeoutMs;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const clientId = typeof payload.clientId === "string" ? payload.clientId : "nexus-web";
    const assertion = createTenantContextAssertion(config, sessionAuthority.authenticate(request), clientId, clock);
    const upstream = await runtimeFetch(`${config.runtimeBaseUrl}${runtimePath}`, {
      method: "POST", headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.runtimeToken}`,
        ...(assertion ? { "X-NEXUS-Context-Assertion": assertion } : {})
      },
      body: JSON.stringify(payload), signal: controller.signal, redirect: "error"
    });
    if ([401, 403].includes(upstream.status)) throw new GatewayFailure("runtime_unauthorized", "Runtime rejected the server credential.", "Unauthorized", 502);
    if (!upstream.ok) throw new GatewayFailure("runtime_unavailable", `Runtime returned status ${upstream.status}.`, "Unavailable", 503);
    const body = validateRuntimeEnvelope(JSON.parse(Buffer.from(await upstream.arrayBuffer()).toString("utf8")));
    tracker.lastSuccessfulConnection = nowIso(); tracker.lastSuccessfulRefresh = nowIso();
    structuredLog("experience_gateway_bounded_runtime_mutation", { route: url.pathname, runtimePath, status: 200 });
    return sendJson(response, 200, successfulEnvelope(config, tracker, url.pathname, body, null, false, false, 1));
  } catch (error) {
    const failure = error instanceof GatewayFailure ? error
      : error?.name === "AbortError" ? new GatewayFailure("runtime_reasoning_timeout", "Runtime reasoning exceeded its bounded response window.", "Timed Out", 504)
      : new GatewayFailure("runtime_unavailable", "Runtime interaction request failed safely.", "Unavailable", 503);
    return sendJson(response, failure.status, failureEnvelope(config, tracker, url.pathname, failure));
  } finally { clearTimeout(timer); }
}

async function handleRealtimeCall(request, response, config, runtimeFetch, sessionAuthority, clock) {
  const url = new URL(request.url, "http://portal.invalid");
  if (!requestOriginAllowed(request, config)) return sendJson(response, 403, { ok: false, error: { code: "origin_denied", message: "Request origin is not allowed." }, truth: TRUTH });
  if (url.search) return sendJson(response, 400, { ok: false, error: { code: "query_not_allowed", message: "Realtime session routes do not accept browser query parameters." }, truth: TRUTH });
  if (request.method === "OPTIONS") {
    response.writeHead(204, { Allow: "POST, OPTIONS", "Cache-Control": "no-store" });
    return response.end();
  }
  if (request.method !== "POST") return sendJson(response, 405, { ok: false, error: { code: "method_not_allowed", message: "Realtime session creation requires POST." }, truth: TRUTH }, { Allow: "POST, OPTIONS" });

  let offer;
  try {
    offer = await readRawBody(request, 262_144, "application/sdp");
  } catch (error) {
    const failure = error instanceof GatewayFailure ? error : new GatewayFailure("invalid_sdp", "Realtime session offer is invalid.", "Unknown", 400);
    return sendJson(response, failure.status, { ok: false, error: { code: failure.code, message: failure.message }, truth: TRUTH });
  }
  if (!offer.toString("utf8").trimStart().startsWith("v=0")) {
    return sendJson(response, 400, { ok: false, error: { code: "invalid_sdp", message: "Realtime session offer is not valid SDP." }, truth: TRUTH });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.realtimeTimeoutMs);
  try {
    let upstream;
    try {
      const assertion = createTenantContextAssertion(config, sessionAuthority.authenticate(request), "nexus-web", clock);
      upstream = await runtimeFetch(`${config.runtimeBaseUrl}/runtime/voice/realtime/call`, {
        method: "POST",
        headers: {
          Accept: "application/sdp",
          "Content-Type": "application/sdp",
          Authorization: `Bearer ${config.runtimeToken}`,
          ...(assertion ? { "X-NEXUS-Context-Assertion": assertion } : {})
        },
        body: offer,
        signal: controller.signal,
        redirect: "error"
      });
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) throw new GatewayFailure("realtime_timed_out", "Realtime session creation timed out.", "Timed Out", 504);
      throw new GatewayFailure("realtime_unavailable", "Realtime voice is unavailable.", "Unavailable", 503);
    }
    if ([401, 403].includes(upstream.status)) throw new GatewayFailure("runtime_unauthorized", "Runtime rejected the server credential.", "Unauthorized", 502);
    if (!upstream.ok) {
      let message = "Runtime could not create the Realtime voice session.";
      try {
        const body = await upstream.json();
        if (typeof body?.error?.message === "string") message = body.error.message.slice(0, 300);
      } catch { /* keep the safe message */ }
      throw new GatewayFailure("realtime_unavailable", message, "Unavailable", upstream.status >= 500 ? 503 : 502);
    }
    if (!String(upstream.headers.get("content-type") ?? "").toLowerCase().startsWith("application/sdp")) {
      throw new GatewayFailure("realtime_response_invalid", "Runtime returned an invalid Realtime response.", "Unknown", 502);
    }
    const answer = Buffer.from(await upstream.arrayBuffer());
    if (answer.byteLength > 262_144 || !answer.toString("utf8").trimStart().startsWith("v=0")) {
      throw new GatewayFailure("realtime_response_invalid", "Runtime returned an invalid Realtime response.", "Unknown", 502);
    }
    structuredLog("experience_gateway_realtime_session", { route: url.pathname, status: upstream.status });
    response.writeHead(upstream.status, {
      "Content-Type": "application/sdp",
      "Content-Length": answer.byteLength,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    return response.end(answer);
  } catch (error) {
    const failure = error instanceof GatewayFailure ? error : new GatewayFailure("realtime_gateway_error", "Realtime session creation failed safely.", "Unknown", 500);
    return sendJson(response, failure.status, { ok: false, error: { code: failure.code, message: failure.message }, truth: TRUTH });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(runtimePath, config, runtimeFetch) {
  let failure;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      return { body: await fetchRuntime(runtimePath, config, runtimeFetch), attempts: attempt };
    } catch (error) {
      failure = error instanceof GatewayFailure ? error : new GatewayFailure("runtime_unknown", "Runtime request failed.", "Unknown", 502);
      if (!failure.retryable || attempt === config.maxAttempts) break;
      structuredLog("runtime_retry", { state: "Retrying", attempt, runtimePath });
      await delay(config.retryDelayMs);
    }
  }
  throw failure;
}

function successfulEnvelope(config, tracker, route, body, entry, cached, stale, attempts) {
  return {
    ok: true,
    data: body.data,
    runtime: {
      status: body.status,
      timestamp: body.timestamp,
      schemaVersion: body.schemaVersion,
      runtimeVersion: body.runtimeVersion,
      proofIds: body.proofIds,
      limitations: body.limitations
    },
    gateway: gatewayMetadata(config, tracker, route, stale ? "Degraded" : "Healthy", entry, {
      attempts,
      cache: cacheMetadata(entry, cached, stale),
      warning: stale ? "Runtime refresh failed; displaying the last validated response." : null
    }),
    truth: TRUTH
  };
}

function failureEnvelope(config, tracker, route, failure) {
  return {
    ok: false,
    data: null,
    runtime: null,
    gateway: gatewayMetadata(config, tracker, route, failure.state, null),
    truth: TRUTH,
    error: { code: failure.code, message: failure.message }
  };
}

async function readThroughGateway(route, runtimePath, request, config, runtimeFetch, cache, tracker) {
  const cacheable = CACHEABLE_ROUTES.has(route);
  const invalidate = /no-cache|no-store/i.test(String(request.headers["cache-control"] ?? "")) || String(request.headers.pragma ?? "").toLowerCase() === "no-cache";
  if (invalidate) cache.delete(route);
  const existing = cache.get(route);
  if (cacheable && existing && existing.expiresAt > Date.now()) {
    return { status: 200, body: successfulEnvelope(config, tracker, route, existing.body, existing, true, false, 0) };
  }

  try {
    const { body, attempts } = await fetchWithRetry(runtimePath, config, runtimeFetch);
    const refreshedAt = Date.now();
    const entry = { body, refreshedAt, expiresAt: refreshedAt + config.cacheTtlMs };
    if (cacheable) cache.set(route, entry);
    tracker.lastSuccessfulConnection = nowIso();
    tracker.lastSuccessfulRefresh = new Date(refreshedAt).toISOString();
    return { status: 200, body: successfulEnvelope(config, tracker, route, body, entry, false, false, attempts) };
  } catch (error) {
    const failure = error instanceof GatewayFailure ? error : new GatewayFailure("runtime_unknown", "Runtime request failed.", "Unknown", 502);
    if (cacheable && existing) {
      structuredLog("runtime_degraded", { route, state: failure.state, servingStale: true });
      return { status: 200, body: successfulEnvelope(config, tracker, route, existing.body, existing, true, true, config.maxAttempts) };
    }
    return { status: failure.status, body: failureEnvelope(config, tracker, route, failure) };
  }
}

async function handleApi(request, response, config, runtimeFetch, cache, tracker) {
  if (!requestOriginAllowed(request, config)) {
    return sendJson(response, 403, failureEnvelope(config, tracker, "origin", new GatewayFailure("origin_denied", "Request origin is not allowed.", "Unknown", 403)));
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, { Allow: "GET, OPTIONS", "Cache-Control": "no-store" });
    return response.end();
  }
  if (request.method !== "GET") {
    return sendJson(response, 405, failureEnvelope(config, tracker, request.url, new GatewayFailure("method_not_allowed", "The Experience Gateway is read-only.", "Unknown", 405)), { Allow: "GET, OPTIONS" });
  }
  const url = new URL(request.url, "http://portal.invalid");
  if (url.search) {
    return sendJson(response, 400, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("query_not_allowed", "Runtime gateway routes do not accept query parameters.", "Unknown", 400)));
  }
  const runtimePath = resolveRuntimeReadRoute(url.pathname);
  if (!runtimePath) {
    return sendJson(response, 404, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("route_not_allowlisted", "This Experience Gateway route is not allowlisted.", "Unknown", 404)));
  }
  const result = await readThroughGateway(url.pathname, runtimePath, request, config, runtimeFetch, cache, tracker);
  structuredLog("experience_gateway_request", { route: url.pathname, runtimePath, status: result.status, connectionState: result.body.gateway.connectionState });
  return sendJson(response, result.status, result.body);
}

function serveStatic(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end();
  }
  const url = new URL(request.url, "http://portal.invalid");
  if (ABSENT_BROWSER_METADATA.has(url.pathname)) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": 9,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return response.end("Not found");
  }
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST, requested === "/" ? "index.html" : requested);
  if (!filePath.startsWith(DIST)) filePath = join(DIST, "index.html");
  try { if (!statSync(filePath).isFile()) filePath = join(DIST, "index.html"); }
  catch { filePath = join(DIST, "index.html"); }
  try {
    const stat = statSync(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": filePath.endsWith("index.html")
        ? "no-store"
        : /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(url.pathname)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"
    });
    if (request.method === "HEAD") return response.end();
    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 503, { ok: false, error: { code: "portal_not_built", message: "Run npm run build before starting the production server." }, truth: TRUTH });
  }
}

export function createPortalServer(options = {}) {
  const config = loadConfig(options.config);
  const runtimeFetch = options.runtimeFetch ?? globalThis.fetch;
  const localFetch = options.localFetch ?? globalThis.fetch;
  const operationalFetch = options.operationalFetch ?? globalThis.fetch;
  const replayFetch = options.replayFetch ?? globalThis.fetch;
  const sessionAuthority = createSessionAuthority(config, options.clock);
  const cache = new Map();
  const tracker = { lastSuccessfulConnection: null, lastSuccessfulRefresh: null };
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/api/session")) {
      handleSessionApi(request, response, config, sessionAuthority)
        .catch(() => sendJson(response, 500, operationalFailure(config, request.url, "session_gateway_error", "The session request failed safely.", "Unknown")));
    } else if (request.url?.startsWith("/api/operations")) {
      handleOperationalApi(request, response, config, operationalFetch, sessionAuthority)
        .catch(() => sendJson(response, 500, operationalFailure(config, request.url, "operational_gateway_error", "The hosted operation failed safely.", "Unknown")));
    } else if (request.url?.startsWith("/api/runtime/realtime/call")) {
      handleRealtimeCall(request, response, config, runtimeFetch, sessionAuthority, options.clock)
        .catch(() => sendJson(response, 500, { ok: false, error: { code: "realtime_gateway_error", message: "Realtime session creation failed safely." }, truth: TRUTH }));
    } else if (request.url?.startsWith("/api/runtime/executive-briefing") || request.url === "/api/runtime/conclave/reviews" || request.url === "/api/runtime/interactions" || request.url?.startsWith("/api/runtime/interactions/")) {
      handleRuntimeMutation(request, response, config, runtimeFetch, tracker, sessionAuthority, options.clock)
        .catch((error) => {
          const failure = error instanceof GatewayFailure ? error : new GatewayFailure("gateway_error", "The bounded Runtime request failed safely.", "Unknown", 500);
          sendJson(response, failure.status, failureEnvelope(config, tracker, request.url, failure));
        });
    } else if (request.url?.startsWith("/api/runtime")) {
      handleApi(request, response, config, runtimeFetch, cache, tracker)
        .catch(() => sendJson(response, 500, failureEnvelope(config, tracker, request.url, new GatewayFailure("gateway_error", "The Experience Gateway could not complete the read request.", "Unknown", 500))));
    } else if (request.url?.startsWith("/api/local")) {
      handleLocalApi(request, response, config, localFetch)
        .catch(() => sendJson(response, 500, localFailure(config, request.url, "local_gateway_error", "The local capability request failed safely.", "Unknown")));
    } else if (request.url?.startsWith("/api/replay")) {
      handleReplayApi(request, response, config, replayFetch)
        .catch(() => sendJson(response, 500, { ok: false, error: { code: "replay_gateway_error", message: "Operational Replay failed safely." }, truth: TRUTH }));
    } else {
      serveStatic(request, response);
    }
  });
  server.experienceGateway = { cache, tracker, config, sessionAuthority };
  return server;
}
