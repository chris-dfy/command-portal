import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/operational-replay-presentation.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const presentation = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const stage = (overrides = {}) => ({
  id: "task-started-task-6499d5db-9770-45a5-a452-09ecf34d03a7",
  contractStage: "task-started",
  label: "task_started",
  whatChanged: "Task task-6499d5db-9770-45a5-a452-09ecf34d03a7 entered in progress.",
  whyChanged: "Dependencies were satisfied.",
  inputs: [],
  outputs: [{
    id: "task-6499d5db-9770-45a5-a452-09ecf34d03a7",
    type: "mission_task",
  }],
  evidence: [],
  artifacts: [],
  ...overrides,
});

test("scheduling stages use a human headline and keep raw identity secondary", () => {
  const result = presentation.presentHostedReplayStage(stage(), 30);
  assert.equal(result.title, "Task state changed");
  assert.equal(result.headline, "Task entered the in-progress state.");
  assert.equal(result.recordId, "task-6499d5db-9770-45a5-a452-09ecf34d03a7");
  assert.doesNotMatch(result.headline, /6499d5db/);
});

test("generic Runtime changes remove raw record and UUID identifiers", () => {
  const result = presentation.presentHostedReplayStage(stage({
    id: "review-recorded",
    contractStage: "review-recorded",
    label: "review_recorded",
    whatChanged: "Receipt receipt-1234567890abcdef and 6499d5db-9770-45a5-a452-09ecf34d03a7 were recorded.",
  }), 30);
  assert.doesNotMatch(result.headline, /receipt-1234567890abcdef|6499d5db/);
  assert.match(result.headline, /recorded item/i);
});

test("zero metric walls collapse while populated facts remain", () => {
  assert.deepEqual(
    presentation.positiveHostedReplayFacts(stage({ outputs: [] })),
    [],
  );
  assert.deepEqual(
    presentation.positiveHostedReplayFacts(stage({
      evidence: ["evidence-1"],
      artifacts: ["receipt-1"],
    })),
    [
      { label: "Evidence", value: 1 },
      { label: "Outputs", value: 1 },
      { label: "Artifacts", value: 1 },
    ],
  );
});

test("long record identities render as compact secondary references", () => {
  assert.equal(
    presentation.compactReplayReference(
      "task-6499d5db-9770-45a5-a452-09ecf34d03a7",
    ),
    "task · …f34d03a7",
  );
});
