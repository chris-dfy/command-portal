import type { GatewayEnvelope } from "./types";

export const asRecord = (domain?: GatewayEnvelope) => (domain?.data ?? {}) as Record<string, unknown>;

export const asItems = (domain?: GatewayEnvelope) => Array.isArray(domain?.data) ? domain.data as Record<string, unknown>[] : [];

export const displayLabel = (value: unknown) => String(value ?? "unavailable").replaceAll("_", " ");

export type PresentationTone = "good" | "warn" | "bad" | "neutral";

export function statusTone(value: unknown): PresentationTone {
  const normalized = String(value ?? "").toLowerCase();
  if (/healthy|compatible|verified|complete|connected|enforced|isolated|reachable|available|fresh/.test(normalized)) return "good";
  if (/failed|blocked|disconnected|unavailable|unauthorized|timed out|mismatch|unknown|exposed/.test(normalized)) return "bad";
  if (/degraded|retrying|connecting|pending|staged|limited|unverified|not connected|not issued|not deployed|preview|mock|stale/.test(normalized)) return "warn";
  return "neutral";
}
