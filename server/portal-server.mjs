import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createSessionAuthority, requiredScope } from "./operational-auth.mjs";
import {
  createExecutiveRegistrationMapper,
  createExecutiveSessionAuthority,
  createHumanSessionAssertion,
  createReplitAuthAdapter,
  EXECUTIVE_SESSION_COOKIE_NAME,
  EXECUTIVE_SESSION_POLICY_DIGEST,
  EXECUTIVE_SESSION_POLICY_ID,
  EXECUTIVE_SESSION_POLICY_VERSION,
  EXECUTIVE_SCOPES,
  ExecutiveSessionFailure,
  HUMAN_SESSION_ASSERTION_CONTRACT,
  HUMAN_SESSION_ASSERTION_HEADER,
  MAX_EXECUTIVE_SESSION_LIFETIME_SECONDS,
  MAX_HUMAN_ASSERTION_LIFETIME_SECONDS,
  REGISTERED_EXECUTIVE_SESSION_CONTRACT,
} from "./executive-session.mjs";
import {
  createExecutiveSessionRuntimeClient,
  ExecutiveSessionRuntimeFailure,
} from "./executive-session-runtime.mjs";
import {
  createReplitAuthIdentityVerifier,
  REPLIT_AUTH_CANONICAL_ISSUER,
} from "./replit-auth-provider.mjs";
import {
  createProviderSessionIdentityVerifier,
  createReplitAuthInteractiveHandler,
} from "./replit-auth-oidc.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(ROOT, "dist");

export const SUPPORTED_SCHEMA_VERSION = "1.0.0";
export const SUPPORTED_RUNTIME_VERSION = "0.1.0";
export const CAPABILITY_REGISTRY_SCHEMA_VERSION = "nexus.live-capability-registry@1.0.0";
export const CAPABILITY_REGISTRY_RECORD_TYPE = "nexus_live_capability_registry_projection";
const CAPABILITY_REGISTRY_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const CAPABILITY_REGISTRY_OWNER = "context_runtime";
const CAPABILITY_REGISTRY_PROJECTION_OWNER = "runtime.state.RuntimeState.capability_registry_projection";
const CAPABILITY_REGISTRY_RELEASE_ID = "NCR-1.0.0";
const CAPABILITY_REGISTRY_RELEASE_DIGEST = "sha256:212678643019c07c38d11c6abf4b4810fb87b5b8cf543b6ccdc958dcb9bdaffa";
const CAPABILITY_REGISTRY_RESOLUTION_DIGEST = "sha256:376331b2fdde7bbe38e6bad7d09d265666353166e78f71c7c2928e59793ec996";
const CAPABILITY_REGISTRY_VERIFICATION_POLICY = "nexus.connector-verification-freshness@1.0.0";
const CAPABILITY_REGISTRY_MAXIMUM_FUTURE_SKEW_SECONDS = 30;
export const REPLIT_AUTH_PROVIDER_ISSUER = REPLIT_AUTH_CANONICAL_ISSUER;
export const MISSION3_SESSION_CAPABILITIES = Object.freeze([
  "executive_session.authenticate",
  "executive_session.read",
  "executive_session.revoke",
]);
export const MISSION3_CAPABILITY_DEPENDENCY_RECEIPT_TYPE =
  "capability_dependency_verification";
export const MISSION3_CAPABILITY_DEPENDENCY_CONNECTOR_ID =
  "context_runtime.local_api";
export const MISSION3_SESSION_ESTABLISHMENT_RECEIPT_TYPE =
  MISSION3_CAPABILITY_DEPENDENCY_RECEIPT_TYPE;
export const TRUST_BOOTSTRAP_CONTRACT = "nexus.runtime-experience-trust-bootstrap@1.0.0";
export const CONTEXT_ASSERTION_CONTRACT = "nexus.context-assertion@2.0.0";
export const CONTEXT_ASSERTION_ALGORITHM = "hmac-sha256";
const CONTEXT_ASSERTION_AUDIENCE = "nexus-runtime";
const CONTEXT_ASSERTION_ISSUER = "command-portal-experience-gateway";
const CONTEXT_ASSERTION_KEY_ID = "context-assertion-current";
const RUNTIME_CREDENTIAL_KEY_ID = "runtime-read-current";
const TRUST_BINDING_ID = "runtime-experience-trust-bootstrap";
const CONTEXT_ASSERTION_ROLES = Object.freeze(["observer"]);
const HUMAN_SESSION_ASSERTION_ISSUER = "command-portal-experience-gateway";
const HUMAN_SESSION_ASSERTION_AUDIENCE = "nexus-runtime";
const HUMAN_SESSION_ASSERTION_KEY_ID = "executive-session-current";
const HUMAN_SESSION_SERVICE_BINDING_ID = "command-portal-experience-gateway";
const EXECUTIVE_SESSION_COOKIE_KEY_ID = "executive-session-cookie-current";
const PROVIDER_SESSION_KEY_ID = "provider-session-current";
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,191}$/;
const HOST_PATTERN =
  /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const SECRET_REFERENCE_PATTERN = /^(?:env|secret-manager):[A-Za-z0-9][A-Za-z0-9._:/-]{2,191}$/;

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
  "/api/runtime/capability-registry": "/runtime/capability-registry",
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
  const match = pathname.match(/^\/api\/runtime\/interactions\/([A-Z0-9-]+)\/(events|interrupt|resume|presentation-complete)$/);
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

const runtimeActionAlias = (
  actionId,
  runtimeMethod,
  runtimePathTemplate,
  {
    runtimePath = runtimePathTemplate,
    requiredSurfaces = ["api"],
    forwarding = "canonical",
    limitation = "",
  } = {},
) => Object.freeze({
  actionId,
  runtimeMethod,
  runtimePath,
  runtimePathTemplate,
  requiredSurfaces: Object.freeze([...requiredSurfaces]),
  forwarding,
  limitation,
});

export const FIXED_RUNTIME_ACTION_ALIASES = Object.freeze({
  "/api/runtime/status": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.status", "GET", "/runtime/status", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/health": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.health", "GET", "/health", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/ready": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.ready", "GET", "/ready", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/version": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.version", "GET", "/runtime/version", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/providers": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.providers", "GET", "/runtime/providers", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/capabilities": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.capabilities", "GET", "/runtime/capabilities", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/proofs": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.proofs", "GET", "/runtime/proofs", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/receipts": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.receipts", "GET", "/runtime/receipts", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/environment": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.environment", "GET", "/runtime/environment", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/diagnostics": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.diagnostics", "GET", "/runtime/diagnostics", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/governance": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.governance", "GET", "/runtime/governance", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/connectors": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.connectors", "GET", "/runtime/connectors", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/capability-registry": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.capability_registry", "GET", "/runtime/capability-registry", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/realtime-voice": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.voice_realtime_status", "GET", "/runtime/voice/realtime/status", { requiredSurfaces: ["api", "ui", "voice"] }) }),
  "/api/runtime/conclave": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.conclave_status", "GET", "/runtime/conclave/status", { requiredSurfaces: ["api", "assistant", "ui"] }) }),
  "/api/runtime/eox": Object.freeze({ GET: runtimeActionAlias("context.runtime.route.get.runtime.executive_operating_loop", "GET", "/runtime/executive-operating-loop", { requiredSurfaces: ["api", "ui"] }) }),
  "/api/runtime/replay": Object.freeze({
    GET: runtimeActionAlias(
      "canonical.route.get.operational-replay",
      "GET",
      "/operational-replay",
      {
        runtimePath: "/runtime/replay",
        forwarding: "unavailable_adapter",
        limitation: "The legacy Runtime Replay alias is registered but unavailable; it never forwards.",
      },
    ),
  }),
  "/api/runtime/executive-briefing": Object.freeze({ POST: runtimeActionAlias("context.runtime.route.post.runtime.executive_operating_loop.briefing", "POST", "/runtime/executive-operating-loop/briefing", { requiredSurfaces: ["api", "assistant", "ui", "voice"] }) }),
  "/api/runtime/conclave/reviews": Object.freeze({ POST: runtimeActionAlias("context.runtime.route.post.runtime.conclave.reviews", "POST", "/runtime/conclave/reviews", { requiredSurfaces: ["api", "assistant", "ui"] }) }),
  "/api/runtime/interactions": Object.freeze({ POST: runtimeActionAlias("context.runtime.route.post.runtime.interactions", "POST", "/runtime/interactions", { requiredSurfaces: ["api", "assistant", "ui", "voice"] }) }),
  "/api/runtime/realtime/call": Object.freeze({ POST: runtimeActionAlias("context.runtime.route.post.runtime.voice.realtime.call", "POST", "/runtime/voice/realtime/call", { requiredSurfaces: ["api", "voice"] }) }),
  "/api/local/interactions/status": Object.freeze({
    GET: runtimeActionAlias(
      "context.runtime.route.get.runtime.interactions_status",
      "GET",
      "/runtime/interactions/status",
      {
        requiredSurfaces: ["api", "assistant", "ui", "voice"],
        forwarding: "unavailable_adapter",
        limitation: "The unsigned local interaction alias is not admitted; the signed Mission 1 Runtime boundary is required.",
      },
    ),
  }),
  "/api/local/interactions": Object.freeze({
    POST: runtimeActionAlias(
      "context.runtime.route.post.runtime.interactions",
      "POST",
      "/runtime/interactions",
      {
        requiredSurfaces: ["api", "assistant", "ui", "voice"],
        forwarding: "unavailable_adapter",
        limitation: "The unsigned local interaction alias is not admitted; use the signed Mission 1 /api/runtime/interactions boundary.",
      },
    ),
  }),
});

function dynamicRuntimeActionAliases(method, pathname) {
  const candidates = [];
  const interaction = pathname.match(/^\/api\/runtime\/interactions\/([A-Z0-9-]+)\/(events|interrupt|resume|presentation-complete)$/);
  if (interaction) {
    const [, interactionId, operation] = interaction;
    const definitions = {
      events: ["GET", "context.runtime.route.get.runtime.interactions.events", "/runtime/interactions/{interaction_id}/events", ["api", "assistant", "ui", "voice"]],
      interrupt: ["POST", "context.runtime.route.post.runtime.interactions.interrupt", "/runtime/interactions/{interaction_id}/interrupt", ["api", "assistant", "ui", "voice"]],
      resume: ["POST", "context.runtime.route.post.runtime.interactions.resume", "/runtime/interactions/{interaction_id}/resume", ["api", "assistant", "ui", "voice"]],
      "presentation-complete": ["POST", "context.runtime.route.post.runtime.interactions.presentation_complete", "/runtime/interactions/{interaction_id}/presentation-complete", ["api", "ui"]],
    };
    const [expectedMethod, actionId, template, requiredSurfaces] = definitions[operation];
    if (method === expectedMethod) {
      candidates.push(runtimeActionAlias(actionId, expectedMethod, template, {
        runtimePath: `/runtime/interactions/${interactionId}/${operation}`,
        requiredSurfaces,
      }));
    }
  }
  const localInteraction = pathname.match(/^\/api\/local\/interactions\/([A-Z0-9-]+)\/(events|interrupt|presentation-complete)$/);
  if (localInteraction) {
    const [, interactionId, operation] = localInteraction;
    const definitions = {
      events: ["GET", "context.runtime.route.get.runtime.interactions.events", "/runtime/interactions/{interaction_id}/events", ["api", "assistant", "ui", "voice"]],
      interrupt: ["POST", "context.runtime.route.post.runtime.interactions.interrupt", "/runtime/interactions/{interaction_id}/interrupt", ["api", "assistant", "ui", "voice"]],
      "presentation-complete": ["POST", "context.runtime.route.post.runtime.interactions.presentation_complete", "/runtime/interactions/{interaction_id}/presentation-complete", ["api", "ui"]],
    };
    const [expectedMethod, actionId, template, requiredSurfaces] = definitions[operation];
    if (method === expectedMethod) {
      candidates.push(runtimeActionAlias(actionId, expectedMethod, template, {
        runtimePath: `/runtime/interactions/${interactionId}/${operation}`,
        requiredSurfaces,
        forwarding: "unavailable_adapter",
        limitation: "The unsigned local interaction lifecycle alias is not admitted; use the signed Mission 1 Runtime boundary.",
      }));
    }
  }
  const replayDetail = pathname.match(/^\/api\/runtime\/replay\/([A-Za-z0-9_.:-]+)$/);
  if (method === "GET" && replayDetail) {
    candidates.push(runtimeActionAlias(
      "canonical.route.get.operational-replay._replay_id",
      "GET",
      "/operational-replay/{replay_id}",
      {
        runtimePath: `/runtime/replay/${replayDetail[1]}`,
        forwarding: "unavailable_adapter",
        limitation: "The legacy Runtime Replay detail alias is registered but unavailable; it never forwards.",
      },
    ));
  }
  const replayEvents = pathname.match(/^\/api\/runtime\/replay\/([A-Za-z0-9_.:-]+)\/events$/);
  if (method === "GET" && replayEvents) {
    candidates.push(runtimeActionAlias(
      "canonical.route.get.operational-replay._replay_id_.events",
      "GET",
      "/operational-replay/{replay_id}/events",
      {
        runtimePath: `/runtime/replay/${replayEvents[1]}/events`,
        forwarding: "unavailable_adapter",
        limitation: "The legacy Runtime Replay event alias is registered but unavailable; it never forwards.",
      },
    ));
  }
  const replayExplain = pathname.match(/^\/api\/runtime\/replay\/([A-Za-z0-9_.:-]+)\/stages\/(observation|evidence|representation|conclave|authority|decision|receipt)\/explain$/);
  if (method === "GET" && replayExplain) {
    candidates.push(runtimeActionAlias(
      "canonical.route.get.operational-replay._replay_id_.stages._selector_.explain",
      "GET",
      "/operational-replay/{replay_id}/stages/{selector}/explain",
      {
        runtimePath: `/runtime/replay/${replayExplain[1]}/stages/${replayExplain[2]}/explain`,
        forwarding: "unavailable_adapter",
        limitation: "The legacy Runtime Replay explanation alias is registered but unavailable; it never forwards.",
      },
    ));
  }
  return candidates;
}

export function resolveGatewayRuntimeActionAlias(method, pathname) {
  const fixed = FIXED_RUNTIME_ACTION_ALIASES[pathname]?.[method];
  const candidates = [...(fixed ? [fixed] : []), ...dynamicRuntimeActionAliases(method, pathname)];
  return candidates.length === 1 ? candidates[0] : null;
}

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
  conclave: "unavailable",
  actualTrainedSLMs: 0,
  secretValuesExposed: false
});
const OPERATIONAL_SESSION_MODES = new Set(["access_key", "automatic_private_workspace"]);

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

function stablePublicIdentifier(value, name) {
  const identifier = String(value ?? "").trim();
  if (!STABLE_ID_PATTERN.test(identifier)) throw new Error(`${name} must be a stable public identifier.`);
  return identifier;
}

function stableSha256Digest(value, name) {
  const digest = String(value ?? "").trim();
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`${name} must be a SHA-256 digest.`);
  }
  return digest;
}

function optionalSecretReference(value, name) {
  const reference = String(value ?? "").trim();
  if (reference && !SECRET_REFERENCE_PATTERN.test(reference)) {
    throw new Error(`${name} must be an opaque secret-provider reference.`);
  }
  return reference;
}

