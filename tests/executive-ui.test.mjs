import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("status bar displays the independent Phase 5X-D health model", async () => {
  const source = await read("../src/components/ExecutiveStatusBar.tsx");
  for (const label of ["Gateway Health", "Runtime Health", "Provider Registry", "Environment", "Connection", "Version", "Diagnostics"]) {
    assert.match(source, new RegExp(`title: \\"${label}\\"`));
  }
  assert.match(source, /aria-label="Experience Gateway health model"/);
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
  const [source, app] = await Promise.all([read("../src/components/RuntimeHealth.tsx"), read("../src/App.tsx")]);
  for (const state of ["Connecting", "Healthy", "Degraded", "Unavailable", "Retrying", "Timed Out", "Version Mismatch", "Schema Mismatch", "Unauthorized", "Unknown"]) {
    assert.match(source, new RegExp(`\"${state}\"`));
  }
  assert.match(app, /if \(!Object\.keys\(snapshot\)\.length\) return loading \? "Connecting" : "Unavailable"/);
  assert.match(app, /if \(loading\) return "Retrying"/);
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
  assert.match(client, /unavailableEnvelope/);
  assert.match(client, /code: "gateway_unreachable"/);
  assert.match(client, /failures\.push\(envelope\)/);
  assert.equal(types.includes("runtimeToken"), false);
  assert.equal(/VITE_.*TOKEN/.test(env), false);
});

test("local-first workspaces delegate intake, project intelligence, and Realtime voice to Runtime", async () => {
  const [app, intake, projects, voice, realtime, client, hif] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/DocumentIntake.tsx"),
    read("../src/components/ProjectStudio.tsx"),
    read("../src/components/VoiceWorkspace.tsx"),
    read("../src/lib/realtime-voice-client.ts"),
    read("../src/lib/local-client.ts"),
    read("../src/lib/hif-client.ts"),
  ]);
  for (const label of ["Document Intelligence", "Projects", "Voice Operations"]) assert.match(app, new RegExp(label));
  for (const contract of ["/intake/upload", "/intake/query", "/projects", "/scope", "/estimate", "/planning-model", "/compile", "/voice-operator/route-transcript"]) assert.match(client, new RegExp(contract));
  assert.match(intake, /FileReader/);
  assert.match(intake, /projectId/);
  assert.match(intake, /Ask ingested sources/);
  assert.match(projects, /browser performs no project calculation/i);
  assert.match(projects, /Missing rates or quantities remain missing/i);
  assert.match(projects, /never fabricates a price/i);
  assert.match(realtime, /RTCPeerConnection/);
  assert.match(realtime, /echoCancellation: true/);
  assert.match(realtime, /output_audio_buffer\.clear/);
  assert.match(realtime, /setMicrophoneMuted/);
  assert.match(realtime, /track\.enabled = !this\.microphoneMuted/);
  assert.match(realtime, /setOutputMuted/);
  assert.match(realtime, /this\.audio\.muted = muted/);
  for (const control of ["Mute microphone", "Mute NEXUS", "Unmute microphone", "Unmute NEXUS"]) assert.match(voice, new RegExp(control));
  assert.match(voice, /Runtime owns the provider session and truth boundaries/i);
  assert.match(voice, /model-native knowledge/i);
  assert.equal(/SpeechRecognition|speechSynthesis/.test(voice + realtime), false);
  for (const event of ["SpeechStarted", "SpeechInterrupted", "ConversationStarted", "AvatarMoveRequested", "NavigationRequested", "FocusRequested", "PresentationStarted", "StreamingChunk"]) assert.match(hif, new RegExp(event));
  assert.match(voice, /hifClient\.start/);
  assert.match(hif, /clientId: "nexus-web"/);
  for (const source of [app, intake, projects, voice, realtime, client, hif]) {
    assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(source), false);
  }
});

