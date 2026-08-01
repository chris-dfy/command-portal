type RuntimeRecord = Record<string, unknown>;

export type OperationalReplayLoadDisposition =
  | "current"
  | "stale_request"
  | "identity_mismatch";

export type SettledReplayPayload = {
  fulfilled: boolean;
  value?: unknown;
};

const REPLAY_SCHEMA = "nexus.operational-replay-api@1.0.0";

function record(value: unknown): RuntimeRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RuntimeRecord
    : null;
}

function exactEnvelope(
  value: unknown,
  recordType: string,
): RuntimeRecord | null {
  const candidate = record(value);
  return candidate?.recordType === recordType
    && candidate.schemaVersion === REPLAY_SCHEMA
    ? candidate
    : null;
}

function replayIdentities(
  value: unknown,
  identities = new Set<string>(),
  depth = 0,
): Set<string> {
  const candidate = record(value);
  if (!candidate || depth > 3) return identities;
  for (const key of ["run_id", "replayId", "replay_id", "runId"]) {
    const supplied = candidate[key];
    if (typeof supplied === "string" && supplied.trim()) {
      identities.add(supplied.trim());
    }
  }
  for (const key of ["replay", "projection", "detail", "session", "record", "data", "result"]) {
    replayIdentities(candidate[key], identities, depth + 1);
  }
  return identities;
}

function hasOnlyReplayIdentity(value: unknown, replayId: string): boolean {
  const identities = replayIdentities(value);
  return identities.size === 1 && identities.has(replayId);
}

export function matchesOperationalReplayDetail(
  value: unknown,
  replayId: string,
): boolean {
  const envelope = exactEnvelope(value, "nexus_operational_replay");
  const replay = record(envelope?.replay);
  return replay?.run_id === replayId && hasOnlyReplayIdentity(value, replayId);
}

export function matchesOperationalReplayEvents(
  value: unknown,
  replayId: string,
): boolean {
  const envelope = exactEnvelope(value, "nexus_operational_replay_events");
  return envelope?.replayId === replayId
    && Array.isArray(envelope.events)
    && hasOnlyReplayIdentity(value, replayId);
}

export function matchesOperationalReplayStage(
  value: unknown,
  replayId: string,
  stageId: string,
): boolean {
  const envelope = exactEnvelope(value, "nexus_operational_replay_stage");
  const stage = record(envelope?.stage);
  return envelope?.replayId === replayId
    && stage?.stage_id === stageId
    && hasOnlyReplayIdentity(value, replayId);
}

export function matchesOperationalReplayExplanation(
  value: unknown,
  replayId: string,
  stageId: string,
): boolean {
  const envelope = exactEnvelope(
    value,
    "nexus_operational_replay_explanation",
  );
  return envelope?.replayId === replayId
    && envelope.stageId === stageId
    && hasOnlyReplayIdentity(value, replayId);
}

export function classifyOperationalReplayLoad({
  requestedReplayId,
  selectedReplayId,
  requestSequence,
  activeRequestSequence,
  detail,
  events,
}: {
  requestedReplayId: string;
  selectedReplayId: string;
  requestSequence: number;
  activeRequestSequence: number;
  detail: SettledReplayPayload;
  events: SettledReplayPayload;
}): OperationalReplayLoadDisposition {
  if (
    requestSequence !== activeRequestSequence
    || requestedReplayId !== selectedReplayId
  ) {
    return "stale_request";
  }
  if (
    (detail.fulfilled
      && !matchesOperationalReplayDetail(detail.value, requestedReplayId))
    || (events.fulfilled
      && !matchesOperationalReplayEvents(events.value, requestedReplayId))
  ) {
    return "identity_mismatch";
  }
  return "current";
}
