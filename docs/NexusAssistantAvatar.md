# NEXUS Assistant Avatar

The NEXUS assistant presents through one shared, procedural avatar (`src/components/NexusAvatar.tsx` + `NexusAvatar.css`) across the persistent copilot, the Voice workspace, the assistant launcher chrome, and the introduction experience. NEXUS is an executive operating system: Experience presents, the Runtime establishes operational truth, and the avatar is presentation only.

## Six truthful states

The avatar renders exactly six states, each mapped to actual interaction state — never a decorative timer:

| State | Truth source |
|---|---|
| `idle` | No live voice session and no governed text request in flight |
| `listening` | A Realtime voice session is capturing operator audio |
| `thinking` | NEXUS is forming a response (Realtime turn or governed HIF text request), or the voice session is negotiating (`connecting`) |
| `speaking` | Realtime audio output is streaming |
| `interrupted` | The operator interrupted NEXUS mid-response (`response.cancel` + output buffer clear) |
| `error` | The voice session or governed request failed; presentation fails closed |

`deriveAssistantAvatarState({ voiceState, textBusy, hasError })` performs this mapping from the `RealtimeVoiceState` enum plus HIF text-request and error state.

## Amplitude and mute truthfulness

- Motion reacts to `--nx-avatar-amplitude`, driven only by real audio analysis in `RealtimeVoiceClient`.
- When the microphone is muted during listening, amplitude is forced to zero because no audio is being sent; the glyph dims via `data-mic-muted`.
- Output mute keeps responses visible as text; it does not change avatar truth.
- `prefers-reduced-motion: reduce` disables all animation; state remains legible through tone, border, and static bar heights.

## Surfaces

- **Persistent copilot** (`NexusCopilot.tsx`): avatar in the header mark and voice row; the introduction dialog shows the large idle avatar.
- **Voice workspace** (`VoiceWorkspace.tsx`): the large avatar replaces the former voice orb on the Realtime stage.
- **Launcher chrome** (`NexusWorkspaceChrome.tsx`): the copilot toggle mirrors avatar state through `src/lib/assistant-presence.ts`, a presentation-only store that owns no session, credential, or Runtime state and never talks to the gateway.

## Preserved contracts

The avatar changes nothing about: governed HIF text chat, Realtime voice negotiation over the same-origin gateway, microphone/output mute, interruption, skills, message history, route allowlists, signed operational sessions, server-only credentials, or Runtime-owned capability/Authority/execution. Model-native reasoning is not proof; no capability, completed Action, receipt, postcondition, or Outcome may be claimed without Runtime evidence. When the Runtime or voice is unavailable, presentation stays useful but explicit that they are unavailable (`data-unavailable`, "Voice unavailable — Runtime voice cannot be established").

## Responsive behavior

No horizontal overflow at any width. At widths of 820px and below the assistant panel itself scrolls (`overflow-y: auto`) so the composer and footer remain keyboard-reachable; the conversation log is capped so it cannot push the composer off-screen.

Regression coverage: `tests/nexus-avatar.test.mjs`.