test("mission control consumes the versioned Runtime parity contract", async () => {
  const [app, workspace, client] = await Promise.all([
    read("../src/App.tsx"), read("../src/components/OperationsWorkspace.tsx"), read("../src/lib/local-client.ts")
  ]);
  for (const label of ["Mission Control", "Work Sessions", "Approval queue", "Simulate before governed action", "Connector readiness"]) assert.match(`${app}\n${workspace}`, new RegExp(label));
  for (const operation of ["clientCapabilities", "planMission", "startWorkSession", "controlWorkSession", "approve", "deny", "dryRunAction", "executeAction", "connectors"]) assert.match(client, new RegExp(operation));
  assert.match(workspace, /Operational behavior, context assembly, governance decisions, proofs, and receipts remain owned by NEXUS Runtime/);
  assert.match(workspace, /Runtime policy and approval gates remain authoritative/);
  for (const boundary of ["Hosted Operational Gateway", "HttpOnly session", "CSRF verification", "single-workspace hosted alpha", "Production multi-tenant readiness remains false"]) assert.match(workspace, new RegExp(boundary));
  assert.match(client, /Idempotency-Key/);
  assert.match(client, /operationalSessionClient/);
  assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(workspace), false);
});

test("Operations Center manifests the Runtime-owned Executive Operating Loop", async () => {
  const [app, center, contract, portalClient] = await Promise.all([
    read("../src/App.tsx"), read("../src/components/OperationsCenter.tsx"), read("../src/lib/eox-client.ts"), read("../src/lib/portal-client.ts")
  ]);
  assert.match(app, /return AREAS\.some\(\(area\) => area\.id === value\) \? value : "dashboard"/);
  assert.match(app, /active === "dashboard"/);
  for (const label of ["Operations Center", "Executive Brief", "Operational Health", "Attention Queue", "Recommended Actions", "Operational Understanding", "Mission Timeline", "Executive state"]) assert.match(center, new RegExp(label));
  assert.match(center, /assessment\.loop\.map/);
  assert.match(center, /Executive Operating Loop/);
  assert.match(portalClient, /"eox"/);
  for (const significance of ["Business impact", "Operational impact", "Mission impact", "Why this matters"]) assert.match(center, new RegExp(significance, "i"));
  assert.doesNotMatch(center, /Begin Executive Briefing|speechSynthesis|HighlightRequested|eoxClient/);
  assert.match(center, /persistent NEXUS copilot is the client presentation surface/i);
  assert.doesNotMatch(contract, /beginBriefing|speechRequested|\/api\/runtime\/executive-briefing/);
  assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(center + contract), false);
});

