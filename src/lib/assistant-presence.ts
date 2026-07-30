import type { NexusAvatarState } from "../components/NexusAvatar";

export type AssistantPresence = {
  state: NexusAvatarState;
  amplitude: number;
  voiceConnected: boolean;
};

const initial: AssistantPresence = { state: "idle", amplitude: 0, voiceConnected: false };

let current: AssistantPresence = initial;
const listeners = new Set<() => void>();

/**
 * Minimal presentation-only store so the assistant launcher chrome can mirror
 * the copilot's truthful avatar state without owning any voice, session, or
 * Runtime state. It never talks to the gateway and holds no credentials.
 */
export const assistantPresence = {
  get: (): AssistantPresence => current,
  set(next: AssistantPresence) {
    if (next.state === current.state && next.amplitude === current.amplitude && next.voiceConnected === current.voiceConnected) return;
    current = next;
    for (const listener of listeners) listener();
  },
  reset() {
    assistantPresence.set(initial);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
