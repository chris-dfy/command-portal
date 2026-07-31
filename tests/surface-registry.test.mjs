import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const registryPath = new URL("../src/platform/surface-registry.json", import.meta.url);
const appPath = new URL("../src/App.tsx", import.meta.url);
const navigationPath = new URL("../src/platform/navigation.ts", import.meta.url);
const clientPath = new URL("../src/lib/local-client.ts", import.meta.url);
const missionDashboardPath = new URL("../src/components/MissionDashboard.tsx", import.meta.url);
const workSessionsPath = new URL("../src/components/WorkSessionsWorkspace.tsx", import.meta.url);

const expectedSurfaceIds = [
  "dashboard",
  "missions",
  "replay",
  "conclave",
  "knowledge",
  "edge",
  "mission-control",
  "settings",
  "documents",
  "projects",
  "data-platform",
  "providers",
  "runtime",
  "connectors",
  "storage",
  "cloud",
  "team",
  "governance",
  "capability-ledger",
  "evidence",
  "security",
  "receipts",
  "voice",
  "executive-views",
  "work-sessions",
  "government",
];

async function registry() {
  return JSON.parse(await readFile(registryPath, "utf8"));
}

test("canonical surface registry pins authority and inventories the desktop/web union once", async () => {
  const document = await registry();
  assert.equal(document.recordType, "nexus_experience_surface_registry");
  assert.equal(document.schemaVersion, "nexus.experience-surface-registry@1.0.0");
  assert.equal(document.constitutionalBasis.releaseId, "NCR-1.0.0");
  assert.equal(
    document.constitutionalBasis.releaseDigest,
    "sha256:212678643019c07c38d11c6abf4b4810fb87b5b8cf543b6ccdc958dcb9bdaffa",
  );
  assert.equal(document.principleImpact, "no_constitutional_change");
  assert.deepEqual(document.clients, ["desktop", "web"]);
  assert.deepEqual(document.surfaces.map((surface) => surface.id), expectedSurfaceIds);
  assert.equal(new Set(document.surfaces.map((surface) => surface.id)).size, expectedSurfaceIds.length);
  for (const client of document.clients) {
    assert.equal(
      new Set(document.surfaces.map((surface) => surface.clients[client].route)).size,
      expectedSurfaceIds.length,
      `${client} routes must be unique`,
    );
  }
});