test("Conclave is a visible Runtime-owned decision challenge capability", async () => {
  const [app, navigation, conclave, client, styles] = await Promise.all([
    read("../src/App.tsx"), read("../src/platform/navigation.ts"),
    read("../src/components/ConclaveWorkspace.tsx"), read("../src/lib/conclave-client.ts"), read("../src/styles.css")
  ]);
  assert.match(navigation, /label: "Conclave"/);
  assert.match(app, /<ConclaveWorkspace/);
  for (const label of ["Conclave synthesis", "Dissent preserved", "Not authorized", "Required before progression"]) assert.match(conclave, new RegExp(label));
  assert.match(client, /\/api\/runtime\/conclave\/reviews/);
  assert.match(conclave, /useState\(""\)/);
  assert.match(conclave, /placeholder=\{suggestedProposal\}/);
  assert.doesNotMatch(client, /gateway\.data\.data/);
  assert.match(conclave, /execution/i);
  assert.match(styles, /understanding-grid \{ grid-template-columns: repeat\(2/);
  assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(conclave + client), false);
});

test("NEXUS remains a Runtime-governed conversational copilot across every portal area", async () => {
  const [app, copilot, hif, realtime, styles, platformStyles] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/NexusCopilot.tsx"),
    read("../src/lib/hif-client.ts"),
    read("../src/lib/realtime-voice-client.ts"),
    read("../src/styles.css"),
    read("../src/platform/nexus-platform.css"),
  ]);
  assert.match(app, /<NexusCopilot/);
  assert.match(app, /className="nx-app-shell nx-hosted-shell"/);
  assert.doesNotMatch(app, /className="nx-platform"/);
  assert.match(app, /open=\{copilotOpen\}/);
  assert.match(copilot, /open: boolean/);
  assert.match(copilot, /Enterprise executive operating intelligence/);
  assert.match(copilot, /hifClient\.start\(request, "text", \{\}, conversationId\.current\)/);
  assert.match(copilot, /RealtimeVoiceClient/);
  assert.match(copilot, /Model-native reasoning is labeled\. Runtime evidence remains authoritative/);
  assert.match(copilot, /plan, scope, and price a Nexicron project/i);
  for (const control of ["Mute mic", "Mute NEXUS", "Unmute mic", "Unmute NEXUS"]) assert.match(copilot, new RegExp(control));
  assert.match(copilot, /if \(voiceConnected\) stopVoice\(\)/);
  assert.match(hif, /conversationId/);
  assert.match(hif, /return gateway\.data/);
  assert.doesNotMatch(hif, /gateway\.data\.data/);
  assert.match(realtime, /RTCPeerConnection/);
  assert.doesNotMatch(app, /Begin Executive Briefing/);
  assert.match(styles, /Persistent NEXUS executive copilot/);
  assert.match(platformStyles, /Canonical hosted NEXUS Platform shell/);
  assert.match(platformStyles, /\.nx-app-shell \{/);
  assert.match(platformStyles, /container-name: portal-main/);
  assert.match(styles, /@container portal-main/);
  assert.match(styles, /Modules respond to the workspace width/);
  for (const source of [app, copilot, hif]) {
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

  for (const breakpoint of [1100, 900, 680, 460]) {
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
  const app = await read("../src/App.tsx");
  assert.match(app, /operationalSessionClient\.status\(\)/);
  assert.match(app, /operationalSessionClient\.use\(session\)/);
  assert.match(app, /operationalSessionClient\.use\(\{ authenticated: false \}\)/);
  assert.match(app, /!sessionBootstrapComplete \|\| \(loading && !Object\.keys\(snapshot\)\.length\)/);
  for (const mapping of ['replay: "replay"', 'missions: "missions"', 'knowledge: "knowledge"', 'edge: "edge"']) assert.match(app, new RegExp(mapping));
  assert.doesNotMatch(app, /as never/);
});

test("canonical consolidation exposes every permanent platform workspace", async () => {
  const [app, navigation, missions, replay, knowledge, conclave, platformStyles, workspaceFrame, appearance] = await Promise.all([
    read("../src/App.tsx"), read("../src/platform/navigation.ts"), read("../src/components/MissionDashboard.tsx"),
    read("../src/components/OperationalReplay.tsx"), read("../src/components/KnowledgeWorkspace.tsx"),
    read("../src/components/ConclaveWorkspace.tsx"), read("../src/platform/nexus-platform.css"),
    read("../src/platform/NexusWorkspaceFrame.tsx"), read("../src/appearance/AppearanceWorkspace.tsx")
  ]);
  for (const label of ["Dashboard", "Missions", "Operational Replay", "Conclave", "Knowledge", "Edge Runtime", "Mission Control", "Settings"]) assert.match(navigation, new RegExp(`label: "${label}"`));
  for (const label of ["Active Missions", "Blocked Missions", "Completed Missions", "Mission Health", "Mission Executor", "Mission receipts"]) assert.match(missions, new RegExp(label, "i"));
  for (const label of ["Replay pipeline visualization", "Stage Inspector", "Explain This Step", "Executive Mode", "Engineering Mode", "Failure Replay", "Export"]) assert.match(replay, new RegExp(label, "i"));
  for (const label of ["Mission Store", "Knowledge Store", "Knowledge Promotion Engine", "Promotion Receipts"]) assert.match(knowledge, new RegExp(label, "i"));
  for (const label of ["Mission", "Objectives", "Knowledge", "Unknowns", "Task Graph", "Specialists", "Evidence", "Knowledge Graph", "Operational Replay", "Executive Conclusions"]) assert.match(conclave, new RegExp(label));
  for (const component of ["NexusExecutiveNavigation", "NexusPlatformRail", "NexusWorkspaceCommandBar", "NexusWorkspaceFrame", "NexusActivityStream", "NexusContextInspector"]) assert.match(app, new RegExp(`<${component}`));
  assert.match(workspaceFrame, /<NexusPageHeader/);
  assert.match(app, /useAppearanceSettings\(\)/);
  assert.match(app, /<AppearanceWorkspace appearance=\{appearance\}/);
  assert.match(appearance, /NEXUS_THEMES\.map/);
  assert.match(platformStyles, /Canonical hosted NEXUS Platform shell/);
  const tokenImport = app.indexOf('import "./design-system/nexus-tokens.css"');
  const foundationImport = app.indexOf('import "./design-system/nexus-foundation.css"');
  const shellImport = app.indexOf('import "./platform/nexus-platform.css"');
  assert.equal(tokenImport >= 0 && tokenImport < foundationImport && foundationImport < shellImport, true);
  assert.doesNotMatch(app, /className=\{`portal-shell/);
  assert.doesNotMatch(app, /className="nx-platform"/);
});

test("Operational Replay surfaces Runtime-owned stage playback with truthful boundaries", async () => {
  const [app, navigation, replay, client] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/platform/navigation.ts"),
    read("../src/components/OperationalReplay.tsx"),
    read("../src/lib/replay-client.ts")
  ]);
  assert.match(navigation, /label: "Operational Replay"/);
  assert.match(app, /<OperationalReplay/);
  for (const stage of ["Observation", "Evidence", "Representation", "Conclave", "Authority", "Decision", "Receipt"]) {
    assert.match(replay, new RegExp(`label: "${stage}"`));
  }
  for (const control of ["Restart", "Previous", "Play", "Pause", "Next"]) {
    assert.match(replay, new RegExp(`<span>${control}</span>`));
  }
  assert.match(replay, /Explain This Step/);
  assert.match(replay, /Runtime supplied no explanation for this stage\./);
  assert.match(replay, /STAGE_INTERVAL_BASE_MS \/ speed/);
  assert.match(client, /\/api\/runtime\/replay/);
  assert.equal(client.includes("COMMAND_PORTAL_RUNTIME_READ_TOKEN"), false);
  assert.equal(client.includes("Authorization"), false);
  assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(replay + client), false);
});

test("new portal destinations render Runtime-backed dashboards without client-side cognition", async () => {
  const [app, navigation, client, missions, knowledge, edge, fleet, admission, styles] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/platform/navigation.ts"),
    read("../src/lib/local-client.ts"),
    read("../src/components/MissionDashboard.tsx"),
    read("../src/components/KnowledgeWorkspace.tsx"),
    read("../src/components/EdgeRuntime.tsx"),
    read("../src/components/EdgeNodeFleet.tsx"),
    read("../src/components/EdgeAdmissionWorkspace.tsx"),
    read("../src/styles.css")
  ]);
  for (const label of ["Missions", "Knowledge", "Edge Runtime"]) assert.match(navigation, new RegExp(`label: "${label}"`));
  assert.match(app, /<MissionDashboard/);
  assert.match(app, /<KnowledgeWorkspace/);
  assert.match(app, /<EdgeRuntime/);
  assert.match(app, /<RuntimeTopology/);
  assert.match(edge, /<EdgeNodeFleet/);
  assert.match(client, /missions: \(\) => request<Record<string, unknown>>\("\/missions"\)/);
  assert.match(client, /runtimeNodes: \(\) => request<RuntimeNodeFleet>\("\/runtime-coordination\/nodes"\)/);
  for (const path of [
    "/runtime-coordination/admissions",
    "/cancel",
    "/challenge/reissue",
    "/receipt",
    "/replay",
  ]) assert.match(client, new RegExp(path.replaceAll("/", "\\/")));
  assert.match(client, /createRuntimeAdmission/);
  assert.match(client, /runtimeAdmissionReceipt/);
  assert.match(client, /runtimeAdmissionReplay/);
  assert.match(knowledge, /Mission Store/);
  assert.match(knowledge, /Knowledge Store/);
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
  assert.match(admission, /capability\?\.available === true/);
  assert.match(admission, /dependenciesReady/);
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
