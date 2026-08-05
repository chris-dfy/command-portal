import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const surfaceRegistry = async () => JSON.parse(await read("../src/platform/surface-registry.json"));

test("status bar displays the independent Phase 5X-D health model", async () => {
  const source = await read("../src/components/ExecutiveStatusBar.tsx");
  for (const label of ["Gateway Health", "Runtime Health", "Provider Registry", "Environment", "Connection", "Version", "Diagnostics"]) {
    assert.match(source, new RegExp(`title: \\"${label}\\"`));
  }
  assert.match(source, /aria-label="Experience Gateway health model"/);
});

test("runtime health cards reflow without breaking status words", async () => {
  const styles = await read("../src/styles.css");
  assert.match(styles, /\.nx-runtime-ribbon \{[^}]*repeat\(auto-fit, minmax\(min\(100%, 11\.5rem\), 1fr\)\)[^}]*overflow-x: visible;[^}]*scroll-snap-type: none;/);
  for (const row of ["span", "strong", "small"]) {
    assert.match(styles, new RegExp(`\\.nx-runtime-ribbon__signal \\.nx-metric > ${row} \\{[^}]*overflow-wrap: normal;[^}]*word-break: normal;[^}]*hyphens: none;`));
  }
  assert.match(styles, /@container portal-main \(max-width: 1280px\) \{\s*\.nx-runtime-ribbon \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(styles, /\.nx-runtime-ribbon \{[^}]*repeat\(7, minmax\(128px, 1fr\)\)/);
});

test("the global shell exposes the persisted Dark Light System control", async () => {
  const [app, navigation, styles] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/platform/NexusExecutiveNavigation.tsx"),
    read("../src/platform/nexus-platform.css"),
  ]);
  assert.match(app, /colorMode=\{appearance\.settings\.colorMode\}/);
  assert.match(app, /onColorModeChange=\{\(colorMode\) => appearance\.updateSettings\(\{ colorMode \}\)\}/);
  assert.match(navigation, /aria-label="Color mode"/);
  for (const [value, label] of [["dark", "Dark"], ["light", "Light"], ["system", "System"]]) {
    assert.match(navigation, new RegExp(`<option value="${value}">${label}<\\/option>`));
  }
  assert.doesNotMatch(navigation, /localStorage|sessionStorage/);
  assert.match(styles, /\.nx-color-mode-control:focus-within \{[^}]*box-shadow: var\(--nx-focus-ring\);/);
  assert.doesNotMatch(styles, /\.nx-color-mode-control\s*\{[^}]*display:\s*none/);
});

test("runtime information exposes discovery and preserved truth boundaries", async () => {
  const source = await read("../src/components/RuntimeInformation.tsx");
  for (const label of ["Runtime version", "Schema version", "Environment", "Runtime URL", "Gateway status", "Provider registry", "Capabilities"]) {
    assert.match(source, new RegExp(label));
  }
  for (const boundary of ["Production ready", "Enterprise ready", "Cloud primary", "Local source of truth", "Default provider", "Conclave", "Actual trained SLMs"]) {
    assert.match(source, new RegExp(boundary));
  }
});

test("connection lifecycle renders every required state", async () => {
  const [source, app, coordination] = await Promise.all([
    read("../src/components/RuntimeHealth.tsx"),
    read("../src/App.tsx"),
    read("../src/lib/request-coordination.mjs"),
  ]);
  for (const state of ["Connecting", "Healthy", "Degraded", "Unavailable", "Retrying", "Timed Out", "Version Mismatch", "Schema Mismatch", "Unauthorized", "Unknown"]) {
    assert.match(source, new RegExp(`\"${state}\"`));
  }
  assert.match(app, /derivePortalConnectionState\(snapshot, failures, loading\)/);
  assert.match(coordination, /if \(loading\) return "Connecting"/);
  assert.match(coordination, /CONNECTION_FAILURE_PRIORITY\.find/);
  assert.doesNotMatch(coordination, /if \(loading\) return "Retrying"/);
});

test("topology is live and follows the required read path", async () => {
  const source = await read("../src/components/RuntimeTopology.tsx");
  const nodes = ["Command Portal", "Experience Gateway", "Runtime Gateway", "Hosted Runtime", "Providers", "OpenAI"];
  const positions = nodes.map((node) => source.indexOf(`name: \"${node}\"`));
  assert.equal(positions.every((position) => position >= 0), true);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(source, /snapshot\.diagnostics/);
  assert.match(source, /snapshot\.providers/);
  assert.match(source, /Live Responses inference verified/);
  assert.match(source, /awaiting successful live Responses inference/);
});

test("browser uses only same-origin allowlisted runtime routes and no token", async () => {
  const [client, localClient, types, env] = await Promise.all([read("../src/lib/portal-client.ts"), read("../src/lib/local-client.ts"), read("../src/lib/types.ts"), read("../.env.example")]);
  assert.match(client, /`\/api\/runtime\/\$\{route\}`/);
  assert.match(localClient, /`\$\{hosted \? "\/api\/operations" : "\/api\/local"\}\$\{path\}`/);
  for (const source of [client, localClient]) {
    assert.equal(source.includes("COMMAND_PORTAL_RUNTIME_READ_TOKEN"), false);
    assert.equal(source.includes("Authorization"), false);
  }
  assert.match(client, /portalFailureEnvelope/);
  assert.match(client, /code: "gateway_unreachable"/);
  assert.match(client, /failures\.push\(envelope\)/);
  assert.equal(types.includes("runtimeToken"), false);
  assert.equal(/VITE_.*TOKEN/.test(env), false);
});

