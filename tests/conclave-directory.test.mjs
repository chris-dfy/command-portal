import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/conclave-directory.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const directory = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const workspace = (overrides = {}) => ({
  missionId: "MISSION-ACTIVE",
  proposal: "Investigate the current evidence.",
  lifecyclePosture: "canonical_operational",
  displayStatus: "investigation_running",
  reviewCompleted: false,
  reviewIntegrityVerified: false,
  terminalReceiptVerified: false,
  executiveSummary: null,
  completionReceipt: null,
  runReceipt: null,
  evidence: [],
  ...overrides,
});

test("verified canonical Review results outrank active and legacy records", () => {
  const legacy = workspace({
    missionId: "MISSION-LEGACY",
    proposal: "Old prompt with no result.",
    lifecyclePosture: "legacy_read_only",
    displayStatus: "legacy_read_only",
  });
  const active = workspace();
  const result = workspace({
    missionId: "MISSION-RESULT",
    proposal: "Completed evidence-backed Review.",
    displayStatus: "completed",
    reviewCompleted: true,
    reviewIntegrityVerified: true,
    terminalReceiptVerified: true,
    completionReceipt: { receiptId: "RECEIPT-001" },
    evidence: [{ evidence_id: "EVIDENCE-001" }],
  });

  assert.equal(directory.defaultConclaveWorkspace([legacy, active, result]), result);
  assert.deepEqual(
    directory.orderConclaveDirectory([legacy, active, result]).map((item) => item.missionId),
    ["MISSION-RESULT", "MISSION-ACTIVE", "MISSION-LEGACY"],
  );
  assert.match(directory.conclaveDirectoryLabel(result), /^Verified Review result/);
});

test("zero-Evidence legacy prompts remain visible but never become the default result", () => {
  const first = workspace({
    missionId: "MISSION-LEGACY-1",
    proposal: "Historical prompt one.",
    lifecyclePosture: "legacy_read_only",
    displayStatus: "legacy_read_only",
  });
  const second = workspace({
    missionId: "MISSION-LEGACY-2",
    proposal: "Historical prompt two.",
    lifecyclePosture: "legacy_read_only",
    displayStatus: "legacy_read_only",
  });

  assert.equal(directory.defaultConclaveWorkspace([first, second]), null);
  assert.equal(directory.isLegacyPromptOnly(first), true);
  assert.match(directory.conclaveDirectoryLabel(first), /^Legacy prompt only — zero Evidence/);
  assert.equal(directory.orderConclaveDirectory([first, second]).length, 2);
});

test("an incomplete or receipt-less completion cannot masquerade as a Review result", () => {
  const unverified = workspace({
    missionId: "MISSION-UNVERIFIED",
    displayStatus: "completed",
    reviewCompleted: true,
    reviewIntegrityVerified: true,
    terminalReceiptVerified: true,
    evidence: [{ evidence_id: "EVIDENCE-001" }],
  });

  assert.equal(directory.isVerifiedCanonicalReview(unverified), false);
  assert.equal(
    directory.conclaveDirectoryDisposition(unverified),
    "canonical_review_unverified",
  );
  assert.equal(directory.defaultConclaveWorkspace([unverified]), null);
});
