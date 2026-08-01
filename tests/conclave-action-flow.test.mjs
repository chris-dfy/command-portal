import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/conclave-action-flow.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const flow = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("Conclave create persists and selects a runnable workspace without dispatching run", async () => {
  let createCalls = 0;
  let runCalls = 0;
  const workspace = {
    missionId: "MISSION-CREATED",
    workspaceVersion: `sha256:${"a".repeat(64)}`,
    lifecyclePosture: "canonical_operational",
    reviewCompleted: false,
    availableActions: [],
  };
  const gates = flow.conclaveActionGates(true, false);
  const created = await flow.createConclaveWorkspaceOnly(
    { proposal: "Challenge the evidence." },
    "create-key",
    async (request, key) => {
      createCalls += 1;
      assert.deepEqual(request, { proposal: "Challenge the evidence." });
      assert.equal(key, "create-key");
      return workspace;
    },
    (durableWorkspace) => ({
      workspace: durableWorkspace,
      ...flow.createdConclaveRunIdentity(
        durableWorkspace,
        `conclave-run-${"a".repeat(64)}`,
      ),
    }),
  );

  assert.equal(createCalls, 1);
  assert.equal(runCalls, 0);
  assert.deepEqual(gates, { createAllowed: true, runAllowed: false });
  assert.equal(created.workspace, workspace);
  assert.equal(created.runPending, true);
  assert.deepEqual(created.workspace.availableActions, []);

  const execute = async (missionId, expectedVersion, key) => {
    runCalls += 1;
    return { missionId, expectedVersion, key };
  };
  const first = await flow.invokeConclaveRun(created, execute);
  const retry = await flow.invokeConclaveRun(created, execute);
  assert.equal(runCalls, 2);
  assert.deepEqual(retry, first);
  assert.equal(retry.key, created.runIdempotencyKey);
  assert.equal(retry.expectedVersion, workspace.workspaceVersion);
});
