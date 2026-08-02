import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/runtime-admission-policy.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "runtime-admission-policy.ts",
}).outputText;
const policy = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("duplicate Realtime completions share one turn key and one upstream admission", async () => {
  const ledger = new policy.RealtimeTurnAdmissionLedger();
  const turnKey = ledger.beginTurn();
  assert.throws(
    () => ledger.beginTurn(),
    /cannot begin a new speech turn while the current turn is unresolved/,
  );
  assert.match(turnKey, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const observedKeys = [];
  let upstreamCalls = 0;
  const upstream = async (idempotencyKey) => {
    upstreamCalls += 1;
    observedKeys.push(idempotencyKey);
    await Promise.resolve();
    return { admitted: true, spokenSummary: "Runtime-owned result" };
  };

  const [first, duplicate] = await Promise.all([
    ledger.admit(turnKey, "publish the briefing", upstream),
    ledger.admit(turnKey, "publish the briefing", upstream),
  ]);

  assert.equal(upstreamCalls, 1);
  assert.deepEqual(observedKeys, [turnKey]);
  assert.equal([first, duplicate].filter((result) => result.duplicate).length, 1);
  assert.equal([first, duplicate].filter((result) => !result.duplicate).length, 1);

  const laterDuplicate = await ledger.admit(turnKey, "publish the briefing", upstream);
  assert.equal(laterDuplicate.duplicate, true);
  assert.equal(laterDuplicate.idempotencyKey, turnKey);
  assert.equal(upstreamCalls, 1);
});

test("ambiguous Realtime failure retries with the same key and conflicting text fails closed", async () => {
  const ledger = new policy.RealtimeTurnAdmissionLedger();
  const turnKey = ledger.beginTurn();
  const observedKeys = [];
  let attempts = 0;
  const flaky = async (idempotencyKey) => {
    attempts += 1;
    observedKeys.push(idempotencyKey);
    if (attempts === 1) throw new Error("ambiguous transport failure");
    return { admitted: true, spokenSummary: "Idempotent Runtime replay" };
  };

  await assert.rejects(ledger.admit(turnKey, "create the draft", flaky), /ambiguous transport failure/);
  await assert.rejects(
    ledger.admit(turnKey, "delete the draft", flaky),
    /conflicting transcripts/,
  );
  assert.equal(attempts, 1);

  const retry = await ledger.admit(turnKey, "create the draft", flaky);
  assert.equal(retry.duplicate, false);
  assert.equal(retry.idempotencyKey, turnKey);
  assert.deepEqual(observedKeys, [turnKey, turnKey]);

  await assert.rejects(
    ledger.admit(turnKey, "delete the draft", flaky),
    /conflicting transcripts/,
  );
  assert.equal(attempts, 2);
  ledger.endTurn();
  assert.notEqual(ledger.beginTurn(), turnKey);
});
