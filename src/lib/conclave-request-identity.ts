export type PendingConclaveCreate = {
  proposal: string;
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

export function resolvePendingConclaveCreate(
  pending: PendingConclaveCreate | null,
  proposal: string,
  createIdentity: () => string,
): PendingConclaveCreate {
  const normalizedProposal = proposal.trim();
  if (!normalizedProposal) {
    throw new Error("Conclave workspace creation requires a proposal.");
  }
  if (pending?.proposal === normalizedProposal) return pending;
  const identity = createIdentity().trim();
  if (!identity) {
    throw new Error("Conclave workspace creation requires an operation identity.");
  }
  return {
    proposal: normalizedProposal,
    idempotencyKey: `conclave-create-${identity}`,
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
