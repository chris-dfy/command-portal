import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  canonicalBrowserMutationRoute,
  createPortalServer,
  retiredInteractionRoute,
} from "../server/portal-server.mjs";

const mutationClients = [
  "intakeUpload",
  "intakeQuery",
  "projectCreate",
  "projectCompile",
  "executeMissionStep",
  "createConclaveWorkspace",
  "runConclaveWorkspace",
  "admitConclaveEvidence",
  "startWorkSession",
  "controlWorkSession",
  "createRuntimeAdmission",
  "cancelRuntimeAdmission",
  "reissueRuntimeAdmissionChallenge",
  "knowledgeIntake",
  "createKnowledgePromotionCandidate",
  "establishRuntimeBaseline",
  "promoteKnowledge",
];

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

test("the browser source tree exposes one action adapter and no domain mutation client", async () => {
  const files = await sourceFiles(fileURLToPath(new URL("../src", import.meta.url)));
  const entries = await Promise.all(files.map(async (path) => [path, await readFile(path, "utf8")]));
  const combined = entries.map(([, source]) => source).join("\n");
  for (const client of mutationClients) {
    assert.doesNotMatch(combined, new RegExp(`localNexusClient\\.${client}\\b`), client);
  }
  for (const component of [
    "ProjectStudio.tsx",
    "DocumentIntake.tsx",
    "MissionDashboard.tsx",
    "WorkSessionsWorkspace.tsx",
    "ConclaveWorkspace.tsx",
    "KnowledgeWorkspace.tsx",
    "EdgeAdmissionWorkspace.tsx",
  ]) {
    const source = entries.find(([path]) => path.endsWith(component))?.[1] ?? "";
    assert.match(source, /admitCanonicalActionIntent\(/, component);
  }
  const localClient = await readFile(new URL("../src/lib/local-client.ts", import.meta.url), "utf8");
  const postCalls = [...localClient.matchAll(/\) => post<[^\n]+\n?\s*\(?(?:\n\s*)?([`\"])(.*?)\1/g)].map((match) => match[2]);
  assert.deepEqual(postCalls.filter((path) => !path.startsWith("/approvals/")), ["/executive-interactions"]);
  assert.match(await readFile(new URL("../src/lib/canonical-action-intent.ts", import.meta.url), "utf8"), /admitExecutiveInteraction\(/);
});

test("every public domain POST is tombstoned before an upstream can be called", async (t) => {
  let upstreamCalls = 0;
  const upstream = async () => {
    upstreamCalls += 1;
    throw new Error("A retired browser mutation reached an upstream.");
  };
  const server = createPortalServer({
    config: {
      port: 0,
      runtimeBaseUrl: "https://runtime.invalid",
      runtimeToken: "server-only-test-token",
    },
    runtimeFetch: upstream,
    localFetch: upstream,
    operationalFetch: upstream,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const routes = [
    "/api/local/intake/upload",
    "/api/local/intake/query",
    "/api/local/projects",
    "/api/local/projects/PROJECT-1/compile",
    "/api/local/missions/MISSION-1/execute-step",
    "/api/local/work-sessions/start",
    "/api/local/work-sessions/WORK-1/pause",
    "/api/local/conclave/workspaces",
    "/api/local/knowledge/intake",
    "/api/local/runtime-coordination/admissions",
    "/api/operations/intake/upload",
    "/api/operations/projects",
    "/api/operations/missions/MISSION-1/execute-step",
    "/api/operations/work-sessions/start",
    "/api/operations/conclave/workspaces/MISSION-1/run",
    "/api/operations/knowledge/promotions",
    "/api/operations/runtime/baselines",
    "/api/operations/runtime-coordination/admissions/ADMISSION-1/cancel",
  ];
  for (const route of routes) {
    assert.equal(retiredInteractionRoute(route, "POST"), true, route);
    const response = await fetch(`${base}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 410, route);
    assert.equal((await response.json()).error.code, "canonical_interaction_required", route);
  }
  assert.equal(upstreamCalls, 0);
});

test("the residual browser mutation exceptions are exact and bounded", () => {
  for (const route of [
    "/api/local/executive-interactions",
    "/api/operations/executive-interactions",
    "/api/local/approvals/APPROVAL-1/approve",
    "/api/local/approvals/APPROVAL-1/deny",
    "/api/operations/approvals/APPROVAL-1/approve",
    "/api/operations/approvals/APPROVAL-1/deny",
  ]) {
    assert.equal(canonicalBrowserMutationRoute(route, "POST"), true, route);
    assert.equal(retiredInteractionRoute(route, "POST"), false, route);
  }
  for (const transportOrIdentity of [
    "/api/runtime/realtime/call",
    "/api/session/login",
    "/api/session/logout",
    "/api/executive-session/login",
    "/api/executive-session/revoke",
    "/api/auth/logout",
  ]) {
    assert.equal(retiredInteractionRoute(transportOrIdentity, "POST"), false, transportOrIdentity);
  }
  for (const broadened of [
    "/api/local/executive-interactions/extra",
    "/api/operations/approvals/APPROVAL-1/approve/extra",
    "/api/operations/arbitrary",
  ]) {
    assert.equal(canonicalBrowserMutationRoute(broadened, "POST"), false, broadened);
    assert.equal(retiredInteractionRoute(broadened, "POST"), true, broadened);
  }
});
