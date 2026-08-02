import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("successful operational results expose proof, receipt, Mission, and Replay discovery", async () => {
  const [app, lineage, replay, mission, conclave, project, voice, workSessions, operations] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/OperationalResultLineage.tsx"),
    read("../src/components/OperationalReplay.tsx"),
    read("../src/components/MissionDashboard.tsx"),
    read("../src/components/ConclaveWorkspace.tsx"),
    read("../src/components/ProjectStudio.tsx"),
    read("../src/components/VoiceWorkspace.tsx"),
    read("../src/components/WorkSessionsWorkspace.tsx"),
    read("../src/components/OperationsWorkspace.tsx"),
  ]);

  assert.match(app, /const \[replayTarget, setReplayTarget\] = useState<OperationalReplayTarget>/);
  assert.match(app, /function openReplay\(target: OperationalReplayTarget\) \{ setReplayTarget\(target\); navigate\("replay"\); \}/);
  assert.match(app, /<OperationalReplay requestedTarget=\{replayTarget\}/);
  for (const mount of ["MissionDashboard", "ConclaveWorkspace", "OperationsWorkspace", "ProjectStudio", "VoiceWorkspace", "WorkSessionsWorkspace"]) {
    assert.match(app, new RegExp(`<${mount} onReplay=\\{openReplay\\}`));
  }

  assert.match(lineage, /replayId[\s\S]*\{ kind: "replay", id: replayId \}/);
  assert.match(lineage, /receiptId[\s\S]*\{ kind: "receipt", id: receiptId \}/);
  assert.match(lineage, /missionId[\s\S]*\{ kind: "mission", id: missionId \}/);
  assert.match(lineage, /aria-label="Operational result lineage"/);
  assert.match(lineage, /Open Operational Replay/);

  assert.match(replay, /requestedTarget\.kind === "mission"[\s\S]*operationalReplayForMission/);
  assert.match(replay, /requestedTarget\.kind === "receipt"[\s\S]*operationalReplayForReceipt/);
  assert.match(replay, /localNexusClient\.operationalReplay\(requestedTarget\.id\)/);
  assert.match(replay, /targetLoadSequenceRef/);
  assert.match(replay, /requestSequence !== targetLoadSequenceRef\.current/);
  assert.match(replay, /const retained = selected/);

  for (const source of [mission, conclave, project, voice, workSessions, operations]) {
    assert.match(source, /<OperationalResultLineage/);
  }
  assert.match(mission, /replayId=\{replayId\} receiptId=\{latestReceiptId\} missionId=/);
  assert.match(conclave, /receiptId=\{terminalReceiptReference\} replayId=\{workspace\.operationalReplay\.runId\} missionId=\{workspace\.missionId\}/);
  assert.match(project, /proofId=\{artifact\.proofId\} receiptId=\{artifact\.receiptId\}/);
  assert.match(voice, /proofId=\{resultProofId\} receiptId=\{resultReceiptId\}/);
  assert.match(workSessions, /proofId=\{resultProofId\} receiptId=\{resultReceiptId\}/);
  assert.match(operations, /receiptId=\{selectedReceiptId\} missionId=\{selectedMissionIdentity\}/);
});

test("new directory and lineage controls remain container-responsive and keyboard visible", async () => {
  const [styles, directory, lineage] = await Promise.all([
    read("../src/styles.css"),
    read("../src/components/HostedCommandDirectory.tsx"),
    read("../src/components/OperationalResultLineage.tsx"),
  ]);
  assert.match(styles, /\.hosted-command-directory \{[\s\S]*repeat\(auto-fit, minmax\(min\(100%, 15rem\), 1fr\)\)/);
  assert.match(styles, /\.operational-result-lineage dl \{[\s\S]*repeat\(auto-fit, minmax\(min\(100%, 11rem\), 1fr\)\)/);
  assert.match(styles, /\.operational-result-lineage code \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  assert.match(styles, /\.hosted-command-directory button:focus-visible/);
  assert.match(styles, /\.operational-result-lineage > button:focus-visible/);
  assert.match(styles, /@container portal-main \(max-width: 460px\)[\s\S]*\.operational-result-lineage > button \{ width: 100%; \}/);
  assert.doesNotMatch(styles, /\.operational-result-lineage[^}]*word-break:\s*break-all/);
  assert.match(directory, /This module is a read-only directory/);
  assert.match(directory, /every destination admits its own exact action/);
  assert.match(lineage, /<code title=\{reference\.value\}>/);
});

test("Voice distinguishes provider-backed live availability from governed fallback", async () => {
  const [voice, client, admission] = await Promise.all([
    read("../src/components/VoiceWorkspace.tsx"),
    read("../src/lib/local-client.ts"),
    read("../src/lib/runtime-voice-admission.ts"),
  ]);
  assert.match(voice, /const manualCommitVerified = isVerifiedManualCommitStatus\(status\)[\s\S]*const liveProviderAvailable = realtimeAction\.available[\s\S]*supported[\s\S]*manualCommitVerified/);
  assert.match(voice, /Client turn detection · manual audio commit/);
  assert.match(voice, /Live voice unavailable/);
  assert.match(voice, /<dt>Realtime provider<\/dt>/);
  assert.match(voice, /<dt>Browser capture<\/dt>/);
  assert.match(voice, /<dt>Governed fallback<\/dt>/);
  assert.match(voice, /\["listening", "thinking", "speaking", "interrupted"\]\.includes\(voiceState\)/);
  assert.match(voice, /Retry exact governed Voice request/);
  assert.match(client, /newExecutiveInteractionId[\s\S]*globalThis\.crypto\.randomUUID\(\)/);
  assert.match(client, /executiveInteraction:[\s\S]*"\/executive-interactions"[\s\S]*interaction\.interaction_id/);
  assert.match(admission, /admitRuntimeVoiceTranscript[\s\S]*admitExecutiveInteraction\(transcript, "voice", sessionId, interactionId\)/);
  assert.doesNotMatch(client, /routeTranscript:|\/voice-operator\/route/);
});
