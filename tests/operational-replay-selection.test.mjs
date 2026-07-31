import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const sourceUrl = new URL(
  "../src/lib/operational-replay-selection.ts",
  import.meta.url,
);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const selection = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const detail = (replayId) => ({
  recordType: "nexus_operational_replay",
  schemaVersion: "nexus.operational-replay-api@1.0.0",
  replay: { run_id: replayId, stages: [] },
});
const events = (replayId) => ({
  recordType: "nexus_operational_replay_events",
  schemaVersion: "nexus.operational-replay-api@1.0.0",
  replayId,
  events: [],
});

test("late Replay A detail and events cannot replace selected Replay B", () => {
  assert.equal(selection.classifyOperationalReplayLoad({
    requestedReplayId: "replay-a",
    selectedReplayId: "replay-b",
    requestSequence: 1,
    activeRequestSequence: 2,
    detail: { fulfilled: true, value: detail("replay-a") },
    events: { fulfilled: true, value: events("replay-a") },
  }), "stale_request");
});

test("an older request for the same Replay cannot overwrite its newer refresh", () => {
  assert.equal(selection.classifyOperationalReplayLoad({
    requestedReplayId: "replay-b",
    selectedReplayId: "replay-b",
    requestSequence: 3,
    activeRequestSequence: 4,
    detail: { fulfilled: true, value: detail("replay-b") },
    events: { fulfilled: false },
  }), "stale_request");
});

test("detail and event contracts must both match the selected Replay", () => {
  assert.equal(selection.classifyOperationalReplayLoad({
    requestedReplayId: "replay-b",
    selectedReplayId: "replay-b",
    requestSequence: 5,
    activeRequestSequence: 5,
    detail: { fulfilled: true, value: detail("replay-b") },
    events: { fulfilled: true, value: events("replay-a") },
  }), "identity_mismatch");
});

test("a fulfilled malformed or conflicting Replay response fails closed", () => {
  for (const malformed of [
    undefined,
    { events: [] },
    {
      ...events("replay-b"),
      replay: { run_id: "replay-a" },
    },
  ]) {
    assert.equal(selection.classifyOperationalReplayLoad({
      requestedReplayId: "replay-b",
      selectedReplayId: "replay-b",
      requestSequence: 6,
      activeRequestSequence: 6,
      detail: { fulfilled: false },
      events: { fulfilled: true, value: malformed },
    }), "identity_mismatch");
  }
});

test("the exact selected Replay projection and events are current", () => {
  assert.equal(selection.classifyOperationalReplayLoad({
    requestedReplayId: "replay-b",
    selectedReplayId: "replay-b",
    requestSequence: 7,
    activeRequestSequence: 7,
    detail: { fulfilled: true, value: detail("replay-b") },
    events: { fulfilled: true, value: events("replay-b") },
  }), "current");
});

test("stage and explanation responses require exact Replay and stage identities", () => {
  const stage = {
    recordType: "nexus_operational_replay_stage",
    schemaVersion: "nexus.operational-replay-api@1.0.0",
    replayId: "replay-b",
    stage: { stage_id: "stage-2" },
  };
  const explanation = {
    recordType: "nexus_operational_replay_explanation",
    schemaVersion: "nexus.operational-replay-api@1.0.0",
    replayId: "replay-b",
    stageId: "stage-2",
  };
  assert.equal(selection.matchesOperationalReplayStage(stage, "replay-b", "stage-2"), true);
  assert.equal(selection.matchesOperationalReplayStage(stage, "replay-a", "stage-2"), false);
  assert.equal(selection.matchesOperationalReplayStage(stage, "replay-b", "stage-1"), false);
  assert.equal(selection.matchesOperationalReplayExplanation(explanation, "replay-b", "stage-2"), true);
  assert.equal(selection.matchesOperationalReplayExplanation(explanation, "replay-a", "stage-2"), false);
});

test("interleaved A success cannot replace selected B failure", async () => {
  let releaseA;
  let selectedReplayId = "replay-a";
  let activeRequestSequence = 0;
  let rendered = "initial";
  const aResponse = new Promise((resolve) => { releaseA = resolve; });

  async function apply(replayId, promise) {
    const requestSequence = ++activeRequestSequence;
    try {
      const value = await promise;
      const disposition = selection.classifyOperationalReplayLoad({
        requestedReplayId: replayId,
        selectedReplayId,
        requestSequence,
        activeRequestSequence,
        detail: { fulfilled: true, value },
        events: { fulfilled: false },
      });
      if (disposition === "current") rendered = replayId;
    } catch {
      if (
        replayId === selectedReplayId
        && requestSequence === activeRequestSequence
      ) rendered = `${replayId}:unavailable`;
    }
  }

  const pendingA = apply("replay-a", aResponse);
  selectedReplayId = "replay-b";
  const pendingB = apply("replay-b", Promise.reject(new Error("B failed")));
  await pendingB;
  releaseA(detail("replay-a"));
  await pendingA;
  assert.equal(rendered, "replay-b:unavailable");
});
