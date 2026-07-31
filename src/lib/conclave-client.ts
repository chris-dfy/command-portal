import { localNexusClient, type ConclaveWorkspaceRecord } from "./local-client";
import {
  recoverableConclaveRun,
  stableConclaveRunIdempotencyKey,
} from "./conclave-request-identity";

export type ConclaveRun = {
  workspace: ConclaveWorkspaceRecord;
  runPending: boolean;
  runError?: string;
  runIdempotencyKey: string;
  expectedWorkspaceVersion: string;
};

function verifiedTerminalReview(workspace: ConclaveWorkspaceRecord) {
  return workspace.displayStatus === "completed"
    && workspace.reviewCompleted === true
    && workspace.reviewIntegrityVerified === true
    && workspace.terminalReceiptVerified === true;
}

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

async function executeAndRefresh(
  created: ConclaveWorkspaceRecord,
  runIdempotencyKey: string,
  attempts = 2,
): Promise<ConclaveRun> {
  let lastError = "The governed Conclave run did not reach a verified terminal review.";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const executed = await localNexusClient.runConclaveWorkspace(
        created.missionId,
        created.workspaceVersion,
        runIdempotencyKey,
      );
      const workspace = await localNexusClient.conclaveWorkspace(created.missionId)
        .catch(() => executed);
      if (!verifiedTerminalReview(workspace)) {
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
  if (verifiedTerminalReview(recovered)) {
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

export async function startConclaveInvestigation(
  proposal: string,
  createIdempotencyKey: string,
): Promise<ConclaveRun> {
  const workspace = await localNexusClient.createConclaveWorkspace(
    proposal,
    createIdempotencyKey,
  );
  const runIdempotencyKey = stableConclaveRunIdempotencyKey(
    workspace.workspaceVersion,
  );
  return executeAndRefresh(workspace, runIdempotencyKey);
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
