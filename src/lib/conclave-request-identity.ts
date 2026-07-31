export type ConclavePredecessor = {
  missionId: string;
  workspaceId: string;
  workspaceVersion: string;
};

export type ConclaveWorkspaceCreateRequest = {
  proposal: string;
  predecessor?: ConclavePredecessor;
};

export type PendingConclaveCreate = ConclaveWorkspaceCreateRequest & {
  idempotencyKey: string;
};

export type ConclaveEvidenceAdmissionRequest = {
  origin: string;
  sourceClassification: "tenant_knowledge" | "retrieved_evidence";
  confidence: number;
  claim: string;
  supportingArtifacts: string[];
  relationships: string[];
  operationalContext: Record<string, unknown>;
};

export type PendingConclaveEvidenceAdmission = {
  missionId: string;
  taskId: string;
  evidence: ConclaveEvidenceAdmissionRequest;
  idempotencyKey: string;
};

export type ConclaveRunRecoveryInput = {
  schemaVersion: string;
  workspaceVersion: string;
  lifecyclePosture: string;
  reviewCompleted?: boolean;
  availableActions?: readonly string[];
};

const WORKSPACE_VERSION = /^sha256:([a-f0-9]{64})$/;

function normalizedPredecessor(
  predecessor: ConclavePredecessor | undefined,
): ConclavePredecessor | undefined {
  if (!predecessor) return undefined;
  const normalized = {
    missionId: predecessor.missionId.trim(),
    workspaceId: predecessor.workspaceId.trim(),
    workspaceVersion: predecessor.workspaceVersion.trim(),
  };
  if (
    !normalized.missionId
    || normalized.missionId.length > 160
    || !normalized.workspaceId
    || normalized.workspaceId.length > 160
  ) {
    throw new Error("Conclave predecessor requires exact Mission and workspace identities.");
  }
  if (!WORKSPACE_VERSION.test(normalized.workspaceVersion)) {
    throw new Error("Conclave predecessor requires an exact sha256 workspace version.");
  }
  return normalized;
}

function samePredecessor(
  left: ConclavePredecessor | undefined,
  right: ConclavePredecessor | undefined,
) {
  if (!left || !right) return left === right;
  return left.missionId === right.missionId
    && left.workspaceId === right.workspaceId
    && left.workspaceVersion === right.workspaceVersion;
}

export function resolvePendingConclaveCreate(
  pending: PendingConclaveCreate | null,
  request: ConclaveWorkspaceCreateRequest,
  createIdentity: () => string,
): PendingConclaveCreate {
  const normalizedProposal = request.proposal.trim();
  const predecessor = normalizedPredecessor(request.predecessor);
  if (!normalizedProposal) {
    throw new Error("Conclave workspace creation requires a proposal.");
  }
  if (
    pending?.proposal === normalizedProposal
    && samePredecessor(pending.predecessor, predecessor)
  ) return pending;
  const identity = createIdentity().trim();
  if (!identity) {
    throw new Error("Conclave workspace creation requires an operation identity.");
  }
  return {
    proposal: normalizedProposal,
    ...(predecessor ? { predecessor } : {}),
    idempotencyKey: `conclave-create-${identity}`,
  };
}

function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalValue(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalValue(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizedEvidence(
  evidence: ConclaveEvidenceAdmissionRequest,
): ConclaveEvidenceAdmissionRequest {
  return {
    origin: evidence.origin.trim(),
    sourceClassification: evidence.sourceClassification,
    confidence: evidence.confidence,
    claim: evidence.claim.trim(),
    supportingArtifacts: evidence.supportingArtifacts.map((item) => item.trim()),
    relationships: evidence.relationships.map((item) => item.trim()),
    operationalContext: { ...evidence.operationalContext },
  };
}

export function resolvePendingConclaveEvidenceAdmission(
  pending: PendingConclaveEvidenceAdmission | null,
  missionId: string,
  taskId: string,
  evidence: ConclaveEvidenceAdmissionRequest,
  createIdentity: () => string,
): PendingConclaveEvidenceAdmission {
  const normalizedMissionId = missionId.trim();
  const normalizedTaskId = taskId.trim();
  const normalized = normalizedEvidence(evidence);
  if (!normalizedMissionId || !normalizedTaskId) {
    throw new Error("Conclave Evidence admission requires exact Mission and task identities.");
  }
  if (!normalized.origin || !normalized.claim) {
    throw new Error("Conclave Evidence admission requires origin and claim.");
  }
  if (
    pending?.missionId === normalizedMissionId
    && pending.taskId === normalizedTaskId
    && canonicalValue(pending.evidence) === canonicalValue(normalized)
  ) return pending;
  const identity = createIdentity().trim();
  if (!identity) {
    throw new Error("Conclave Evidence admission requires an operation identity.");
  }
  return {
    missionId: normalizedMissionId,
    taskId: normalizedTaskId,
    evidence: normalized,
    idempotencyKey: `conclave-evidence-${identity}`,
  };
}

export function stableConclaveRunIdempotencyKey(
  workspaceVersion: string,
): string {
  const match = WORKSPACE_VERSION.exec(workspaceVersion);
  if (!match) {
    throw new Error("Conclave run requires an exact sha256 workspace version.");
  }
  return `conclave-run-${match[1]}`;
}

export function recoverableConclaveRun(
  workspace: ConclaveRunRecoveryInput,
): {
  runPending: boolean;
  runIdempotencyKey: string;
  expectedWorkspaceVersion: string;
} {
  const runPending = (
    workspace.schemaVersion === "nexus.conclave-workspace@2.0.0"
    && workspace.lifecyclePosture === "canonical_operational"
    && workspace.reviewCompleted !== true
    && workspace.availableActions?.includes("run") === true
  );
  return {
    runPending,
    runIdempotencyKey: runPending
      ? stableConclaveRunIdempotencyKey(workspace.workspaceVersion)
      : "",
    expectedWorkspaceVersion: workspace.workspaceVersion,
  };
}
