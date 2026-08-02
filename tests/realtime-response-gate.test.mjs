import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/realtime-narration-response-gate.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { NEXUS_NARRATION_CORRELATION_METADATA_KEY, RealtimeNarrationResponseGate } = await import(moduleUrl);

const correlation = "nexus-narration-12345678-1234-4234-9234-123456789abc";

test("Realtime narration gate authorizes only the response that echoes the exact correlation", () => {
  const gate = new RealtimeNarrationResponseGate();
  gate.begin(correlation);

  assert.deepEqual(gate.authorize({
    id: "resp_automatic",
    metadata: { [NEXUS_NARRATION_CORRELATION_METADATA_KEY]: `${correlation}-wrong` },
  }), { authorized: false, responseId: "resp_automatic" });
  assert.equal(gate.activeResponse(), null);

  assert.deepEqual(gate.authorize({
    id: "resp_governed",
    metadata: { [NEXUS_NARRATION_CORRELATION_METADATA_KEY]: correlation },
  }), { authorized: true, responseId: "resp_governed" });
  assert.equal(gate.allows("resp_governed"), true);
  assert.equal(gate.allows("resp_automatic"), false);
});

test("Realtime narration gate cannot be consumed by event order or a second pending request", () => {
  const gate = new RealtimeNarrationResponseGate();
  gate.begin(correlation);
  assert.throws(() => gate.begin(`${correlation}-second`), /already pending or active/);
  assert.deepEqual(gate.authorize({ id: "resp_missing_metadata" }), {
    authorized: false,
    responseId: "resp_missing_metadata",
  });
  assert.equal(gate.hasPendingResponse(), true);
});

test("Realtime narration gate closes on exact completion and resets pending or active state", () => {
  const gate = new RealtimeNarrationResponseGate();
  gate.begin(correlation);
  gate.authorize({
    id: "resp_governed",
    metadata: { [NEXUS_NARRATION_CORRELATION_METADATA_KEY]: correlation },
  });
  assert.equal(gate.complete("resp_other"), false);
  assert.equal(gate.activeResponse(), "resp_governed");
  assert.equal(gate.complete("resp_governed"), true);
  assert.equal(gate.activeResponse(), null);

  gate.begin(`${correlation}-pending`);
  assert.equal(gate.reset(), null);
  assert.equal(gate.hasPendingResponse(), false);
});

test("Realtime narration gate rejects malformed response and correlation identifiers", () => {
  const gate = new RealtimeNarrationResponseGate();
  assert.throws(() => gate.begin("short"), /Invalid narration correlation/);
  gate.begin(correlation);
  assert.deepEqual(gate.authorize({
    id: "invalid response id",
    metadata: { [NEXUS_NARRATION_CORRELATION_METADATA_KEY]: correlation },
  }), { authorized: false, responseId: null });
});