test("Replit publishes the fixed hosted binding without committing server secrets", async () => {
  const replit = await read("../.replit");
  for (const binding of [
    'COMMAND_PORTAL_OPERATIONAL_API_BASE_URL = "https://nexus-runtime-dev.fly.dev"',
    'COMMAND_PORTAL_OPERATIONAL_ENABLED = "true"',
    'COMMAND_PORTAL_SESSION_MODE = "automatic_private_workspace"',
    'COMMAND_PORTAL_OPERATOR_USER_ID = "nexus-workspace-service"',
    'COMMAND_PORTAL_TENANT_ID = "nexicron"',
    'COMMAND_PORTAL_WORKSPACE_ID = "primary"',
    'COMMAND_PORTAL_OPERATOR_ROLE = "operator"',
    'COMMAND_PORTAL_OPERATIONAL_SCOPES = "edge:node_admission:request,evidence:write,operations:read,operations:write,repository:metadata:read"',
    'COMMAND_PORTAL_PROVIDER_INTERACTIVE_AUTH_ENABLED = "true"',
    'COMMAND_PORTAL_PROVIDER_SESSION_SECRET_REF = "secret-manager:experience-gateway/mission-3/provider-session-current"',
    'COMMAND_PORTAL_PROVIDER_SESSION_KEY_ID = "provider-session-current"',
    'COMMAND_PORTAL_REPLIT_AUTH_ISSUER = "https://replit.com/oidc"',
    'COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_ID = "registered-executive-session-policy"',
    'COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_VERSION = "1.0.0"',
    'COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_DIGEST = "sha256:b1f6a2cdf2153ac48236867e5e1aeab794842256410f3f314fc2655008a2be78"',
  ]) assert.match(replit, new RegExp(binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(replit, /approvals:decide/);
  for (const secretName of [
    "COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN",
    "COMMAND_PORTAL_OPERATOR_ACCESS_KEY",
    "COMMAND_PORTAL_RUNTIME_READ_TOKEN",
    "COMMAND_PORTAL_SESSION_SECRET",
    "COMMAND_PORTAL_PROVIDER_SESSION_SECRET",
    "COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_SECRET",
    "COMMAND_PORTAL_EXECUTIVE_REGISTRATIONS_JSON",
    "NEXUS_HUMAN_SESSION_ASSERTION_SECRET",
    "NEXUS_CONTEXT_ASSERTION_COMMAND_PORTAL_SECRET",
  ]) assert.doesNotMatch(replit, new RegExp(`^${secretName}\\s*=`, "m"));
});

test("hosted workspaces bootstrap automatically without a browser credential form", async () => {
  const [gate, client, app, operations] = await Promise.all([
    read("../src/components/OperationalAccessGate.tsx"),
    read("../src/lib/local-client.ts"),
    read("../src/App.tsx"),
    read("../src/components/OperationsWorkspace.tsx"),
  ]);
  assert.match(app, /operationalSessionClient\.status\(\)/);
  assert.match(gate, /operationalSessionClient\.status\(\)/);
  assert.match(gate, /Retry secure connection/);
  assert.match(gate, /private deployment admits the user/);
  assert.doesNotMatch(gate, /password|accessKey|Operator access key|current-password|KeyRound/);
  assert.match(client, /login: \(accessKey: string\)/);
  assert.match(operations, /Private workspace managed/);
  assert.match(operations, /Authentication and access scope do not create operational Authority/);
});

test("provider sign-out stays within the CSP-closed same-origin request boundary", async () => {
  const [component, server] = await Promise.all([
    read("../src/components/RegisteredExecutiveSession.tsx"),
    read("../server/portal-server.mjs"),
  ]);
  assert.match(
    component,
    /fetch\("\/api\/auth\/logout", \{\s*method: "POST"/,
  );
  assert.match(
    component,
    /window\.location\.assign\(payload\.providerLogoutUrl\)/,
  );
  assert.doesNotMatch(component, /action="\/api\/auth\/logout"/);
  assert.doesNotMatch(component, /href="\/api\/auth\/logout"/);
  assert.match(server, /form-action 'none'/);
});

test("local-first workspaces delegate intake, project intelligence, and Realtime voice to Runtime", async () => {
  const [app, registry, intake, projects, voice, realtime, pcm, browserSpeech, client, admission, documentResult] = await Promise.all([
    read("../src/App.tsx"),
    surfaceRegistry(),
    read("../src/components/DocumentIntake.tsx"),
    read("../src/components/ProjectStudio.tsx"),
    read("../src/components/VoiceWorkspace.tsx"),
    read("../src/lib/realtime-voice-client.ts"),
    read("../src/lib/realtime-pcm-input.ts"),
    read("../src/lib/browser-speech.ts"),
    read("../src/lib/local-client.ts"),
    read("../src/lib/runtime-voice-admission.ts"),
    read("../src/lib/document-intake-result.ts"),
  ]);
  for (const label of ["Document Intelligence", "Projects", "Voice Operations"]) {
    assert.equal(registry.surfaces.some((surface) => surface.label === label), true);
  }
  assert.match(app, /<DocumentIntake capabilityRegistry=\{capabilityRegistry\} session=\{operationalSession\}/);
  for (const contract of ["/executive-interactions", "/scope", "/estimate", "/planning-model"]) assert.match(client, new RegExp(contract));
  for (const retired of ["intakeUpload", "intakeQuery", "projectCreate", "projectCompile"]) assert.doesNotMatch(client, new RegExp(retired));
  assert.doesNotMatch(intake, /FileReader|readAsDataURL/);
  assert.match(intake, /admitCanonicalActionIntent/);
  assert.match(intake, /canonicalHostedControlAvailability/);
  assert.match(intake, /pathTemplate: "\/intake\/history"/);
  assert.match(intake, /pathTemplate: "\/intake\/upload"/);
  assert.match(intake, /pathTemplate: "\/intake\/query"/);
  assert.match(intake, /"operations:read"/);
  assert.doesNotMatch(intake, /pathTemplate: "\/intake\/query"[\s\S]{0,180}"operations:write"/);
  assert.match(intake, /"evidence:write"/);
  assert.match(intake, /browser has retained the selected file bytes locally/);
  assert.match(intake, /projectId/);
  assert.match(intake, /Ask ingested sources/);
  assert.match(projects, /browser performs no project calculation/i);
  assert.match(projects, /Missing rates or quantities remain missing/i);
  assert.match(projects, /never fabricates a price/i);
  assert.match(realtime, /RTCPeerConnection/);
  assert.match(realtime, /echoCancellation: true/);
  assert.match(realtime, /conversation\.item\.input_audio_transcription\.completed/);
  assert.match(pcm, /type: "input_audio_buffer\.append"/);
  assert.match(pcm, /type: "input_audio_buffer\.commit"/);
  assert.match(realtime, /input_audio_buffer\.committed/);
  assert.match(realtime, /status\.serverVAD === false/);
  assert.match(realtime, /status\.clientAudioCommitRequired === true/);
  assert.match(realtime, /status\.clientAudioAppendRequired === true/);
  assert.match(realtime, /status\.providerOfferAudioDirection === "inactive"/);
  assert.match(realtime, /status\.providerOfferAudioTrackAttached === false/);
  assert.match(realtime, /addTransceiver\("audio", \{ direction: "inactive" \}\)/);
  assert.doesNotMatch(realtime, /\.addTrack\(/);
  assert.match(realtime, /setMicrophoneMuted/);
  assert.match(realtime, /track\.enabled = !this\.microphoneMuted && !this\.turnProcessing/);
  assert.match(realtime, /setOutputMuted/);
  assert.doesNotMatch(realtime, /HTMLAudioElement|document\.createElement\(["']audio/);
  assert.match(realtime, /attempted to attach output media to a transcription-only session/);
  assert.match(realtime, /onRuntimeResponse\(responseText\)/);
  assert.doesNotMatch(realtime, /type:\s*"response\.create"/);
  assert.doesNotMatch(realtime, /\.play\(/);
  for (const control of ["Mute microphone", "Mute NEXUS", "Unmute microphone", "Unmute NEXUS"]) assert.match(voice, new RegExp(control));
  assert.match(voice, /WebRTC carries ordered microphone PCM on its data channel only/i);
  assert.match(voice, /model-native knowledge/i);
  assert.match(browserSpeech, /SpeechRecognition/);
  assert.match(browserSpeech, /speechSynthesis\.speak\(utterance\)/);
  assert.match(browserSpeech, /Browser microphone did not capture speech within/);
  assert.match(voice, /speakBrowserResponse\(responseText\)/);
  assert.match(voice, /if \(!nexusMutedRef\.current\) speakBrowserResponse\(responseText\)/);
  assert.match(voice, /actual Runtime response locally/);
  assert.match(realtime, /forbidden output event/);
  assert.match(voice, /admitRuntimeVoiceTranscript\(/);
  assert.match(admission, /The sole browser admission path for both text and finalized voice input/);
  assert.match(admission, /localNexusClient\.executiveInteraction\(request, approvalId\)/);
  assert.match(admission, /lookupUncertainInteraction\(request\)/);
  assert.doesNotMatch(admission, /hifClient|routeTranscript|executiveIntentEndpointIsAbsent|voiceOperatorEndpointIsAbsent/);
  assert.match(voice, /setTranscript\(""\)/);
  assert.match(voice, /governed Runtime Voice Operator/);
  assert.doesNotMatch(client, /executiveIntent|routeTranscript|executeAction/);
  for (const source of [app, intake, projects, voice, realtime, client, admission]) {
    assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(source), false);
  }
});

test("mission control consumes the versioned Runtime parity contract", async () => {
  const [app, workspace, client] = await Promise.all([
    read("../src/App.tsx"), read("../src/components/OperationsWorkspace.tsx"), read("../src/lib/local-client.ts")
  ]);
  for (const label of ["Mission Control", "Mission portfolio", "Mission Executor", "Mission receipts", "Operational Replay", "Capability-specific readiness"]) assert.match(`${app}\n${workspace}`, new RegExp(label));
  for (const operation of ["capabilityReadiness", "missions", "mission", "missionReceipts", "operationalReplayForMission", "executiveInteraction"]) assert.match(client, new RegExp(operation));
  assert.match(workspace, /admitExecutiveInteraction\(/);
  assert.match(workspace, /PORTAL_CANONICAL_ACTIONS\.copilotInteractionStart/);
  assert.doesNotMatch(`${client}\n${workspace}`, /"\/missions\/plan"|localNexusClient\.planMission/);
  assert.match(workspace, /Mission status, task graph, receipts, and Replay come from independent canonical Runtime routes/);
  assert.match(workspace, /Authentication and role never establish operational Authority/);
  for (const boundary of ["Hosted Operational Gateway", "Session expiration", "server-derived", "authenticated Runtime"]) assert.match(workspace, new RegExp(boundary));
  for (const staleCall of ["clientCapabilities\\(\\)", "workSessions\\(\\)", "approvals\\(\\)", "connectors\\(\\)", "dryRunAction\\(", "executeAction\\("]) assert.doesNotMatch(workspace, new RegExp(staleCall));
  assert.match(client, /Idempotency-Key/);
  assert.match(client, /operationalSessionClient/);
  assert.match(client, /capabilityTransport\.mode = session\.authenticated \? "hosted" : "local"/);
  assert.match(app, /hosted-operational-context/);
  assert.match(app, /localNexusClient\.capabilityReadiness\(\)/);
  assert.match(app, /Capability state/);
  assert.match(app, /Verified Runtime reason/);
  assert.match(app, /Technical details/);
  assert.match(app, /AREA_CAPABILITY_IDS/);
  assert.match(app, /Runtime commit/);
  assert.match(app, /runtimeCommit=\{deployedRuntimeCommit\}/);
  assert.match(workspace, /missionCreationAllowed/);
  assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(workspace), false);
});

test("Operations Center manifests the Runtime-owned Executive Operating Loop", async () => {
  const [app, center, contract, portalClient, bootstrapContract] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/OperationsCenter.tsx"),
    read("../src/lib/eox-client.ts"),
    read("../src/lib/portal-client.ts"),
    read("../shared/runtime-bootstrap-contract.mjs"),
  ]);
  assert.match(app, /areaFromPath\(window\.location\.pathname\)/);
  assert.match(app, /"web\.dashboard\.operations-center": <OperationsCenter/);
  assert.match(app, /current\.modules\.map\(renderWebModule\)/);
  for (const label of ["Operations Center", "Executive Brief", "Operational Health", "Attention Queue", "Recommended Actions", "Operational Understanding", "Mission Timeline", "Executive state"]) assert.match(center, new RegExp(label));
  assert.match(center, /assessment\.loop\.map/);
  assert.match(center, /Executive Operating Loop/);
  assert.match(portalClient, /RUNTIME_BOOTSTRAP_ROUTE_KEYS/);
  assert.match(bootstrapContract, /\["eox", "\/api\/runtime\/eox"\]/);
  for (const significance of ["Business impact", "Operational impact", "Mission impact", "Why this matters"]) assert.match(center, new RegExp(significance, "i"));
  assert.doesNotMatch(center, /Begin Executive Briefing|speechSynthesis|HighlightRequested|eoxClient/);
  assert.match(center, /persistent NEXUS copilot is the client presentation surface/i);
  assert.doesNotMatch(contract, /beginBriefing|speechRequested|\/api\/runtime\/executive-briefing/);
  assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(center + contract), false);
});

test("direct hosted workspace paths survive a fresh page load", async () => {
  const [app, registry] = await Promise.all([read("../src/App.tsx"), surfaceRegistry()]);
  assert.match(app, /window\.location\.pathname/);
  assert.match(app, /window\.location\.hash/);
  const routes = new Set(registry.surfaces.map((surface) => surface.clients.web.route));
  for (const path of ["/missions", "/mission-control", "/conclave", "/operational-replay", "/knowledge", "/edge-runtime"]) {
    assert.equal(routes.has(path), true, path);
  }
  assert.match(app, /const \[active, setActive\] = useState<AreaId>\(routeFromLocation\)/);
  assert.match(app, /setActive\(routeFromLocation\(\)\)/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /window\.history\.replaceState/);
  assert.match(app, /routePath=\{AREA_PATHS\[active\]\}/);
});

test("Conclave is a visible Runtime-owned decision challenge capability", async () => {
  const [app, registry, conclave, client, directory, localClient, styles] = await Promise.all([
    read("../src/App.tsx"), surfaceRegistry(),
    read("../src/components/ConclaveWorkspace.tsx"), read("../src/lib/conclave-client.ts"),
    read("../src/lib/conclave-directory.ts"),
    read("../src/lib/local-client.ts"), read("../src/styles.css")
  ]);
  assert.equal(registry.surfaces.find((surface) => surface.id === "conclave")?.label, "Conclave");
  assert.match(app, /<ConclaveWorkspace onReplay=\{openReplay\} readiness=\{operationalReadiness\} session=\{operationalSession\} capabilityRegistry=\{capabilityRegistry\} availability=\{hostedContextData\}/);
  for (const label of ["Conclave synthesis", "authorize external actions", "Required before progression"]) assert.match(conclave, new RegExp(label));
  assert.doesNotMatch(client, /localNexusClient\.(?:createConclaveWorkspace|runConclaveWorkspace)/);
  assert.match(directory, /lifecyclePosture === "canonical_operational"/);
  assert.match(directory, /reviewIntegrityVerified === true/);
  assert.match(directory, /terminalReceiptVerified === true/);
  assert.match(directory, /completionReceipt[\s\S]*runReceipt/);
  assert.match(client, /createdConclaveRunIdentity/);
  assert.match(client, /expectedWorkspaceVersion/);
  assert.doesNotMatch(client, /\/api\/runtime\/conclave\/reviews|runConclaveReview/);
  assert.match(conclave, /localNexusClient\.conclaveWorkspaces\(\)/);
  assert.match(conclave, /Saved Reviews/);
  assert.match(conclave, /Operational question/);
  assert.match(conclave, /not yet a Runtime record/);
  assert.match(conclave, /defaultConclaveWorkspace/);
  assert.match(conclave, /conclaveDirectoryLabel/);
  assert.match(conclave, /Verified canonical Review result/);
  assert.match(conclave, /Historical prompt only — not a Review result/);
  assert.match(conclave, /does not substitute a browser-only result/);
  assert.match(conclave, /Run review/);
  assert.match(conclave, /requests creation of a governed Review record/);
  assert.match(conclave, /does not run tasks or authorize external actions/);
  assert.match(conclave, /createAllowed: creationAllowed, runAllowed/);
  assert.match(conclave, /admitCanonicalActionIntent/);
  assert.match(conclave, /workspaceDisplayStatus\(workspace\)/);
  assert.match(conclave, /workspace\.lifecyclePosture === "legacy_read_only"/);
  assert.doesNotMatch(conclave, /displayStatus\s*\?\?\s*(?:workspace\??\.)?status/);
  assert.match(conclave, /const predecessor: ConclavePredecessor/);
  assert.match(conclave, /workspaceVersion:\s*workspace\.workspaceVersion/);
  assert.match(conclave, /Unblock an evidence-waiting task/);
  assert.doesNotMatch(conclave, /localNexusClient\.admitConclaveEvidence/);
  assert.match(conclave, /Admit this Evidence to Conclave Review/);
  assert.match(conclave, /evidence:write/);
  assert.match(conclave, /canonicalHostedControlAvailability/);
  assert.match(conclave, /pathTemplate: "\/conclave\/workspaces"/);
  assert.match(conclave, /pathTemplate: "\/conclave\/workspaces\/\{mission_id\}\/run"/);
  assert.match(conclave, /pathTemplate: "\/conclave\/workspaces\/\{mission_id\}\/tasks\/\{task_id\}\/evidence"/);
  assert.match(conclave, /conclaveActionGates\([\s\S]*createAction\.available,[\s\S]*runAction\.available/);
  assert.doesNotMatch(conclave, /creationAllowed[^\n]*&& runAction\.available/);
  assert.match(conclave, /createAllowed: creationAllowed, runAllowed/);
  assert.match(conclave, /Runtime derives the collector from the authenticated principal/);
  assert.match(conclave, /"tenant_knowledge"/);
  assert.match(conclave, /"retrieved_evidence"/);
  for (const producerOwned of [
    "runtime_evidence",
    "live_external_source",
    "platform_knowledge",
    "model_native",
  ]) {
    assert.doesNotMatch(
      conclave,
      new RegExp(`evidenceSourceClassifications[\\s\\S]{0,240}"${producerOwned}"`),
    );
  }
  assert.doesNotMatch(localClient, /admitConclaveEvidence|createConclaveWorkspace|runConclaveWorkspace/);
  assert.match(conclave, /useState\(""\)/);
  assert.match(conclave, /placeholder=\{suggestedProposal\}/);
  assert.doesNotMatch(client, /gateway\.data\.data/);
  assert.match(conclave, /execution/i);
  assert.match(styles, /understanding-grid \{ grid-template-columns: repeat\(2/);
  assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(conclave + client), false);
});

test("NEXUS remains a Runtime-governed conversational copilot across every portal area", async () => {
  const [app, copilot, admission, realtime, styles, platformStyles] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/NexusCopilot.tsx"),
    read("../src/lib/runtime-voice-admission.ts"),
    read("../src/lib/realtime-voice-client.ts"),
    read("../src/styles.css"),
    read("../src/platform/nexus-platform.css"),
  ]);
  assert.match(app, /<NexusCopilot/);
  assert.match(app, /className="nx-app-shell nx-hosted-shell"/);
  assert.doesNotMatch(app, /className="nx-platform"/);
  assert.match(app, /open=\{copilotOpen\}/);
  assert.match(copilot, /open: boolean/);
  assert.match(copilot, /NEXUS/);
  assert.match(copilot, /admitExecutiveInteraction\(request, "text", conversationId\.current\)/);
  assert.match(copilot, /RealtimeVoiceClient/);
  assert.match(copilot, /Model-native reasoning is labeled\. Runtime evidence remains authoritative/);
  assert.match(copilot, /plan, scope, and price a NEXUS project/i);
  for (const control of ["Mute mic", "Mute NEXUS", "Unmute mic", "Unmute NEXUS"]) assert.match(copilot, new RegExp(control));
  assert.match(copilot, /if \(voiceConnected\) stopVoice\(\)/);
  assert.match(admission, /The sole browser admission path for both text and finalized voice input/);
  assert.doesNotMatch(admission, /hifClient|routeTranscript|executiveIntentEndpointIsAbsent|voiceOperatorEndpointIsAbsent/);
  assert.match(realtime, /RTCPeerConnection/);
  assert.doesNotMatch(app, /Begin Executive Briefing/);
  assert.match(styles, /Persistent NEXUS executive copilot/);
  assert.match(platformStyles, /Canonical hosted NEXUS Platform shell/);
  assert.match(platformStyles, /\.nx-app-shell \{/);
  assert.match(platformStyles, /container-name: portal-main/);
  assert.match(styles, /@container portal-main/);
  assert.match(styles, /Modules respond to the workspace width/);
  for (const source of [app, copilot, admission]) {
    assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(source), false);
  }
});

test("fixture mode and silent fixture fallback are absent", async () => {
  const [server, app, readme] = await Promise.all([read("../server/portal-server.mjs"), read("../src/App.tsx"), read("../README.md")]);
  for (const source of [server, app, readme]) {
    assert.equal(source.includes("contract_fixture"), false);
    assert.equal(source.includes("fixture fallback"), false);
  }
});

test("responsive and accessible presentation contracts remain present", async () => {
  const [styles, app, executiveNavigation, rail, chrome, inspector, primitives, platformStyles, tokens] = await Promise.all([
    read("../src/styles.css"),
    read("../src/App.tsx"),
    read("../src/platform/NexusExecutiveNavigation.tsx"),
    read("../src/platform/NexusPlatformRail.tsx"),
    read("../src/platform/NexusWorkspaceChrome.tsx"),
    read("../src/platform/NexusContextInspector.tsx"),
    read("../src/design-system/NexusPrimitives.tsx"),
    read("../src/platform/nexus-platform.css"),
    read("../src/design-system/nexus-tokens.css"),
  ]);
  assert.match(platformStyles, /@media \(max-width: 820px\)/);
  assert.match(styles, /@media \(max-width: 580px\)/);
  assert.match(platformStyles, /prefers-reduced-motion/);
  assert.match(tokens, /prefers-contrast/);
  assert.match(app, /Skip to workspace/);
  assert.match(chrome, /label="Open navigation"/);
  assert.match(primitives, /aria-label=\{label\}/);
  assert.match(executiveNavigation, /aria-current=\{active === item\.id \? "page" : undefined\}/);
  assert.match(rail, /aria-label="Search platform workspaces"/);
  assert.match(app, /inspectorOpen && <NexusContextInspector/);
  assert.match(inspector, /<aside id="context-inspector"/);
  assert.doesNotMatch(app, /behavior: "smooth"/);
});

test("navigation, Context Inspector, and NEXUS reflow without covering the workspace", async () => {
  const [app, copilot, chrome, platformStyles, routeStyles, missions, knowledge] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/NexusCopilot.tsx"),
    read("../src/platform/NexusWorkspaceChrome.tsx"),
    read("../src/platform/nexus-platform.css"),
    read("../src/styles.css"),
    read("../src/components/MissionDashboard.tsx"),
    read("../src/components/KnowledgeWorkspace.tsx"),
  ]);

  assert.match(app, /const sidePanel = copilotOpen \? "copilot" : inspectorOpen \? "inspector" : "closed"/);
  assert.match(app, /data-side-panel=\{sidePanel\}/);
  assert.match(app, /data-navigation=\{menuOpen \? "open" : "closed"\}/);
  assert.match(app, /if \(next\) setInspectorOpen\(false\)/);
  assert.match(app, /setCopilotOpen\(false\);\s+setCopilotExpanded\(false\)/);
  assert.doesNotMatch(app, /nx-platform-scrim/);

  const bodyStart = app.indexOf('<div className="nx-app-shell__body">');
  const copilotStart = app.indexOf("<NexusCopilot", bodyStart);
  const bodyEnd = app.indexOf("</div>", copilotStart);
  assert.ok(bodyStart >= 0 && copilotStart > bodyStart && bodyEnd > copilotStart);
  assert.match(copilot, /if \(!open\) return null/);
  assert.match(copilot, /id="nexus-copilot"/);
  assert.match(chrome, /aria-controls="nexus-copilot"/);

  assert.match(platformStyles, /grid-template-areas: "rail stage panel"/);
  assert.match(platformStyles, /grid-area: panel;\s+position: sticky/);
  assert.match(platformStyles, /grid-template-areas: "rail panel" "rail stage"/);
  assert.match(platformStyles, /data-navigation="open".*\.nx-platform-rail \{ display: flex; \}/);
  assert.doesNotMatch(platformStyles, /position:\s*fixed/);
  assert.doesNotMatch(platformStyles, /nx-platform-scrim/);

  for (const breakpoint of [1280, 1100, 900, 680, 460]) {
    assert.match(routeStyles, new RegExp(`@container portal-main \\(max-width: ${breakpoint}px\\)`));
  }
  assert.match(routeStyles, /\.nx-runtime-ribbon \{[^}]*grid-auto-rows: 1fr;[^}]*align-items: stretch;/);
  assert.match(routeStyles, /\.nx-runtime-ribbon__signal \{[^}]*display: grid;[^}]*height: 100%;/);
  assert.match(routeStyles, /\.nx-runtime-ribbon__signal \.nx-metric \{[^}]*box-sizing: border-box;[^}]*width: 100%;[^}]*height: 100%;[^}]*min-height: 8\.75rem;[^}]*gap: var\(--nx-status-card-gap\);/);
  assert.match(routeStyles, /\.nx-runtime-ribbon__signal \.nx-metric > span \{[^}]*min-block-size: 2lh;[^}]*line-height: 1\.25;/);
  assert.match(routeStyles, /\.nx-runtime-ribbon__signal \.nx-metric > strong \{[^}]*min-block-size: 2lh;[^}]*line-height: var\(--nx-leading-tight\);[^}]*text-transform: capitalize;/);
  assert.match(routeStyles, /\.nx-runtime-ribbon__signal \.nx-metric > small \{[^}]*min-block-size: 2lh;/);
  assert.match(routeStyles, /\.nx-runtime-ribbon \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); overflow-x: visible; scroll-snap-type: none; \}/);
  assert.match(routeStyles, /\.eox-indicators strong \{[^}]*overflow-wrap: anywhere;/);
  assert.match(routeStyles, /\.eox-indicators:not\(\.understanding-grid\) article \{ grid-template-columns: 1fr; \}/);
  assert.match(routeStyles, /\.understanding-grid article > header \{ align-items: flex-start; flex-direction: column; \}/);
  assert.match(routeStyles, /overflow-wrap: anywhere/);
  for (const workspace of [missions, knowledge]) {
    assert.match(workspace, /NexusButton/);
    assert.match(workspace, /NexusMetric/);
  }
});

