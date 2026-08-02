import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function assertOrder(source, labels) {
  let previous = -1;
  for (const label of labels) {
    const next = source.indexOf(label, previous + 1);
    assert.notEqual(next, -1, `missing ${label}`);
    assert.ok(next > previous, `${label} must follow the preceding draft-lifecycle step`);
    previous = next;
  }
}

test("Project drafts retain exact private retry operations while project context remains selected", async () => {
  const source = await read("../src/components/ProjectStudio.tsx");
  const create = source.slice(source.indexOf("async function create()"), source.indexOf("async function analyze()"));
  const compile = source.slice(source.indexOf("async function compile()"), source.indexOf("const range"));
  assertOrder(source, [
    "pendingCreate ?? snapshotPrivateDraftOperation(",
    'setProjectName("")',
    "beginPrivateDraftAttempt(staged)",
    "const admission = await admitCanonicalActionIntent(",
  ]);
  assertOrder(compile, [
    "pendingCompile ?? snapshotPrivateDraftOperation(",
    'setWeeks("")',
    'setAssumption("")',
    "beginPrivateDraftAttempt(staged)",
    "const admission = await admitCanonicalActionIntent(",
  ]);
  assert.match(create, /retainPrivateDraftAfterFailure\(operation\)/);
  assert.match(compile, /operation\.idempotencyKey[\s\S]*retainPrivateDraftAfterFailure\(operation\)/);
  assert.match(source, /Retry exact project creation/);
  assert.match(source, /Retry exact compile/);
  assert.doesNotMatch(source, /setProjectName\(project\.name\)/);
  assert.doesNotMatch(source, /setProjectId\(""\)/);
  assert.ok((source.match(/autoComplete="off"/g) ?? []).length >= 3);
});

test("Conclave clears the proposal without losing the exact pending retry identity", async () => {
  const source = await read("../src/components/ConclaveWorkspace.tsx");
  assert.match(source, /proposal\.trim\(\) \|\| pendingCreate\?\.proposal/);
  assertOrder(source, [
    "setPendingCreate(createIdentity)",
    'setProposal("")',
    "const admission = await admitCanonicalActionIntent(",
  ]);
  assert.match(source, /!proposal\.trim\(\) && !pendingCreate\?\.proposal/);
  assert.match(source, /id="conclave-proposal"[\s\S]{0,300}autoComplete="off"/);
});

test("Conclave Evidence clears transient fields and retries the private exact admission", async () => {
  const source = await read("../src/components/ConclaveWorkspace.tsx");
  const admission = source.slice(source.indexOf("async function admitEvidence"), source.indexOf("async function refreshWorkspace"));
  assertOrder(admission, [
    "admission = resolvePendingConclaveEvidenceAdmission(",
    "setPendingEvidence(admission)",
    'setEvidenceOrigin("")',
    'setEvidenceClaim("")',
    "const result = await admitCanonicalActionIntent(",
  ]);
  assert.match(admission, /pendingEvidence\?\.missionId === workspace\.missionId/);
  assert.match(admission, /admission\.idempotencyKey/);
  assert.match(admission, /catch \(caught\)[\s\S]*setError/);
  assert.match(source, /pendingEvidence \? "Retry exact Evidence admission"/);
  assert.doesNotMatch(source, /value=\{pendingEvidence[^}]*\}/);
  assert.ok((source.match(/autoComplete="off"/g) ?? []).length >= 6);
});

test("Knowledge intake snapshots payload and idempotency before clearing private retry drafts", async () => {
  const source = await read("../src/components/KnowledgeWorkspace.tsx");
  const intake = source.slice(source.indexOf("async function submitIntake"), source.indexOf("async function establishBaseline"));
  assertOrder(intake, [
    "staged = snapshotPrivateDraftOperation(",
    "setPendingIntake(staged)",
    'setIntakeOrigin("")',
    'setIntakeClaim("")',
    "const operation = beginPrivateDraftAttempt(staged)",
    "const admission = await admitCanonicalActionIntent(",
  ]);
  assert.match(intake, /let staged = pendingIntake/);
  assert.match(intake, /retainPrivateDraftAfterFailure\(operation\)/);
  assert.match(intake, /catch \(caught\)[\s\S]*Knowledge intake failed safely/);
  assert.match(source, /pendingIntake \? "Retry exact Evidence admission"/);
  assert.doesNotMatch(source, /value=\{pendingIntake[^}]*\}/);
  assert.match(source, /value=\{intakeClaim\}[\s\S]{0,300}autoComplete="off"/);
  const baseline = source.slice(source.indexOf("async function establishBaseline"), source.indexOf("async function createPromotionCandidate"));
  assertOrder(baseline, [
    "pendingBaseline ?? snapshotPrivateDraftOperation(",
    'setExpectedDeployedCommit("")',
    "beginPrivateDraftAttempt(staged)",
    "const admission = await admitCanonicalActionIntent(",
  ]);
  assert.match(baseline, /retainPrivateDraftAfterFailure\(operation\)/);
  assert.match(source, /Retry exact Runtime baseline/);
});

