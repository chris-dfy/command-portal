import { type ConclaveWorkspaceRecord } from "./local-client";
import {
  recoverableConclaveRun,
  stableConclaveRunIdempotencyKey,
} from "./conclave-request-identity";
import {
  createdConclaveRunIdentity,
} from "./conclave-action-flow";

export type ConclaveRun = {
  workspace: ConclaveWorkspaceRecord;
  runPending: boolean;
  runError?: string;
  runIdempotencyKey: string;
  expectedWorkspaceVersion: string;
};

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
