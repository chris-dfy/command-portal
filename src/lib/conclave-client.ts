import { localNexusClient, type ConclaveWorkspaceRecord } from "./local-client";
import {
  recoverableConclaveRun,
  stableConclaveRunIdempotencyKey,
  type ConclaveWorkspaceCreateRequest,
} from "./conclave-request-identity";
import {
  createConclaveWorkspaceOnly,
  createdConclaveRunIdentity,
  invokeConclaveRun,
} from "./conclave-action-flow";
import { isVerifiedCanonicalReview } from "./conclave-directory";

export type ConclaveRun = {
  workspace: ConclaveWorkspaceRecord;
  runPending: boolean;
  runError?: string;
  runIdempotencyKey: string;
  expectedWorkspaceVersion: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function conclaveRunFromWorkspace(
  workspace: ConclaveWorkspaceRecord,
): ConclaveRun {
  return {
    workspace,
    ...recoverableConclaveRun(workspace),
  };
}

export function createdConclaveRunFromWorkspace(
  workspace: ConclaveWorkspaceRecord,
): ConclaveRun {
  if (workspace.lifecyclePosture !== "canonical_operational" || workspace.reviewCompleted === true) {
    return conclaveRunFromWorkspace(workspace);
  }
  return {
    workspace,
    ...createdConclaveRunIdentity(
      workspace,
      stableConclaveRunIdempotencyKey(workspace.workspaceVersion),
    ),
  };
}

async function executeAndRefresh(
  created: ConclaveWorkspaceRecord,
  runIdempotencyKey: string,
  attempts = 2,
): Promise<ConclaveRun> {
  let lastError = "The governed Conclave run did not reach a verified terminal review.";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const executed = await invokeConclaveRun(
        {
          workspace: created,
          expectedWorkspaceVersion: created.workspaceVersion,
          runIdempotencyKey,
        },
        localNexusClient.runConclaveWorkspace,
      );
      const workspace = await localNexusClient.conclaveWorkspace(created.missionId)
        .catch(() => executed);
      if (!isVerifiedCanonicalReview(workspace)) {
        throw new Error(
          "Conclave returned without completed, reviewIntegrityVerified, and terminalReceiptVerified postconditions.",
        );
      }
      return {
        workspace,
        runPending: false,
        runIdempotencyKey,
        expectedWorkspaceVersion: created.workspaceVersion,
      };
    } catch (error) {
      lastError = errorMessage(error);
      const retryable = (error as { details?: { retryable?: boolean } })?.details?.retryable;
      if (retryable === false) break;
    }
  }

  const recovered = await localNexusClient.conclaveWorkspace(created.missionId)
    .catch(() => created);
  if (isVerifiedCanonicalReview(recovered)) {
    return {
      workspace: recovered,
      runPending: false,
      runIdempotencyKey,
      expectedWorkspaceVersion: created.workspaceVersion,
    };
  }
  return {
    workspace: recovered,
    runPending: true,
    runError: lastError,
    runIdempotencyKey,
    expectedWorkspaceVersion: created.workspaceVersion,
  };
}

export async function createConclaveInvestigation(
  request: ConclaveWorkspaceCreateRequest,
  createIdempotencyKey: string,
): Promise<ConclaveRun> {
  return createConclaveWorkspaceOnly(
    request,
    createIdempotencyKey,
    localNexusClient.createConclaveWorkspace,
    createdConclaveRunFromWorkspace,
  );
}

export async function retryConclaveInvestigation(run: ConclaveRun): Promise<ConclaveRun> {
  return executeAndRefresh(
    {
      ...run.workspace,
      workspaceVersion: run.expectedWorkspaceVersion,
    },
    run.runIdempotencyKey,
  );
}