test("canonical shell bootstraps the hosted operational session before mounting workspaces", async () => {
  const [app, gate] = await Promise.all([read("../src/App.tsx"), read("../src/components/OperationalAccessGate.tsx")]);
  assert.match(app, /operationalSessionClient\.status\(\)/);
  assert.match(app, /operationalSessionClient\.use\(session\)/);
  assert.match(app, /operationalSessionClient\.use\(\{ authenticated: false \}\)/);
  assert.match(app, /!sessionBootstrapComplete \|\| \(loading && !Object\.keys\(snapshot\)\.length\)/);
  assert.match(app, /const requiresOperationalSession = OPERATIONAL_AREAS\.has\(active\) \|\| \(hostedOperationalConfigured && HOSTED_CONTRACT_AREAS\.has\(active\)\)/);
  assert.match(app, /requiresOperationalSession && !operationalSession\.authenticated/);
  assert.match(app, /<OperationalAccessGate workspace=\{current\.label\}/);
  assert.match(gate, /operationalSessionClient\.status\(\)/);
  assert.match(gate, /Retry secure connection/);
  assert.doesNotMatch(gate, /accessKey|type="password"|Operator access key/);
  assert.match(gate, /HttpOnly, scoped session/);
  assert.doesNotMatch(gate, /localStorage|sessionStorage/);
  for (const mapping of ['replay: "replay"', 'missions: "missions"', 'knowledge: "knowledge"', 'edge: "edge"']) assert.match(app, new RegExp(mapping));
  assert.doesNotMatch(app, /as never/);
});

