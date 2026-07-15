import type { DomainEnvelope } from "./types";

export const asRecord = (domain?: DomainEnvelope) => (domain?.data ?? {}) as Record<string, unknown>;

export const asItems = (domain?: DomainEnvelope) => {
  const value = asRecord(domain).items;
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
};

export const displayLabel = (value: unknown) => String(value ?? "unavailable").replaceAll("_", " ");

export type PresentationTone = "good" | "warn" | "bad" | "neutral";

export function statusTone(value: unknown): PresentationTone {
  const normalized = String(value ?? "").toLowerCase();
  if (/verified|complete|connected|enforced|isolated|available|local only/.test(normalized)) return "good";
  if (/failed|blocked|disconnected|unavailable|exposed/.test(normalized)) return "bad";
  if (/pending|staged|fixture|limited|unverified|not connected|not issued|not deployed|preview|mock/.test(normalized)) return "warn";
  return "neutral";
}
