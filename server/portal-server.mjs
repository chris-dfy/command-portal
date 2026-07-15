import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(ROOT, "dist");
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "fixtures/contract-fixture.json"), "utf8"));
const BRAND = JSON.parse(readFileSync(join(ROOT, "config/brand.json"), "utf8"));
const ASSET_MANIFEST = JSON.parse(readFileSync(join(ROOT, "config/platform-assets.v1.json"), "utf8"));

export const ROUTES = Object.freeze({
  status: "/api/nexus/status",
  readiness: "/api/nexus/readiness",
  claims: "/api/nexus/claims",
  proofs: "/api/nexus/proofs",
  receipts: "/api/nexus/receipts",
  layers: "/api/nexus/layers",
  connectors: "/api/nexus/connectors",
  "operator-alpha": "/api/nexus/operator-alpha",
  projects: "/api/nexus/projects",
  sources: "/api/nexus/intake/sources",
  "intake-status": "/api/nexus/intake/status",
  cdp: "/api/nexus/cdp/status",
  artifacts: "/api/nexus/artifacts",
  "asset-manifest": "/api/nexus/assets/manifest",
  "asset-coverage": "/api/nexus/assets/coverage",
  capabilities: "/api/nexus/capabilities",
  "live-policy": "/api/nexus/capabilities/live-policy",
  exposure: "/api/nexus/replit-exposure",
  specialists: "/api/nexus/slm/specialists",
  "model-hosting": "/api/nexus/slm/hosting",
  "runtime-verification": "/api/nexus/runtime-verification/status",
  "runtime-matrix": "/api/nexus/runtime-verification/matrix",
  "phase5x-prerequisite": "/api/nexus/runtime-verification/phase-5x-prerequisite",
  limitations: "/api/nexus/limitations",
  persistence: "/persistence/health",
  "hosted-readiness": "/team/hosted-readiness",
  "supabase-readiness": "/team/supabase/status"
});

const DETAILS = Object.freeze({
  claim: "/api/nexus/claims/",
  proof: "/api/nexus/proofs/",
  receipt: "/api/nexus/receipts/",
  project: "/api/nexus/projects/",
  specialist: "/api/nexus/slm/specialists/",
  "verification-record": "/api/nexus/runtime-verification/records/"
});

const SNAPSHOT_DOMAINS = Object.freeze([
  "status", "readiness", "runtime-verification", "runtime-matrix", "claims", "proofs", "receipts",
  "capabilities", "layers", "connectors", "asset-manifest", "asset-coverage", "specialists",
  "model-hosting", "limitations", "persistence", "hosted-readiness", "exposure"
]);

