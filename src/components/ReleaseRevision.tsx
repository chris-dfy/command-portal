import "./ReleaseRevision.css";

export function ReleaseRevision({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const revision = value.trim() || "Unavailable";
  return (
    <article className="release-revision">
      <span>{label}</span>
      <strong>
        <code title={revision} aria-label={`${label} ${revision}`}>
          {revision}
        </code>
      </strong>
    </article>
  );
}