function registeredExecutives(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  let parsed;
  try {
    parsed = JSON.parse(String(value ?? ""));
  } catch {
    throw new Error("COMMAND_PORTAL_EXECUTIVE_REGISTRATIONS_JSON must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("COMMAND_PORTAL_EXECUTIVE_REGISTRATIONS_JSON must contain a principal registry object.");
  }
  return parsed;
}

const encodeBase64Url = (value) => Buffer.from(value).toString("base64url");

export function createTenantContextAssertion(config, _claims, clientId, clock = () => Date.now()) {
  if (!config.contextAssertionSecret) return "";
  const issuer = config.contextAssertionIssuer ?? CONTEXT_ASSERTION_ISSUER;
  const audience = config.contextAssertionAudience ?? CONTEXT_ASSERTION_AUDIENCE;
  const keyId = config.contextAssertionKeyId ?? CONTEXT_ASSERTION_KEY_ID;
  const allowedClientIds = config.contextAssertionClientIds ?? ["nexus-web"];
  if (!allowedClientIds.includes(clientId)) {
    throw new Error("The Runtime client identity is not provisioned for this Experience Gateway.");
  }
  const issuedAt = Math.floor(clock() / 1000);
  const payload = {
    v: 2,
    contract: CONTEXT_ASSERTION_CONTRACT,
    alg: CONTEXT_ASSERTION_ALGORITHM,
    kid: keyId,
    iss: issuer,
    aud: audience,
    tid: config.operationalTenantId ?? "nexicron",
    wid: config.operationalWorkspaceId ?? "primary",
    sub: issuer,
    roles: [...CONTEXT_ASSERTION_ROLES],
    clientId,
    iat: issuedAt,
    exp: issuedAt + 60,
    jti: randomUUID(),
    trustBindingId: TRUST_BINDING_ID,
    authorityGranted: false
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
  const trustBootstrapRequired = enabled(
    overrides.trustBootstrapRequired
      ?? process.env.COMMAND_PORTAL_TRUST_BOOTSTRAP_REQUIRED
  );
  const runtimeTokenRef = optionalSecretReference(
    overrides.runtimeTokenRef
      ?? process.env.COMMAND_PORTAL_RUNTIME_READ_TOKEN_REF,
    "COMMAND_PORTAL_RUNTIME_READ_TOKEN_REF"
  );
  const runtimeTokenKeyId = stablePublicIdentifier(
    overrides.runtimeTokenKeyId
      ?? process.env.COMMAND_PORTAL_RUNTIME_READ_TOKEN_KEY_ID
      ?? RUNTIME_CREDENTIAL_KEY_ID,
    "COMMAND_PORTAL_RUNTIME_READ_TOKEN_KEY_ID"
  );
  const contextAssertionSecret = optionalSecret(
    overrides.contextAssertionSecret
      ?? process.env.NEXUS_CONTEXT_ASSERTION_SECRET,
    "NEXUS_CONTEXT_ASSERTION_SECRET"
  );
  const contextAssertionSecretRef = optionalSecretReference(
    overrides.contextAssertionSecretRef
      ?? process.env.NEXUS_CONTEXT_ASSERTION_SECRET_REF,
    "NEXUS_CONTEXT_ASSERTION_SECRET_REF"
  );
  const contextAssertionIssuer = stablePublicIdentifier(
    overrides.contextAssertionIssuer
      ?? process.env.COMMAND_PORTAL_CONTEXT_ASSERTION_ISSUER
      ?? CONTEXT_ASSERTION_ISSUER,
    "COMMAND_PORTAL_CONTEXT_ASSERTION_ISSUER"
  );
  const contextAssertionAudience = stablePublicIdentifier(
    overrides.contextAssertionAudience
      ?? process.env.COMMAND_PORTAL_CONTEXT_ASSERTION_AUDIENCE
      ?? CONTEXT_ASSERTION_AUDIENCE,
    "COMMAND_PORTAL_CONTEXT_ASSERTION_AUDIENCE"
  );
  const contextAssertionKeyId = stablePublicIdentifier(
    overrides.contextAssertionKeyId
      ?? process.env.NEXUS_CONTEXT_ASSERTION_KEY_ID
      ?? CONTEXT_ASSERTION_KEY_ID,
    "NEXUS_CONTEXT_ASSERTION_KEY_ID"
  );
  const contextAssertionClientIds = String(
    overrides.contextAssertionClientIds
      ?? process.env.COMMAND_PORTAL_CONTEXT_ASSERTION_CLIENT_IDS
      ?? "nexus-web"
  ).split(",").map((item) => item.trim()).filter(Boolean);
  if (
    contextAssertionClientIds.length === 0
    || new Set(contextAssertionClientIds).size !== contextAssertionClientIds.length
    || contextAssertionClientIds.some((item) => !STABLE_ID_PATTERN.test(item))
  ) {
    throw new Error("COMMAND_PORTAL_CONTEXT_ASSERTION_CLIENT_IDS must contain unique stable public identifiers.");
  }
  const operationalTenantId = stablePublicIdentifier(
    overrides.operationalTenantId
      ?? process.env.COMMAND_PORTAL_TENANT_ID
      ?? "nexicron",
    "COMMAND_PORTAL_TENANT_ID"
  );
  const operationalWorkspaceId = stablePublicIdentifier(
    overrides.operationalWorkspaceId
      ?? process.env.COMMAND_PORTAL_WORKSPACE_ID
      ?? "primary",
    "COMMAND_PORTAL_WORKSPACE_ID"
  );
  if (contextAssertionSecret && contextAssertionSecret === runtimeToken) {
    throw new Error("Runtime service authentication and context assertion material must be distinct by purpose.");
  }
  if (trustBootstrapRequired) {
    requiredSecret(runtimeToken, "COMMAND_PORTAL_RUNTIME_READ_TOKEN", 32);
    requiredSecret(contextAssertionSecret, "NEXUS_CONTEXT_ASSERTION_SECRET", 32);
    if (!runtimeTokenRef || !contextAssertionSecretRef) {
      throw new Error("Trust bootstrap requires both opaque secret-provider references.");
    }
    if (new URL(runtimeBaseUrl).protocol !== "https:") {
      throw new Error("Trust bootstrap requires an HTTPS Runtime endpoint.");
    }
    if (
      contextAssertionIssuer !== CONTEXT_ASSERTION_ISSUER
      || contextAssertionAudience !== CONTEXT_ASSERTION_AUDIENCE
      || contextAssertionKeyId !== CONTEXT_ASSERTION_KEY_ID
      || runtimeTokenKeyId !== RUNTIME_CREDENTIAL_KEY_ID
      || contextAssertionClientIds.length !== 1
      || contextAssertionClientIds[0] !== "nexus-web"
    ) {
      throw new Error("Trust bootstrap public identities must match the registered Mission 1 binding.");
    }
  }
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
  const operationalRuntimeToken = operationalEnabled
    ? requiredSecret(
      overrides.operationalRuntimeToken
        ?? process.env.COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN,
      "COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN",
    )
    : "";
  const operationalSessionSecret = operationalEnabled
    ? requiredSecret(
      overrides.operationalSessionSecret
        ?? process.env.COMMAND_PORTAL_SESSION_SECRET,
      "COMMAND_PORTAL_SESSION_SECRET",
      32,
    )
    : "";
  const operationalScopes = String(overrides.operationalScopes ?? process.env.COMMAND_PORTAL_OPERATIONAL_SCOPES ?? "operations:read,operations:write,actions:simulate,actions:execute,approvals:decide,evidence:write,knowledge:promote,edge:node_admission:request")
    .split(",").map((item) => item.trim()).filter(Boolean);
  const replitDeployment = enabled(overrides.replitDeployment ?? process.env.REPLIT_DEPLOYMENT);
  const replitId = String(overrides.replitId ?? process.env.REPL_ID ?? "").trim();
  const operationalSessionMode = String(
    overrides.operationalSessionMode
      ?? process.env.COMMAND_PORTAL_SESSION_MODE
      ?? (replitDeployment ? "automatic_private_workspace" : "access_key")
  ).trim();
  if (!OPERATIONAL_SESSION_MODES.has(operationalSessionMode)) {
    throw new Error("COMMAND_PORTAL_SESSION_MODE must be access_key or automatic_private_workspace.");
  }
  const operationalCookieSecure = enabled(overrides.operationalCookieSecure ?? process.env.COMMAND_PORTAL_COOKIE_SECURE, true);
  const replitDomains = String(overrides.replitDomains ?? process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, ""))
    .filter(Boolean);
  const replitDevDomain = String(
    overrides.replitDevDomain ?? process.env.REPLIT_DEV_DOMAIN ?? "",
  )
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
  if (
    replitDevDomain
    && (
      !HOST_PATTERN.test(replitDevDomain)
      || !replitDevDomain.endsWith(".replit.dev")
    )
  ) {
    throw new Error("REPLIT_DEV_DOMAIN must be an exact Replit development host.");
  }
  if (operationalEnabled && operationalSessionMode === "automatic_private_workspace") {
    if (!replitDeployment || !operationalCookieSecure || replitDomains.length === 0) {
      throw new Error("Automatic hosted sessions require REPLIT_DEPLOYMENT=1, at least one REPLIT_DOMAINS binding, and Secure cookies.");
    }
  }
  const executiveSessionEnabled = enabled(
    overrides.executiveSessionEnabled
      ?? process.env.COMMAND_PORTAL_EXECUTIVE_SESSION_ENABLED,
  );
  const providerInteractiveAuthEnabled = enabled(
    overrides.providerInteractiveAuthEnabled
      ?? process.env.COMMAND_PORTAL_PROVIDER_INTERACTIVE_AUTH_ENABLED,
  );
  if (
    executiveSessionEnabled
    && replitDeployment
    && !providerInteractiveAuthEnabled
  ) {
    throw new Error(
      "Published Registered Executive sessions require the attested interactive Replit Auth path.",
    );
  }
  const executiveSessionCookieSecure = operationalCookieSecure;
  const executiveSessionTtlSeconds = integer(
    overrides.executiveSessionTtlSeconds
      ?? process.env.COMMAND_PORTAL_EXECUTIVE_SESSION_TTL_SECONDS,
    MAX_EXECUTIVE_SESSION_LIFETIME_SECONDS,
    300,
  );
  const humanSessionAssertionTtlSeconds = integer(
    overrides.humanSessionAssertionTtlSeconds
      ?? process.env.COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_TTL_SECONDS,
    MAX_HUMAN_ASSERTION_LIFETIME_SECONDS,
  );
  if (
    executiveSessionTtlSeconds > MAX_EXECUTIVE_SESSION_LIFETIME_SECONDS
    || humanSessionAssertionTtlSeconds > MAX_HUMAN_ASSERTION_LIFETIME_SECONDS
  ) {
    throw new Error("Registered executive session or assertion lifetime exceeds the Mission 3 bound.");
  }
  const executiveSessionCookieSecret = executiveSessionEnabled
    ? requiredSecret(
      overrides.executiveSessionCookieSecret
        ?? process.env.COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_SECRET,
      "COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_SECRET",
      32,
    )
    : "";
  const executiveSessionCookieSecretRef = optionalSecretReference(
    overrides.executiveSessionCookieSecretRef
      ?? process.env.COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_SECRET_REF,
    "COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_SECRET_REF",
  );
  const executiveSessionCookieKeyId = stablePublicIdentifier(
    overrides.executiveSessionCookieKeyId
      ?? process.env.COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_KEY_ID
      ?? EXECUTIVE_SESSION_COOKIE_KEY_ID,
    "COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_KEY_ID",
  );
  const humanSessionAssertionSecret = executiveSessionEnabled
    ? requiredSecret(
      overrides.humanSessionAssertionSecret
        ?? process.env.NEXUS_HUMAN_SESSION_ASSERTION_SECRET,
      "NEXUS_HUMAN_SESSION_ASSERTION_SECRET",
      32,
    )
    : "";
  const humanSessionAssertionSecretRef = optionalSecretReference(
    overrides.humanSessionAssertionSecretRef
      ?? process.env.NEXUS_HUMAN_SESSION_ASSERTION_SECRET_REF,
    "NEXUS_HUMAN_SESSION_ASSERTION_SECRET_REF",
  );
  const humanSessionAssertionKeyId = stablePublicIdentifier(
    overrides.humanSessionAssertionKeyId
      ?? process.env.NEXUS_HUMAN_SESSION_ASSERTION_KEY_ID
      ?? HUMAN_SESSION_ASSERTION_KEY_ID,
    "NEXUS_HUMAN_SESSION_ASSERTION_KEY_ID",
  );
  const humanSessionAssertionIssuer = stablePublicIdentifier(
    overrides.humanSessionAssertionIssuer
      ?? process.env.COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_ISSUER
      ?? HUMAN_SESSION_ASSERTION_ISSUER,
    "COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_ISSUER",
  );
  const humanSessionAssertionAudience = stablePublicIdentifier(
    overrides.humanSessionAssertionAudience
      ?? process.env.COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_AUDIENCE
      ?? HUMAN_SESSION_ASSERTION_AUDIENCE,
    "COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_AUDIENCE",
  );
  const humanSessionServiceBindingId = stablePublicIdentifier(
    overrides.humanSessionServiceBindingId
      ?? process.env.COMMAND_PORTAL_HUMAN_SESSION_SERVICE_BINDING_ID
      ?? HUMAN_SESSION_SERVICE_BINDING_ID,
    "COMMAND_PORTAL_HUMAN_SESSION_SERVICE_BINDING_ID",
  );
  const humanSessionAssertionClientId = stablePublicIdentifier(
    overrides.humanSessionAssertionClientId
      ?? process.env.COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_CLIENT_ID
      ?? "nexus-web",
    "COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_CLIENT_ID",
  );
  if (
    executiveSessionEnabled
    && replitDeployment
    && !STABLE_ID_PATTERN.test(replitId)
  ) {
    throw new Error(
      "Managed Replit Auth requires a stable provider-owned REPL_ID.",
    );
  }
  const replitAuthIssuer = executiveSessionEnabled || providerInteractiveAuthEnabled
    ? stablePublicIdentifier(
      overrides.replitAuthIssuer
        ?? process.env.COMMAND_PORTAL_REPLIT_AUTH_ISSUER
        ?? REPLIT_AUTH_PROVIDER_ISSUER,
      "COMMAND_PORTAL_REPLIT_AUTH_ISSUER",
    )
    : "";
  const replitAuthAudience = executiveSessionEnabled || providerInteractiveAuthEnabled
    ? stablePublicIdentifier(
      overrides.replitAuthAudience
        ?? process.env.COMMAND_PORTAL_REPLIT_AUTH_AUDIENCE
        ?? replitId,
      "COMMAND_PORTAL_REPLIT_AUTH_AUDIENCE",
    )
    : "";
  const replitAuthJwksUrl = String(
    overrides.replitAuthJwksUrl
      ?? process.env.COMMAND_PORTAL_REPLIT_AUTH_JWKS_URL
      ?? "",
  ).trim();
  const replitAuthTokenHeader = String(
    overrides.replitAuthTokenHeader
      ?? process.env.COMMAND_PORTAL_REPLIT_AUTH_TOKEN_HEADER
      ?? "x-replit-auth-token",
  ).trim().toLowerCase();
  const replitAuthClockSkewSeconds = integer(
    overrides.replitAuthClockSkewSeconds
      ?? process.env.COMMAND_PORTAL_REPLIT_AUTH_CLOCK_SKEW_SECONDS,
    30,
    0,
  );
  const replitAuthMaxTokenLifetimeSeconds = integer(
    overrides.replitAuthMaxTokenLifetimeSeconds
      ?? process.env.COMMAND_PORTAL_REPLIT_AUTH_MAX_TOKEN_LIFETIME_SECONDS,
    3_600,
    60,
  );
  const replitAuthJwksTimeoutMs = integer(
    overrides.replitAuthJwksTimeoutMs
      ?? process.env.COMMAND_PORTAL_REPLIT_AUTH_JWKS_TIMEOUT_MS,
    5_000,
    100,
  );
  const replitAuthJwksCacheSeconds = integer(
    overrides.replitAuthJwksCacheSeconds
      ?? process.env.COMMAND_PORTAL_REPLIT_AUTH_JWKS_CACHE_SECONDS,
    300,
    30,
  );
  const executiveSessionPolicyId = stablePublicIdentifier(
    overrides.executiveSessionPolicyId
      ?? process.env.COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_ID
      ?? EXECUTIVE_SESSION_POLICY_ID,
    "COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_ID",
  );
  const executiveSessionPolicyVersion = stablePublicIdentifier(
    overrides.executiveSessionPolicyVersion
      ?? process.env.COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_VERSION
      ?? EXECUTIVE_SESSION_POLICY_VERSION,
    "COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_VERSION",
  );
  const executiveSessionPolicyDigest = executiveSessionEnabled
    ? stableSha256Digest(
      overrides.executiveSessionPolicyDigest
        ?? process.env.COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_DIGEST,
      "COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_DIGEST",
    )
    : "";
  const providerSessionSecret = providerInteractiveAuthEnabled
    ? requiredSecret(
      overrides.providerSessionSecret
        ?? process.env.COMMAND_PORTAL_PROVIDER_SESSION_SECRET,
      "COMMAND_PORTAL_PROVIDER_SESSION_SECRET",
      32,
    )
    : "";
  const providerSessionSecretRef = optionalSecretReference(
    overrides.providerSessionSecretRef
      ?? process.env.COMMAND_PORTAL_PROVIDER_SESSION_SECRET_REF,
    "COMMAND_PORTAL_PROVIDER_SESSION_SECRET_REF",
  );
  const providerSessionKeyId = stablePublicIdentifier(
    overrides.providerSessionKeyId
      ?? process.env.COMMAND_PORTAL_PROVIDER_SESSION_KEY_ID
      ?? PROVIDER_SESSION_KEY_ID,
    "COMMAND_PORTAL_PROVIDER_SESSION_KEY_ID",
  );
  const providerSessionTtlSeconds = integer(
    overrides.providerSessionTtlSeconds
      ?? process.env.COMMAND_PORTAL_PROVIDER_SESSION_TTL_SECONDS,
    3_600,
    60,
  );
  if (providerInteractiveAuthEnabled) {
    if (!providerSessionSecretRef) {
      throw new Error(
        "Interactive Replit Auth requires a provider-session secret-manager reference.",
      );
    }
    if (!STABLE_ID_PATTERN.test(replitId)) {
      throw new Error("Interactive Replit Auth requires a stable provider-owned REPL_ID.");
    }
    if (
      replitAuthIssuer !== REPLIT_AUTH_PROVIDER_ISSUER
      || replitAuthAudience !== replitId
    ) {
      throw new Error("Interactive Replit Auth requires the managed provider issuer and REPL_ID audience.");
    }
    if (providerSessionTtlSeconds > 86_400) {
      throw new Error("Interactive provider session lifetime exceeds the accepted bound.");
    }
    const purposeBoundSecrets = [
        runtimeToken,
        contextAssertionSecret,
        providerSessionSecret,
        ...(operationalRuntimeToken ? [operationalRuntimeToken] : []),
        ...(operationalSessionSecret ? [operationalSessionSecret] : []),
        ...(executiveSessionEnabled
          ? [executiveSessionCookieSecret, humanSessionAssertionSecret]
          : []),
      ];
    if (new Set(purposeBoundSecrets).size !== purposeBoundSecrets.length) {
      throw new Error("The interactive provider session secret must be purpose-bound and distinct.");
    }
  }
  let executiveRegistrations = executiveSessionEnabled
    ? registeredExecutives(
      overrides.executiveRegistrations
        ?? process.env.COMMAND_PORTAL_EXECUTIVE_REGISTRATIONS_JSON,
    )
    : [];
  if (executiveSessionEnabled) {
    if (
      !trustBootstrapRequired
      || !executiveSessionCookieSecretRef
      || !humanSessionAssertionSecretRef
      || humanSessionAssertionIssuer !== HUMAN_SESSION_ASSERTION_ISSUER
      || humanSessionAssertionAudience !== HUMAN_SESSION_ASSERTION_AUDIENCE
      || humanSessionAssertionKeyId !== HUMAN_SESSION_ASSERTION_KEY_ID
      || humanSessionServiceBindingId !== HUMAN_SESSION_SERVICE_BINDING_ID
      || humanSessionAssertionClientId !== "nexus-web"
      || executiveSessionCookieKeyId !== EXECUTIVE_SESSION_COOKIE_KEY_ID
      || executiveSessionPolicyId !== EXECUTIVE_SESSION_POLICY_ID
      || executiveSessionPolicyVersion !== EXECUTIVE_SESSION_POLICY_VERSION
      || executiveSessionPolicyDigest !== EXECUTIVE_SESSION_POLICY_DIGEST
      || (
        replitDeployment
        && (
          replitAuthIssuer !== REPLIT_AUTH_PROVIDER_ISSUER
          || replitAuthAudience !== replitId
        )
      )
    ) {
      throw new Error("Mission 3 registered executive sessions require the exact accepted trust, key, issuer, audience, service, and secret-reference bindings.");
    }
    if (
      new Set([
        runtimeToken,
        contextAssertionSecret,
        executiveSessionCookieSecret,
        humanSessionAssertionSecret,
      ]).size !== 4
    ) {
      throw new Error("Runtime, context, executive-cookie, and human-assertion secrets must be purpose-bound and distinct.");
    }
    if (
      !executiveSessionCookieSecure
      || (replitDeployment && replitDomains.length === 0)
    ) {
      throw new Error("Registered executive sessions require Secure cookies; Replit deployments also require at least one REPLIT_DOMAINS binding.");
    }
    const registrationMapper = createExecutiveRegistrationMapper(executiveRegistrations);
    const metadata = registrationMapper.publicMetadata();
    if (
      metadata.some((item) => (
        item.providerIssuer !== replitAuthIssuer
        || item.principalId === humanSessionServiceBindingId
        || item.tenantId !== operationalTenantId
        || item.workspaceId !== operationalWorkspaceId
        || item.policyId !== executiveSessionPolicyId
        || item.policyVersion !== executiveSessionPolicyVersion
        || item.policyDigest !== executiveSessionPolicyDigest
      ))
    ) {
      throw new Error("Executive registrations must match the verified provider issuer and server-owned tenant/workspace binding.");
    }
    executiveRegistrations = registrationMapper.document();
  }
  return Object.freeze({
    port: integer(overrides.port ?? process.env.PORT, 4173, 0),
    runtimeBaseUrl,
    runtimePublicUrl: new URL(runtimeBaseUrl).origin,
    runtimeToken,
    runtimeTokenRef,
    runtimeTokenKeyId,
    trustBootstrapRequired,
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
    operationalRuntimeToken,
    operationalSessionSecret:
      operationalSessionSecret || "disabled-session-secret-not-used",
    operationalSessionMode,
    operationalPrincipalType: operationalSessionMode === "automatic_private_workspace" ? "workspace_service" : "named_operator",
    operationalAccessBasis: operationalSessionMode === "automatic_private_workspace" ? "replit_private_deployment" : "operator_access_key",
    operationalAccessKey: operationalEnabled && operationalSessionMode === "access_key"
      ? requiredSecret(overrides.operationalAccessKey ?? process.env.COMMAND_PORTAL_OPERATOR_ACCESS_KEY, "COMMAND_PORTAL_OPERATOR_ACCESS_KEY", 16)
      : "automatic-session-no-access-key",
    operationalUserId: String(overrides.operationalUserId ?? process.env.COMMAND_PORTAL_OPERATOR_USER_ID ?? "operator-alpha"),
    operationalTenantId,
    operationalWorkspaceId,
    operationalRole: String(overrides.operationalRole ?? process.env.COMMAND_PORTAL_OPERATOR_ROLE ?? "admin"),
    contextAssertionSecret,
    contextAssertionSecretRef,
    contextAssertionIssuer,
    contextAssertionAudience,
    contextAssertionKeyId,
    contextAssertionClientIds,
    operationalScopes,
    operationalSessionTtlSeconds: integer(overrides.operationalSessionTtlSeconds ?? process.env.COMMAND_PORTAL_SESSION_TTL_SECONDS, 3600, 300),
    operationalCookieSecure,
    replitDeployment,
    replitId,
    replitDomains,
    replitDevDomain,
    executiveSessionEnabled,
    executiveSessionTtlSeconds,
    executiveSessionCookieSecure,
    executiveSessionCookieSecret,
    executiveSessionCookieSecretRef,
    executiveSessionCookieKeyId,
    humanSessionAssertionSecret,
    humanSessionAssertionSecretRef,
    humanSessionAssertionKeyId,
    humanSessionAssertionIssuer,
    humanSessionAssertionAudience,
    humanSessionAssertionTtlSeconds,
    humanSessionServiceBindingId,
    humanSessionAssertionClientId,
    providerInteractiveAuthEnabled,
    providerSessionSecret,
    providerSessionSecretRef,
    providerSessionKeyId,
    providerSessionTtlSeconds,
    replitAuthIssuer,
    replitAuthAudience,
    replitAuthJwksUrl,
    replitAuthTokenHeader,
    replitAuthClockSkewSeconds,
    replitAuthMaxTokenLifetimeSeconds,
    replitAuthJwksTimeoutMs,
    replitAuthJwksCacheSeconds,
    executiveSessionPolicyId,
    executiveSessionPolicyVersion,
    executiveSessionPolicyDigest,
    executiveRegistrations,
    maxAttempts: integer(overrides.maxAttempts, 3),
    retryDelayMs: integer(overrides.retryDelayMs, 100, 0)
  });
}

export function publicTrustBootstrap(config) {
  const runtimeCredentialReferenceConfigured = Boolean(config.runtimeTokenRef);
  const assertionKeyReferenceConfigured = Boolean(config.contextAssertionSecretRef);
  const runtimeCredentialMaterialConfigured = Boolean(config.runtimeToken);
  const assertionKeyMaterialConfigured = Boolean(config.contextAssertionSecret);
  const trustBootstrapRequired = Boolean(config.trustBootstrapRequired);
  const secureRuntimeTransport = (() => {
    try {
      return new URL(config.runtimeBaseUrl).protocol === "https:";
    } catch {
      return false;
    }
  })();
  const publicBindingsValid = (
    (config.contextAssertionIssuer ?? CONTEXT_ASSERTION_ISSUER) === CONTEXT_ASSERTION_ISSUER
    && (config.contextAssertionAudience ?? CONTEXT_ASSERTION_AUDIENCE) === CONTEXT_ASSERTION_AUDIENCE
    && (config.contextAssertionKeyId ?? CONTEXT_ASSERTION_KEY_ID) === CONTEXT_ASSERTION_KEY_ID
    && (config.runtimeTokenKeyId ?? RUNTIME_CREDENTIAL_KEY_ID) === RUNTIME_CREDENTIAL_KEY_ID
    && (config.contextAssertionClientIds ?? ["nexus-web"]).length === 1
    && (config.contextAssertionClientIds ?? ["nexus-web"])[0] === "nexus-web"
    && STABLE_ID_PATTERN.test(String(config.operationalTenantId ?? ""))
    && STABLE_ID_PATTERN.test(String(config.operationalWorkspaceId ?? ""))
  );
  const provisioningReady = trustBootstrapRequired
    && secureRuntimeTransport
    && publicBindingsValid
    && runtimeCredentialReferenceConfigured
    && assertionKeyReferenceConfigured
    && runtimeCredentialMaterialConfigured
    && assertionKeyMaterialConfigured;
  const state = !trustBootstrapRequired
    ? "disabled"
    : (!secureRuntimeTransport || !publicBindingsValid)
      ? "invalid"
      : provisioningReady
        ? "configured_not_verified"
        : "awaiting_operator_provisioning";
  return {
    contractVersion: TRUST_BOOTSTRAP_CONTRACT,
    contextAssertionContract: CONTEXT_ASSERTION_CONTRACT,
    algorithm: CONTEXT_ASSERTION_ALGORITHM,
    state,
    experienceGatewayPrincipalId: config.contextAssertionIssuer ?? CONTEXT_ASSERTION_ISSUER,
    assertionIssuer: config.contextAssertionIssuer ?? CONTEXT_ASSERTION_ISSUER,
    assertionAudience: config.contextAssertionAudience ?? CONTEXT_ASSERTION_AUDIENCE,
    allowedClientIds: [...(config.contextAssertionClientIds ?? ["nexus-web"])],
    currentKeyId: config.contextAssertionKeyId ?? CONTEXT_ASSERTION_KEY_ID,
    runtimeCredentialKeyId: config.runtimeTokenKeyId ?? RUNTIME_CREDENTIAL_KEY_ID,
    runtimeCredentialReferenceConfigured,
    assertionKeyReferenceConfigured,
    runtimeCredentialMaterialConfigured,
    assertionKeyMaterialConfigured,
    secureRuntimeTransport,
    publicBindingsValid,
    tenantBindingConfigured: STABLE_ID_PATTERN.test(String(config.operationalTenantId ?? "")),
    workspaceBindingConfigured: STABLE_ID_PATTERN.test(String(config.operationalWorkspaceId ?? "")),
    assertionSubjectId: CONTEXT_ASSERTION_ISSUER,
    assertionRoles: [...CONTEXT_ASSERTION_ROLES],
    maxAssertionLifetimeSeconds: 60,
    replayProtection: "runtime_process_local_single_use",
    replayProtectionDurable: false,
    canonicalAuthorityOwner: "contracts.authority",
    canonicalAuthorityGrantContract: "nexus.authority-grant@1.1.0",
    canonicalDecisionContract: "nexus.authority-decision@1.1.0",
    authenticationGrantsAuthority: false,
    provisioningContractGrantsAuthority: false,
    targetEnvironmentVerified: false,
    provisioningReady,
    trustBootstrapRequired,
    secretValuesExposed: false,
    limitations: [
      "The Experience Gateway identity is a service principal, not a verified human operator",
      "Service authentication does not grant canonical Authority",
      "Target-environment trust requires a separate sanitized live handshake receipt"
    ]
  };
}

export function publicExecutiveSessionTrust(config) {
  const enabled = Boolean(config.executiveSessionEnabled);
  return {
    contractVersion: REGISTERED_EXECUTIVE_SESSION_CONTRACT,
    assertionContract: HUMAN_SESSION_ASSERTION_CONTRACT,
    state: !enabled ? "disabled" : "configured_not_verified",
    provider: "replit-auth",
    providerIssuerConfigured: Boolean(config.replitAuthIssuer),
    providerAudienceConfigured: Boolean(config.replitAuthAudience),
    providerJwksConfigured: Boolean(config.replitAuthJwksUrl),
    agentProvisionedVerifierSupported: true,
    registrationCount: enabled
      ? config.executiveRegistrations.principals.length
      : 0,
    cookieKeyId: config.executiveSessionCookieKeyId,
    assertionKeyId: config.humanSessionAssertionKeyId,
    assertionIssuer: config.humanSessionAssertionIssuer,
    assertionAudience: config.humanSessionAssertionAudience,
    serviceBindingId: config.humanSessionServiceBindingId,
    clientId: config.humanSessionAssertionClientId,
    policyId: config.executiveSessionPolicyId,
    policyVersion: config.executiveSessionPolicyVersion,
    policyDigest: config.executiveSessionPolicyDigest || null,
    policyBindingVerified: enabled,
    exactRoles: ["executive"],
    exactScopes: [...EXECUTIVE_SCOPES],
    maxSessionLifetimeSeconds: MAX_EXECUTIVE_SESSION_LIFETIME_SECONDS,
    maxAssertionLifetimeSeconds: MAX_HUMAN_ASSERTION_LIFETIME_SECONDS,
    cookieSecretReferenceConfigured: Boolean(config.executiveSessionCookieSecretRef),
    assertionSecretReferenceConfigured: Boolean(config.humanSessionAssertionSecretRef),
    providerSubjectStoredOrExposed: false,
    providerSubjectBindingAlgorithm: "sha256",
    identitySelectsTenantOrWorkspace: false,
    authenticationGrantsAuthority: false,
    sessionCreatesDecision: false,
    sessionCreatesMission: false,
    sessionAuthorizesAction: false,
    targetEnvironmentVerified: false,
    secretValuesExposed: false,
    limitations: enabled
      ? [
        "Replit Auth must be provisioned by Replit Agent and verified by one non-production human login.",
        "Configured identity and session state do not establish Decision, Mission, or Authority.",
        "Target-environment admission requires a separate sanitized Runtime handshake receipt.",
      ]
      : [
        "Registered executive sessions are disabled.",
        "The Mission 1 service principal remains distinct and does not establish a human identity.",
      ],
  };
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
  const forwardedHost = String(request.headers["x-forwarded-host"] ?? "").split(",")[0].trim();
  const selfHost = forwardedHost || request.headers.host;
  const selfOrigin = selfHost ? `${protocol}://${selfHost}` : "";
  return origin === selfOrigin || config.allowedOrigins.includes(origin);
}

function automaticWorkspaceIngressAllowed(request, config) {
  if (
    config.operationalSessionMode !== "automatic_private_workspace"
    || !config.replitDeployment
    || !config.operationalCookieSecure
  ) return false;
  const forwardedHost = String(request.headers["x-forwarded-host"] ?? "").split(",")[0].trim();
  const host = (forwardedHost || String(request.headers.host ?? "")).toLowerCase().replace(/:\d+$/, "");
  if (!host || !config.replitDomains.includes(host)) return false;
  const forwardedProto = String(request.headers["x-forwarded-proto"] ?? "").split(",")[0].trim().toLowerCase();
  const protocol = forwardedProto || (request.socket.encrypted ? "https" : "http");
  if (protocol !== "https") return false;
  const fetchSite = String(request.headers["sec-fetch-site"] ?? "").trim().toLowerCase();
  if (fetchSite === "same-origin") return true;
  const origin = String(request.headers.origin ?? "").trim().toLowerCase();
  return origin === `https://${host}`;
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
    trustBootstrap: publicTrustBootstrap(config),
    executiveSessionTrust: publicExecutiveSessionTrust(config),
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

function executiveSessionEnvelope(config, route, session, additions = {}) {
  return {
    ok: true,
    session,
    executiveSession: {
      mode: "registered_executive_nonproduction",
      route,
      enabled: config.executiveSessionEnabled,
      provider: "replit-auth",
      identityOwner: "server_owned_registration",
      runtimeOwner: "NEXUS Runtime",
      serviceIdentityDistinct: true,
      tenantWorkspaceServerSelected: true,
      authenticationGrantsAuthority: false,
      sessionCreatesDecision: false,
      sessionCreatesMission: false,
      sessionAuthorizesAction: false,
      productionMultiTenantReady: false,
      secretValuesExposed: false,
      ...additions,
    },
    truth: TRUTH,
  };
}

function executiveSessionFailureEnvelope(config, route, error, session = undefined) {
  const connectionState = error.status === 503
    ? "Unavailable"
    : error.status === 504
      ? "Timed Out"
      : error.status >= 500
        ? "Unknown"
        : "Unauthorized";
  return {
    ok: false,
    ...(session ? { session } : {}),
    executiveSession: {
      mode: "registered_executive_nonproduction",
      route,
      enabled: config.executiveSessionEnabled,
      provider: "replit-auth",
      identityOwner: "server_owned_registration",
      runtimeOwner: "NEXUS Runtime",
      serviceIdentityDistinct: true,
      tenantWorkspaceServerSelected: true,
      authenticationGrantsAuthority: false,
      sessionCreatesDecision: false,
      sessionCreatesMission: false,
      sessionAuthorizesAction: false,
      productionMultiTenantReady: false,
      connectionState,
      secretValuesExposed: false,
    },
    truth: TRUTH,
    error: {
      code: error.code ?? "executive_session_failed",
      message: error.message ?? "The registered executive session failed safely.",
    },
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
  "/api/operations/client-capabilities": Object.freeze({ GET: "/client-capabilities" }),
  "/api/operations/intake/history": Object.freeze({ GET: "/intake/history" }),
  "/api/operations/intake/upload": Object.freeze({ POST: "/intake/upload" }),
  "/api/operations/intake/query": Object.freeze({ POST: "/intake/query" }),
  "/api/operations/projects": Object.freeze({ POST: "/projects" }),
  "/api/operations/projects/artifact-types": Object.freeze({ GET: "/projects/artifact-types" }),
  "/api/operations/voice-operator/status": Object.freeze({ GET: "/voice-operator/status" }),
  "/api/operations/voice-operator/history": Object.freeze({ GET: "/voice-operator/history" }),
  "/api/operations/voice-operator/route-transcript": Object.freeze({ POST: "/voice-operator/route-transcript" }),
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

const DYNAMIC_CANONICAL_RUNTIME_TEMPLATES = Object.freeze([
  ["GET", "/projects/{project_id}/sources"],
  ["GET", "/projects/{project_id}/evidence"],
  ["GET", "/projects/{project_id}/scope"],
  ["GET", "/projects/{project_id}/estimate"],
  ["GET", "/projects/{project_id}/planning-model"],
  ["GET", "/projects/{project_id}/artifacts"],
  ["POST", "/projects/{project_id}/compile"],
  ["GET", "/conclave/workspaces/{mission_id}"],
  ["POST", "/conclave/workspaces/{mission_id}/tasks/{task_id}/evidence"],
  ["POST", "/missions/{mission_id}/execute-step"],
  ["POST", "/approvals/{approval_id}/approve"],
  ["POST", "/approvals/{approval_id}/deny"],
  ["GET", "/work-sessions/{session_id}"],
  ["POST", "/work-sessions/{session_id}/step"],
  ["POST", "/work-sessions/{session_id}/continue"],
  ["POST", "/work-sessions/{session_id}/pause"],
  ["POST", "/work-sessions/{session_id}/cancel"],
  ["GET", "/work-sessions/{session_id}/receipt"],
  ["GET", "/operational-replay/{replay_id}"],
  ["GET", "/operational-replay/{replay_id}/events"],
  ["GET", "/operational-replay/{replay_id}/stages/{selector}"],
  ["GET", "/operational-replay/{replay_id}/stages/{selector}/explain"],
  ["GET", "/operational-replay/missions/{mission_id}"],
  ["GET", "/operational-replay/receipts/{receipt_id}"],
  ["GET", "/receipts/missions/{mission_id}"],
  ["GET", "/receipts/{receipt_id}"],
  ["GET", "/receipts/{receipt_id}/proofs"],
  ["POST", "/knowledge/acquisitions/{mission_id}/promotion-candidates"],
  ["GET", "/knowledge/acquisitions/{mission_id}"],
  ["GET", "/knowledge/promotion-candidates/{candidate_id}"],
  ["GET", "/knowledge/store/{record_id}"],
  ["GET", "/knowledge/store/{record_id}/versions"],
  ["GET", "/knowledge/receipts/{receipt_id}"],
  ["GET", "/mission-store/{mission_id}"],
  ["GET", "/missions/{mission_id}"],
  ["GET", "/executive-authority/canonical-execution"],
  ["POST", "/executive-authority/canonical-execution/missions"],
  ["GET", "/executive-authority/canonical-execution/missions/{mission_id}"],
  ["POST", "/executive-authority/canonical-execution/missions/{mission_id}/actions"],
  ["GET", "/runtime/baselines/{baseline_id}"],
  ["GET", "/runtime-coordination/nodes/{node_id}"],
  ["GET", "/runtime-coordination/admissions/{admission_id}"],
  ["POST", "/runtime-coordination/admissions/{admission_id}/cancel"],
  ["POST", "/runtime-coordination/admissions/{admission_id}/challenge/reissue"],
  ["GET", "/runtime-coordination/admissions/{admission_id}/receipt"],
  ["GET", "/runtime-coordination/admissions/{admission_id}/replay"],
]);

function rootRuntimeActionTemplates() {
  const fixed = [];
  for (const routes of Object.values(CANONICAL_OPERATIONAL_ROUTES)) {
    for (const [method, runtimePath] of Object.entries(routes)) {
      fixed.push([method, runtimePath]);
    }
  }
  for (const route of Object.values(LOCAL_CAPABILITY_ROUTES)) {
    fixed.push([route.method, route.runtimePath.split("?", 1)[0]]);
  }
  fixed.push(["POST", "/conclave/workspaces"]);
  const unique = new Map(
    [...fixed, ...DYNAMIC_CANONICAL_RUNTIME_TEMPLATES]
      .map(([method, template]) => [`${method} ${template}`, [method, template]]),
  );
  return Object.freeze([...unique.values()].map((entry) => Object.freeze(entry)));
}

export const ROOT_RUNTIME_ACTION_TEMPLATES = rootRuntimeActionTemplates();

function runtimeTemplatePattern(template) {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\{[A-Za-z][A-Za-z0-9_]*\\\}/g, "[^/]+")}$`);
}

function canonicalActionSlug(method, template) {
  return `${method}.${template.replace(/^\/+|\/+$/g, "").replaceAll("/", ".")}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "") || "unknown";
}

export function resolveCanonicalCapabilityActionAlias(resolved) {
  if (!resolved?.method || !resolved?.runtimePath) return null;
  const path = resolved.runtimePath.split("?", 1)[0];
  let matches = ROOT_RUNTIME_ACTION_TEMPLATES.filter(
    ([method, template]) => method === resolved.method && runtimeTemplatePattern(template).test(path),
  );
  if (matches.length > 1) {
    const specificity = ([, template]) => {
      const segments = template.split("/").filter(Boolean);
      const literals = segments.filter((segment) => !segment.startsWith("{"));
      return [literals.length, literals.join("/").length, -segments.length];
    };
    const compare = (left, right) => {
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return left[index] - right[index];
      }
      return 0;
    };
    const best = matches.reduce((value, item) => (
      compare(specificity(item), specificity(value)) > 0 ? item : value
    ));
    const bestSpecificity = specificity(best);
    matches = matches.filter((item) => compare(specificity(item), bestSpecificity) === 0);
  }
  if (matches.length !== 1) return null;
  const [method, template] = matches[0];
  return runtimeActionAlias(
    `canonical.route.${canonicalActionSlug(method, template)}`,
    method,
    template,
    {
      runtimePath: resolved.runtimePath,
      requiredSurfaces: template.startsWith(
        "/executive-authority/canonical-execution"
      )
        ? ["api", "ui"]
        : ["api"],
    },
  );
}