test("canonical consolidation exposes every permanent platform workspace", async () => {
  const [app, registry, missions, replay, knowledge, conclave, platformStyles, workspaceFrame, appearance] = await Promise.all([
    read("../src/App.tsx"), surfaceRegistry(), read("../src/components/MissionDashboard.tsx"),
    read("../src/components/OperationalReplay.tsx"), read("../src/components/KnowledgeWorkspace.tsx"),
    read("../src/components/ConclaveWorkspace.tsx"), read("../src/platform/nexus-platform.css"),
    read("../src/platform/NexusWorkspaceFrame.tsx"), read("../src/appearance/AppearanceWorkspace.tsx")
  ]);
  const labels = new Set(registry.surfaces.filter((surface) => surface.executive).map((surface) => surface.label));
  for (const label of ["Dashboard", "Missions", "Operational Replay", "Conclave", "Knowledge", "Edge Runtime", "Mission Control", "Settings"]) assert.equal(labels.has(label), true, label);
  for (const label of ["Active Missions", "Blocked Missions", "Completed Missions", "Mission Health", "Mission Executor", "Mission receipts"]) assert.match(missions, new RegExp(label, "i"));
  for (const label of ["Replay pipeline visualization", "Stage Inspector", "Explain This Step", "Executive Mode", "Engineering Mode", "Failure Replay", "Export"]) assert.match(replay, new RegExp(label, "i"));
  for (const label of ["Mission Store", "Knowledge Store", "Knowledge Promotion", "Knowledge Receipts"]) assert.match(knowledge, new RegExp(label, "i"));
  for (const label of ["Mission", "Objectives", "Knowledge", "Unknowns", "Task Graph", "Specialists", "Evidence", "Knowledge Graph", "Operational Replay", "Executive Conclusions"]) assert.match(conclave, new RegExp(label));
  for (const component of ["NexusExecutiveNavigation", "NexusPlatformRail", "NexusWorkspaceCommandBar", "NexusWorkspaceFrame", "NexusActivityStream", "NexusContextInspector"]) assert.match(app, new RegExp(`<${component}`));
  assert.match(workspaceFrame, /<NexusPageHeader/);
  assert.match(app, /useAppearanceSettings\(\)/);
  assert.match(app, /<AppearanceWorkspace appearance=\{appearance\}/);
  assert.match(appearance, /NEXUS_THEMES\.map/);
  assert.match(appearance, /Saved in this browser/);
  assert.doesNotMatch(appearance, /Presentation only/);
  assert.match(platformStyles, /Canonical hosted NEXUS Platform shell/);
  const tokenImport = app.indexOf('import "./design-system/nexus-tokens.css"');
  const foundationImport = app.indexOf('import "./design-system/nexus-foundation.css"');
  const shellImport = app.indexOf('import "./platform/nexus-platform.css"');
  assert.equal(tokenImport >= 0 && tokenImport < foundationImport && foundationImport < shellImport, true);
  assert.doesNotMatch(app, /className=\{`portal-shell/);
  assert.doesNotMatch(app, /className="nx-platform"/);
});

test("Operational Replay surfaces Runtime-owned stage playback with truthful boundaries", async () => {
  const [app, registry, replay, client] = await Promise.all([
    read("../src/App.tsx"),
    surfaceRegistry(),
    read("../src/components/OperationalReplay.tsx"),
    read("../src/lib/local-client.ts")
  ]);
  assert.equal(registry.surfaces.find((surface) => surface.id === "replay")?.label, "Operational Replay");
  assert.match(app, /<OperationalReplay/);
  for (const control of ["Restart", "Previous", "Play", "Pause", "Next"]) {
    assert.match(replay, new RegExp(control));
  }
  assert.match(replay, /Explain This Step/);
  assert.match(replay, /supplied\.whatChanged/);
  assert.match(replay, /Runtime supplied no explanation for this stage\./);
  assert.match(replay, /STAGE_INTERVAL_BASE_MS \/ speed/);
  assert.match(replay, /classifyOperationalReplayLoad/);
  assert.match(replay, /selectedReplayIdRef/);
  assert.match(replay, /replayLoadSequenceRef/);
  assert.match(replay, /stageButtonsRef/);
  assert.match(replay, /scrollIntoView/);
  assert.match(replay, /presentHostedReplayStage/);
  assert.match(replay, /positiveHostedReplayFacts/);
  assert.match(replay, /Scheduling trace/);
  for (const operation of ["operationalReplays", "operationalReplayEvents", "operationalReplayStage", "explainOperationalReplayStage", "operationalReplayFailures", "operationalReplayForMission", "operationalReplayForReceipt"]) {
    assert.match(client, new RegExp(operation));
  }
  assert.match(replay, /Canonical direct Replay/);
  assert.match(replay, /No local-only Replay fallback is used/);
  assert.doesNotMatch(replay, /replayClient|\/api\/replay|\/api\/runtime\/replay/);
  assert.equal(client.includes("COMMAND_PORTAL_RUNTIME_READ_TOKEN"), false);
  assert.equal(client.includes("Authorization"), false);
  assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(replay + client), false);
});

test("hosted Project, Knowledge, Edge, Voice, and Copilot controls use exact action and scope gates while canonical execution is read-only", async () => {
  const [app, projects, knowledge, edgeAdmission, canonical, hostedGate] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/ProjectStudio.tsx"),
    read("../src/components/KnowledgeWorkspace.tsx"),
    read("../src/components/EdgeAdmissionWorkspace.tsx"),
    read("../src/components/CanonicalExecutionSpine.tsx"),
    read("../src/lib/hosted-capability-gate.ts"),
  ]);
  assert.match(app, /<ProjectStudio onReplay=\{openReplay\} capabilityRegistry=\{capabilityRegistry\} session=\{operationalSession\}/);
  assert.match(app, /<KnowledgeWorkspace snapshot=\{snapshot\} session=\{operationalSession\} capabilityRegistry=\{capabilityRegistry\}/);
  assert.match(app, /<EdgeAdmissionWorkspace capabilityRegistry=\{capabilityRegistry\}/);
  assert.match(app, /<CanonicalExecutionSpine capabilityRegistry=\{capabilityRegistry\}/);
  assert.match(app, /hostedSessionActionAvailability/);
  for (const actionName of [
    "copilotInteractionStart",
    "realtimeVoiceCall",
    "voiceOperatorTranscript",
  ]) {
    assert.match(app, new RegExp(`PORTAL_CANONICAL_ACTIONS\\.${actionName}`));
  }
  assert.ok((app.match(/"operations:write"/g) ?? []).length >= 1);
  assert.match(
    app,
    /PORTAL_CANONICAL_ACTIONS\.voiceOperatorTranscript[\s\S]{0,240}"operations:read"/,
  );
  assert.match(
    app,
    /PORTAL_CANONICAL_ACTIONS\.copilotInteractionStart[\s\S]{0,240}"operations:read"/,
  );
  assert.match(
    app,
    /PORTAL_CANONICAL_ACTIONS\.realtimeVoiceCall[\s\S]{0,240}"operations:write"/,
  );

  assert.match(projects, /capabilityId: PROJECTS_PLANNING_CAPABILITY_ID/);
  assert.match(hostedGate, /PROJECTS_PLANNING_CAPABILITY_ID = "projects\.nexicron_planning"/);
  assert.match(projects, /pathTemplate: "\/projects"/);
  assert.match(projects, /pathTemplate: "\/projects\/\{project_id\}\/compile"/);
  assert.match(projects, /disabled=\{busy \|\| !createAction\.available\}/);
  assert.match(projects, /!compileAction\.available/);

  for (const [capabilityId, pathTemplate, scope] of [
    ["knowledge_intake", "/knowledge/intake", "evidence:write"],
    ["knowledge_acquisition", "/runtime/baselines", "operations:write"],
    ["knowledge_promotion", "/knowledge/acquisitions/{mission_id}/promotion-candidates", "operations:write"],
    ["knowledge_promotion", "/knowledge/promotions", "knowledge:promote"],
  ]) {
    assert.match(knowledge, new RegExp(capabilityId.replace(".", "\\.")));
    assert.match(knowledge, new RegExp(pathTemplate.replaceAll("/", "\\/").replaceAll("{", "\\{").replaceAll("}", "\\}")));
    assert.match(knowledge, new RegExp(scope.replace(":", "\\:")));
  }
  assert.match(knowledge, /candidateGate\.allowed/);
  assert.match(knowledge, /baselineGate\.allowed/);
  assert.doesNotMatch(knowledge, /const acquisitionGate = actionGate/);

  for (const pathTemplate of [
    "/runtime-coordination/admissions",
    "/runtime-coordination/admissions/{admission_id}/cancel",
    "/runtime-coordination/admissions/{admission_id}/challenge/reissue",
  ]) {
    assert.match(edgeAdmission, new RegExp(pathTemplate.replaceAll("/", "\\/").replaceAll("{", "\\{").replaceAll("}", "\\}")));
  }
  assert.match(edgeAdmission, /ADMISSION_REQUEST_SCOPE/);
  assert.match(edgeAdmission, /ADMISSION_REVIEW_SCOPE/);
  assert.match(edgeAdmission, /if \(!createAction\.available\) \{ setActionError\(createAction\.reason\); return; \}/);
  assert.match(edgeAdmission, /disabled=\{!createAction\.available \|\| \(!canCreate && !pendingCreate\)\}/);
  assert.match(edgeAdmission, /!cancelAction\.available/);
  assert.match(edgeAdmission, /!reissueAction\.available/);

  assert.match(canonical, /title="Canonical execution evidence"/);
  assert.match(canonical, /canonicalExecutionClient\.status\(\)/);
  assert.match(canonical, /canonicalExecutionClient\.mission\(record\.missionId\)/);
  assert.match(canonical, /This surface is read-only/);
  assert.match(canonical, /POST \/executive\/interactions/);
  assert.doesNotMatch(canonical, /createMission|executeAction|restoreAction|canonicalHostedActionAvailability/);
  assert.match(hostedGate, /hostedSessionActionAvailability/);
});

test("new portal destinations render Runtime-backed dashboards without client-side cognition", async () => {
  const [app, registry, client, missions, knowledge, edge, fleet, admission, styles, hostedGate] = await Promise.all([
    read("../src/App.tsx"),
    surfaceRegistry(),
    read("../src/lib/local-client.ts"),
    read("../src/components/MissionDashboard.tsx"),
    read("../src/components/KnowledgeWorkspace.tsx"),
    read("../src/components/EdgeRuntime.tsx"),
    read("../src/components/EdgeNodeFleet.tsx"),
    read("../src/components/EdgeAdmissionWorkspace.tsx"),
    read("../src/styles.css"),
    read("../src/lib/hosted-capability-gate.ts")
  ]);
  const labels = new Set(registry.surfaces.map((surface) => surface.label));
  for (const label of ["Missions", "Knowledge", "Edge Runtime"]) assert.equal(labels.has(label), true, label);
  assert.match(app, /<MissionDashboard/);
  assert.match(app, /<KnowledgeWorkspace/);
  assert.match(app, /<EdgeRuntime/);
  assert.match(app, /<RuntimeTopology/);
  assert.match(edge, /<EdgeNodeFleet/);
  assert.match(client, /missions: \(\) => request<Record<string, unknown>>\("\/missions"\)/);
  assert.match(client, /runtimeNodes: \(\) => request<RuntimeNodeFleet>\("\/runtime-coordination\/nodes"\)/);
  for (const path of [
    "/runtime-coordination/admissions",
    "/receipt",
    "/replay",
  ]) assert.match(client, new RegExp(path.replaceAll("/", "\\/")));
  assert.doesNotMatch(client, /createRuntimeAdmission|cancelRuntimeAdmission|reissueRuntimeAdmissionChallenge/);
  assert.match(client, /runtimeAdmissionReceipt/);
  assert.match(client, /runtimeAdmissionReplay/);
  assert.match(knowledge, /Mission Store/);
  assert.match(knowledge, /Knowledge Store/);
  for (const operation of ["knowledgeAcquisition", "knowledgePromotionCandidate", "knowledgeVersions", "knowledgeReceipt", "knowledgePromotions"]) assert.match(client, new RegExp(operation));
  assert.doesNotMatch(client, /knowledgeIntake|createKnowledgePromotionCandidate|promoteKnowledge/);
  assert.match(knowledge, /admitCanonicalActionIntent/);
  assert.match(knowledge, /policyEligible/);
  for (const gate of ["intakeGate", "baselineGate", "candidateGate", "promotionGate"]) assert.match(knowledge, new RegExp(gate));
  assert.match(knowledge, /Mission completion never writes to Knowledge Store automatically/);
  for (const field of ["operationalState", "awaitingNodeProof", "requiredNextAction", "replayId"]) assert.match(admission, new RegExp(field));
  assert.match(admission, /Awaiting physical node proof/);
  assert.match(admission, /ADMISSION_REVIEW_SCOPE/);
  assert.match(admission, /reissueAction\.available/);
  assert.match(missions, /\["active", "in_progress", "running", "executing"\]/);
  assert.match(missions, /step\.reversible === true/);
  assert.doesNotMatch(missions, /step\.reversible !== false/);
  assert.match(missions, /missionPlanAction\.available/);
  assert.match(missions, /missionStepAction\.available/);
  assert.doesNotMatch(missions, /missionCapabilityBlocked/);
  assert.match(app, /HostedCapabilityBoundary/);
  assert.match(app, /if \(configured && \["live", "degraded"\]\.includes\(capability\.state\)\) return children/);
  assert.match(app, /asCapabilityRegistryProjection/);
  assert.match(hostedGate, /action\.invocable !== true/);
  assert.match(hostedGate, /required hosted read\/base action set is unavailable/);
  assert.match(hostedGate, /must stay disabled at its control/);
  assert.match(app, /moduleCapabilityStateView/);
  assert.match(hostedGate, /MODULE_MOUNT_ACTION_REQUIREMENTS/);
  assert.match(app, /groups=\{registryRailGroups\}/);
  assert.doesNotMatch(app, /live: area\.id ===/);
  assert.match(app, /Hosted operational mode is not configured for this deployment/);
  const capabilityIds = new Set(registry.surfaces.flatMap((surface) => surface.capabilityIds));
  for (const capabilityId of ["knowledge.document_intake", "projects.nexicron_planning", "interaction.human"]) {
    assert.equal(capabilityIds.has(capabilityId), true, capabilityId);
  }
  assert.match(app, /NEXUS will not substitute local state or infer readiness/);
  assert.doesNotMatch(app, /HostedContractUnavailable/);
  assert.match(edge, /Edge status is unavailable/);
  assert.match(edge, /Array\.isArray\(capabilityData\)/);
  assert.match(edge, /EDGE_CAPABILITY_IDS/);
  for (const label of ["Edge node ecosystem", "Authorized scope only", "Observed manifest", "Evidence, journal, and Replay"]) assert.match(fleet, new RegExp(label));
  for (const dimension of ["stateVector", "trust", "freshness", "lastHeartbeatAt", "evidenceRefs", "receiptRefs", "replayRefs"]) assert.match(fleet, new RegExp(dimension));
  assert.match(fleet, /<caption className="sr-only">Runtime-reported node state dimensions<\/caption>/);
  for (const label of [
    "Governed node admission", "Owning Mission", "Node display name", "Operational asset class",
    "Operational purpose", "Requested capabilities", "Existing Evidence references", "Request governed admission",
    "Mission task graph", "Policy", "Conclave", "Approval", "Decision", "Authority", "Challenge",
    "Verification", "Asset contract", "First heartbeat", "Receipt", "Operational Replay",
  ]) assert.match(admission, new RegExp(label));
  assert.match(admission, /edge:node_admission:request/);
  assert.match(admission, /canonicalHostedControlAvailability/);
  assert.match(admission, /createAction\.available/);
  assert.match(admission, /dependencies\.map/);
  assert.doesNotMatch(
    admission,
    /const canCreate = Boolean\([\s\S]{0,220}capability\?\.available/,
  );
  assert.match(admission, /operationAllowed/);
  assert.doesNotMatch(client + fleet + admission, /credentialRef|challengeId|createRuntimeNode|enrollment-challenge/);
  assert.doesNotMatch(
    fleet + admission,
    /\bcredentialValue\b|\bsecretValue\b|name=["'](?:password|token|secret)["']|type="password"/,
  );
  assert.match(styles, /\.edge-fleet-layout/);
  assert.match(styles, /\.edge-admission-stages/);
  assert.match(styles, /\.edge-admission-lineage/);
  assert.match(styles, /@container portal-main \(max-width: 900px\)/);
  for (const source of [missions, knowledge, edge, fleet, admission]) {
    assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(source), false);
    assert.equal(source.includes("Authorization"), false);
  }
});

test("Runtime information renders one canonical capability projection and Executive Continuity truthfully", async () => {
  const [runtimeInformation, registry, client, types, styles, server] = await Promise.all([
    read("../src/components/RuntimeInformation.tsx"),
    read("../src/components/CapabilityRegistryProjection.tsx"),
    read("../src/lib/portal-client.ts"),
    read("../src/lib/types.ts"),
    read("../src/styles.css"),
    read("../server/portal-server.mjs"),
  ]);
  assert.match(server, /"\/api\/runtime\/capability-registry": "\/runtime\/capability-registry"/);
  assert.match(client, /nexus_live_capability_registry_projection/);
  assert.match(client, /nexus\.live-capability-registry@1\.0\.0/);
  assert.match(client, /capability_registry_response_invalid/);
  assert.match(runtimeInformation, /snapshot\["capability-registry"\]/);
  assert.match(runtimeInformation, /<CapabilityRegistryProjection/);
  for (const state of ["Live", "Degraded", "Simulated", "Unavailable"]) assert.match(registry, new RegExp(`"${state}"`));
  for (const dimension of [
    "Registration", "Configuration", "Reachability", "Verification", "Health",
    "Availability", "Verification age", "Authorization",
  ]) assert.match(registry, new RegExp(dimension));
  for (const classification of [
    "hard_blocking", "safely_remediable", "non_blocking_degraded", "operator_action_required",
  ]) assert.match(`${registry}\n${types}`, new RegExp(classification));
  assert.match(registry, /Authority is separate: Not granted/);
  assert.match(registry, /action\.operationId/);
  assert.match(registry, /action\.inputSchemaId/);
  assert.match(registry, /action\.fixedTarget/);
  assert.match(registry, /Fixed target:/);
  assert.match(registry, /remediationAction\.classification === "staged"/);
  assert.match(registry, /<NexusButton size="sm" disabled>/);
  assert.match(styles, /\.capability-registry-layout/);
  assert.doesNotMatch(registry, /fetch\(|runtimeBaseUrl|Bearer\s/);
});

test("copilot and voice controls fail closed on canonical interaction availability", async () => {
  const [app, client, copilot, voice, realtime] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/lib/portal-client.ts"),
    read("../src/components/NexusCopilot.tsx"),
    read("../src/components/VoiceWorkspace.tsx"),
    read("../src/lib/realtime-voice-client.ts"),
  ]);
  for (const actionId of [
    "canonical.route.post.executive.interactions",
    "context.runtime.route.post.runtime.voice.realtime.call",
  ]) assert.match(client, new RegExp(actionId.replaceAll(".", "\\.")));
  assert.match(client, /\["live_verified", "live_degraded"\]\.includes\(action\.classification\)/);
  assert.match(client, /contract\.actionId\.startsWith\("canonical\.route\."\)/);
  assert.match(client, /`\$\{contract\.surface\}:canonical-adapter:\$\{contract\.actionId\}`/);
  assert.match(client, /action\.operationalAvailability === true/);
  assert.match(client, /action\.authorityGranted === false/);
  assert.match(app, /interactionAction=\{copilotInteractionAction\}/);
  assert.match(app, /realtimeAction=\{realtimeVoiceAction\}/);
  assert.match(app, /textAction=\{voiceOperatorTranscriptAction\}/);
  assert.ok(
    copilot.indexOf("if (!interactionAction.available)") < copilot.indexOf("await admitExecutiveInteraction"),
    "NexusCopilot must reject unavailable interaction admission before creating a canonical interaction",
  );
  assert.ok(
    copilot.indexOf("if (!realtimeAction.available)") < copilot.indexOf('fetch("/api/runtime/realtime-voice"'),
    "NexusCopilot must reject unavailable Realtime before status retrieval",
  );
  assert.match(copilot, /disabled=\{!interactionAction\.available/);
  assert.match(copilot, /disabled=\{!voiceAvailable \|\| !realtimeAction\.available/);
  assert.ok(
    voice.indexOf("if (!liveProviderAvailable)") < voice.indexOf("await client.connect()"),
    "VoiceWorkspace must reject unavailable Realtime before connection",
  );
  assert.match(voice, /const manualCommitVerified = isVerifiedManualCommitStatus\(status\)[\s\S]*const liveProviderAvailable = realtimeAction\.available[\s\S]*manualCommitVerified/);
  assert.match(voice, /disabled=\{!liveProviderAvailable \|\| voiceState === "connecting"\}/);
  assert.match(
    voice,
    /if \(!textAction\.available\) \{[\s\S]{0,1200}executeExplicitPrivateDraftAction\([\s\S]{0,300}admitRuntimeVoiceTranscript\(/,
    "VoiceWorkspace must reject unavailable typed text admission before forwarding",
  );
  assert.match(voice, /disabled=\{!textAction\.available/);
  assert.match(voice, /if \(captured\)/);
  assert.match(voice, /The captured transcript has not been sent/);
  assert.doesNotMatch(voice, /response_timeout/);
  assert.match(voice, /Send captured transcript through governed Voice/);
  assert.match(realtime, /RealtimePcmAppendCoordinator/);
  assert.match(realtime, /addTransceiver\("audio", \{ direction: "inactive" \}\)/);
  assert.doesNotMatch(realtime, /\.addTrack\(/);
  assert.match(realtime, /isProviderOutputEvent\(type\)/);
  assert.match(realtime, /forbidden output event/);
  assert.doesNotMatch(realtime, /RealtimeNarrationResponseGate|requestResponse/);
});

test("canonical execution exposes only registered-session-backed read-only evidence", async () => {
  const [component, client] = await Promise.all([
    read("../src/components/CanonicalExecutionSpine.tsx"),
    read("../src/lib/local-client.ts"),
  ]);

  assert.match(
    component,
    /const \[registeredExecutiveSessionVerified, setRegisteredExecutiveSessionVerified\] = useState\(false\)/,
  );
  assert.match(
    component,
    /next\.registeredExecutiveSessionVerified === true/,
  );
  assert.match(component, /const ready = registeredExecutiveSessionVerified/);
  assert.match(component, /disabled=\{busy\}/);
  assert.match(component, /It cannot admit another effect/);
  assert.match(component, /former Mission creation and direct Action[\s\S]*mutations are retired and return 410/);
  assert.doesNotMatch(component, /createAction|executeAction|restoreAction|createMission/);
  const clientStart = client.indexOf("async function canonicalExecutionRequest");
  const clientEnd = client.indexOf("const post =", clientStart);
  const canonicalClient = client.slice(clientStart, clientEnd);
  assert.match(canonicalClient, /status: \(\) => canonicalExecutionRequest\(""\)/);
  assert.match(canonicalClient, /mission: \(missionId: string\) => canonicalExecutionRequest/);
  assert.doesNotMatch(canonicalClient, /method:\s*"POST"|createMission|executeAction|restoreAction/);
  assert.doesNotMatch(component, /capabilities\.every/);
  assert.doesNotMatch(component, /operationalAvailability/);
});

test("active assistant and Experience presentation copy carries no legacy product identity", async () => {
  // Migrated surfaces: user-facing assistant and Experience copy must use canonical NEXUS language.
  // Preserved on purpose: config/brand.json parentBrand (compatibility data), tenant identifiers,
  // URLs, external contract fixtures in gateway tests, docs, and historical CSS commentary.
  const activePresentationSources = [
    "../src/components/NexusCopilot.tsx",
    "../src/components/VoiceWorkspace.tsx",
    "../src/components/DocumentIntake.tsx",
    "../src/components/ProjectStudio.tsx",
    "../src/components/NexusAvatar.tsx",
    "../src/platform/NexusWorkspaceChrome.tsx",
    "../src/appearance/themes.ts",
  ];
  for (const path of activePresentationSources) {
    const source = await read(path);
    assert.equal(/Nexicron/i.test(source), false, `${path} must not reintroduce the legacy product identity in active copy`);
  }
  const copilot = await read("../src/components/NexusCopilot.tsx");
  assert.match(copilot, /Help plan a NEXUS project/);
});
