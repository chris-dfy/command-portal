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
  for (const label of ["Document Intelligence", "Nexicron Projects", "Voice Operator"]) assert.match(app, new RegExp(label));
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
  assert.match(app, /useState<AreaId>\("center"\)/);
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

test("NEXUS remains a Runtime-governed conversational copilot across every portal area", async () => {
  const [app, copilot, hif, realtime, styles] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/NexusCopilot.tsx"),
    read("../src/lib/hif-client.ts"),
    read("../src/lib/realtime-voice-client.ts"),
    read("../src/styles.css"),
  ]);
  assert.match(app, /<NexusCopilot/);
  assert.match(copilot, /Enterprise executive operating intelligence/);
  assert.match(copilot, /hifClient\.start\(request, "text", \{\}, conversationId\.current\)/);
  assert.match(copilot, /RealtimeVoiceClient/);
  assert.match(copilot, /Model-native reasoning is labeled\. Runtime evidence remains authoritative/);
  assert.match(copilot, /plan, scope, and price a Nexicron project/i);
  assert.match(hif, /conversationId/);
  assert.match(realtime, /RTCPeerConnection/);
  assert.doesNotMatch(app, /Begin Executive Briefing/);
  assert.match(styles, /Persistent NEXUS executive copilot/);
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
  const [styles, app] = await Promise.all([read("../src/styles.css"), read("../src/App.tsx")]);
  assert.match(styles, /@media \(max-width: 820px\)/);
  assert.match(styles, /@media \(max-width: 580px\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /prefers-contrast/);
  assert.match(app, /Skip to portal content/);
  assert.match(app, /aria-label="Toggle navigation"/);
});
