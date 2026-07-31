import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const sourceUrl = new URL(
  "../src/lib/conclave-request-identity.ts",
  import.meta.url,
);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const identity = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("a lost create response retains one proposal-bound request identity", () => {
  let identities = 0;
  const createIdentity = () => `identity-${++identities}`;
  const pending = identity.resolvePendingConclaveCreate(
    null,
    "  Investigate the evidence boundary.  ",
    createIdentity,
  );
  const retried = identity.resolvePendingConclaveCreate(
    pending,
    "Investigate the evidence boundary.",
    createIdentity,
  );
  assert.deepEqual(retried, pending);
  assert.equal(identities, 1);
  assert.match(pending.idempotencyKey, /^conclave-create-/);
});

test("a changed proposal receives a distinct create identity", () => {
  let identities = 0;
  const createIdentity = () => `identity-${++identities}`;
  const first = identity.resolvePendingConclaveCreate(
    null,
    "Investigate alpha.",
    createIdentity,
  );
  const second = identity.resolvePendingConclaveCreate(
    first,
    "Investigate beta.",
    createIdentity,
  );
  assert.notEqual(second.idempotencyKey, first.idempotencyKey);
  assert.equal(identities, 2);
});

test("a preexisting canonical v2 investigation resumes with a stable run identity", () => {
  const version = `sha256:${"c".repeat(64)}`;
  const workspace = {
    schemaVersion: "nexus.conclave-workspace@2.0.0",
    workspaceVersion: version,
    lifecyclePosture: "canonical_operational",
    reviewCompleted: false,
    availableActions: ["run"],
  };
  const first = identity.recoverableConclaveRun(workspace);
  const refreshed = identity.recoverableConclaveRun({ ...workspace });
  assert.deepEqual(refreshed, first);
  assert.equal(first.runPending, true);
  assert.equal(first.expectedWorkspaceVersion, version);
  assert.equal(first.runIdempotencyKey, `conclave-run-${"c".repeat(64)}`);
});

test("completed, legacy, unavailable, and malformed workspaces do not become runnable", () => {
  const canonical = {
    schemaVersion: "nexus.conclave-workspace@2.0.0",
    workspaceVersion: `sha256:${"d".repeat(64)}`,
    lifecyclePosture: "canonical_operational",
    reviewCompleted: false,
    availableActions: ["run"],
  };
  for (const workspace of [
    { ...canonical, reviewCompleted: true },
    { ...canonical, lifecyclePosture: "legacy_read_only", availableActions: ["restart_canonical"] },
    { ...canonical, availableActions: [] },
  ]) {
    assert.equal(identity.recoverableConclaveRun(workspace).runPending, false);
  }
  assert.throws(
    () => identity.stableConclaveRunIdempotencyKey("not-a-workspace-version"),
    /exact sha256 workspace version/,
  );
});
