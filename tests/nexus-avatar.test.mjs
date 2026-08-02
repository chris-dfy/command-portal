import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the shared NEXUS avatar declares six truthful states and derives them from real interaction state", async () => {
  const avatar = await read("../src/components/NexusAvatar.tsx");
  for (const state of ["idle", "listening", "thinking", "speaking", "interrupted", "error"]) {
    assert.match(avatar, new RegExp(`"${state}"`));
  }
  assert.match(avatar, /deriveAssistantAvatarState/);
  assert.match(avatar, /voiceState: RealtimeVoiceState/);
  assert.match(avatar, /textBusy/);
  assert.match(avatar, /hasError/);
  // Interruption and errors map to dedicated states rather than being hidden.
  assert.match(avatar, /if \(voiceState === "error"\) return "error"/);
  assert.match(avatar, /if \(voiceState === "interrupted"\) return "interrupted"/);
  // Muted microphone truthfully zeroes amplitude because no audio is being sent.
  assert.match(avatar, /state === "listening" && micMuted \? 0/);
  // No decorative timers: the component accepts no duration or timer props.
  assert.equal(/setTimeout|setInterval/.test(avatar), false);
});

test("the avatar stylesheet is amplitude-reactive and honors reduced motion", async () => {
  const css = await read("../src/components/NexusAvatar.css");
  assert.match(css, /--nx-avatar-amplitude/);
  for (const state of ["idle", "listening", "thinking", "speaking", "interrupted", "error"]) {
    assert.match(css, new RegExp(`data-state="${state}"`));
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation: none !important/);
});

test("the persistent copilot, voice workspace, launcher, and introduction share the avatar", async () => {
  const [copilot, voice, chrome] = await Promise.all([
    read("../src/components/NexusCopilot.tsx"),
    read("../src/components/VoiceWorkspace.tsx"),
    read("../src/platform/NexusWorkspaceChrome.tsx"),
  ]);
  for (const source of [copilot, voice, chrome]) {
    assert.match(source, /NexusAvatar/);
    assert.match(source, /NexusAvatar\.css/);
  }
  assert.match(copilot, /deriveAssistantAvatarState\(\{ voiceState, textBusy: busy \|\| browserListening, hasError: Boolean\(error\) \}\)/);
  assert.match(voice, /deriveAssistantAvatarState\(\{ voiceState, textBusy: busy, hasError: false \}\)/);
  // The launcher mirrors presentation state through the presence store and owns no session state.
  assert.match(chrome, /assistantPresence/);
  assert.match(chrome, /useSyncExternalStore/);
  assert.equal(/RealtimeVoiceClient|hifClient|fetch\(/.test(chrome), false);
  // The introduction experience renders the avatar.
  assert.match(copilot, /nexus-introduction__avatar/);
});

test("the presence store is presentation-only", async () => {
  const presence = await read("../src/lib/assistant-presence.ts");
  assert.match(presence, /voiceConnected/);
  assert.equal(/fetch\(|token|localStorage|document\.cookie/i.test(presence), false);
  assert.match(presence, /never talks to the gateway and holds no credentials/);
});

test("disconnected presentation stays explicit and the panel remains reachable on small screens", async () => {
  const [copilot, platformCss] = await Promise.all([
    read("../src/components/NexusCopilot.tsx"),
    read("../src/platform/nexus-platform.css"),
  ]);
  assert.match(copilot, /Voice unavailable — Runtime voice cannot be established/);
  // At 820px and below, the assistant panel scrolls so the composer and footer stay keyboard-reachable.
  const mobileBlock = platformCss.slice(platformCss.indexOf("@media (max-width: 820px)"));
  assert.match(mobileBlock, /\.nexus-copilot[\s\S]*?overflow-y: auto/);
  assert.match(mobileBlock, /overflow-x: clip/);
});

test("voice, mute, interruption, and Runtime truth contracts are preserved", async () => {
  const [copilot, voice, realtime] = await Promise.all([
    read("../src/components/NexusCopilot.tsx"),
    read("../src/components/VoiceWorkspace.tsx"),
    read("../src/lib/realtime-voice-client.ts"),
  ]);
  assert.match(copilot, /admitExecutiveInteraction\(request, "text", conversationId\.current\)/);
  assert.match(copilot, /setMicrophoneMuted/);
  assert.match(copilot, /setOutputMuted/);
  assert.match(realtime, /"interrupted"/);
  assert.match(voice, /WebRTC carries microphone input only/i);
  assert.match(copilot, /Runtime evidence remains authoritative/);
});
