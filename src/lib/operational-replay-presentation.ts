export type ReplayPresentationObject = {
  id: string;
  type: string;
};

export type ReplayPresentationStage = {
  id: string;
  contractStage: string;
  label: string;
  whatChanged: string;
  whyChanged: string;
  inputs: ReplayPresentationObject[];
  outputs: ReplayPresentationObject[];
  evidence: string[];
  artifacts: string[];
};

const RECORD_IDENTIFIER =
  /\b(?:task|mission|workspace|conclave|observation|evidence|representation|receipt|decision|event)[-:][a-z0-9][a-z0-9-]{7,}\b/gi;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function readable(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function withoutRawIdentifiers(value: string): string {
  return value
    .replace(
      /\b(Task|Mission|Workspace|Observation|Evidence|Representation|Receipt|Decision)\s+(?:task|mission|workspace|conclave|observation|evidence|representation|receipt|decision|event)[-:][a-z0-9][a-z0-9-]{7,}\b/gi,
      "$1",
    )
    .replace(RECORD_IDENTIFIER, "the recorded item")
    .replace(UUID, "the recorded item")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactReplayReference(value: string, tailLength = 8): string {
  const normalized = value.trim();
  if (normalized.length <= tailLength + 8) return normalized;
  const prefix = normalized.includes("-")
    ? normalized.split("-")[0]
    : "record";
  return `${prefix} · …${normalized.slice(-tailLength)}`;
}

export function presentHostedReplayStage(
  stage: ReplayPresentationStage,
  totalStages: number,
) {
  const stageIdentity = `${stage.id} ${stage.contractStage}`.toLowerCase();
  const taskScheduled = stageIdentity.includes("task-started");
  const missionRunning = stageIdentity.includes("investigation-running");
  const recordedChange = withoutRawIdentifiers(stage.whatChanged);
  const record = [...stage.outputs, ...stage.inputs].find(
    (item) => item.id.trim(),
  ) ?? null;

  return {
    position: `${totalStages} recorded stage${totalStages === 1 ? "" : "s"}`,
    title: taskScheduled
      ? "Task state changed"
      : missionRunning
        ? "Mission lifecycle changed"
        : readable(stage.label || stage.contractStage || "Runtime stage"),
    headline: taskScheduled
      ? "Task entered the in-progress state."
      : missionRunning
        ? "Mission entered the investigation-running state."
        : recordedChange || readable(stage.label || "Runtime stage"),
    explanation: taskScheduled
      ? "The scheduler recorded that dependencies were satisfied and the assigned task may proceed. This does not prove specialist work occurred."
      : missionRunning
        ? "The Mission lifecycle advanced to investigation running. Findings still require admitted Evidence and a terminal receipt."
        : stage.whyChanged,
    recordLabel: record ? readable(record.type || "record") : null,
    recordId: record?.id ?? null,
  };
}

export function positiveHostedReplayFacts(stage: ReplayPresentationStage) {
  return [
    { label: "Inputs", value: stage.inputs.length },
    { label: "Evidence", value: stage.evidence.length },
    { label: "Outputs", value: stage.outputs.length },
    { label: "Artifacts", value: stage.artifacts.length },
  ].filter((item) => item.value > 0);
}