test("every client surface has an explicit truthful state and reason", async () => {
  const document = await registry();
  const allowedStates = new Set(["functional", "read_only", "local_only", "unavailable"]);
  for (const surface of document.surfaces) {
    assert.ok(surface.label);
    assert.ok(surface.detail);
    assert.ok(Array.isArray(surface.capabilityIds));
    for (const client of document.clients) {
      const projection = surface.clients[client];
      assert.ok(allowedStates.has(projection.state), `${surface.id}:${client}`);
      assert.match(projection.route, /^\//, `${surface.id}:${client}`);
      assert.ok(projection.reason.length >= 24, `${surface.id}:${client} requires a truthful reason`);
    }
  }

  const webStateCounts = document.surfaces.reduce((counts, surface) => ({
    ...counts,
    [surface.clients.web.state]: (counts[surface.clients.web.state] ?? 0) + 1,
  }), {});
  assert.deepEqual(webStateCounts, {
    read_only: 9,
    functional: 10,
    unavailable: 6,
    local_only: 1,
  });
  assert.deepEqual(
    document.surfaces.filter((surface) => surface.executive).map((surface) => surface.id),
    expectedSurfaceIds.slice(0, 8),
  );
});

test("web state reflects the implemented Work Session and connector boundaries", async () => {
  const document = await registry();
  const byId = Object.fromEntries(document.surfaces.map((surface) => [surface.id, surface]));
  assert.equal(byId["work-sessions"].clients.web.state, "functional");
  assert.equal(byId["work-sessions"].webOperationalSessionRequired, true);
  assert.deepEqual(byId["work-sessions"].capabilityIds, ["operational.work_sessions"]);
  assert.equal(byId.connectors.clients.web.state, "read_only");
  assert.equal(byId.connectors.webOperationalSessionRequired, false);
  assert.deepEqual(
    document.surfaces.filter((surface) => surface.clients.web.state === "local_only").map((surface) => surface.id),
    ["runtime"],
  );
  assert.deepEqual(
    document.surfaces.filter((surface) => surface.clients.web.state === "unavailable").map((surface) => surface.id),
    ["data-platform", "storage", "cloud", "team", "security", "government"],
  );
  assert.equal(byId.governance.clients.web.state, "read_only");
  assert.deepEqual(
    byId.governance.modules
      .filter((module) => module.clients.web.state === "read_only")
      .map((module) => module.moduleId),
    ["governance.readiness-diagnostics", "governance.authority-diagnostics"],
  );
  assert.equal(byId["data-platform"].clients.desktop.state, "unavailable");
  assert.equal(byId.providers.clients.desktop.state, "read_only");
  assert.equal(byId.providers.clients.desktop.route, "/providers");
  assert.equal(byId["executive-views"].clients.desktop.state, "read_only");
  assert.equal(byId.documents.clients.desktop.state, "functional");
  assert.equal(byId.voice.clients.desktop.state, "functional");
  assert.equal(byId["work-sessions"].clients.desktop.state, "functional");
});

test("both navigation layers and every web route consume the canonical registry", async () => {
  const [app, navigation] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(navigationPath, "utf8"),
  ]);
  assert.match(app, /NEXUS_WEB_SURFACES\.map/);
  assert.match(app, /NEXUS_SURFACE_GROUPS\.map/);
  assert.match(app, /SurfaceAvailabilityBoundary/);
  assert.match(app, /ConnectorDiagnosticsWorkspace/);
  assert.match(app, /WorkSessionsWorkspace/);
  assert.match(navigation, /NEXUS_EXECUTIVE_SURFACES\.map/);
  assert.doesNotMatch(app, /const AREAS: Area\[\] = \[/);
});

test("Mission planning and step execution no longer substitute Conclave or reject hosted mode", async () => {
  const [client, dashboard, workSessions] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(missionDashboardPath, "utf8"),
    readFile(workSessionsPath, "utf8"),
  ]);
  const plan = client.match(/planMission:[\s\S]*?executeMissionStep:/)?.[0] ?? "";
  const execute = client.match(/executeMissionStep:[\s\S]*?conclaveWorkspaces:/)?.[0] ?? "";
  assert.match(plan, /"\/missions\/plan"/);
  assert.doesNotMatch(plan, /conclave\/workspaces/);
  assert.match(execute, /\/execute-step/);
  assert.doesNotMatch(execute, /Promise\.reject|Hosted Mission execution is unavailable/);
  assert.match(dashboard, /localNexusClient\.planMission/);
  assert.match(dashboard, /localNexusClient\.executeMissionStep/);
  assert.match(dashboard, /hostedMissionScope/);
  assert.match(dashboard, /operations:write/);
  assert.match(dashboard, /=== "mission_executor"/);
  assert.doesNotMatch(dashboard, /=== "operational\.missions"/);
  assert.doesNotMatch(
    dashboard,
    /New Conclave mission|Start canonical Conclave mission|governed execution route unavailable/,
  );
  assert.match(workSessions, /object\(response\.receipt\)/);
  assert.match(workSessions, /No receipt is recorded for/);
  assert.match(workSessions, /setReceipt\(null\)/);
  assert.match(workSessions, /const terminal = new Set/);
  assert.match(workSessions, /disabled=\{!canStep\}/);
  assert.match(workSessions, /disabled=\{!canContinue\}/);
  assert.match(workSessions, /disabled=\{!canPause\}/);
  assert.match(workSessions, /disabled=\{!canCancel\}/);
});
