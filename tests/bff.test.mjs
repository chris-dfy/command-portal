import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createPortalServer, ROUTES } from "../server/portal-server.mjs";

const servers = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))));

async function start(config = {}, runtimeFetch) {
  const server = createPortalServer({ config: { port: 0, ...config }, runtimeFetch });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test("contract fixture is visibly non-live and preserves truth boundaries", async () => {
  const base = await start({ mode: "contract_fixture" });
  const response = await fetch(`${base}/api/portal/snapshot`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.referenceFixture, true);
  assert.match(body.data.fixtureLabel, /NON-LIVE DATA/);
  assert.equal(body.meta.sourceOfTruth, "contract_fixture");
  assert.equal(body.meta.productionReady, false);
  assert.equal(body.meta.enterpriseReady, false);
  assert.equal(body.meta.cloudPrimary, false);
  assert.equal(body.meta.localSourceOfTruth, true);
  assert.equal(body.meta.secretValuesExposed, false);
  assert.equal(body.data.domains.specialists.data.actualTrainedSLMs, 0);
});

test("mutations, arbitrary routes, and unsafe queries are rejected", async () => {
  const base = await start({ mode: "contract_fixture" });
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await fetch(`${base}/api/portal/status`, { method });
    assert.equal(response.status, 405, method);
  }
  assert.equal((await fetch(`${base}/api/portal/proxy?path=/anything`)).status, 400);
  assert.equal((await fetch(`${base}/api/portal/not-a-route`)).status, 404);
  assert.equal((await fetch(`${base}/api/portal/status?runtimePath=/api/nexus/status`)).status, 400);
  assert.equal((await fetch(`${base}/api/portal/status?limit=101`)).status, 400);
});

test("untrusted origins are denied without runtime access", async () => {
  let calls = 0;
  const base = await start({ mode: "local_runtime", runtimeBaseUrl: "https://runtime.invalid" }, async () => { calls += 1; return new Response("{}"); });
  const response = await fetch(`${base}/api/portal/status`, { headers: { Origin: "https://attacker.invalid" } });
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test("local runtime uses the literal route and keeps its credential server-only", async () => {
  const token = "test-secret-that-must-not-leak";
  const observed = [];
  const runtimeFetch = async (url, options) => {
    observed.push({ url, options });
    return new Response(JSON.stringify({ data: { status: "observed" }, meta: { proofIds: ["PROOF-1"] } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const base = await start({ mode: "local_runtime", runtimeBaseUrl: "https://runtime.invalid", runtimeToken: token }, runtimeFetch);
  const response = await fetch(`${base}/api/portal/status`);
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(response.status, 200);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].url, `https://runtime.invalid${ROUTES.status}`);
  assert.equal(observed[0].options.method, "GET");
  assert.equal(observed[0].options.headers.Authorization, `Bearer ${token}`);
  assert.equal(text.includes(token), false);
  assert.deepEqual(body.meta.proofIds, ["PROOF-1"]);
  assert.equal(body.meta.secretValuesExposed, false);
});

test("disconnected mode returns no fabricated operational data", async () => {
  const base = await start({ mode: "disconnected" });
  const response = await fetch(`${base}/api/portal/snapshot`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.data, null);
  assert.equal(body.meta.connectionState, "disconnected");
  assert.match(body.error.message, /intentionally disconnected/i);
});

test("the platform manifest covers every required asset category", async () => {
  const base = await start({ mode: "contract_fixture" });
  const body = await (await fetch(`${base}/api/portal/asset-manifest`)).json();
  const categories = new Set(body.data.assets.map((asset) => asset.category));
  for (const category of ["knowledge", "data", "schemas", "handlers", "connectors", "workflows", "specialists", "prompts", "indexes", "models", "policies", "evaluations", "APIs", "UI modules", "proofs", "receipts", "test fixtures"]) {
    assert.equal(categories.has(category), true, category);
  }
});