test("Edge admission snapshots exact intent and key before clearing transient operational text", async () => {
  const source = await read("../src/components/EdgeAdmissionWorkspace.tsx");
  const creation = source.slice(source.indexOf("async function createAdmission"), source.indexOf("async function mutateAdmission"));
  assertOrder(creation, [
    "const staged = pendingCreate ?? snapshotPrivateDraftOperation(",
    "setPendingCreate(staged)",
    "setForm({",
    "const operation = beginPrivateDraftAttempt(staged)",
    "const admission = await admitCanonicalActionIntent(",
  ]);
  assert.match(creation, /retainPrivateDraftAfterFailure\(operation\)/);
  assert.match(creation, /catch \(error\)[\s\S]*setActionError/);
  assert.match(source, /pendingCreate \? "Retry exact governed admission"/);
  assert.match(source, /submitted text will not be restored into editable fields/);
  assert.doesNotMatch(source, /value=\{pendingCreate[^}]*\}/);
  assert.ok((source.match(/autoComplete="off"/g) ?? []).length >= 7);
});

test("Voice keeps transcripts in history and never rehydrates the typed draft", async () => {
  const source = await read("../src/components/VoiceWorkspace.tsx");
  const userTranscript = source.slice(
    source.indexOf("onUserTranscript:"),
    source.indexOf("onError:", source.indexOf("onUserTranscript:")),
  );
  assert.doesNotMatch(userTranscript, /setTranscript/);
  assert.match(userTranscript, /setHistory/);
  assert.match(userTranscript, /admitRuntimeVoiceTranscript/);
  assertOrder(source, [
    "async function routeGovernedTranscript(",
    'setTranscript("")',
    "await executeExplicitPrivateDraftAction(",
    "admitRuntimeVoiceTranscript(",
  ]);
  const browserMicrophone = source.slice(
    source.indexOf("async function useBrowserMicrophone"),
    source.indexOf("return <div"),
  );
  assert.doesNotMatch(browserMicrophone, /setTranscript\(captured\)/);
  assert.match(source, /historyAlreadyRecorded = false/);
  assert.match(source, /setPendingRequest\(operation\)[\s\S]*if \(!retryRequest\) setTranscript\(""\)/);
  assert.match(source, /current\?\.attempts === 0 && current\.payload\.historyAlreadyRecorded \? current : null/);
  assert.match(source, /explicitOperation\.idempotencyKey/);
  assert.match(source, /executeExplicitPrivateDraftAction\(/);
  assert.match(source, /pendingRequest && <button[\s\S]*Send captured transcript through governed Voice/);
  assert.match(source, /retainPrivateDraftAfterFailure\(operation\)/);
  assert.match(source, /shouldPresentPrivateDraft\([\s\S]*staged\.payload\.historyAlreadyRecorded/);
  assert.match(source, /onError: \(errorMessage, context\) => \{[\s\S]*context\?\.retryProhibited[\s\S]*captured[\s\S]*snapshotPrivateDraftOperation/);
  assert.doesNotMatch(source, /onError: \(errorMessage, context\) => \{[\s\S]{0,900}void routeGovernedTranscript/);
  assert.doesNotMatch(source, /value=\{pendingRequest[^}]*\}/);
  assert.match(source, /value=\{transcript\}[\s\S]*autoComplete="off"/);
});

test("Document and Work Session submissions retain exact private retry operations", async () => {
  const [documents, workSessions] = await Promise.all([
    read("../src/components/DocumentIntake.tsx"),
    read("../src/components/WorkSessionsWorkspace.tsx"),
  ]);
  assertOrder(documents, [
    "pendingQuery ?? snapshotPrivateDraftOperation(",
    'setQuestion("")',
    "beginPrivateDraftAttempt(staged)",
    "const admission = await admitCanonicalActionIntent(",
  ]);
  assert.match(documents, /operation\.idempotencyKey[\s\S]*retainPrivateDraftAfterFailure\(operation\)/);
  assert.match(documents, /Retry exact source query/);
  assert.match(documents, /value=\{question\}[\s\S]{0,300}autoComplete="off"/);

  assertOrder(workSessions, [
    "matchingPending ?? snapshotPrivateDraftOperation(",
    'setObjective("")',
    "beginPrivateDraftAttempt(staged)",
    "const admission = await admitCanonicalActionIntent(",
  ]);
  assert.match(workSessions, /operation\.idempotencyKey/);
  assert.doesNotMatch(workSessions, /planWorkSession|\/work-sessions\/plan/);
  assert.doesNotMatch(workSessions, /startWorkSession|controlWorkSession/);
  assert.match(workSessions, /admitCanonicalActionIntent/);
  assert.match(workSessions, /retainPrivateDraftAfterFailure\(operation\)/);
  assert.match(workSessions, /Retry exact plan/);
  assert.match(workSessions, /Retry exact start/);
  assert.match(workSessions, /value=\{objective\}[\s\S]{0,400}autoComplete="off"/);
});

test("both Mission entry points retain exact private retry plans", async () => {
  for (const path of [
    "../src/components/MissionDashboard.tsx",
    "../src/components/OperationsWorkspace.tsx",
  ]) {
    const source = await read(path);
    assertOrder(source, [
      "pendingPlan ?? snapshotPrivateDraftOperation(",
      'setObjective("")',
      "beginPrivateDraftAttempt(staged)",
      "await admitExecutiveInteraction(",
    ]);
    assert.match(source, /conversationId\.current,[\s\S]*operation\.idempotencyKey/);
    assert.doesNotMatch(source, /localNexusClient\.planMission|"\/missions\/plan"/);
    assert.match(source, /retainPrivateDraftAfterFailure\(operation\)/);
    assert.match(source, /Retry exact [Mm]ission plan/);
    assert.match(source, /value=\{objective\}[\s\S]{0,300}autoComplete="off"/);
  }
});

test("Copilot clears its visible draft only after canonical Runtime acceptance", async () => {
  const source = await read("../src/components/NexusCopilot.tsx");
  assertOrder(source, [
    "const request = (text ?? input).trim()",
    "beginAcceptanceBoundDraft(input)",
    "await admitExecutiveInteraction(request",
    "presentAdmission(result)",
    "clearDraftAfterAcceptance(draftOperation)",
  ]);
  assert.match(source, /retainDraftAfterUnacceptedFailure\(draftOperation\)/);
  assert.match(source, /disabled=\{!interactionAction\.available \|\| busy \|\| Boolean\(pendingAskDraft\)\}/);
  const askFlow = source.slice(source.indexOf("async function ask("), source.indexOf("async function startVoice"));
  assert.doesNotMatch(askFlow, /idempotency|randomUUID/);
  assert.equal(source.includes("sessionStorage"), false);
  assert.equal((source.match(/localStorage/g) ?? []).length, 2);
  assert.match(source, /introductionKey/);
  assert.match(source, /aria-label="Ask NEXUS" autoComplete="off"/);
  assert.match(source, /onError: \(message, context\) => \{[\s\S]*context\?\.retryProhibited[\s\S]*captured[\s\S]*snapshotPrivateDraftOperation/);
  assert.doesNotMatch(source, /onError: \(message, context\) => \{[\s\S]{0,800}void routeGovernedVoice/);
  assert.match(source, /pendingVoiceRequest && <button[\s\S]*Send captured transcript through governed Voice/);
  assert.match(source, /explicitOperation\.idempotencyKey/);
  assert.match(source, /retainPrivateDraftAfterFailure\(operation\)/);
  assert.match(source, /shouldPresentPrivateDraft\([\s\S]*staged\.payload\.operatorAlreadyVisible/);
  assert.doesNotMatch(source, /setInput\(captured\)/);
  assert.doesNotMatch(source, /hifClient|\/api\/hif/);
});
