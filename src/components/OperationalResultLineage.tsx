import { FileCheck2, History, ShieldCheck } from "lucide-react";

export type OperationalReplayTarget = {
  kind: "mission" | "receipt" | "replay";
  id: string;
};

export type OpenOperationalReplay = (target: OperationalReplayTarget) => void;

const compactReference = (value: string, leading = 14, trailing = 8) => (
  value.length > leading + trailing + 1
    ? `${value.slice(0, leading)}…${value.slice(-trailing)}`
    : value
);

export function OperationalResultLineage({
  proofId,
  receiptId,
  replayId,
  missionId,
  onOpenReplay,
  empty = "The Runtime did not return proof, receipt, or Replay lineage for this result.",
}: {
  proofId?: string | null;
  receiptId?: string | null;
  replayId?: string | null;
  missionId?: string | null;
  onOpenReplay?: OpenOperationalReplay;
  empty?: string;
}) {
  const target: OperationalReplayTarget | null = replayId
    ? { kind: "replay", id: replayId }
    : receiptId
      ? { kind: "receipt", id: receiptId }
      : missionId
        ? { kind: "mission", id: missionId }
        : null;
  const references = [
    proofId ? { label: "Proof", value: proofId, icon: <ShieldCheck size={13} /> } : null,
    receiptId ? { label: "Receipt", value: receiptId, icon: <FileCheck2 size={13} /> } : null,
    replayId ? { label: "Replay", value: replayId, icon: <History size={13} /> } : null,
  ].filter((item): item is { label: string; value: string; icon: JSX.Element } => item !== null);

  return <section className="operational-result-lineage" aria-label="Operational result lineage">
    {references.length ? <dl>{references.map((reference) => <div key={`${reference.label}-${reference.value}`}>
      <dt>{reference.icon}{reference.label}</dt>
      <dd><code title={reference.value}>{compactReference(reference.value)}</code></dd>
    </div>)}</dl> : <p>{empty}</p>}
    {target && onOpenReplay && <button type="button" onClick={() => onOpenReplay(target)}>
      <History size={14} /> Open Operational Replay
    </button>}
  </section>;
}
