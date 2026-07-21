export type StatusPillTone = "good" | "warn" | "bad" | "neutral";

const CRITICAL_STATE = /\b(failed|failure|error|blocked|disconnected|unavailable|unauthorized|timed out|timeout|mismatch|unknown|denied|rejected|critical|invalid)\b/;
const ATTENTION_STATE = /\b(degraded|retrying|connecting|staged|pending|limited|unverified|stale|awaiting|incomplete|warning|attention|required|review|draft|offline)\b|not (verified|established|authorized|available|ready)/;
const SUCCESS_STATE = /\b(healthy|compatible|verified|connected|complete|completed|enforced|reachable|fresh|authenticated|authorized|approved|promoted|ready|success|successful|passed)\b/;

export function inferStatusPillTone(value: string): StatusPillTone {
  const normalized = value.trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
  if (CRITICAL_STATE.test(normalized)) return "bad";
  if (ATTENTION_STATE.test(normalized)) return "warn";
  if (SUCCESS_STATE.test(normalized)) return "good";
  return "neutral";
}

export function StatusPill({ value, tone }: { value: string; tone?: StatusPillTone }) {
  const normalized = value.trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
  const inferred = tone ?? inferStatusPillTone(normalized);
  const nexusTone = inferred === "good" ? "success" : inferred === "warn" ? "attention" : inferred === "bad" ? "critical" : "neutral";
  return <span className="status-pill nx-status" data-tone={inferred} data-nexus-tone={nexusTone}><i aria-hidden="true" />{normalized}</span>;
}
