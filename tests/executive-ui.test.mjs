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

test("Replit publishes the fixed hosted binding without committing server secrets", async () => {
  const replit = await read("../.replit");
  for (const binding of [
    'COMMAND_PORTAL_OPERATIONAL_API_BASE_URL = "https://nexus-runtime-dev.fly.dev"',
    'COMMAND_PORTAL_OPERATIONAL_ENABLED = "true"',
    'COMMAND_PORTAL_OPERATOR_USER_ID = "nexus-workspace-service"',
    'COMMAND_PORTAL_TENANT_ID = "nexicron"',
    'COMMAND_PORTAL_WORKSPACE_ID = "primary"',
    'COMMAND_PORTAL_OPERATOR_ROLE = "operator"',
    'COMMAND_PORTAL_OPERATIONAL_SCOPES = "operations:read,operations:write,actions:simulate,evidence:write,edge:node_admission:request"',
    'COMMAND_PORTAL_PROVIDER_INTERACTIVE_AUTH_ENABLED = "true"',
    'COMMAND_PORTAL_PROVIDER_SESSION_SECRET_REF = "secret-manager:experience-gateway/mission-3/provider-session-current"',
    'COMMAND_PORTAL_PROVIDER_SESSION_KEY_ID = "provider-session-current"',
    'COMMAND_PORTAL_REPLIT_AUTH_ISSUER = "https://replit.com/oidc"',
    'COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_ID = "registered-executive-session-policy"',
    'COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_VERSION = "1.0.0"',
    'COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_DIGEST = "sha256:b1f6a2cdf2153ac48236867e5e1aeab794842256410f3f314fc2655008a2be78"',
  ]) assert.match(replit, new RegExp(binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const secretName of [
    "COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN",
    "COMMAND_PORTAL_OPERATOR_ACCESS_KEY",
    "COMMAND_PORTAL_RUNTIME_READ_TOKEN",
    "COMMAND_PORTAL_SESSION_SECRET",
    "COMMAND_PORTAL_PROVIDER_SESSION_SECRET",
    "COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_SECRET",
    "COMMAND_PORTAL_EXECUTIVE_REGISTRATIONS_JSON",
    "NEXUS_HUMAN_SESSION_ASSERTION_SECRET",
    "NEXUS_CONTEXT_ASSERTION_SECRET",
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
  assert.match(gate, /Retry secure connection/);
  assert.match(gate, /private deployment admits the user/i);
  assert.match(gate, /Connection grants API access—not operational Authority/i);
  assert.doesNotMatch(gate, /password|accessKey|Operator access key|current-password|KeyRound/);
  for (const forbidden of ['sessionRequest("/login"', "login:", "accessKey"]) {
    assert.equal(client.includes(forbidden), false);
  }
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
  const [app, registry, intake, projects, voice, realtime, client, hif] = await Promise.all([
    read("../src/App.tsx"),
    surfaceRegistry(),
    read("../src/components/DocumentIntake.tsx"),
    read("../src/components/ProjectStudio.tsx"),
    read("../src/components/VoiceWorkspace.tsx"),
    read("../src/lib/realtime-voice-client.ts"),
    read("../src/lib/local-client.ts"),
    read("../src/lib/hif-client.ts"),
  ]);
  for (const label of ["Document Intelligence", "Projects", "Voice Operations"]) {
    assert.equal(registry.surfaces.some((surface) => surface.label === label), true);
  }
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
  assert.match(voice, /localNexusClient\.routeTranscript\(transcript\.trim\(\), "text_fallback"\)/);
  assert.match(voice, /governed NEXUS Runtime Voice Operator/);
  assert.match(hif, /clientId: "nexus-web"/);
  for (const source of [app, intake, projects, voice, realtime, client, hif]) {
    assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(source), false);
  }
});

test("mission control consumes the versioned Runtime parity contract", async () => {
  const [app, workspace, client] = await Promise.all([
    read("../src/App.tsx"), read("../src/components/OperationsWorkspace.tsx"), read("../src/lib/local-client.ts")
  ]);
  for (const label of ["Mission Control", "Mission portfolio", "Mission Executor", "Mission receipts", "Operational Replay", "Capability-specific readiness"]) assert.match(`${app}\n${workspace}`, new RegExp(label));
  for (const operation of ["capabilityReadiness", "missions", "mission", "missionReceipts", "operationalReplayForMission", "planMission"]) assert.match(client, new RegExp(operation));
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
  assert.match(app, /Capability reason/);
  assert.match(app, /AREA_CAPABILITY_IDS/);
  assert.match(app, /Runtime commit/);
  assert.match(app, /runtimeCommit=\{deployedRuntimeCommit\}/);
  assert.match(workspace, /missionCreationAllowed/);
  assert.equal(/ContextBuilder|ContextRegistry|buildOperationalContext/.test(workspace), false);
});

test("Operations Center manifests the Runtime-owned Executive Operating Loop", async () => {
  const [app, center, contract, portalClient] = await Promise.all([
    read("../src/App.tsx"), read("../src/components/OperationsCenter.tsx"), read("../src/lib/eox-client.ts"), read("../src/lib/portal-client.ts")
  ]);
  assert.match(app, /areaFromPath\(window\.location\.pathname\)/);
  assert.match(app, /"web\.dashboard\.operations-center": <OperationsCenter/);
  assert.match(app, /current\.modules\.map\(renderWebModule\)/);
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
  const [app, registry, conclave, client, styles] = await Promise.all([
    read("../src/App.tsx"), surfaceRegistry(),
    read("../src/components/ConclaveWorkspace.tsx"), read("../src/lib/conclave-client.ts"), read("../src/styles.css")
  ]);
  assert.equal(registry.surfaces.find((surface) => surface.id === "conclave")?.label, "Conclave");
  assert.match(app, /<ConclaveWorkspace/);
  for (const label of ["Conclave synthesis", "Dissent preserved", "Not authorized", "Required before progression"]) assert.match(conclave, new RegExp(label));
  assert.match(client, /localNexusClient\.createConclaveWorkspace/);
  assert.match(client, /localNexusClient\.runConclaveWorkspace/);
  assert.match(client, /localNexusClient\.conclaveWorkspace/);
  assert.match(client, /reviewIntegrityVerified === true/);
  assert.match(client, /terminalReceiptVerified === true/);
  assert.match(client, /runPending: true/);
  assert.match(client, /expectedWorkspaceVersion/);
  assert.doesNotMatch(client, /\/api\/runtime\/conclave\/reviews|runConclaveReview/);
  assert.match(conclave, /localNexusClient\.conclaveWorkspaces\(\)/);
  assert.match(conclave, /Durable Runtime workspace/);
  assert.match(conclave, /does not substitute a static one-shot review/);
  assert.match(conclave, /Run governed review/);
  assert.match(conclave, /created workspace was preserved/i);
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
  assert.match(copilot, /plan, scope, and price a NEXUS project/i);
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
  const [app, gate] = await Promise.all([read("../src/App.tsx"), read("../src/components/OperationalAccessGate.tsx")]);
  assert.match(app, /operationalSessionClient\.status\(\)/);
  assert.match(app, /operationalSessionClient\.use\(session\)/);
  assert.match(app, /operationalSessionClient\.use\(\{ authenticated: false \}\)/);
  assert.match(app, /!sessionBootstrapComplete \|\| \(loading && !Object\.keys\(snapshot\)\.length\)/);
  assert.match(app, /const requiresOperationalSession = OPERATIONAL_AREAS\.has\(active\) \|\| \(hostedOperationalConfigured && HOSTED_CONTRACT_AREAS\.has\(active\)\)/);
  assert.match(app, /requiresOperationalSession && !operationalSession\.authenticated/);
  assert.match(app, /<OperationalAccessGate workspace=\{current\.label\}/);
  assert.match(gate, /operationalSessionClient\.status\(\)/);
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

test("new portal destinations render Runtime-backed dashboards without client-side cognition", async () => {
  const [app, registry, client, missions, knowledge, edge, fleet, admission, styles] = await Promise.all([
    read("../src/App.tsx"),
    surfaceRegistry(),
    read("../src/lib/local-client.ts"),
    read("../src/components/MissionDashboard.tsx"),
    read("../src/components/KnowledgeWorkspace.tsx"),
    read("../src/components/EdgeRuntime.tsx"),
    read("../src/components/EdgeNodeFleet.tsx"),
    read("../src/components/EdgeAdmissionWorkspace.tsx"),
    read("../src/styles.css")
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
  for (const operation of ["knowledgeIntake", "knowledgeAcquisition", "knowledgePromotionCandidate", "knowledgeVersions", "knowledgeReceipt", "knowledgePromotions"]) assert.match(client, new RegExp(operation));
  assert.match(knowledge, /policyEligible/);
  for (const gate of ["intakeGate", "acquisitionGate", "promotionGate"]) assert.match(knowledge, new RegExp(gate));
  assert.match(knowledge, /Mission completion never writes to Knowledge Store automatically/);
  for (const field of ["operationalState", "awaitingNodeProof", "requiredNextAction", "replayId"]) assert.match(admission, new RegExp(field));
  assert.match(admission, /Awaiting physical node proof/);
  assert.match(admission, /ADMISSION_REVIEW_SCOPE/);
  assert.match(admission, /reviewPermissionGranted/);
  assert.match(missions, /\["active", "in_progress", "running", "executing"\]/);
  assert.match(missions, /step\.reversible === true/);
  assert.doesNotMatch(missions, /step\.reversible !== false/);
  assert.match(app, /HostedCapabilityBoundary/);
  assert.match(app, /if \(configured && \["live", "degraded"\]\.includes\(capability\.state\)\) return children/);
  assert.match(app, /asCapabilityRegistryProjection/);
  assert.match(app, /action\.invocable !== true/);
  assert.match(app, /No typed handler inventory for/);
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

test("copilot, HIF, and voice controls fail closed on canonical action availability", async () => {
  const [app, client, copilot, voice] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/lib/portal-client.ts"),
    read("../src/components/NexusCopilot.tsx"),
    read("../src/components/VoiceWorkspace.tsx"),
  ]);
  for (const actionId of [
    "context.runtime.route.post.runtime.interactions",
    "context.runtime.route.get.runtime.interactions.events",
    "context.runtime.route.post.runtime.interactions.interrupt",
    "context.runtime.route.post.runtime.voice.realtime.call",
    "canonical.route.post.voice-operator.route-transcript",
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
    copilot.indexOf("if (!interactionAction.available)") < copilot.indexOf("await hifClient.start"),
    "NexusCopilot must reject unavailable HIF before creating an interaction",
  );
  assert.ok(
    copilot.indexOf("if (!realtimeAction.available)") < copilot.indexOf('fetch("/api/runtime/realtime-voice"'),
    "NexusCopilot must reject unavailable Realtime before status retrieval",
  );
  assert.match(copilot, /disabled=\{!interactionAction\.available/);
  assert.match(copilot, /disabled=\{!voiceAvailable \|\| !realtimeAction\.available/);
  assert.ok(
    voice.indexOf("if (!audio.current || !realtimeAction.available)") < voice.indexOf("await client.connect()"),
    "VoiceWorkspace must reject unavailable Realtime before connection",
  );
  assert.ok(
    voice.indexOf("if (!textAction.available)") < voice.indexOf("await localNexusClient.routeTranscript"),
    "VoiceWorkspace must reject unavailable typed text routing before forwarding",
  );
  assert.match(voice, /disabled=\{!textAction\.available/);
});

test("canonical execution retains verified capability readiness across mission responses", async () => {
  const component = await read("../src/components/CanonicalExecutionSpine.tsx");

  assert.match(
    component,
    /const \[capabilityReady, setCapabilityReady\] = useState\(false\)/,
  );
  assert.match(component, /if \(Array\.isArray\(capabilities\)\)/);
  assert.match(
    component,
    /capabilities\.length > 0\s+&& capabilities\.every\(\(item\) => item\.operationalAvailability\)/,
  );
  assert.match(component, /const ready = capabilityReady/);
  assert.doesNotMatch(
    component,
    /view\?\.data\?\.capabilities\?\.every/,
  );
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