function operationalMethod(route, method) {
  const runtimePath = route?.[method];
  if (runtimePath) return { method, runtimePath, canonicalHosted: true };
  if (!route) return null;
  return { methodMismatch: true, allowed: Object.keys(route).join(", ") };
}

function operationalIdentifier(raw) {
  let identifier;
  try { identifier = decodeURIComponent(raw); } catch { return null; }
  return OPERATIONAL_RECORD_ID_PATTERN.test(identifier) ? identifier : null;
}

export function resolveOperationalCapability(pathname, method) {
  const direct = operationalMethod(CANONICAL_OPERATIONAL_ROUTES[pathname], method);
  if (direct) return direct;

  const project = pathname.match(/^\/api\/operations\/projects\/([^/]+)\/(scope|estimate|planning-model|compile)$/);
  if (project) {
    const projectId = operationalIdentifier(project[1]);
    if (!projectId) return null;
    const action = project[2];
    const expectedMethod = action === "compile" ? "POST" : "GET";
    return operationalMethod({ [expectedMethod]: `/projects/${projectId}/${action}` }, method);
  }
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
  if (url.pathname === "/api/session" && request.method === "GET") {
    const current = sessionAuthority.authenticate(request);
    if (current) return sendJson(response, 200, { ok: true, session: sessionAuthority.publicSession(current), truth: TRUTH });
    if (config.operationalSessionMode !== "automatic_private_workspace") {
      return sendJson(response, 200, { ok: true, session: { authenticated: false }, truth: TRUTH });
    }
    if (!automaticWorkspaceIngressAllowed(request, config)) {
      return sendJson(response, 401, operationalFailure(
        config,
        url.pathname,
        "trusted_private_ingress_required",
        "Automatic workspace access requires the verified private Replit deployment boundary.",
        "Unauthorized",
      ));
    }
    const result = sessionAuthority.establish();
    structuredLog("automatic_operational_session_started", {
      userId: result.claims.sub,
      tenantId: result.claims.tenantId,
      workspaceId: result.claims.workspaceId,
      principalType: result.claims.principalType,
      accessBasis: result.claims.accessBasis,
    });
    return sendJson(
      response,
      200,
      { ok: true, session: sessionAuthority.publicSession(result.claims), truth: TRUTH },
      { "Set-Cookie": result.cookie },
    );
  }
  if (url.pathname === "/api/session/login" && request.method === "POST") {
    if (config.operationalSessionMode !== "access_key") {
      return sendJson(response, 404, operationalFailure(config, url.pathname, "route_not_allowlisted", "Browser-entered operator access keys are not accepted by this deployment."));
    }
    const payload = await readJsonBody(request, 8_192); strictKeys(payload, new Set(["accessKey"]));
    const result = sessionAuthority.login(boundedText(payload.accessKey, "accessKey", 512), request.socket.remoteAddress);
    if (result.status !== 200) return sendJson(response, result.status, operationalFailure(config, url.pathname, result.error, "Authentication failed.", "Unauthorized"));
    structuredLog("operational_session_started", { userId: result.claims.sub, tenantId: result.claims.tenantId, workspaceId: result.claims.workspaceId });
    return sendJson(response, 200, { ok: true, session: sessionAuthority.publicSession(result.claims), truth: TRUTH }, { "Set-Cookie": result.cookie });
  }
  if (url.pathname === "/api/session/logout" && request.method === "POST") {
    if (config.operationalSessionMode === "automatic_private_workspace") {
      return sendJson(response, 409, operationalFailure(config, url.pathname, "managed_session", "This private-workspace session is managed automatically."));
    }
    const claims = sessionAuthority.authenticate(request);
    if (!claims || !sessionAuthority.csrfValid(request, claims)) return sendJson(response, 403, operationalFailure(config, url.pathname, "csrf_invalid", "Session verification failed.", "Unauthorized"));
    sessionAuthority.revoke(claims);
    return sendJson(response, 200, { ok: true, session: { authenticated: false }, truth: TRUTH }, { "Set-Cookie": sessionAuthority.clearCookie() });
  }
  return sendJson(response, 404, operationalFailure(config, url.pathname, "route_not_allowlisted", "This session route is not allowlisted."));
}

