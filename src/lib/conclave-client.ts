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

type RuntimeEnvelope = { data: { review: ConclaveReview } };
type GatewayEnvelope = { ok: boolean; data: RuntimeEnvelope | null; error?: { message?: string } };

export async function runConclaveReview(proposal: string): Promise<ConclaveReview> {
  const response = await fetch("/api/runtime/conclave/reviews", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", proposal }),
  });
  const gateway = await response.json() as GatewayEnvelope;
  if (!response.ok || !gateway.ok || !gateway.data?.data.review) {
    throw new Error(gateway.error?.message ?? `Conclave review failed (${response.status})`);
  }
  return gateway.data.data.review;
}
