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

test("Project drafts clear before Runtime submission while project context remains selected", async () => {
  const source = await read("../src/components/ProjectStudio.tsx");
  assertOrder(source, [
    "const submittedName = projectName.trim()",
    'setProjectName("")',
    "await localNexusClient.projectCreate(submittedName)",
  ]);
  assertOrder(source, [
    "const submittedWeeks = weeks",
    'setWeeks("")',
    'setAssumption("")',
    "await localNexusClient.projectCompile(submittedProjectId",
  ]);
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
    "await startConclaveInvestigation(",
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
    "await localNexusClient.admitConclaveEvidence(",
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
    "operation = {",
    "setPendingIntake(operation)",
    'setIntakeOrigin("")',
    'setIntakeClaim("")',
    "await localNexusClient.knowledgeIntake(operation.payload, operation.idempotencyKey)",
  ]);
  assert.match(intake, /let operation = pendingIntake/);
  assert.match(intake, /catch \(caught\)[\s\S]*Knowledge intake failed safely/);
  assert.match(source, /pendingIntake \? "Retry exact Evidence admission"/);
  assert.doesNotMatch(source, /value=\{pendingIntake[^}]*\}/);
  assert.match(source, /value=\{intakeClaim\}[\s\S]{0,300}autoComplete="off"/);
});

test("Edge admission snapshots exact intent and key before clearing transient operational text", async () => {
  const source = await read("../src/components/EdgeAdmissionWorkspace.tsx");
  const creation = source.slice(source.indexOf("async function createAdmission"), source.indexOf("async function mutateAdmission"));
  assertOrder(creation, [
    "const operation = pendingCreate ?? {",
    "setPendingCreate(operation)",
    "setForm({",
    "await localNexusClient.createRuntimeAdmission(operation.payload, operation.idempotencyKey)",
  ]);
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
    source.indexOf("onAssistantTranscript:"),
  );
  assert.doesNotMatch(userTranscript, /setTranscript/);
  assert.match(userTranscript, /setHistory/);
  assertOrder(source, [
    "async function routeGovernedTranscript(",
    'setTranscript("")',
    "await runBoundedTask(",
    "localNexusClient.routeTranscript(",
  ]);
  const browserMicrophone = source.slice(
    source.indexOf("async function useBrowserMicrophone"),
    source.indexOf("return <div"),
  );
  assert.doesNotMatch(browserMicrophone, /setTranscript\(captured\)/);
  assert.match(source, /historyAlreadyRecorded = false/);
  assert.match(source, /setPendingRequest\(operation\)[\s\S]*setTranscript\(""\)/);
  assert.match(source, /operation\.idempotencyKey/);
  assert.match(source, /pendingRequest && <button[\s\S]*Retry exact governed request/);
  assert.doesNotMatch(source, /value=\{pendingRequest[^}]*\}/);
  assert.match(source, /value=\{transcript\}[\s\S]{0,300}autoComplete="off"/);
});

test("Document and Work Session submissions consume transient drafts", async () => {
  const [documents, workSessions] = await Promise.all([
    read("../src/components/DocumentIntake.tsx"),
    read("../src/components/WorkSessionsWorkspace.tsx"),
  ]);
  assertOrder(documents, [
    "const submittedQuestion = question.trim()",
    'setQuestion("")',
    "await localNexusClient.intakeQuery(submittedQuestion",
  ]);
  assert.match(documents, /value=\{question\}[\s\S]{0,300}autoComplete="off"/);

  assertOrder(workSessions, [
    "const submittedObjective = objective.trim()",
    'setObjective("")',
    "await run(() => operation(submittedObjective))",
  ]);
  assert.match(workSessions, /planWorkSession\(submittedObjective\)/);
  assert.match(workSessions, /startWorkSession\(submittedObjective\)/);
  assert.match(workSessions, /value=\{objective\}[\s\S]{0,400}autoComplete="off"/);
});

test("both Mission entry points clear before canonical planning", async () => {
  for (const path of [
    "../src/components/MissionDashboard.tsx",
    "../src/components/OperationsWorkspace.tsx",
  ]) {
    const source = await read(path);
    assertOrder(source, [
      "const submittedObjective = objective.trim()",
      'setObjective("")',
      "await localNexusClient.planMission(submittedObjective)",
    ]);
    assert.match(source, /value=\{objective\}[\s\S]{0,300}autoComplete="off"/);
  }
});

test("Copilot remains the reference pattern: clear draft, retain message history", async () => {
  const source = await read("../src/components/NexusCopilot.tsx");
  assertOrder(source, [
    "const request = text.trim()",
    'setInput("")',
    "setMessages((items) => [...items, { speaker: \"operator\", text: request }])",
    "await hifClient.start(request",
  ]);
  assert.equal(source.includes("sessionStorage"), false);
  assert.equal((source.match(/localStorage/g) ?? []).length, 2);
  assert.match(source, /introductionKey/);
  assert.match(source, /aria-label="Ask NEXUS" autoComplete="off"/);
});
