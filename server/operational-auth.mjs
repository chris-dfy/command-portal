import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "nexus_operational_session";
const b64 = (value) => Buffer.from(value).toString("base64url");
const unb64 = (value) => Buffer.from(value, "base64url").toString("utf8");
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
};
const sign = (value, secret) => createHmac("sha256", secret).update(value).digest("base64url");
const cookieMap = (header = "") => Object.fromEntries(String(header).split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
  const index = item.indexOf("="); return index < 0 ? [item, ""] : [item.slice(0, index), item.slice(index + 1)];
}));

export function createSessionAuthority(config, clock = () => Date.now()) {
  const failures = new Map();
  const revokedSessions = new Map();
  const sessionCookie = (value, maxAge) => `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.operationalCookieSecure ? "; Secure" : ""}`;
  const encode = (claims) => { const payload = b64(JSON.stringify(claims)); return `${payload}.${sign(payload, config.operationalSessionSecret)}`; };
  const nowSeconds = () => Math.floor(clock() / 1000);
  const scopesMatch = (scopes) => Array.isArray(scopes)
    && scopes.length === config.operationalScopes.length
    && scopes.every((scope, index) => scope === config.operationalScopes[index]);
  const revoke = (claims) => {
    if (typeof claims?.sid === "string" && Number.isSafeInteger(claims.exp)) revokedSessions.set(claims.sid, claims.exp);
  };
  const revoked = (claims, now) => {
    const expiresAt = revokedSessions.get(claims.sid);
    if (expiresAt === undefined) return false;
    if (expiresAt <= now) {
      revokedSessions.delete(claims.sid);
      return false;
    }
    return true;
  };
  const decode = (token) => {
    const [payload, signature, extra] = String(token ?? "").split(".");
    if (!payload || !signature || extra || !safeEqual(signature, sign(payload, config.operationalSessionSecret))) return null;
    try {
      const claims = JSON.parse(unb64(payload));
      const now = nowSeconds();
      const active = claims && !Array.isArray(claims)
        && typeof claims.sid === "string" && claims.sid.length > 0
        && claims.sub === config.operationalUserId
        && claims.tenantId === config.operationalTenantId
        && claims.workspaceId === config.operationalWorkspaceId
        && claims.role === config.operationalRole
        && scopesMatch(claims.scopes)
        && Number.isSafeInteger(claims.iat)
        && Number.isSafeInteger(claims.exp)
        && claims.exp > claims.iat
        && claims.exp > now
        && !revoked(claims, now);
      return active ? claims : null;
    } catch { return null; }
  };
  const authenticate = (request) => decode(cookieMap(request.headers.cookie)[COOKIE_NAME]);
  const csrf = (claims) => sign(`csrf:${claims.sid}:${claims.exp}`, config.operationalSessionSecret);
  const login = (accessKey, remoteAddress = "unknown") => {
    const now = clock();
    const recent = (failures.get(remoteAddress) ?? []).filter((at) => now - at < 15 * 60_000);
    if (recent.length >= 5) return { status: 429, error: "login_rate_limited" };
    if (!safeEqual(accessKey, config.operationalAccessKey)) {
      failures.set(remoteAddress, [...recent, now]);
      return { status: 401, error: "credentials_invalid" };
    }
    failures.delete(remoteAddress);
    const issued = Math.floor(now / 1000);
    const claims = {
      sid: randomBytes(18).toString("base64url"), sub: config.operationalUserId,
      tenantId: config.operationalTenantId, workspaceId: config.operationalWorkspaceId,
      role: config.operationalRole, scopes: config.operationalScopes, iat: issued,
      exp: issued + config.operationalSessionTtlSeconds
    };
    return { status: 200, claims, csrfToken: csrf(claims), cookie: sessionCookie(encode(claims), config.operationalSessionTtlSeconds) };
  };
  return {
    login, authenticate, csrf, revoke,
    csrfValid: (request, claims) => {
      if (!claims || revoked(claims, nowSeconds()) || !safeEqual(request.headers["x-csrf-token"], csrf(claims))) return false;
      let pathname = "";
      try { pathname = new URL(request.url ?? "", "http://session.invalid").pathname; } catch { return false; }
      if (pathname === "/api/session/logout") revoke(claims);
      return true;
    },
    clearCookie: () => sessionCookie("", 0),
    publicSession: (claims) => claims ? {
      authenticated: true, userId: claims.sub, tenantId: claims.tenantId, workspaceId: claims.workspaceId,
      role: claims.role, scopes: claims.scopes, expiresAt: new Date(claims.exp * 1000).toISOString(), csrfToken: csrf(claims)
    } : { authenticated: false }
  };
}

export function requiredScope(runtimePath, method) {
  if (method === "GET") return "operations:read";
  if (runtimePath === "/knowledge/promotions") return "knowledge:promote";
  if (runtimePath === "/knowledge/intake" || /^\/conclave\/workspaces\/.+\/tasks\/.+\/evidence$/.test(runtimePath)) return "evidence:write";
  if (/^\/runtime-coordination\/admissions\/[A-Za-z0-9_.%:@-]+\/challenge\/reissue$/.test(runtimePath)) return "edge:node_admission:review";
  if (/^\/runtime-coordination\/admissions(?:\/[A-Za-z0-9_.%:@-]+\/cancel)?$/.test(runtimePath)) return "edge:node_admission:request";
  if (/^\/approvals\/.+\/(approve|deny)$/.test(runtimePath)) return "approvals:decide";
  if (runtimePath === "/actions/execute") return "actions:execute";
  if (runtimePath === "/actions/dry-run") return "actions:simulate";
  if (runtimePath === "/intake/upload") return "evidence:write";
  return "operations:write";
}
