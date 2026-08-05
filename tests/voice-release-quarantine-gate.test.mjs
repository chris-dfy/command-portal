import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the exact browser and Gateway release remain directly quarantined", async () => {
  const [client, gateway, workspace, copilot] = await Promise.all([
    read("src/lib/realtime-voice-client.ts"),
    read("server/portal-server.mjs"),
    read("src/components/VoiceWorkspace.tsx"),
    read("src/components/NexusCopilot.tsx"),
  ]);

  assert.match(client, /COMMAND_PORTAL_REALTIME_PROFILE = "continuity_only"/);
  assert.match(client, /COMMAND_PORTAL_PROVES_FULL_DUPLEX_READINESS = false/);
  assert.match(client, /COMMAND_PORTAL_REALTIME_QUARANTINE_CODE = "realtime_voice_quarantined"/);
  const connect = client.slice(client.indexOf("  async connect()"), client.indexOf("\n  stop()", client.indexOf("  async connect()")));
  assert.ok(connect.indexOf("commandPortalRealtimeActivationAllowed()") < connect.indexOf("RealtimeVoiceClient.supported()"));
  assert.ok(connect.indexOf("commandPortalRealtimeActivationAllowed()") < connect.indexOf("navigator.mediaDevices.getUserMedia"));
  assert.ok(connect.indexOf("commandPortalRealtimeActivationAllowed()") < connect.indexOf('fetch("/api/runtime/realtime-voice"'));
  assert.ok(connect.indexOf("commandPortalRealtimeActivationAllowed()") < connect.indexOf('fetch("/api/runtime/realtime/call"'));

  assert.match(gateway, /COMMAND_PORTAL_REALTIME_PROFILE = "continuity_only"/);
  assert.match(gateway, /COMMAND_PORTAL_PROVES_FULL_DUPLEX_READINESS = false/);
  const handler = gateway.slice(gateway.indexOf("async function handleRealtimeCall"), gateway.indexOf("\nasync function fetchWithRetry", gateway.indexOf("async function handleRealtimeCall")));
  assert.match(handler, /boundedGatewayRequestId\(request\)/);
  assert.match(handler, /sendJson\(response, 503/);
  assert.match(handler, /code: COMMAND_PORTAL_REALTIME_QUARANTINE_CODE/);
  assert.match(handler, /activationAllowed: false/);
  assert.match(handler, /connectionState: "unavailable"/);
  assert.doesNotMatch(handler, /runtimeFetch|operationalFetch|fetch\(/);

  for (const surface of [workspace, copilot]) {
    assert.match(surface, /COMMAND_PORTAL_REALTIME_QUARANTINE_MESSAGE/);
    assert.doesNotMatch(surface, /RealtimeVoiceClient|Live Voice Active|Start live/);
  }
});

test("main and release subjects are blocked on the quarantine and exact-artifact gates", async () => {
  const [corrective, release] = await Promise.all([
    read(".github/workflows/experience-corrective-gate.yml"),
    read(".github/workflows/nexus-release-attestation.yml"),
  ]);

  assert.match(corrective, /push:\n\s+branches:\n\s+- main\n\s+- "codex\/\*\*"/);
  assert.match(release, /pull_request:\n\s+branches:\n\s+- main/);
  assert.match(release, /push:\n\s+branches:\n\s+- main/);
  assert.doesNotMatch(release, /codex\/command-portal-direct-voice-quarantine/);
  assert.match(release, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(release, /readFileSync\("dist\/index\.html"/);
  assert.match(release, /javascript: javascript\[0\]/);
  assert.match(release, /stylesheet: stylesheets\[0\]/);
  assert.match(release, /releaseDigest: "sha256:212678643019c07c38d11c6abf4b4810fb87b5b8cf543b6ccdc958dcb9bdaffa"/);
  assert.match(release, /profile: "continuity_only"/);
  assert.match(release, /activationAllowed: false/);
  assert.match(release, /provesFullDuplexReadiness: false/);
  assert.match(release, /currentArtifactVoiceReceiptDigest: null/);
  assert.match(release, /deploymentPromotionEligible: false/);
  assert.match(release, /\.sourceLineage\.releaseCommit == \$source_commit/);
  assert.match(release, /\.sourceLineage\.releaseTree == \$source_tree/);
  assert.match(release, /\.attestation\.subjectDigest == \$subject_digest/);
  assert.match(release, /Tracked deployment receipt is historical and cannot attest/);
  assert.match(release, /\.voiceQuarantinePostconditions\.runtimeRealtimeCallCount == 0/);
  assert.match(release, /\.voiceQuarantinePostconditions\.liveVoiceActiveRendered == false/);
  assert.doesNotMatch(release, /replit\s+(?:deploy|publish)|curl[^\n]+api\.replit/i);
});
