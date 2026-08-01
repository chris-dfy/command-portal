import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScriptModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const lifecycle = await importTypeScriptModule("../src/lib/private-draft-operation.ts");

test("a captured transcript causes zero POSTs until the explicit action dispatches it", async () => {
  const editable = { transcript: "captured private words", source: "browser_speech" };
  const pending = lifecycle.snapshotPrivateDraftOperation(editable, "voice-stable-key");
  editable.transcript = "later composer contents";
  let postCalls = 0;

  assert.equal(postCalls, 0);
  assert.equal(pending.attempts, 0);
  assert.equal(pending.payload.transcript, "captured private words");

  const submitted = lifecycle.beginPrivateDraftAttempt(pending);
  await lifecycle.executeExplicitPrivateDraftAction(submitted, async (operation) => {
    postCalls += 1;
    assert.equal(operation.payload.transcript, "captured private words");
    return { accepted: true };
  });
  assert.equal(postCalls, 1);
  assert.equal(submitted.attempts, 1);
  assert.equal(submitted.idempotencyKey, "voice-stable-key");
});

test("ambiguous failure retains the private payload and key while retry advances only the attempt", () => {
  const staged = lifecycle.snapshotPrivateDraftOperation(
    { claim: "private evidence draft", artifacts: ["artifact-1"] },
    "evidence-stable-key",
  );
  const firstAttempt = lifecycle.beginPrivateDraftAttempt(staged);
  const retained = lifecycle.retainPrivateDraftAfterFailure(firstAttempt);
  const retry = lifecycle.beginPrivateDraftAttempt(retained);
  const secondRetained = lifecycle.retainPrivateDraftAfterFailure(retry);
  const secondRetry = lifecycle.beginPrivateDraftAttempt(secondRetained);

  let presentationCount = 0;
  for (const operation of [staged, firstAttempt, retry, secondRetry]) {
    if (lifecycle.shouldPresentPrivateDraft(operation, false)) presentationCount += 1;
  }

  assert.equal(retained, firstAttempt);
  assert.equal(lifecycle.shouldPresentPrivateDraft(staged, false), true);
  assert.equal(lifecycle.shouldPresentPrivateDraft(firstAttempt, false), false);
  assert.equal(lifecycle.shouldPresentPrivateDraft(staged, true), false);
  assert.deepEqual(retry.payload, staged.payload);
  assert.equal(retry.idempotencyKey, staged.idempotencyKey);
  assert.equal(retry.attempts, 2);
  assert.equal(secondRetry.idempotencyKey, staged.idempotencyKey);
  assert.equal(secondRetry.attempts, 3);
  assert.equal(presentationCount, 1);
  assert.equal(lifecycle.clearPrivateDraftAfterSuccess(), null);
});
