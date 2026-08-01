export type RecoverableConclaveRun<TWorkspace> = Readonly<{
  workspace: TWorkspace;
  expectedWorkspaceVersion: string;
  runIdempotencyKey: string;
}>;

export function conclaveActionGates(
  createAvailable: boolean,
  runAvailable: boolean,
): { createAllowed: boolean; runAllowed: boolean } {
  return { createAllowed: createAvailable, runAllowed: runAvailable };
}

export function createdConclaveRunIdentity(
  workspace: { lifecyclePosture: string; reviewCompleted?: boolean; workspaceVersion: string },
  runIdempotencyKey: string,
): {
  runPending: boolean;
  runIdempotencyKey: string;
  expectedWorkspaceVersion: string;
} {
  const runPending = workspace.lifecyclePosture === "canonical_operational"
    && workspace.reviewCompleted !== true;
  return {
    runPending,
    runIdempotencyKey: runPending ? runIdempotencyKey : "",
    expectedWorkspaceVersion: workspace.workspaceVersion,
  };
}

export async function createConclaveWorkspaceOnly<TRequest, TWorkspace, TRun>(
  request: TRequest,
  createIdempotencyKey: string,
  createWorkspace: (request: TRequest, idempotencyKey: string) => Promise<TWorkspace>,
  recoverRun: (workspace: TWorkspace) => TRun,
): Promise<TRun> {
  const workspace = await createWorkspace(request, createIdempotencyKey);
  return recoverRun(workspace);
}

export async function invokeConclaveRun<TWorkspace extends { missionId: string }, TResult>(
  run: RecoverableConclaveRun<TWorkspace>,
  execute: (
    missionId: string,
    expectedWorkspaceVersion: string,
    runIdempotencyKey: string,
  ) => Promise<TResult>,
): Promise<TResult> {
  return execute(
    run.workspace.missionId,
    run.expectedWorkspaceVersion,
    run.runIdempotencyKey,
  );
}
