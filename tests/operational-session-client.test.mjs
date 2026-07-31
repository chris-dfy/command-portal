import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  asOperationalSession,
  operationalSessionClient,
} from "../src/lib/local-client.ts";

const originalFetch = globalThis.fetch;
const future = () => new Date(Date.now() + 60_000).toISOString();
const truth = {
  productionReady: false,
  enterpriseReady: false,
  cloudPrimary: false,
  localSourceOfTruth: true,
  defaultProvider: "mock_model",
  conclave: "unavailable",
  actualTrainedSLMs: 0,
  secretValuesExposed: false,
};
const activeSession = (overrides = {}) => ({
  authenticated: true,
  userId: "nexus-workspace-service",
  tenantId: "nexicron",
  workspaceId: "primary",
  role: "operator",
  scopes: ["operations:read", "operations:write"],
  expiresAt: future(),
  csrfToken: "bounded-csrf-token",
  connectionMode: "automatic_private_workspace",
  principalType: "workspace_service",
  accessBasis: "replit_private_deployment",
  managed: true,
  ...overrides,
});
const response = (session, status = 200, bodyOverrides = {}) => new Response(
  JSON.stringify({
    ok: status >= 200 && status < 300,
    session,
    truth,
    ...bodyOverrides,
  }),
  {
    status,
    headers: { "Content-Type": "application/json" },
  },
);

afterEach(() => {
  globalThis.fetch = originalFetch;
  operationalSessionClient.use({ authenticated: false });
});

test("operational session parser accepts only complete, internally consistent states", () => {
  assert.deepEqual(asOperationalSession({ authenticated: false }), {
    authenticated: false,
  });
  assert.equal(asOperationalSession({
    authenticated: false,
    tenantId: "client-selected",
  }), null);
  assert.equal(asOperationalSession({ authenticated: "yes" }), null);
  assert.equal(asOperationalSession(activeSession({
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  })), null);
  assert.equal(asOperationalSession(activeSession({
    principalType: "named_operator",
  })), null);
  assert.equal(asOperationalSession(activeSession())?.authenticated, true);
});

test("malformed operational session responses never switch transport to hosted", async () => {
  const malformed = [
    { authenticated: "yes" },
    { authenticated: true },
    activeSession({
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    }),
  ];
  for (const session of malformed) {
    globalThis.fetch = async () => response(session);
    await assert.rejects(
      operationalSessionClient.status(),
      /failed validation/,
    );
    assert.equal(operationalSessionClient.mode(), "local");
  }
});

test("operational session client correlates HTTP and body truth before use", async () => {
  globalThis.fetch = async () => response(activeSession(), 503, {
    ok: true,
  });
  await assert.rejects(
    operationalSessionClient.status(),
    /failed validation/,
  );
  assert.equal(operationalSessionClient.mode(), "local");

  globalThis.fetch = async () => response(activeSession());
  const session = await operationalSessionClient.status();
  operationalSessionClient.use(session);
  assert.equal(operationalSessionClient.mode(), "hosted");
});
