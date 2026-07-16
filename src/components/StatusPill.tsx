export function StatusPill({ value, tone }: { value: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const normalized = value.toLowerCase().replaceAll("_", " ");
  const inferred = tone ?? (/healthy|compatible|verified|connected|complete|enforced|reachable|fresh/.test(normalized) ? "good" : /degraded|retrying|connecting|staged|pending|limited|unverified|stale/.test(normalized) ? "warn" : /failed|blocked|disconnected|unavailable|unauthorized|timed out|mismatch|unknown/.test(normalized) ? "bad" : "neutral");
  return <span className="status-pill" data-tone={inferred}><i aria-hidden="true" />{normalized}</span>;
}
