export type ConclavePerspective = {
  id: string;
  name: string;
  mandate: string;
  position: "challenge" | "conditional" | "support";
  assessment: string;
  requiredEvidence: string[];
};

export type ConclaveReview = {
  schemaVersion: string;
  reviewId: string;
  reviewedAt: string;
  proposal: string;
  mode: string;
  outcome: string;
  confidence: number;
  contextCompleteness: number;
  perspectives: ConclavePerspective[];
  dissent: string[];
  synthesis: string;
  missingContextDomains: string[];
  provenanceCount: number;
  executionAuthorized: false;
  proofIds: string[];
  limitations: string[];
};

type GatewayEnvelope = { ok: boolean; data: { review: ConclaveReview } | null; error?: { message?: string } };

export async function runConclaveReview(proposal: string): Promise<ConclaveReview> {
  const response = await fetch("/api/runtime/conclave/reviews", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", proposal }),
  });
  const gateway = await response.json() as GatewayEnvelope;
  if (!response.ok || !gateway.ok || !gateway.data?.review) {
    throw new Error(gateway.error?.message ?? `Conclave review failed (${response.status})`);
  }
  return gateway.data.review;
}

export type ConclaveRun = {
  workspace: ConclaveWorkspaceRecord;
  preflightReview: ConclaveReview | null;
  preflightUnavailableReason: string | null;
};

export async function startConclaveInvestigation(proposal: string): Promise<ConclaveRun> {
  const idempotencyKey = `conclave-${globalThis.crypto.randomUUID()}`;
  const workspace = await localNexusClient.createConclaveWorkspace(proposal, idempotencyKey);
  try {
    return { workspace, preflightReview: await runConclaveReview(proposal), preflightUnavailableReason: null };
  } catch (error) {
    return {
      workspace,
      preflightReview: null,
      preflightUnavailableReason: error instanceof Error ? error.message : String(error),
    };
  }
}
import { localNexusClient, type ConclaveWorkspaceRecord } from "./local-client";
