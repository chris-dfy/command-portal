import type { CSSProperties } from "react";
import type { RealtimeVoiceState } from "../lib/realtime-voice-client";

/**
 * The six truthful presentation states of the NEXUS assistant avatar.
 * Every state maps to actual interaction state — never a decorative timer:
 * - idle: no live voice session and no text request in flight.
 * - listening: a live Realtime voice session is capturing operator audio.
 * - thinking: NEXUS is forming a response (Realtime turn or governed HIF text request), or the voice session is negotiating.
 * - speaking: NEXUS Realtime audio output is streaming.
 * - interrupted: the operator interrupted NEXUS mid-response.
 * - error: the voice session or governed request failed; presentation fails closed.
 */
export type NexusAvatarState = "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export const NEXUS_AVATAR_STATES: readonly NexusAvatarState[] = ["idle", "listening", "thinking", "speaking", "interrupted", "error"];

export const NEXUS_AVATAR_STATE_LABELS: Record<NexusAvatarState, string> = {
  idle: "NEXUS is idle",
  listening: "NEXUS is listening",
  thinking: "NEXUS is thinking",
  speaking: "NEXUS is speaking",
  interrupted: "NEXUS was interrupted",
  error: "NEXUS reported an error",
};

/**
 * Derive the truthful avatar state from actual voice, text, and error state.
 * Realtime voice state wins because it is the live interaction channel;
 * "connecting" presents as thinking (session negotiation is real work, not proof of readiness).
 */
export function deriveAssistantAvatarState({ voiceState, textBusy, hasError }: {
  voiceState: RealtimeVoiceState;
  textBusy: boolean;
  hasError: boolean;
}): NexusAvatarState {
  if (voiceState === "error") return "error";
  if (voiceState === "interrupted") return "interrupted";
  if (voiceState === "speaking") return "speaking";
  if (voiceState === "thinking" || voiceState === "connecting") return "thinking";
  if (voiceState === "listening") return "listening";
  if (textBusy) return "thinking";
  if (hasError) return "error";
  return "idle";
}

/**
 * Procedural NEXUS avatar: a layered core, equalizer glyph, and orbital ring
 * rendered entirely with CSS. Amplitude-reactive motion is driven by the
 * `--nx-avatar-amplitude` custom property from real audio analysis; when the
 * microphone is muted during listening, amplitude is truthfully forced to
 * zero because no audio is being sent. Honors prefers-reduced-motion.
 */
export function NexusAvatar({ state, amplitude = 0, size = "md", micMuted = false, unavailable = false, label, className }: {
  state: NexusAvatarState;
  amplitude?: number;
  size?: "xs" | "sm" | "md" | "lg";
  micMuted?: boolean;
  unavailable?: boolean;
  label?: string;
  className?: string;
}) {
  const truthfulAmplitude = state === "listening" && micMuted ? 0 : Math.max(0, Math.min(1, amplitude));
  return (
    <span
      className={`nexus-avatar${className ? ` ${className}` : ""}`}
      data-state={state}
      data-size={size}
      data-mic-muted={micMuted || undefined}
      data-unavailable={unavailable || undefined}
      role="img"
      aria-label={label ?? NEXUS_AVATAR_STATE_LABELS[state]}
      style={{ "--nx-avatar-amplitude": truthfulAmplitude } as CSSProperties}
    >
      <span className="nexus-avatar__halo" aria-hidden="true" />
      <span className="nexus-avatar__orbit" aria-hidden="true" />
      <span className="nexus-avatar__core" aria-hidden="true">
        <span className="nexus-avatar__glyph">
          <i /><i /><i /><i />
        </span>
      </span>
    </span>
  );
}
