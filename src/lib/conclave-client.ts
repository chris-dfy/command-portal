import { localNexusClient, type ConclaveWorkspaceRecord } from "./local-client";

export type ConclaveRun = {
  workspace: ConclaveWorkspaceRecord;
};

export async function startConclaveInvestigation(proposal: string): Promise<ConclaveRun> {
  const idempotencyKey = `conclave-${globalThis.crypto.randomUUID()}`;
  const workspace = await localNexusClient.createConclaveWorkspace(proposal, idempotencyKey);
  return { workspace };
}