function executiveSessionError(error) {
  if (
    error instanceof ExecutiveSessionFailure
    || error instanceof ExecutiveSessionRuntimeFailure
  ) {
    return error;
  }
  if (error instanceof GatewayFailure) {
    return new ExecutiveSessionFailure(
      error.code,
      error.message,
      error.status,
    );
  }
  return new ExecutiveSessionFailure(
    "executive_session_gateway_error",
    "The registered executive session failed safely.",
    500,
  );
}

function sessionAccess(authority, claims) {
  return {
    csrfToken: authority.csrfToken(claims),
    cookieHttpOnly: true,
    cookieSameSite: "Strict",
    providerTokenRetained: false,
    providerSubjectRetained: false,
    authorityGranted: false,
    actionAuthorized: false,
    secretValuesExposed: false,
  };
}

async function handleExecutiveSessionApi(
  request,
  response,
  config,
  providerAdapter,
  registrationMapper,
  authority,
  runtimeClient,
) {
  const url = new URL(request.url, "http://portal.invalid");
  if (
    !requestOriginAllowed(
      request,
      config,
      request.method === "POST",
    )
  ) {
    const error = new ExecutiveSessionFailure(
      "origin_denied",
      "Request origin is not allowed.",
      403,
    );
    return sendJson(
      response,
      error.status,
      executiveSessionFailureEnvelope(config, url.pathname, error),
    );
  }
  if (!config.executiveSessionEnabled) {
    const error = new ExecutiveSessionFailure(
      "executive_session_disabled",
      "Registered executive sessions are not enabled.",
      503,
    );
    return sendJson(
      response,
      error.status,
      executiveSessionFailureEnvelope(config, url.pathname, error),
    );
  }
  if (url.search) {
    const error = new ExecutiveSessionFailure(
      "query_not_allowed",
      "Registered executive session routes do not accept query parameters.",
      400,
    );
    return sendJson(
      response,
      error.status,
      executiveSessionFailureEnvelope(config, url.pathname, error),
    );
  }
  if (
    url.pathname === "/api/executive-session/login"
    && request.method === "POST"
  ) {
    try {
      const payload = await readJsonBody(request, 1_024);
      strictKeys(payload, new Set());
      const identity = await providerAdapter.verify(request);
      const registration = registrationMapper.resolve(identity);
      const issued = authority.issue(identity, registration);
      const session = await runtimeClient.verify(issued.claims);
      structuredLog("registered_executive_session_started", {
        sessionId: issued.claims.sid,
        registrationId: issued.claims.registrationId,
        principalId: issued.claims.principalId,
        provider: issued.claims.provider,
        providerIssuer: issued.claims.providerIssuer,
        tenantId: issued.claims.tenantId,
        workspaceId: issued.claims.workspaceId,
        role: issued.claims.role,
        authorityGranted: false,
        actionAuthorized: false,
      });
      const body = executiveSessionEnvelope(
        config,
        url.pathname,
        session,
        {
          runtimeVerified: true,
          lifecycleState: "active",
        },
      );
      body.sessionAccess = sessionAccess(authority, issued.claims);
      return sendJson(response, 201, body, {
        "Set-Cookie": issued.cookie,
      });
    } catch (caught) {
      const error = executiveSessionError(caught);
      return sendJson(
        response,
        error.status,
        executiveSessionFailureEnvelope(config, url.pathname, error),
      );
    }
  }
  if (
    url.pathname === "/api/executive-session"
    && request.method === "GET"
  ) {
    const claims = authority.authenticate(request);
    if (!claims) {
      const hadCookie = String(request.headers.cookie ?? "")
        .split(";")
        .some(
          (item) =>
            item.trim().startsWith(`${EXECUTIVE_SESSION_COOKIE_NAME}=`),
        );
      return sendJson(
        response,
        200,
        executiveSessionEnvelope(
          config,
          url.pathname,
          {
            authenticated: false,
            runtimeVerified: false,
            authorityGranted: false,
            actionAuthorized: false,
            secretValuesExposed: false,
          },
          { runtimeVerified: false, lifecycleState: "absent" },
        ),
        hadCookie ? { "Set-Cookie": authority.clearCookie() } : {},
      );
    }
    try {
      const session = await runtimeClient.get(claims);
      const body = executiveSessionEnvelope(
        config,
        url.pathname,
        session,
        {
          runtimeVerified: true,
          lifecycleState: "active",
        },
      );
      body.sessionAccess = sessionAccess(authority, claims);
      return sendJson(response, 200, body);
    } catch (caught) {
      const error = executiveSessionError(caught);
      const terminalSessionFailure = [
        "session_expired",
        "session_revoked",
        "session_not_found",
        "executive_session_invalid",
      ].includes(error.code);
      if (terminalSessionFailure) {
        authority.revoke(claims);
      }
      return sendJson(
        response,
        error.status,
        executiveSessionFailureEnvelope(
          config,
          url.pathname,
          error,
          authority.publicSession(claims, false),
        ),
        terminalSessionFailure
          ? { "Set-Cookie": authority.clearCookie() }
          : {},
      );
    }
  }
  if (
    url.pathname === "/api/executive-session/revoke"
    && request.method === "POST"
  ) {
    const claims = authority.authenticate(request);
    if (!claims) {
      const error = new ExecutiveSessionFailure(
        "executive_session_required",
        "A verified registered executive session is required.",
        401,
      );
      return sendJson(
        response,
        error.status,
        executiveSessionFailureEnvelope(config, url.pathname, error),
      );
    }
    if (!authority.csrfValid(request, claims)) {
      const error = new ExecutiveSessionFailure(
        "csrf_invalid",
        "Session verification failed.",
        403,
      );
      return sendJson(
        response,
        error.status,
        executiveSessionFailureEnvelope(config, url.pathname, error),
      );
    }
    try {
      const payload = await readJsonBody(request, 1_024);
      strictKeys(payload, new Set());
      const session = await runtimeClient.revoke(claims);
      authority.revoke(claims);
      structuredLog("registered_executive_session_revoked", {
        sessionId: claims.sid,
        registrationId: claims.registrationId,
        principalId: claims.principalId,
        tenantId: claims.tenantId,
        workspaceId: claims.workspaceId,
        authorityGranted: false,
        actionAuthorized: false,
      });
      return sendJson(
        response,
        200,
        executiveSessionEnvelope(
          config,
          url.pathname,
          session,
          { runtimeVerified: true, lifecycleState: "revoked" },
        ),
        { "Set-Cookie": authority.clearCookie() },
      );
    } catch (caught) {
      authority.revoke(claims);
      const error = executiveSessionError(caught);
      return sendJson(
        response,
        error.status,
        executiveSessionFailureEnvelope(
          config,
          url.pathname,
          error,
          {
            authenticated: false,
            runtimeVerified: false,
            authorityGranted: false,
            actionAuthorized: false,
            secretValuesExposed: false,
          },
        ),
        { "Set-Cookie": authority.clearCookie() },
      );
    }
  }
  const allowed = url.pathname === "/api/executive-session"
    ? "GET"
    : url.pathname === "/api/executive-session/login"
      || url.pathname === "/api/executive-session/revoke"
      ? "POST"
      : "";
  const error = new ExecutiveSessionFailure(
    allowed ? "method_not_allowed" : "route_not_allowlisted",
    allowed
      ? "Method is not allowed for this registered executive session route."
      : "This registered executive session route is not allowlisted.",
    allowed ? 405 : 404,
  );
  return sendJson(
    response,
    error.status,
    executiveSessionFailureEnvelope(config, url.pathname, error),
    allowed ? { Allow: allowed } : {},
  );
}

