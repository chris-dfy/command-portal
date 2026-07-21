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
  const sessionCookie = (value, maxAge) => `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.operationalCookieSecure ? "; Secure" : ""}`;
  const encode = (claims) => { const payload = b64(JSON.stringify(claims)); return `${payload}.${sign(payload, config.operationalSessionSecret)}`; };
  const decode = (token) => {
    const [payload, signature, extra] = String(token ?? "").split(".");
    if (!payload || !signature || extra || !safeEqual(signature, sign(payload, config.operationalSessionSecret))) return null;
    try {
      const claims = JSON.parse(unb64(payload));
      return claims && claims.exp > Math.floor(clock() / 1000) && claims.tenantId === config.operationalTenantId && claims.workspaceId === config.operationalWorkspaceId ? claims : null;
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
    login, authenticate, csrf,
    csrfValid: (request, claims) => safeEqual(request.headers["x-csrf-token"], csrf(claims)),
    clearCookie: () => sessionCookie("", 0),
    publicSession: (claims) => claims ? {
      authenticated: true, userId: claims.sub, tenantId: claims.tenantId, workspaceId: claims.workspaceId,
      role: claims.role, scopes: claims.scopes, expiresAt: new Date(claims.exp * 1000).toISOString(), csrfToken: csrf(claims)
    } : { authenticated: false }
  };
}

export function requiredScope(runtimePath, method) {
  if (method === "GET") return "operations:read";
  if (/^\/runtime-coordination\/admissions(?:\/[A-Za-z0-9_.%:@-]+\/(?:cancel|challenge\/reissue))?$/.test(runtimePath)) return "edge:node_admission:request";
  if (/^\/approvals\/.+\/(approve|deny)$/.test(runtimePath)) return "approvals:decide";
  if (runtimePath === "/actions/execute") return "actions:execute";
  if (runtimePath === "/actions/dry-run") return "actions:simulate";
  if (runtimePath === "/intake/upload") return "evidence:write";
  return "operations:write";
}
