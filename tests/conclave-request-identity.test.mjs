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
    { proposal: "  Investigate the evidence boundary.  " },
    createIdentity,
  );
  const retried = identity.resolvePendingConclaveCreate(
    pending,
    { proposal: "Investigate the evidence boundary." },
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
    { proposal: "Investigate alpha." },
    createIdentity,
  );
  const second = identity.resolvePendingConclaveCreate(
    first,
    { proposal: "Investigate beta." },
    createIdentity,
  );
  assert.notEqual(second.idempotencyKey, first.idempotencyKey);
  assert.equal(identities, 2);
});

test("a restart create identity is bound to the complete immutable predecessor", () => {
  let identities = 0;
  const createIdentity = () => `restart-${++identities}`;
  const predecessor = {
    missionId: "MISSION-LEGACY-001",
    workspaceId: "WORKSPACE-LEGACY-001",
    workspaceVersion: `sha256:${"a".repeat(64)}`,
  };
  const pending = identity.resolvePendingConclaveCreate(
    null,
    { proposal: "Re-run the preserved investigation.", predecessor },
    createIdentity,
  );
  const repeated = identity.resolvePendingConclaveCreate(
    pending,
    {
      proposal: "Re-run the preserved investigation.",
      predecessor: { ...predecessor },
    },
    createIdentity,
  );
  assert.deepEqual(repeated, pending);
  for (const changedPredecessor of [
    { ...predecessor, missionId: "MISSION-LEGACY-002" },
    { ...predecessor, workspaceId: "WORKSPACE-LEGACY-002" },
    { ...predecessor, workspaceVersion: `sha256:${"b".repeat(64)}` },
  ]) {
    const changed = identity.resolvePendingConclaveCreate(
      pending,
      {
        proposal: "Re-run the preserved investigation.",
        predecessor: changedPredecessor,
      },
      createIdentity,
    );
    assert.notEqual(changed.idempotencyKey, pending.idempotencyKey);
  }
  assert.equal(identities, 4);
  assert.throws(
    () => identity.resolvePendingConclaveCreate(
      null,
      {
        proposal: "Invalid restart.",
        predecessor: { ...predecessor, workspaceVersion: "not-a-digest" },
      },
      createIdentity,
    ),
    /exact sha256 workspace version/,
  );
});

test("Evidence retries retain one request identity and payload changes receive another", () => {
  let identities = 0;
  const createIdentity = () => `evidence-${++identities}`;
  const evidence = {
    origin: " runtime://edge/observation-001 ",
    sourceClassification: "tenant_knowledge",
    confidence: 0.91,
    claim: " A bounded observation was admitted. ",
    supportingArtifacts: [" observation-001 "],
    relationships: [" supports "],
    operationalContext: { controlAttempted: false, node: "edge-1" },
  };
  const pending = identity.resolvePendingConclaveEvidenceAdmission(
    null,
    "MISSION-001",
    "TASK-001",
    evidence,
    createIdentity,
  );
  const repeated = identity.resolvePendingConclaveEvidenceAdmission(
    pending,
    "MISSION-001",
    "TASK-001",
    {
      ...evidence,
      operationalContext: { node: "edge-1", controlAttempted: false },
    },
    createIdentity,
  );
  assert.deepEqual(repeated, pending);
  assert.equal(pending.evidence.origin, "runtime://edge/observation-001");
  assert.equal(pending.evidence.claim, "A bounded observation was admitted.");
  const changed = identity.resolvePendingConclaveEvidenceAdmission(
    pending,
    "MISSION-001",
    "TASK-001",
    { ...evidence, claim: "A materially different claim." },
    createIdentity,
  );
  assert.notEqual(changed.idempotencyKey, pending.idempotencyKey);
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

test("canonical incomplete run identity survives action-unavailable refresh while completed and legacy records do not become pending", () => {
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
  ]) {
    assert.equal(identity.recoverableConclaveRun(workspace).runPending, false);
  }
  const actionUnavailableRefresh = identity.recoverableConclaveRun({
    ...canonical,
    availableActions: [],
  });
  assert.equal(actionUnavailableRefresh.runPending, true);
  assert.equal(actionUnavailableRefresh.runIdempotencyKey, `conclave-run-${"d".repeat(64)}`);
  assert.throws(
    () => identity.stableConclaveRunIdempotencyKey("not-a-workspace-version"),
    /exact sha256 workspace version/,
  );
});
