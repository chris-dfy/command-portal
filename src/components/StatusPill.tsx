export function StatusPill({ value, tone }: { value: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const normalized = value.toLowerCase().replaceAll("_", " ");
  const inferred = tone ?? (/verified|connected|complete|enforced/.test(normalized) ? "good" : /staged|pending|fixture|limited|unverified/.test(normalized) ? "warn" : /failed|blocked|disconnected|unavailable/.test(normalized) ? "bad" : "neutral");
  return <span className="status-pill" data-tone={inferred}><i aria-hidden="true" />{normalized}</span>;
}
