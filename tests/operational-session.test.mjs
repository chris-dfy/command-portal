import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionAuthority } from "../server/operational-auth.mjs";

const BASE_TIME = Date.parse("2026-07-22T12:00:00Z");
const config = Object.freeze({
  operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
  operationalAccessKey: "development-operator-access-key",
  operationalUserId: "operator-alpha",
  operationalTenantId: "tenant-alpha",
  operationalWorkspaceId: "workspace-alpha",
  operationalRole: "admin",
  operationalScopes: ["operations:read", "operations:write", "knowledge:promote"],
  operationalSessionTtlSeconds: 3600,
  operationalCookieSecure: true,
});

const cookieHeader = (setCookie) => setCookie.split(";", 1)[0];
const request = (cookie, headers = {}, url = "/api/session") => ({
  url,
  headers: { ...(cookie ? { cookie } : {}), ...headers },
});

test("session claims are server-derived and the cookie is signed, HttpOnly, strict, and secure", () => {
  const authority = createSessionAuthority(config, () => BASE_TIME);
  const login = authority.login(config.operationalAccessKey, "127.0.0.1");

  assert.equal(login.status, 200);
  assert.match(login.cookie, /^nexus_operational_session=[^.]+\.[^;]+;/);
  for (const attribute of ["Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=3600", "Secure"]) {
    assert.match(login.cookie, new RegExp(`(?:^|; )${attribute.replace("/", "\\/")}(?:;|$)`));
  }
  assert.equal(login.cookie.includes(config.operationalAccessKey), false);

  const claims = authority.authenticate(request(cookieHeader(login.cookie)));
  assert.ok(claims);
  assert.equal(claims.sub, config.operationalUserId);
  assert.equal(claims.tenantId, config.operationalTenantId);
  assert.equal(claims.workspaceId, config.operationalWorkspaceId);
  assert.equal(claims.role, config.operationalRole);
  assert.deepEqual(claims.scopes, config.operationalScopes);

  const session = authority.publicSession(claims);
  assert.deepEqual(session, {
    authenticated: true,
    userId: config.operationalUserId,
    tenantId: config.operationalTenantId,
    workspaceId: config.operationalWorkspaceId,
    role: config.operationalRole,
    scopes: config.operationalScopes,
    expiresAt: "2026-07-22T13:00:00.000Z",
    csrfToken: login.csrfToken,
  });
});

test("the signed session survives ordinary navigation and page refresh within its lifetime", () => {
  let now = BASE_TIME;
  const authority = createSessionAuthority(config, () => now);
  const login = authority.login(config.operationalAccessKey, "127.0.0.1");
  const cookie = cookieHeader(login.cookie);
  const initial = authority.authenticate(request(cookie, {}, "/missions"));

  now += 30 * 60_000;
  const refreshed = authority.authenticate(request(cookie, {}, "/api/session"));
  assert.ok(initial);
  assert.ok(refreshed);
  assert.equal(refreshed.sid, initial.sid);
  assert.deepEqual(authority.publicSession(refreshed), authority.publicSession(initial));
});

test("a CSRF-verified logout revokes the session identifier before clearing the cookie", () => {
  const authority = createSessionAuthority(config, () => BASE_TIME);
  const login = authority.login(config.operationalAccessKey, "127.0.0.1");
  const cookie = cookieHeader(login.cookie);
  const claims = authority.authenticate(request(cookie));
  assert.ok(claims);

  const invalidLogout = request(cookie, { "x-csrf-token": "invalid" }, "/api/session/logout");
  assert.equal(authority.csrfValid(invalidLogout, claims), false);
  assert.ok(authority.authenticate(request(cookie)));

  const logout = request(cookie, { "x-csrf-token": login.csrfToken }, "/api/session/logout");
  assert.equal(authority.csrfValid(logout, claims), true);
  assert.equal(authority.authenticate(request(cookie)), null);
  assert.equal(authority.csrfValid(logout, claims), false);
  assert.equal(authority.clearCookie(), "nexus_operational_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure");
});

test("expired, tampered, and malformed sessions fail closed", () => {
  let now = BASE_TIME;
  const authority = createSessionAuthority(config, () => now);
  const login = authority.login(config.operationalAccessKey, "127.0.0.1");
  const cookie = cookieHeader(login.cookie);
  const token = cookie.slice(cookie.indexOf("=") + 1);
  const tamperedToken = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

  assert.equal(authority.authenticate(request(`nexus_operational_session=${tamperedToken}`)), null);
  assert.equal(authority.authenticate(request("nexus_operational_session=malformed")), null);

  now += config.operationalSessionTtlSeconds * 1000;
  assert.equal(authority.authenticate(request(cookie)), null);
  assert.deepEqual(authority.publicSession(null), { authenticated: false });
});

test("sessions are invalidated when any active server identity or privilege binding changes", () => {
  const issuer = createSessionAuthority(config, () => BASE_TIME);
  const cookie = cookieHeader(issuer.login(config.operationalAccessKey, "127.0.0.1").cookie);
  const changes = [
    { operationalUserId: "operator-bravo" },
    { operationalTenantId: "tenant-bravo" },
    { operationalWorkspaceId: "workspace-bravo" },
    { operationalRole: "operator" },
    { operationalScopes: ["operations:read"] },
    { operationalScopes: [...config.operationalScopes].reverse() },
  ];

  for (const change of changes) {
    const verifier = createSessionAuthority({ ...config, ...change }, () => BASE_TIME);
    assert.equal(verifier.authenticate(request(cookie)), null, JSON.stringify(change));
  }
});

test("non-secure loopback test cookies preserve the remaining session protections", () => {
  const authority = createSessionAuthority({ ...config, operationalCookieSecure: false }, () => BASE_TIME);
  const cookie = authority.login(config.operationalAccessKey, "127.0.0.1").cookie;
  assert.match(cookie, /; Path=\/; HttpOnly; SameSite=Strict; Max-Age=3600$/);
  assert.equal(cookie.includes("; Secure"), false);
});