async function handleOperationalApi(
  request,
  response,
  config,
  runtimeFetch,
  operationalFetch,
  sessionAuthority,
  actionAdmission,
) {
  const url = new URL(request.url, "http://portal.invalid");
  if (!requestOriginAllowed(request, config, request.method === "POST")) return sendJson(response, 403, operationalFailure(config, url.pathname, "origin_denied", "Request origin is not allowed."));
  if (!config.operationalEnabled) return sendJson(response, 503, operationalFailure(config, url.pathname, "operational_gateway_disabled", "Hosted operational mode is not enabled."));
  if (url.search) return sendJson(response, 400, operationalFailure(config, url.pathname, "query_not_allowed", "Operational routes do not accept browser query parameters."));
  const claims = sessionAuthority.authenticate(request);
  if (!claims) return sendJson(response, 401, operationalFailure(config, url.pathname, "session_required", "An authenticated operational session is required.", "Unauthorized"));
  const resolved = resolveOperationalCapability(url.pathname, request.method);
  if (!resolved) return sendJson(response, 404, operationalFailure(config, url.pathname, "route_not_allowlisted", "This hosted operation is not allowlisted."));
  if (resolved.methodMismatch) return sendJson(response, 405, operationalFailure(config, url.pathname, "method_not_allowed", "Method is not allowed for this hosted operation."), { Allow: resolved.allowed });
  const alias = resolveCanonicalCapabilityActionAlias(resolved);
  const admission = await ensureRuntimeActionAdmission(
    alias,
    config,
    runtimeFetch,
    actionAdmission,
  );
  if (!admission.allowed) {
    return sendJson(
      response,
      admission.status,
      operationalFailure(
        config,
        url.pathname,
        admission.code,
        admission.message,
        admission.state,
      ),
    );
  }
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

function resolveCanonicalExecutionRoute(pathname, method) {
  if (pathname === "/api/canonical-execution") {
    return method === "GET"
      ? { method, runtimePath: "/executive-authority/canonical-execution" }
      : { methodMismatch: true, allowed: "GET" };
  }
  if (pathname === "/api/canonical-execution/missions") {
    return method === "POST"
      ? {
        method,
        runtimePath: "/executive-authority/canonical-execution/missions",
      }
      : { methodMismatch: true, allowed: "POST" };
  }
  const match = pathname.match(
    /^\/api\/canonical-execution\/missions\/([^/]+)(\/actions)?$/,
  );
  if (!match) return null;
  const missionId = operationalIdentifier(match[1]);
  if (!missionId) return null;
  const actions = match[2] === "/actions";
  const expectedMethod = actions ? "POST" : "GET";
  if (method !== expectedMethod) {
    return { methodMismatch: true, allowed: expectedMethod };
  }
  return {
    method,
    runtimePath: (
      `/executive-authority/canonical-execution/missions/${missionId}`
      + (actions ? "/actions" : "")
    ),
  };
}

function validateCanonicalExecutionPayload(runtimePath, payload) {
  rejectUntrustedOperationalFields(payload);
  if (runtimePath === "/executive-authority/canonical-execution/missions") {
    strictKeys(
      payload,
      new Set(["objective", "authorizationAcknowledged"]),
    );
    if (
      payload.objective !==
        "Prove one governed reversible non-production repository fixture Action."
      || payload.authorizationAcknowledged !== true
    ) {
      throw new GatewayFailure(
        "canonical_execution_mission_scope_invalid",
        "Only the exact admitted Mission 4 objective may be authorized.",
        "Unauthorized",
        400,
      );
    }
    return payload;
  }
  strictKeys(
    payload,
    payload?.action === "repository.edit"
      ? new Set(["action", "path", "expectedSha256", "content"])
      : new Set([
        "action",
        "path",
        "expectedSha256",
        "restoreSha256",
      ]),
  );
  if (
    !["repository.edit", "repository.restore"].includes(payload?.action)
    || payload.path !== "mission-fixture/nexus/m4/canonical-execution.json"
    || !/^sha256:[0-9a-f]{64}$/.test(String(payload.expectedSha256 ?? ""))
    || (
      payload.action === "repository.edit"
      && (
        typeof payload.content !== "string"
        || Buffer.byteLength(payload.content, "utf8") < 1
        || Buffer.byteLength(payload.content, "utf8") > 4_096
      )
    )
    || (
      payload.action === "repository.restore"
      && !/^sha256:[0-9a-f]{64}$/.test(
        String(payload.restoreSha256 ?? ""),
      )
    )
  ) {
    throw new GatewayFailure(
      "canonical_execution_action_invalid",
      "The Action does not match the exact Mission 4 fixture contract.",
      "Unauthorized",
      400,
    );
  }
  return payload;
}

async function handleCanonicalExecutionApi(
  request,
  response,
  config,
  runtimeFetch,
  operationalFetch,
  executiveSessionAuthority,
  actionAdmission,
  clock,
) {
  const url = new URL(request.url, "http://portal.invalid");
  if (
    !requestOriginAllowed(
      request,
      config,
      request.method === "POST",
    )
  ) {
    return sendJson(
      response,
      403,
      operationalFailure(
        config,
        url.pathname,
        "origin_denied",
        "Request origin is not allowed.",
        "Unauthorized",
      ),
    );
  }
  if (!config.operationalEnabled || !config.executiveSessionEnabled) {
    return sendJson(
      response,
      503,
      operationalFailure(
        config,
        url.pathname,
        "canonical_execution_unconfigured",
        "Mission 4 requires both hosted operational transport and Registered Executive sessions.",
        "Unavailable",
      ),
    );
  }
  if (url.search) {
    return sendJson(
      response,
      400,
      operationalFailure(
        config,
        url.pathname,
        "query_not_allowed",
        "Canonical execution routes do not accept query parameters.",
      ),
    );
  }
  const resolved = resolveCanonicalExecutionRoute(
    url.pathname,
    request.method,
  );
  if (!resolved) {
    return sendJson(
      response,
      404,
      operationalFailure(
        config,
        url.pathname,
        "route_not_allowlisted",
        "This canonical execution route is not allowlisted.",
      ),
    );
  }
  if (resolved.methodMismatch) {
    return sendJson(
      response,
      405,
      operationalFailure(
        config,
        url.pathname,
        "method_not_allowed",
        "Method is not allowed for this canonical execution route.",
      ),
      { Allow: resolved.allowed },
    );
  }
  const claims = executiveSessionAuthority.authenticate(request);
  if (!claims) {
    return sendJson(
      response,
      401,
      operationalFailure(
        config,
        url.pathname,
        "registered_executive_session_required",
        "A current Registered Executive session is required.",
        "Unauthorized",
      ),
    );
  }
  if (
    request.method === "POST"
    && !executiveSessionAuthority.csrfValid(request, claims)
  ) {
    return sendJson(
      response,
      403,
      operationalFailure(
        config,
        url.pathname,
        "csrf_invalid",
        "Registered Executive CSRF verification failed.",
        "Unauthorized",
      ),
    );
  }
  const requestKey = String(request.headers["idempotency-key"] ?? "");
  if (
    request.method === "POST"
    && !IDEMPOTENCY_KEY_PATTERN.test(requestKey)
  ) {
    return sendJson(
      response,
      400,
      operationalFailure(
        config,
        url.pathname,
        "idempotency_key_required",
        "A valid Idempotency-Key is required.",
      ),
    );
  }
  const alias = resolveCanonicalCapabilityActionAlias(resolved);
  const admission = await ensureRuntimeActionAdmission(
    alias,
    config,
    runtimeFetch,
    actionAdmission,
  );
  if (!admission.allowed) {
    return sendJson(
      response,
      admission.status,
      operationalFailure(
        config,
        url.pathname,
        admission.code,
        admission.message,
        admission.state,
      ),
    );
  }
  let payload;
  try {
    payload = request.method === "POST"
      ? validateCanonicalExecutionPayload(
        resolved.runtimePath,
        await readJsonBody(request, 8_192),
      )
      : undefined;
  } catch (caught) {
    const failure = caught instanceof GatewayFailure
      ? caught
      : new GatewayFailure(
        "canonical_execution_request_invalid",
        "The canonical execution request was invalid.",
        "Unknown",
        400,
      );
    return sendJson(
      response,
      failure.status,
      operationalFailure(
        config,
        url.pathname,
        failure.code,
        failure.message,
        failure.state,
      ),
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const assertion = createHumanSessionAssertion(config, claims, clock);
    let upstream;
    try {
      upstream = await operationalFetch(
        `${config.operationalApiBaseUrl}${resolved.runtimePath}`,
        {
          method: resolved.method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${config.operationalRuntimeToken}`,
            "X-NEXUS-Service-Authorization": (
              `Bearer ${config.runtimeToken}`
            ),
            "X-NEXUS-Human-Session-ID": claims.sid,
            [HUMAN_SESSION_ASSERTION_HEADER]: assertion,
            ...(resolved.method === "POST"
              ? {
                "Content-Type": "application/json",
                "Idempotency-Key": requestKey,
              }
              : {}),
          },
          ...(resolved.method === "POST"
            ? { body: JSON.stringify(payload) }
            : {}),
          signal: controller.signal,
          redirect: "error",
        },
      );
    } catch (caught) {
      if (caught?.name === "AbortError" || controller.signal.aborted) {
        throw new GatewayFailure(
          "canonical_execution_timed_out",
          "Canonical execution timed out before a verified result.",
          "Timed Out",
          504,
          true,
        );
      }
      throw new GatewayFailure(
        "canonical_execution_runtime_unavailable",
        "The non-production canonical execution Runtime is unavailable.",
        "Unavailable",
        503,
        true,
      );
    }
    const raw = Buffer.from(await upstream.arrayBuffer());
    if (raw.byteLength > config.localMaxResponseBytes) {
      throw new GatewayFailure(
        "canonical_execution_response_too_large",
        "Canonical execution response exceeded the bounded size.",
        "Unknown",
        502,
      );
    }
    let upstreamBody;
    try {
      upstreamBody = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new GatewayFailure(
        "canonical_execution_response_invalid",
        "Canonical execution returned invalid JSON.",
        "Unknown",
        502,
      );
    }
    if (
      !upstreamBody
      || typeof upstreamBody !== "object"
      || Array.isArray(upstreamBody)
      || upstreamBody.secretValuesExposed !== false
    ) {
      throw new GatewayFailure(
        "canonical_execution_response_invalid",
        "Canonical execution returned an invalid truth-bound response.",
        "Unknown",
        502,
      );
    }
    const sanitized = sanitizeOperationalResponse(upstreamBody);
    if (JSON.stringify(sanitized) !== JSON.stringify(upstreamBody)) {
      throw new GatewayFailure(
        "canonical_execution_sensitive_field_rejected",
        "Canonical execution response contained a prohibited sensitive field.",
        "Unauthorized",
        502,
      );
    }
    structuredLog("canonical_execution_gateway_result", {
      route: url.pathname,
      runtimePath: resolved.runtimePath,
      method: resolved.method,
      status: upstream.status,
      sessionId: claims.sid,
      principalId: claims.principalId,
      tenantId: claims.tenantId,
      workspaceId: claims.workspaceId,
      authorityGranted: false,
      secretValuesExposed: false,
    });
    return sendJson(response, upstream.status, {
      ok: upstream.ok,
      recordType: "nexus_canonical_execution_gateway_response",
      route: url.pathname,
      data: sanitized,
      registeredExecutiveSessionVerified: true,
      authorityGranted: false,
      secretValuesExposed: false,
      truth: TRUTH,
    });
  } catch (caught) {
    const failure = caught instanceof GatewayFailure
      ? caught
      : new GatewayFailure(
        "canonical_execution_gateway_error",
        "Canonical execution failed safely.",
        "Unknown",
        500,
      );
    return sendJson(
      response,
      failure.status,
      operationalFailure(
        config,
        url.pathname,
        failure.code,
        failure.message,
        failure.state,
      ),
    );
  } finally {
    clearTimeout(timer);
  }
}

async function handleLocalApi(
  request,
  response,
  config,
  runtimeFetch,
  localFetch,
  actionAdmission,
) {
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
  const alias = url.pathname.startsWith("/api/local/interactions")
    ? resolveGatewayRuntimeActionAlias(request.method, url.pathname)
    : resolveCanonicalCapabilityActionAlias(resolved);
  const decision = await ensureRuntimeActionAdmission(
    alias,
    config,
    runtimeFetch,
    actionAdmission,
  );
  if (!decision.allowed) {
    return sendJson(
      response,
      decision.status,
      localFailure(config, url.pathname, decision.code, decision.message, decision.state),
    );
  }
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

async function handleReplayApi(request, response, config) {
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
  return sendJson(response, 503, {
    ok: false,
    data: null,
    error: {
      code: "canonical_action_unavailable",
      message: "The legacy Replay export proxy is registered as unavailable until it is represented by one current Runtime-owned canonical action.",
    },
    truth: TRUTH,
  });
}

const CAPABILITY_CLASSIFICATION_VOCABULARY = Object.freeze([
  "live_verified",
  "live_degraded",
  "configured_unverified",
  "staged",
  "simulated",
  "unavailable",
]);
const CAPABILITY_CLASSIFICATIONS = new Set(CAPABILITY_CLASSIFICATION_VOCABULARY);
const EXECUTIVE_CONTINUITY_CLASSIFICATIONS = new Set([
  "hard_blocking",
  "safely_remediable",
  "non_blocking_degraded",
  "operator_action_required",
]);
const EXECUTIVE_CONTINUITY_VOCABULARY = Object.freeze([
  "hard_blocking",
  "safely_remediable",
  "non_blocking_degraded",
  "operator_action_required",
]);
const CONNECTOR_CONFIGURATIONS = new Set(["configured", "unconfigured", "invalid", "unknown"]);
const CONNECTOR_REACHABILITY_STATES = new Set(["reachable", "unreachable", "unknown"]);
const CONNECTOR_VERIFICATION_STATES = new Set(["verified", "failed", "unverified", "expired"]);
const CONNECTOR_HEALTH_STATES = new Set(["healthy", "degraded", "unhealthy", "unknown"]);
const CONNECTOR_OPERATIONAL_STATES = new Set(["available", "degraded", "unavailable"]);
const CONNECTOR_FRESHNESS_STATES = new Set(["current", "stale", "never"]);
const NON_OPERATIONAL_CLASSIFICATIONS = new Set([
  "configured_unverified",
  "staged",
  "simulated",
  "unavailable",
]);
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PRINCIPLE_ENTRY_PATTERN = /^NCR-[A-Z]+-[0-9]{4}@[0-9]+$/;

const objectRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const validIdentifier = (value) => typeof value === "string" && value.length > 0 && value.length <= 191;
const validStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
const validTimestamp = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const sameStringArray = (value, expected) => (
  Array.isArray(value)
  && value.length === expected.length
  && value.every((item, index) => item === expected[index])
);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (objectRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalProjectionDigest(projection) {
  const digestBasis = Object.fromEntries(
    Object.entries(projection).filter(([key]) => key !== "projectionDigest"),
  );
  return `sha256:${createHash("sha256").update(canonicalJson(digestBasis), "utf8").digest("hex")}`;
}

function receiptIdentity(reference) {
  if (typeof reference !== "string" || !reference) return null;
  return reference.startsWith("connector-receipt:")
    ? reference.slice("connector-receipt:".length)
    : reference;
}

function duplicateIdentity(records, key) {
  const identities = records.map((item) => item[key]);
  return new Set(identities).size !== identities.length;
}

function validateCapabilityRegistryProjection(
  value,
  clock = () => Date.now(),
) {
  const projection = objectRecord(value);
  const invalid = (message) => {
    throw new GatewayFailure("capability_registry_response_invalid", message, "Unknown", 502);
  };
  if (!projection) invalid("Capability Registry projection was not a JSON object.");
  if (projection.recordType !== CAPABILITY_REGISTRY_RECORD_TYPE) invalid("Capability Registry record type is invalid.");
  if (projection.schemaVersion !== CAPABILITY_REGISTRY_SCHEMA_VERSION) invalid("Capability Registry schema version is incompatible.");
  if (projection.owner !== CAPABILITY_REGISTRY_OWNER || projection.projectionOwner !== CAPABILITY_REGISTRY_PROJECTION_OWNER) {
    invalid("Capability Registry is not the Runtime-owned canonical projection.");
  }
  if (!validIdentifier(projection.generatedAt) || Number.isNaN(Date.parse(projection.generatedAt))) {
    invalid("Capability Registry generation timestamp is invalid.");
  }
  const constitutionalBasis = objectRecord(projection.constitutionalBasis);
  const verificationPolicy = objectRecord(projection.verificationPolicy);
  if (!constitutionalBasis || !verificationPolicy) {
    invalid("Capability Registry constitutional or verification policy basis is missing.");
  }
  const principleEntryIds = constitutionalBasis.principleEntryIds;
  if (
    constitutionalBasis.registryId !== "NCR"
    || constitutionalBasis.releaseId !== CAPABILITY_REGISTRY_RELEASE_ID
    || constitutionalBasis.releaseDigest !== CAPABILITY_REGISTRY_RELEASE_DIGEST
    || constitutionalBasis.resolverVersion !== "1.0.0"
    || constitutionalBasis.resolutionDigest !== CAPABILITY_REGISTRY_RESOLUTION_DIGEST
    || !Array.isArray(principleEntryIds)
    || principleEntryIds.length !== 48
    || new Set(principleEntryIds).size !== principleEntryIds.length
    || principleEntryIds.some((item) => typeof item !== "string" || !PRINCIPLE_ENTRY_PATTERN.test(item))
  ) {
    invalid("Capability Registry constitutional basis does not match the active pinned release.");
  }
  if (
    verificationPolicy.policyId !== CAPABILITY_REGISTRY_VERIFICATION_POLICY
    || verificationPolicy.maxAgeSeconds !== 300
    || !validTimestamp(verificationPolicy.evaluatedAt)
    || Date.parse(verificationPolicy.evaluatedAt) !== Date.parse(projection.generatedAt)
    || verificationPolicy.staleVerificationEstablishesAvailability !== false
    || verificationPolicy.networkFailureRewritesConfiguration !== false
  ) {
    invalid("Capability Registry verification policy is invalid.");
  }
  const consumerNow = Number(clock());
  const evaluatedAt = Date.parse(verificationPolicy.evaluatedAt);
  const projectionAgeSeconds = (consumerNow - evaluatedAt) / 1000;
  if (
    !Number.isFinite(consumerNow)
    || !Number.isFinite(projectionAgeSeconds)
    || projectionAgeSeconds < -CAPABILITY_REGISTRY_MAXIMUM_FUTURE_SKEW_SECONDS
  ) {
    invalid("Capability Registry verification is not current at the consuming Gateway.");
  }
  if (projectionAgeSeconds >= verificationPolicy.maxAgeSeconds) {
    throw new GatewayFailure(
      "capability_registry_verification_stale",
      "The Runtime-owned Capability Registry verification has expired.",
      "Unavailable",
      503,
    );
  }
  if (!sameStringArray(projection.classificationVocabulary, CAPABILITY_CLASSIFICATION_VOCABULARY)) {
    invalid("Capability Registry classification vocabulary is invalid.");
  }
  const scope = objectRecord(projection.scope);
  if (
    !scope
    || !validIdentifier(scope.tenantId)
    || !validIdentifier(scope.workspaceId)
    || scope.derivedByRuntime !== true
  ) {
    invalid("Capability Registry scope was not derived by the Runtime.");
  }
  if (!objectRecord(projection.inventory)) invalid("Capability Registry inventory is missing.");
  const authority = objectRecord(projection.authority);
  if (
    !authority
    || authority.authorityGranted !== false
    || authority.executionAuthorityIntroduced !== false
    || authority.healthyCapabilityImpliesAuthority !== false
    || projection.authorityGranted !== false
    || projection.capabilityHealthGrantsAuthority !== false
    || projection.availabilityIndependent !== true
    || projection.noExecutionAuthorityIntroduced !== true
    || typeof projection.mission3Admitted !== "boolean"
  ) {
    invalid("Capability Registry must explicitly state that it grants no execution Authority.");
  }
  if (!objectRecord(projection.summary)) invalid("Capability Registry summary is missing.");
  if (!Array.isArray(projection.capabilities) || !Array.isArray(projection.connectors) || !Array.isArray(projection.actions)) {
    invalid("Capability Registry collections are invalid.");
  }
  if (!Array.isArray(projection.verificationReceipts) || !validStringArray(projection.limitations)) {
    invalid("Capability Registry receipt or limitation collections are invalid.");
  }
  if (projection.secretValuesExposed !== false) invalid("Capability Registry secret-exposure boundary is invalid.");
  if (!SHA256_DIGEST_PATTERN.test(projection.projectionDigest) || projection.projectionDigest !== canonicalProjectionDigest(projection)) {
    invalid("Capability Registry projection digest does not verify.");
  }

  const capabilities = projection.capabilities.map(objectRecord);
  const connectors = projection.connectors.map(objectRecord);
  const actions = projection.actions.map(objectRecord);
  const receipts = projection.verificationReceipts.map(objectRecord);
  if ([...capabilities, ...connectors, ...actions].some((item) => !item)) {
    invalid("Capability Registry contains a non-object record.");
  }
  if (receipts.some((item) => !item)) invalid("Capability Registry contains a non-object verification receipt.");
  if (
    projection.capabilityCount !== capabilities.length
    || projection.connectorCount !== connectors.length
    || projection.actionCount !== actions.length
    || projection.receiptCount !== receipts.length
    || projection.summary.capabilityCount !== capabilities.length
    || projection.summary.connectorCount !== connectors.length
    || projection.summary.actionCount !== actions.length
    || projection.summary.verificationReceiptCount !== receipts.length
  ) {
    invalid("Capability Registry collection counts are inconsistent.");
  }
  if (capabilities.some((item) => (
    !validIdentifier(item.capabilityId)
    || !CAPABILITY_CLASSIFICATIONS.has(item.classification)
    || typeof item.operationalAvailability !== "boolean"
    || item.authorityGranted !== false
    || item.availabilityIndependent !== true
    || !validStringArray(item.evidenceRefs)
    || !validStringArray(item.receiptRefs)
    || !validStringArray(item.limitations)
    || typeof item.requiredNextAction !== "string"
    || (NON_OPERATIONAL_CLASSIFICATIONS.has(item.classification) && item.operationalAvailability !== false)
  ))) {
    invalid("Capability Registry contains an invalid capability identity or classification.");
  }
  if (connectors.some((item) => (
    !validIdentifier(item.connectorId)
    || !CAPABILITY_CLASSIFICATIONS.has(item.classification)
    || item.registration !== "registered"
    || !CONNECTOR_CONFIGURATIONS.has(item.configuration)
    || !CONNECTOR_REACHABILITY_STATES.has(item.reachability)
    || !CONNECTOR_VERIFICATION_STATES.has(item.verification)
    || !CONNECTOR_HEALTH_STATES.has(item.health)
    || !CONNECTOR_OPERATIONAL_STATES.has(item.operationalAvailability)
    || typeof item.authorizationRequirement !== "string"
    || (item.lastSuccessfulVerification !== null && !validTimestamp(item.lastSuccessfulVerification))
    || typeof item.verificationFresh !== "boolean"
    || !objectRecord(item.freshness)
    || !validStringArray(item.evidenceReferences)
    || !validStringArray(item.receiptReferences)
    || !validStringArray(item.limitations)
    || typeof item.requiredNextAction !== "string"
    || item.authorityGranted !== false
  ))) {
    invalid("Capability Registry contains an invalid connector record.");
  }
  if (actions.some((item) => (
    !validIdentifier(item.actionId)
    || !validIdentifier(item.capabilityId)
    || !validIdentifier(item.handlerId)
    || !validIdentifier(item.operationId)
    || !validIdentifier(item.inputSchemaId)
    || (item.fixedTarget !== undefined && !validIdentifier(item.fixedTarget))
    || !CAPABILITY_CLASSIFICATIONS.has(item.classification)
    || typeof item.operationalAvailability !== "boolean"
    || typeof item.invocable !== "boolean"
    || item.authorityGranted !== false
    || item.dispatchAuthorized === true
    || item.dispatchAvailable === true
    || !validStringArray(item.invocationSurfaces)
    || !validStringArray(item.invocationPaths)
    || !validStringArray(item.receiptRefs)
    || typeof item.authorizationRequirement !== "string"
    || !validStringArray(item.limitations)
    || typeof item.requiredNextAction !== "string"
    || (NON_OPERATIONAL_CLASSIFICATIONS.has(item.classification) && (
      item.operationalAvailability !== false || item.invocable !== false
    ))
    || (item.invocable === true && item.operationalAvailability !== true)
  ))) {
    invalid("Capability Registry contains an invalid action record.");
  }
  if (
    duplicateIdentity(capabilities, "capabilityId")
    || duplicateIdentity(connectors, "connectorId")
    || duplicateIdentity(actions, "actionId")
  ) {
    invalid("Capability Registry contains a duplicate canonical identity.");
  }
  if (duplicateIdentity(receipts, "receiptId")) {
    invalid("Capability Registry contains a duplicate verification receipt identity.");
  }
  if (receipts.some((item) => (
    !validIdentifier(item.receiptId)
    || !validIdentifier(item.receiptType)
    || !validIdentifier(item.connectorId)
    || !validTimestamp(item.verifiedAt)
    || typeof item.successful !== "boolean"
    || !validStringArray(item.evidenceRefs)
    || item.sanitized !== true
    || item.secretValuesExposed !== false
  ))) {
    invalid("Capability Registry contains an invalid or unsanitized verification receipt.");
  }
  const receiptById = new Map(receipts.map((item) => [item.receiptId, item]));
  const currentSuccessfulReceipt = (reference, connectorId = null) => {
    const receipt = receiptById.get(receiptIdentity(reference));
    if (!receipt || receipt.successful !== true) return false;
    if (connectorId !== null && receipt.connectorId !== connectorId) return false;
    const ageSeconds = (evaluatedAt - Date.parse(receipt.verifiedAt)) / 1000;
    return Number.isFinite(ageSeconds)
      && ageSeconds >= -1
      && ageSeconds < verificationPolicy.maxAgeSeconds;
  };
  const successfulReferencedReceipt = (record, references, requireConnectorMatch = true) => {
    const successfulAt = Date.parse(record.lastSuccessfulVerification);
    return references.some((reference) => {
      const receipt = receiptById.get(receiptIdentity(reference));
      return receipt
        && receipt.successful === true
        && (!requireConnectorMatch || receipt.connectorId === record.connectorId)
        && Date.parse(receipt.verifiedAt) === successfulAt;
    });
  };
  for (const capability of capabilities) {
    if (capability.classification === "live_verified" && (
      capability.operationalAvailability !== true
      || !capability.receiptRefs.some((reference) => currentSuccessfulReceipt(reference))
    )) {
      invalid("A live capability lacks a current successful verification receipt.");
    }
  }
  for (const connector of connectors) {
    const freshness = connector.freshness;
    if (
      !CONNECTOR_FRESHNESS_STATES.has(freshness.state)
      || freshness.policySeconds !== verificationPolicy.maxAgeSeconds
      || (
        freshness.ageSeconds !== null
        && (!Number.isInteger(freshness.ageSeconds) || freshness.ageSeconds < 0)
      )
    ) {
      invalid("Capability Registry contains an invalid connector freshness state.");
    }
    if (freshness.state === "never") {
      if (
        freshness.ageSeconds !== null
        || connector.lastSuccessfulVerification !== null
        || connector.verificationFresh !== false
      ) {
        invalid("A never-verified connector claimed successful verification freshness.");
      }
    } else {
      const lastSuccessfulAt = Date.parse(connector.lastSuccessfulVerification);
      const measuredAge = (evaluatedAt - lastSuccessfulAt) / 1000;
      if (
        !Number.isFinite(lastSuccessfulAt)
        || measuredAge < -1
        || Math.abs(Math.max(0, Math.floor(measuredAge)) - freshness.ageSeconds) > 1
        || !successfulReferencedReceipt(connector, connector.receiptReferences)
      ) {
        invalid("Connector freshness is not backed by its current successful verification receipt.");
      }
      if (freshness.state === "current" && (
        freshness.ageSeconds >= verificationPolicy.maxAgeSeconds
        || connector.verificationFresh !== true
      )) {
        invalid("A current connector verification is stale or marked not fresh.");
      }
      if (freshness.state === "stale" && (
        freshness.ageSeconds < verificationPolicy.maxAgeSeconds
        || connector.verificationFresh !== false
        || connector.verification !== "expired"
      )) {
        invalid("A stale connector verification did not expire fail closed.");
      }
    }
    if (connector.classification === "live_verified" && (
      connector.configuration !== "configured"
      || connector.reachability !== "reachable"
      || connector.verification !== "verified"
      || connector.health !== "healthy"
      || connector.operationalAvailability !== "available"
      || connector.freshness.state !== "current"
      || connector.verificationFresh !== true
    )) {
      invalid("A live connector lacks current successful verification evidence.");
    }
    if (connector.classification === "live_degraded" && (
      connector.operationalAvailability !== "degraded"
      || connector.freshness.state !== "current"
      || connector.verificationFresh !== true
    )) {
      invalid("A degraded connector lacks a current last-known-good verification.");
    }
    if (NON_OPERATIONAL_CLASSIFICATIONS.has(connector.classification) && connector.operationalAvailability !== "unavailable") {
      invalid("A non-live connector claimed operational availability.");
    }
  }
  for (const action of actions) {
    if (
      action.classification === "live_verified"
      && !action.receiptRefs.some((reference) => currentSuccessfulReceipt(
        reference,
        typeof action.connectorId === "string" ? action.connectorId : null,
      ))
    ) {
      invalid("A live action lacks a current successful verification receipt.");
    }
  }

  const executiveContinuity = objectRecord(projection.executiveContinuity);
  if (
    !executiveContinuity
    || !sameStringArray(
      executiveContinuity.impedimentClassificationVocabulary,
      EXECUTIVE_CONTINUITY_VOCABULARY,
    )
    || !Array.isArray(executiveContinuity.impediments)
    || !Array.isArray(executiveContinuity.remediationActions)
    || executiveContinuity.duplicateIdentitiesRejected !== true
    || executiveContinuity.dispatchAvailable !== false
    || executiveContinuity.authorityGranted !== false
  ) {
    invalid("Executive Continuity impediments are missing.");
  }
  const impediments = executiveContinuity.impediments.map(objectRecord);
  const remediationActions = executiveContinuity.remediationActions.map(objectRecord);
  if (impediments.some((item) => (
    !item
    || !validIdentifier(item.impedimentId)
    || !EXECUTIVE_CONTINUITY_CLASSIFICATIONS.has(item.classification)
    || typeof item.limitation !== "string"
    || typeof item.requiredNextAction !== "string"
    || (
      item.remediationAction !== undefined
      && item.remediationAction !== null
      && !objectRecord(item.remediationAction)
    )
  ))) {
    invalid("Executive Continuity contains an invalid impediment record.");
  }
  if (remediationActions.some((item) => (
    !item
    || !validIdentifier(item.remediationActionId)
    || !["staged", "unavailable"].includes(item.classification)
    || item.operationalAvailability !== false
    || item.invocable !== false
    || item.dispatchAvailable !== false
    || item.authorityGranted !== false
  ))) {
    invalid("Executive Continuity contains an invalid remediation action.");
  }
  if (
    executiveContinuity.impedimentCount !== impediments.length
    || executiveContinuity.remediationActionCount !== remediationActions.length
    || duplicateIdentity(impediments, "impedimentId")
    || duplicateIdentity(remediationActions, "remediationActionId")
  ) {
    invalid("Executive Continuity contains inconsistent or duplicate identities.");
  }
  if (impediments.some((item) => {
    const remediation = item.remediationAction;
    if (remediation === undefined || remediation === null) return false;
    return (
      !["staged", "unavailable"].includes(remediation.classification)
      || remediation.invocable !== false
      || remediation.authorityGranted !== false
      || remediation.dispatchAvailable === true
    );
  })) {
    invalid("Executive Continuity remediation actions must remain staged or unavailable and non-invocable.");
  }
  if (
    projection.mission3Admitted
    !== deriveMission3Admission(projection, clock)
  ) {
    invalid("Capability Registry mission3Admitted does not match the per-capability session-establishment evidence.");
  }
  return projection;
}

export function deriveMission3Admission(
  projection,
  clock = () => Date.now(),
) {
  const verificationPolicy = objectRecord(projection?.verificationPolicy);
  if (!verificationPolicy || verificationPolicy.maxAgeSeconds !== 300) return false;
  const evaluatedAt = Date.parse(String(verificationPolicy.evaluatedAt ?? ""));
  if (!Number.isFinite(evaluatedAt)) return false;
  const consumerNow = Number(clock());
  const projectionAgeSeconds = (consumerNow - evaluatedAt) / 1000;
  if (
    !Number.isFinite(consumerNow)
    || !Number.isFinite(projectionAgeSeconds)
    || projectionAgeSeconds < -CAPABILITY_REGISTRY_MAXIMUM_FUTURE_SKEW_SECONDS
    || projectionAgeSeconds >= verificationPolicy.maxAgeSeconds
  ) {
    return false;
  }
  const capabilities = Array.isArray(projection.capabilities) ? projection.capabilities.map(objectRecord) : [];
  const actions = Array.isArray(projection.actions) ? projection.actions.map(objectRecord) : [];
  const receipts = Array.isArray(projection.verificationReceipts)
    ? projection.verificationReceipts.map(objectRecord).filter(Boolean)
    : [];
  if (capabilities.some((item) => !item) || actions.some((item) => !item)) return false;
  const receiptById = new Map(receipts.map((item) => [item.receiptId, item]));
  if (receiptById.size !== receipts.length) return false;
  const dependencyReceipt = (references, verifiedAtMs, capabilityId) => {
    if (!Array.isArray(references)) return null;
    const matches = new Map();
    for (const reference of references) {
      const receipt = receiptById.get(receiptIdentity(reference));
      if (
        !receipt
        || receipt.successful !== true
        || receipt.sanitized !== true
        || receipt.secretValuesExposed !== false
        || receipt.receiptType !== MISSION3_CAPABILITY_DEPENDENCY_RECEIPT_TYPE
        || receipt.connectorId !== MISSION3_CAPABILITY_DEPENDENCY_CONNECTOR_ID
        || !Array.isArray(receipt.evidenceRefs)
        || !receipt.evidenceRefs.includes(`capability:${capabilityId}`)
      ) {
        continue;
      }
      const receiptVerifiedAt = Date.parse(String(receipt.verifiedAt ?? ""));
      if (!Number.isFinite(receiptVerifiedAt) || receiptVerifiedAt !== verifiedAtMs) {
        continue;
      }
      const ageSeconds = (evaluatedAt - receiptVerifiedAt) / 1000;
      if (ageSeconds >= -1 && ageSeconds < verificationPolicy.maxAgeSeconds) {
        matches.set(receipt.receiptId, receipt);
      }
    }
    return matches.size === 1 ? [...matches.values()][0] : null;
  };
  const dependencyReceiptIds = new Set();
  for (const capabilityId of MISSION3_SESSION_CAPABILITIES) {
    const matches = capabilities.filter((item) => item.capabilityId === capabilityId);
    if (matches.length !== 1) return false;
    const capability = matches[0];
    const lastSuccessfulVerification = capability.lastSuccessfulVerification;
    const verifiedAtMs = Date.parse(String(lastSuccessfulVerification ?? ""));
    if (
      capability.classification !== "live_verified"
      || capability.operationalAvailability !== true
      || capability.verification !== "verified"
      || capability.verificationFresh !== true
      || capability.authorityGranted !== false
      || typeof lastSuccessfulVerification !== "string"
      || !Number.isFinite(verifiedAtMs)
    ) {
      return false;
    }
    const evidenceAgeSeconds = (evaluatedAt - verifiedAtMs) / 1000;
    if (evidenceAgeSeconds < -1 || evidenceAgeSeconds >= verificationPolicy.maxAgeSeconds) return false;
    const receipt = dependencyReceipt(
      capability.receiptRefs,
      verifiedAtMs,
      capabilityId,
    );
    if (!receipt || dependencyReceiptIds.has(receipt.receiptId)) return false;
    dependencyReceiptIds.add(receipt.receiptId);
    const capabilityActions = actions.filter((item) => item.capabilityId === capabilityId);
    if (capabilityActions.length === 0) return false;
    for (const action of capabilityActions) {
      if (
        action.classification !== "live_verified"
        || action.operationalAvailability !== true
        || action.invocable !== true
        || action.authorityGranted !== false
        || action.connectorId !== MISSION3_CAPABILITY_DEPENDENCY_CONNECTOR_ID
        || Date.parse(String(action.lastSuccessfulVerification ?? "")) !== verifiedAtMs
        || !Array.isArray(action.receiptRefs)
        || !action.receiptRefs.some(
          (reference) => receiptIdentity(reference) === receipt.receiptId,
        )
      ) {
        return false;
      }
    }
  }
  return dependencyReceiptIds.size === MISSION3_SESSION_CAPABILITIES.length;
}

const INVOCABLE_ACTION_CLASSIFICATIONS = new Set(["live_verified", "live_degraded"]);

function createRuntimeActionAdmissionState(config, clock = () => Date.now()) {
  let projection = null;
  let expiresAt = 0;

  const clear = () => {
    projection = null;
    expiresAt = 0;
  };
  const observe = (value) => {
    const candidate = validateCapabilityRegistryProjection(value, clock);
    const scope = candidate.scope;
    if (
      scope.tenantId !== config.operationalTenantId
      || scope.workspaceId !== config.operationalWorkspaceId
    ) {
      clear();
      throw new GatewayFailure(
        "capability_registry_scope_mismatch",
        "The Runtime-owned Capability Registry scope does not match the Experience Gateway tenant and workspace binding.",
        "Unauthorized",
        502,
      );
    }
    const evaluatedAt = Date.parse(candidate.verificationPolicy.evaluatedAt);
    expiresAt = evaluatedAt + (candidate.verificationPolicy.maxAgeSeconds * 1000);
    if (!Number.isFinite(expiresAt) || expiresAt <= clock()) {
      clear();
      throw new GatewayFailure(
        "capability_registry_verification_stale",
        "The Runtime-owned Capability Registry verification has expired.",
        "Unavailable",
        503,
      );
    }
    projection = candidate;
    return candidate;
  };
  const unavailable = (alias, code, message) => ({
    allowed: false,
    actionId: alias?.actionId ?? null,
    code,
    message,
    status: 503,
    state: "Unavailable",
  });
  const decide = (alias) => {
    if (!alias) {
      return unavailable(
        null,
        "canonical_action_alias_unresolved",
        "The Gateway route does not resolve to one exact canonical Runtime action identity.",
      );
    }
    if (alias.forwarding !== "canonical") {
      return unavailable(
        alias,
        "canonical_action_unavailable",
        alias.limitation || "The canonical Runtime action is unavailable.",
      );
    }
    if (!projection || expiresAt <= clock()) {
      clear();
      return unavailable(
        alias,
        "capability_registry_verification_required",
        "A current Runtime-owned Capability Registry projection is required before this action can be invoked.",
      );
    }
    const matches = projection.actions.filter((action) => action.actionId === alias.actionId);
    if (matches.length !== 1) {
      return unavailable(
        alias,
        "canonical_action_identity_invalid",
        "The Gateway alias did not resolve to exactly one canonical Runtime action record.",
      );
    }
    const action = matches[0];
    const expectedInvocationPaths = alias.requiredSurfaces.map((surface) => (
      surface === "api"
        ? `${surface}:${alias.runtimeMethod} ${alias.runtimePathTemplate}`
        : `${surface}:canonical-adapter:${alias.actionId}`
    ));
    if (
      action.method !== alias.runtimeMethod
      || action.pathTemplate !== alias.runtimePathTemplate
      || !Array.isArray(action.invocationSurfaces)
      || alias.requiredSurfaces.some((surface) => !action.invocationSurfaces.includes(surface))
      || expectedInvocationPaths.some((path) => !action.invocationPaths.includes(path))
    ) {
      return unavailable(
        alias,
        "canonical_action_contract_mismatch",
        "The canonical Runtime action no longer matches the fixed Gateway alias contract.",
      );
    }
    if (
      !INVOCABLE_ACTION_CLASSIFICATIONS.has(action.classification)
      || action.invocable !== true
      || action.operationalAvailability !== true
      || action.authorityGranted !== false
    ) {
      const limitations = [
        action.requiredNextAction,
        ...(Array.isArray(action.limitations) ? action.limitations : []),
      ].filter((item) => typeof item === "string" && item.trim());
      return unavailable(
        alias,
        "canonical_action_unavailable",
        [...new Set(limitations)].join(" ") || `Canonical action ${alias.actionId} is ${action.classification}.`,
      );
    }
    return {
      allowed: true,
      actionId: action.actionId,
      classification: action.classification,
    };
  };
  return Object.freeze({
    clear,
    decide,
    observe,
    snapshot: () => projection,
  });
}

async function ensureRuntimeActionAdmission(alias, config, runtimeFetch, actionAdmission) {
  let decision = actionAdmission.decide(alias);
  if (
    decision.allowed
    || decision.code !== "capability_registry_verification_required"
  ) {
    return decision;
  }
  try {
    const envelope = await fetchRuntime(
      "/runtime/capability-registry",
      config,
      runtimeFetch,
    );
    actionAdmission.observe(envelope.data);
  } catch (error) {
    actionAdmission.clear();
    const failure = error instanceof GatewayFailure
      ? error
      : new GatewayFailure(
        "capability_registry_verification_required",
        "A current Runtime-owned Capability Registry projection is required before this action can be invoked.",
        "Unavailable",
        503,
      );
    return {
      allowed: false,
      actionId: alias?.actionId ?? null,
      code: failure.code,
      message: failure.message,
      status: failure.status,
      state: failure.state,
    };
  }
  decision = actionAdmission.decide(alias);
  return decision;
}

function actionAdmissionFailure(config, tracker, route, decision) {
  return failureEnvelope(
    config,
    tracker,
    route,
    new GatewayFailure(
      decision.code,
      decision.message,
      decision.state,
      decision.status,
    ),
  );
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

function validateRuntimeReadResponse(
  body,
  runtimePath,
  clock = () => Date.now(),
) {
  if (runtimePath !== "/runtime/capability-registry") return validateRuntimeEnvelope(body);
  const sanitized = sanitizeOperationalResponse(body);
  if (sanitized?.recordType === CAPABILITY_REGISTRY_RECORD_TYPE) {
    const projection = validateCapabilityRegistryProjection(sanitized, clock);
    return {
      status: "ok",
      timestamp: projection.generatedAt,
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      runtimeVersion: SUPPORTED_RUNTIME_VERSION,
      proofIds: [],
      limitations: projection.limitations,
      data: projection,
    };
  }
  const envelope = validateRuntimeEnvelope(sanitized);
  validateCapabilityRegistryProjection(envelope.data, clock);
  return envelope;
}

async function fetchRuntime(
  runtimePath,
  config,
  runtimeFetch,
  clock = () => Date.now(),
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const maximumResponseBytes = runtimePath === "/runtime/capability-registry"
    ? CAPABILITY_REGISTRY_MAX_RESPONSE_BYTES
    : config.maxResponseBytes;
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
    if (declaredLength > maximumResponseBytes) {
      throw new GatewayFailure("runtime_response_too_large", "Runtime response exceeded the gateway size limit.", "Unknown", 502);
    }
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength > maximumResponseBytes) {
      throw new GatewayFailure("runtime_response_too_large", "Runtime response exceeded the gateway size limit.", "Unknown", 502);
    }
    let body;
    try { body = JSON.parse(raw.toString("utf8")); }
    catch { throw new GatewayFailure("runtime_response_invalid", "Runtime returned invalid JSON.", "Unknown", 502); }
    return validateRuntimeReadResponse(body, runtimePath, clock);
  } finally {
    clearTimeout(timer);
  }
}

async function handleRuntimeMutation(request, response, config, runtimeFetch, tracker, sessionAuthority, actionAdmission, clock) {
  const url = new URL(request.url, "http://portal.invalid");
  if (!requestOriginAllowed(request, config, config.operationalEnabled)) return sendJson(response, 403, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("origin_denied", "Request origin is not allowed.", "Unknown", 403)));
  const runtimePath = resolveRuntimeMutation(url.pathname);
  if (!runtimePath) return sendJson(response, 404, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("route_not_allowlisted", "This Runtime mutation is not allowlisted.", "Unknown", 404)));
  const expectedMethod = runtimePath.endsWith("/events") ? "GET" : "POST";
  if (request.method !== expectedMethod) return sendJson(response, 405, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("method_not_allowed", `This bounded Runtime route requires ${expectedMethod}.`, "Unknown", 405)), { Allow: expectedMethod });
  const claims = sessionAuthority.authenticate(request);
  if (config.operationalEnabled && !claims) {
    return sendJson(response, 401, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("session_required", "An authenticated operational session is required.", "Unauthorized", 401)));
  }
  const scope = requiredScope(runtimePath, expectedMethod);
  if (config.operationalEnabled && !claims.scopes.includes(scope)) {
    return sendJson(response, 403, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("scope_denied", `Session lacks required scope: ${scope}.`, "Unauthorized", 403)));
  }
  if (config.operationalEnabled && expectedMethod === "POST" && !sessionAuthority.csrfValid(request, claims)) {
    return sendJson(response, 403, failureEnvelope(config, tracker, url.pathname, new GatewayFailure("csrf_invalid", "CSRF verification failed.", "Unauthorized", 403)));
  }
  const alias = resolveGatewayRuntimeActionAlias(expectedMethod, url.pathname);
  if (!alias || alias.runtimePath !== runtimePath) {
    return sendJson(
      response,
      503,
      failureEnvelope(
        config,
        tracker,
        url.pathname,
        new GatewayFailure(
          "canonical_action_alias_unresolved",
          "The Gateway route does not resolve to one exact canonical Runtime action identity.",
          "Unavailable",
          503,
        ),
      ),
    );
  }
  const admission = await ensureRuntimeActionAdmission(
    alias,
    config,
    runtimeFetch,
    actionAdmission,
  );
  if (!admission.allowed) {
    return sendJson(
      response,
      admission.status,
      actionAdmissionFailure(config, tracker, url.pathname, admission),
    );
  }
  if (expectedMethod === "GET") {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const assertion = createTenantContextAssertion(config, claims, "nexus-web", clock);
      const upstream = await runtimeFetch(`${config.runtimeBaseUrl}${runtimePath}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.runtimeToken}`,
          ...(assertion ? { "X-NEXUS-Context-Assertion": assertion } : {})
        },
        signal: controller.signal,
        redirect: "error"
      });
      if ([401, 403].includes(upstream.status)) throw new GatewayFailure("runtime_unauthorized", "Runtime rejected the server credential.", "Unauthorized", 502);
      if (!upstream.ok) throw new GatewayFailure("runtime_unavailable", `Runtime returned status ${upstream.status}.`, "Unavailable", 503);
      const body = validateRuntimeEnvelope(JSON.parse(Buffer.from(await upstream.arrayBuffer()).toString("utf8")));
      tracker.lastSuccessfulConnection = nowIso(); tracker.lastSuccessfulRefresh = nowIso();
      structuredLog("experience_gateway_bounded_runtime_read", { route: url.pathname, runtimePath, status: 200 });
      return sendJson(response, 200, successfulEnvelope(config, tracker, url.pathname, body, null, false, false, 1));
    } catch (error) {
      const failure = error instanceof GatewayFailure ? error
        : error?.name === "AbortError" ? new GatewayFailure("runtime_timed_out", "Runtime request timed out.", "Timed Out", 504)
        : new GatewayFailure("runtime_unavailable", "Runtime interaction request failed safely.", "Unavailable", 503);
      return sendJson(response, failure.status, failureEnvelope(config, tracker, url.pathname, failure));
    } finally { clearTimeout(timer); }
  }
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
    const assertion = createTenantContextAssertion(config, claims, clientId, clock);
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
        ...(assertion ? { tenantId: claims?.tenantId ?? config.operationalTenantId } : {})
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
    const assertion = createTenantContextAssertion(config, claims, clientId, clock);
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

async function handleRealtimeCall(request, response, config, runtimeFetch, sessionAuthority, actionAdmission, clock) {
  const url = new URL(request.url, "http://portal.invalid");
  if (!requestOriginAllowed(request, config, config.operationalEnabled)) return sendJson(response, 403, { ok: false, error: { code: "origin_denied", message: "Request origin is not allowed." }, truth: TRUTH });
  if (url.search) return sendJson(response, 400, { ok: false, error: { code: "query_not_allowed", message: "Realtime session routes do not accept browser query parameters." }, truth: TRUTH });
  if (request.method === "OPTIONS") {
    response.writeHead(204, { Allow: "POST, OPTIONS", "Cache-Control": "no-store" });
    return response.end();
  }
  if (request.method !== "POST") return sendJson(response, 405, { ok: false, error: { code: "method_not_allowed", message: "Realtime session creation requires POST." }, truth: TRUTH }, { Allow: "POST, OPTIONS" });
  const claims = sessionAuthority.authenticate(request);
  if (config.operationalEnabled && !claims) {
    return sendJson(response, 401, { ok: false, error: { code: "session_required", message: "An authenticated operational session is required." }, truth: TRUTH });
  }
  if (config.operationalEnabled && !claims.scopes.includes("operations:write")) {
    return sendJson(response, 403, { ok: false, error: { code: "scope_denied", message: "Session lacks required scope: operations:write." }, truth: TRUTH });
  }
  if (config.operationalEnabled && !sessionAuthority.csrfValid(request, claims)) {
    return sendJson(response, 403, { ok: false, error: { code: "csrf_invalid", message: "CSRF verification failed." }, truth: TRUTH });
  }
  const alias = resolveGatewayRuntimeActionAlias("POST", url.pathname);
  const admission = await ensureRuntimeActionAdmission(
    alias,
    config,
    runtimeFetch,
    actionAdmission,
  );
  if (!admission.allowed) {
    return sendJson(response, admission.status, {
      ok: false,
      data: null,
      error: { code: admission.code, message: admission.message },
      truth: TRUTH,
    });
  }

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
      const assertion = createTenantContextAssertion(config, claims, "nexus-web", clock);
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

async function fetchWithRetry(
  runtimePath,
  config,
  runtimeFetch,
  clock = () => Date.now(),
) {
  let failure;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      return {
        body: await fetchRuntime(runtimePath, config, runtimeFetch, clock),
        attempts: attempt,
      };
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

async function readThroughGateway(
  route,
  runtimePath,
  request,
  config,
  runtimeFetch,
  cache,
  tracker,
  clock = () => Date.now(),
) {
  const cacheable = CACHEABLE_ROUTES.has(route);
  const invalidate = /no-cache|no-store/i.test(String(request.headers["cache-control"] ?? "")) || String(request.headers.pragma ?? "").toLowerCase() === "no-cache";
  if (invalidate) cache.delete(route);
  const existing = cache.get(route);
  if (cacheable && existing && existing.expiresAt > Date.now()) {
    return { status: 200, body: successfulEnvelope(config, tracker, route, existing.body, existing, true, false, 0) };
  }

  try {
    const { body, attempts } = await fetchWithRetry(
      runtimePath,
      config,
      runtimeFetch,
      clock,
    );
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

async function handleApi(
  request,
  response,
  config,
  runtimeFetch,
  cache,
  tracker,
  actionAdmission,
  clock = () => Date.now(),
) {
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
  const alias = resolveGatewayRuntimeActionAlias("GET", url.pathname);
  if (!alias || alias.runtimePath !== runtimePath) {
    return sendJson(
      response,
      503,
      failureEnvelope(
        config,
        tracker,
        url.pathname,
        new GatewayFailure(
          "canonical_action_alias_unresolved",
          "The Gateway route does not resolve to one exact canonical Runtime action identity.",
          "Unavailable",
          503,
        ),
      ),
    );
  }
  if (runtimePath !== "/runtime/capability-registry") {
    const admission = await ensureRuntimeActionAdmission(
      alias,
      config,
      runtimeFetch,
      actionAdmission,
    );
    if (!admission.allowed) {
      return sendJson(
        response,
        admission.status,
        actionAdmissionFailure(config, tracker, url.pathname, admission),
      );
    }
  }
  const result = await readThroughGateway(
    url.pathname,
    runtimePath,
    request,
    config,
    runtimeFetch,
    cache,
    tracker,
    clock,
  );
  if (runtimePath === "/runtime/capability-registry") {
    if (result.status === 200 && result.body.ok && result.body.data) {
      try {
        actionAdmission.observe(result.body.data);
      } catch (error) {
        actionAdmission.clear();
        const failure = error instanceof GatewayFailure
          ? error
          : new GatewayFailure(
            "capability_registry_response_invalid",
            "The Runtime-owned Capability Registry projection failed Gateway admission validation.",
            "Unavailable",
            502,
          );
        return sendJson(response, failure.status, failureEnvelope(config, tracker, url.pathname, failure));
      }
    } else {
      actionAdmission.clear();
    }
  }
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
  const sessionAuthority = createSessionAuthority(config, options.clock);
  const executiveRegistrationMapper = config.executiveSessionEnabled
    ? createExecutiveRegistrationMapper(config.executiveRegistrations)
    : null;
  const providerInteractiveAuth = config.providerInteractiveAuthEnabled
    ? createReplitAuthInteractiveHandler(config, {
      clock: options.clock,
      oidc: options.providerInteractiveOidc,
    })
    : null;
  const executiveProviderAdapter = config.executiveSessionEnabled
    ? createReplitAuthAdapter(config, {
      fetchImpl: options.providerFetch ?? globalThis.fetch,
      clock: options.clock,
      providerIdentityVerifier: options.providerIdentityVerifier
        ?? (providerInteractiveAuth
          ? createProviderSessionIdentityVerifier(
            config,
            providerInteractiveAuth.sessionService,
          )
          : config.replitDeployment
            ? createReplitAuthIdentityVerifier(config, {
              clock: options.clock,
            })
            : undefined),
    })
    : null;
  const executiveSessionAuthority = config.executiveSessionEnabled
    ? createExecutiveSessionAuthority(config, options.clock)
    : null;
  const executiveSessionRuntimeClient = config.executiveSessionEnabled
    ? createExecutiveSessionRuntimeClient(config, {
      runtimeFetch,
      clock: options.clock,
    })
    : null;
  const actionAdmission = options.actionAdmission
    ?? createRuntimeActionAdmissionState(
      config,
      options.clock ?? (() => Date.now()),
    );
  const cache = new Map();
  const tracker = { lastSuccessfulConnection: null, lastSuccessfulRefresh: null };
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/api/auth")) {
      if (!providerInteractiveAuth) {
        return sendJson(response, 404, {
          ok: false,
          error: {
            code: "route_not_allowlisted",
            message: "Interactive provider authentication is not enabled.",
          },
          truth: TRUTH,
        });
      }
      const authPath = new URL(
        request.url,
        "http://portal.invalid",
      ).pathname;
      if (
        authPath === "/api/auth/logout"
        && executiveSessionAuthority?.authenticate(request)
      ) {
        return sendJson(response, 409, {
          ok: false,
          error: {
            code: "executive_session_revocation_required",
            message:
              "Revoke the active Registered Executive session before provider sign-out.",
          },
          providerLogoutCompleted: false,
          executiveSessionRevoked: false,
          authorityGranted: false,
          actionAuthorized: false,
          secretValuesExposed: false,
          truth: TRUTH,
        });
      }
      providerInteractiveAuth
        .handle(request, response)
        .catch(() => sendJson(response, 500, {
          ok: false,
          error: {
            code: "provider_auth_gateway_error",
            message: "Interactive provider authentication failed safely.",
          },
          truth: TRUTH,
        }));
    } else if (request.url?.startsWith("/api/canonical-execution")) {
      handleCanonicalExecutionApi(
        request,
        response,
        config,
        runtimeFetch,
        operationalFetch,
        executiveSessionAuthority,
        actionAdmission,
        options.clock ?? (() => Date.now()),
      )
        .catch(() => sendJson(
          response,
          500,
          operationalFailure(
            config,
            request.url,
            "canonical_execution_gateway_error",
            "Canonical execution failed safely.",
            "Unknown",
          ),
        ));
    } else if (request.url?.startsWith("/api/executive-session")) {
      handleExecutiveSessionApi(
        request,
        response,
        config,
        executiveProviderAdapter,
        executiveRegistrationMapper,
        executiveSessionAuthority,
        executiveSessionRuntimeClient,
      )
        .catch(() => {
          const error = new ExecutiveSessionFailure(
            "executive_session_gateway_error",
            "The registered executive session failed safely.",
            500,
          );
          sendJson(
            response,
            error.status,
            executiveSessionFailureEnvelope(
              config,
              request.url,
              error,
            ),
          );
        });
    } else if (request.url?.startsWith("/api/session")) {
      handleSessionApi(request, response, config, sessionAuthority)
        .catch(() => sendJson(response, 500, operationalFailure(config, request.url, "session_gateway_error", "The session request failed safely.", "Unknown")));
    } else if (request.url?.startsWith("/api/operations")) {
      handleOperationalApi(
        request,
        response,
        config,
        runtimeFetch,
        operationalFetch,
        sessionAuthority,
        actionAdmission,
      )
        .catch(() => sendJson(response, 500, operationalFailure(config, request.url, "operational_gateway_error", "The hosted operation failed safely.", "Unknown")));
    } else if (request.url?.startsWith("/api/runtime/realtime/call")) {
      handleRealtimeCall(request, response, config, runtimeFetch, sessionAuthority, actionAdmission, options.clock)
        .catch(() => sendJson(response, 500, { ok: false, error: { code: "realtime_gateway_error", message: "Realtime session creation failed safely." }, truth: TRUTH }));
    } else if (request.url?.startsWith("/api/runtime/executive-briefing") || request.url === "/api/runtime/conclave/reviews" || request.url === "/api/runtime/interactions" || request.url?.startsWith("/api/runtime/interactions/")) {
      handleRuntimeMutation(request, response, config, runtimeFetch, tracker, sessionAuthority, actionAdmission, options.clock)
        .catch((error) => {
          const failure = error instanceof GatewayFailure ? error : new GatewayFailure("gateway_error", "The bounded Runtime request failed safely.", "Unknown", 500);
          sendJson(response, failure.status, failureEnvelope(config, tracker, request.url, failure));
        });
    } else if (request.url?.startsWith("/api/runtime")) {
      handleApi(
        request,
        response,
        config,
        runtimeFetch,
        cache,
        tracker,
        actionAdmission,
        options.clock,
      )
        .catch(() => sendJson(response, 500, failureEnvelope(config, tracker, request.url, new GatewayFailure("gateway_error", "The Experience Gateway could not complete the read request.", "Unknown", 500))));
    } else if (request.url?.startsWith("/api/local")) {
      handleLocalApi(
        request,
        response,
        config,
        runtimeFetch,
        localFetch,
        actionAdmission,
      )
        .catch(() => sendJson(response, 500, localFailure(config, request.url, "local_gateway_error", "The local capability request failed safely.", "Unknown")));
    } else if (request.url?.startsWith("/api/replay")) {
      handleReplayApi(request, response, config)
        .catch(() => sendJson(response, 500, { ok: false, error: { code: "replay_gateway_error", message: "Operational Replay failed safely." }, truth: TRUTH }));
    } else {
      serveStatic(request, response);
    }
  });
  server.experienceGateway = {
    cache,
    tracker,
    config,
    sessionAuthority,
    providerInteractiveAuth,
    executiveRegistrationMapper,
    executiveProviderAdapter,
    executiveSessionAuthority,
    executiveSessionRuntimeClient,
    actionAdmission,
  };
  return server;
}
