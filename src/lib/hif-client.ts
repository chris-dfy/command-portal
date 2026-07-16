export type HifEventType =
  | "SpeechStarted" | "SpeechCompleted" | "SpeechInterrupted"
  | "ConversationStarted" | "ConversationCompleted"
  | "AvatarMoveRequested" | "AvatarPulseRequested"
  | "HighlightRequested" | "NavigationRequested" | "FocusRequested"
  | "PresentationStarted" | "PresentationCompleted"
  | "StreamingStarted" | "StreamingChunk" | "StreamingCompleted";

export type HifEvent = {
  schemaVersion: "1.0.0";
  sequence: number;
  type: HifEventType;
  interactionId: string;
  conversationId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type HifInteraction = {
  schemaVersion: "1.0.0";
  interactionId: string;
  conversationId: string;
  clientId: string;
  state: string;
  responseText: string;
  intentResolution?: { name: string; subject?: string | null; confidence: number; limitations: string[] };
  limitations: string[];
  proofIds: string[];
};

type RuntimeEnvelope<T> = { status: string; data: T; proofIds: string[]; limitations: string[] };
type GatewayEnvelope<T> = { ok: boolean; data: T | null; error?: { message?: string } };

export type HifPresentationState = {
  speech: "idle" | "speaking" | "interrupted";
  avatarMode: string;
  navigationTarget: string | null;
  highlightTarget: string | null;
  focusTarget: string | null;
  presentationMode: string | null;
  streamedText: string;
};

export const initialHifPresentationState: HifPresentationState = {
  speech: "idle", avatarMode: "idle", navigationTarget: null, highlightTarget: null,
  focusTarget: null, presentationMode: null, streamedText: "",
};

export function presentHifEvents(events: HifEvent[], initial = initialHifPresentationState): HifPresentationState {
  return events.reduce((state, event) => {
    const value = (key: string) => String(event.payload[key] ?? "") || null;
    switch (event.type) {
      case "SpeechStarted": return { ...state, speech: "speaking", avatarMode: "speaking" };
      case "SpeechCompleted": return { ...state, speech: "idle", avatarMode: "ready" };
      case "SpeechInterrupted": return { ...state, speech: "interrupted", avatarMode: "listening" };
      case "AvatarMoveRequested": return { ...state, avatarMode: value("movement") ?? state.avatarMode };
      case "AvatarPulseRequested": return { ...state, avatarMode: value("mode") ?? state.avatarMode };
      case "NavigationRequested": return { ...state, navigationTarget: value("target") };
      case "HighlightRequested": return { ...state, highlightTarget: value("target") };
      case "FocusRequested": return { ...state, focusTarget: value("target") };
      case "PresentationStarted": return { ...state, presentationMode: value("mode") };
      case "PresentationCompleted": return { ...state, presentationMode: null };
      case "StreamingStarted": return { ...state, streamedText: "" };
      case "StreamingChunk": return { ...state, streamedText: state.streamedText + String(event.payload.text ?? "") };
      default: return state;
    }
  }, initial);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/runtime/interactions${path}`, {
    ...options,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(options?.body ? { "Content-Type": "application/json" } : {}) },
  });
  const gateway = await response.json() as GatewayEnvelope<RuntimeEnvelope<T>>;
  if (!response.ok || !gateway.ok || !gateway.data?.data) throw new Error(gateway.error?.message ?? `HIF request failed (${response.status})`);
  return gateway.data.data;
}

export const hifClient = Object.freeze({
  start: (inputText: string, modality: string, presentation: Record<string, unknown> = {}, conversationId?: string) => request<{ interaction: HifInteraction; events: HifEvent[] }>("", {
    method: "POST",
    body: JSON.stringify({ clientId: "nexus-web", inputText, modality, kind: "converse", conversationId, stream: true, speechRequested: true, presentation }),
  }),
  events: (interactionId: string) => request<{ events: HifEvent[] }>(`/${encodeURIComponent(interactionId)}/events`),
  interrupt: (interactionId: string) => request<{ interaction: HifInteraction; events: HifEvent[] }>(`/${encodeURIComponent(interactionId)}/interrupt`, {
    method: "POST", body: JSON.stringify({ reason: "user_barge_in" }),
  }),
});