const TRUTH = Object.freeze({
  productionReady: false,
  enterpriseReady: false,
  cloudPrimary: false,
  localSourceOfTruth: true,
  secretValuesExposed: false
});

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const integer = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function loadConfig(overrides = {}) {
  const mode = overrides.mode ?? process.env.COMMAND_PORTAL_MODE ?? "contract_fixture";
  if (!["contract_fixture", "local_runtime", "disconnected"].includes(mode)) {
    throw new Error(`Invalid COMMAND_PORTAL_MODE: ${mode}`);
  }
  return Object.freeze({
    mode,
    port: integer(overrides.port ?? process.env.PORT, 4173),
    runtimeBaseUrl: String(overrides.runtimeBaseUrl ?? process.env.COMMAND_PORTAL_RUNTIME_API_BASE_URL ?? "").replace(/\/$/, ""),
    runtimeToken: String(overrides.runtimeToken ?? process.env.COMMAND_PORTAL_RUNTIME_READ_TOKEN ?? ""),
    allowedOrigins: String(overrides.allowedOrigins ?? process.env.COMMAND_PORTAL_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    timeoutMs: integer(overrides.timeoutMs ?? process.env.COMMAND_PORTAL_REQUEST_TIMEOUT_MS, 15_000),
    cacheTtlMs: integer(overrides.cacheTtlMs ?? process.env.COMMAND_PORTAL_CACHE_TTL_MS, 30_000),
    maxResponseBytes: integer(overrides.maxResponseBytes ?? process.env.COMMAND_PORTAL_MAX_RESPONSE_BYTES, 1_048_576)
  });
}

function meta(config, additions = {}) {
  const now = new Date().toISOString();
  const fixture = config.mode === "contract_fixture";
  return {
    schemaVersion: "1.0",
    generatedAt: now,
    sourceOfTruth: fixture ? "contract_fixture" : "nexus_runtime",
    readOnly: true,
    dataMode: config.mode,
    verificationEnvironment: fixture ? "non_live_contract_fixture" : config.mode,
    connectionState: fixture ? "local_only" : config.mode === "local_runtime" ? "connected" : "disconnected",
    cached: false,
    stale: false,
    limitations: fixture ? ["CONTRACT FIXTURE — NON-LIVE DATA", "Hosted connection acceptance remains pending Phase 5X-C."] : [],
    proofIds: [],
    receiptIds: [],
    ...TRUTH,
    ...additions
  };
}

function envelope(config, data, additions = {}) {
  return { ok: true, data, meta: meta(config, additions) };
}

function errorEnvelope(config, code, message, additions = {}) {
  return { ok: false, data: null, meta: meta(config, additions), error: { code, message } };
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

function requestOriginAllowed(request, config) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (origin === "null") return false;
  const forwardedProto = String(request.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
  const protocol = forwardedProto || (request.socket.encrypted ? "https" : "http");
  const selfOrigin = request.headers.host ? `${protocol}://${request.headers.host}` : "";
  return origin === selfOrigin || config.allowedOrigins.includes(origin);
}

function validateQuery(url) {
  const allowed = new Set(["limit", "offset"]);
  for (const key of url.searchParams.keys()) if (!allowed.has(key)) return "Only limit and offset query parameters are allowed.";
  if (url.searchParams.has("limit")) {
    const limit = Number(url.searchParams.get("limit"));
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return "limit must be an integer from 1 to 100.";
  }
  if (url.searchParams.has("offset")) {
    const offset = Number(url.searchParams.get("offset"));
    if (!Number.isInteger(offset) || offset < 0) return "offset must be a non-negative integer.";
  }
  return null;
}

function fixtureReferences(name) {
  if (["claims", "proofs", "receipts", "runtime-verification"].includes(name)) {
    return { proofIds: ["PROOF-20260714213158-90F39693"], receiptIds: ["PORTAL-LOCAL-REC-86244CC7947F"] };
  }
  return {};
}

async function readRuntime(runtimePath, url, config, runtimeFetch, cache) {
  if (!config.runtimeBaseUrl) throw new Error("Runtime API base URL is not configured.");
  const cacheKey = `${runtimePath}?${url.searchParams.toString()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, meta: { ...cached.value.meta, cached: true } };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers = { Accept: "application/json" };
    if (config.runtimeToken) headers.Authorization = `Bearer ${config.runtimeToken}`;
    const runtimeUrl = `${config.runtimeBaseUrl}${runtimePath}${url.search}`;
    const response = await runtimeFetch(runtimeUrl, { method: "GET", headers, signal: controller.signal, redirect: "error" });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > config.maxResponseBytes) throw new Error("Runtime response exceeded the portal size limit.");
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength > config.maxResponseBytes) throw new Error("Runtime response exceeded the portal size limit.");
    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { throw new Error("Runtime returned invalid JSON."); }
    if (!response.ok) throw new Error(`Runtime read failed with status ${response.status}.`);
    const data = body && typeof body === "object" && "data" in body ? body.data : body;
    const runtimeMeta = body && typeof body === "object" && body.meta && typeof body.meta === "object" ? body.meta : {};
    const value = envelope(config, data, {
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + config.cacheTtlMs).toISOString(),
      proofIds: Array.isArray(runtimeMeta.proofIds) ? runtimeMeta.proofIds : [],
      receiptIds: Array.isArray(runtimeMeta.receiptIds) ? runtimeMeta.receiptIds : [],
      limitations: Array.isArray(runtimeMeta.limitations) ? runtimeMeta.limitations : []
    });
    cache.set(cacheKey, { value, expiresAt: Date.now() + config.cacheTtlMs });
    return value;
  } catch (error) {
    if (cached) return { ...cached.value, meta: { ...cached.value.meta, cached: true, stale: true, connectionState: "stale", limitations: [...cached.value.meta.limitations, "Runtime refresh failed; displaying expired cached data."] } };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function fixtureDomain(name, config) {
  if (name === "asset-manifest") return envelope(config, ASSET_MANIFEST, fixtureReferences(name));
  const value = FIXTURE.domains[name];
  if (value === undefined) return null;
  return envelope(config, value, fixtureReferences(name));
}

async function snapshot(config, runtimeFetch, cache) {
  if (config.mode === "contract_fixture") {
    const domains = Object.fromEntries(Object.keys(FIXTURE.domains).map((name) => [name, fixtureDomain(name, config)]));
    domains["asset-manifest"] = fixtureDomain("asset-manifest", config);
    return envelope(config, { brand: BRAND, referenceFixture: true, fixtureLabel: FIXTURE.label, domains, failedDomains: [] }, { limitations: [FIXTURE.label, "Values demonstrate the contract and are not current runtime observations."] });
  }
  if (config.mode === "disconnected") return errorEnvelope(config, "runtime_disconnected", "The portal is intentionally disconnected. No live values are available.");
  const domains = {};
  const failedDomains = [];
  await Promise.all(SNAPSHOT_DOMAINS.map(async (name) => {
    try { domains[name] = await readRuntime(ROUTES[name], new URL("http://portal.invalid/"), config, runtimeFetch, cache); }
    catch { failedDomains.push(name); }
  }));
  return envelope(config, { brand: BRAND, referenceFixture: false, domains, failedDomains }, { limitations: failedDomains.length ? [`${failedDomains.length} allowlisted runtime domains were unavailable.`] : [] });
}

async function handleApi(request, response, config, runtimeFetch, cache) {
  if (!requestOriginAllowed(request, config)) {
    return sendJson(response, 403, errorEnvelope(config, "origin_denied", "Request origin is not allowed."));
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, { Allow: "GET, OPTIONS", "Cache-Control": "no-store" });
    return response.end();
  }
  if (request.method !== "GET") {
    return sendJson(response, 405, errorEnvelope(config, "method_not_allowed", "The portal BFF is read-only."), { Allow: "GET, OPTIONS" });
  }
  const url = new URL(request.url, "http://portal.invalid");
  const queryError = validateQuery(url);
  if (queryError) return sendJson(response, 400, errorEnvelope(config, "unsafe_query", queryError));
  if (url.pathname === "/api/portal/snapshot") {
    const result = await snapshot(config, runtimeFetch, cache);
    return sendJson(response, result.ok ? 200 : 503, result);
  }
  const staticMatch = url.pathname.match(/^\/api\/portal\/([a-z0-9-]+)$/);
  if (staticMatch && ROUTES[staticMatch[1]]) {
    const name = staticMatch[1];
    if (config.mode === "disconnected") return sendJson(response, 503, errorEnvelope(config, "runtime_disconnected", "The portal is intentionally disconnected. No live values are available."));
    try {
      const result = config.mode === "contract_fixture" ? fixtureDomain(name, config) : await readRuntime(ROUTES[name], url, config, runtimeFetch, cache);
      return result ? sendJson(response, 200, result) : sendJson(response, 404, errorEnvelope(config, "fixture_record_missing", "This allowlisted domain has no contract fixture record."));
    } catch (error) {
      return sendJson(response, 502, errorEnvelope(config, "runtime_read_failed", error instanceof Error ? error.message : "Runtime read failed."));
    }
  }
  const detailMatch = url.pathname.match(/^\/api\/portal\/([a-z-]+)\/([A-Za-z0-9._:-]{1,160})$/);
  if (detailMatch && DETAILS[detailMatch[1]]) {
    const [, kind, id] = detailMatch;
    if (config.mode === "disconnected") return sendJson(response, 503, errorEnvelope(config, "runtime_disconnected", "The portal is intentionally disconnected. No live values are available."));
    if (config.mode === "contract_fixture") {
      const detail = FIXTURE.details[kind]?.[id];
      return detail ? sendJson(response, 200, envelope(config, detail, fixtureReferences(kind))) : sendJson(response, 404, errorEnvelope(config, "fixture_record_missing", "The fixture does not contain this evidence record."));
    }
    try {
      const result = await readRuntime(`${DETAILS[kind]}${encodeURIComponent(id)}`, url, config, runtimeFetch, cache);
      return sendJson(response, 200, result);
    } catch (error) {
      return sendJson(response, 502, errorEnvelope(config, "runtime_read_failed", error instanceof Error ? error.message : "Runtime read failed."));
    }
  }
  return sendJson(response, 404, errorEnvelope(config, "route_not_allowlisted", "This portal route is not allowlisted."));
}

function serveStatic(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end();
  }
  const url = new URL(request.url, "http://portal.invalid");
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST, requested === "/" ? "index.html" : requested);
  if (!filePath.startsWith(DIST)) filePath = join(DIST, "index.html");
  try {
    if (!statSync(filePath).isFile()) filePath = join(DIST, "index.html");
  } catch { filePath = join(DIST, "index.html"); }
  try {
    const stat = statSync(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
      "Content-Length": stat.size,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"
    });
    if (request.method === "HEAD") return response.end();
    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 503, { ok: false, error: { code: "portal_not_built", message: "Run npm run build before starting the production server." }, ...TRUTH });
  }
}

export function createPortalServer(options = {}) {
  const config = loadConfig(options.config);
  const runtimeFetch = options.runtimeFetch ?? globalThis.fetch;
  const cache = new Map();
  return createServer((request, response) => {
    if (request.url?.startsWith("/api/portal")) {
      handleApi(request, response, config, runtimeFetch, cache).catch(() => sendJson(response, 500, errorEnvelope(config, "portal_error", "The portal could not complete the read request.")));
    } else {
      serveStatic(request, response);
    }
  });
}
