import type { HifEvent, HifInteraction } from "./hif-client";

export type WhyThisMatters = { businessImpact: string; operationalImpact: string; missionImpact: string };
export type EoxIndicator = { name: string; status: string; value: string; basis: string; measurement?: { numerator: number; denominator: number } };
export type EoxRecommendation = { recommendationId: string; title: string; status: string; suggestedNavigation: string; whyThisMatters: WhyThisMatters };
export type EoxAssessment = {
  schemaVersion: "1.0.0";
  recordType: "nexus_executive_operating_loop";
  generatedAt: string;
  executiveState: { active: string; source: string; reason: string };
  loop: Array<{ stage: string; active: boolean; status: string }>;
  executiveNarrative: { text: string; status: string; source: string };
  executiveBrief: { currentOperationalPosture: string; operationalReadiness: Record<string, unknown>; currentRisks: EoxAttention[]; currentOpportunities: Array<Record<string, unknown>>; currentApprovals: Record<string, unknown>; outstandingRecommendations: EoxRecommendation[] };
  operationalHealth: EoxIndicator[];
  attentionQueue: EoxAttention[];
  recommendedActions: EoxRecommendation[];
  missionTimeline: Array<{ event: string; occurredAt: string; source: string; whyThisMatters: string }>;
  operationalUnderstanding: EoxIndicator[];
  briefing: { available: boolean; interactionOwner: string; presentationSections: string[] };
  truth: Record<string, unknown>;
  limitations: string[];
};
export type EoxAttention = { significance: string; category: string; title: string; whyThisMatters: WhyThisMatters };

type Gateway<T> = { ok: boolean; data: T | null; error?: { message?: string } };

async function mutation<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as Gateway<T>;
  if (!response.ok || !result.ok || !result.data) throw new Error(result.error?.message ?? `Executive briefing failed (${response.status})`);
  return result.data;
}

export const eoxClient = Object.freeze({
  beginBriefing: () => mutation<{ assessment: EoxAssessment; interaction: HifInteraction; events: HifEvent[] }>("/api/runtime/executive-briefing", { clientId: "nexus-web", modality: "text", speechRequested: true }),
  interrupt: (interactionId: string) => mutation<{ interaction: HifInteraction; events: HifEvent[] }>(`/api/runtime/interactions/${encodeURIComponent(interactionId)}/interrupt`, { reason: "user_barge_in" }),
  resume: (interactionId: string) => mutation<{ interaction: HifInteraction; events: HifEvent[] }>(`/api/runtime/interactions/${encodeURIComponent(interactionId)}/resume`, {}),
  presentationComplete: (interactionId: string) => mutation<{ interaction: HifInteraction; events: HifEvent[] }>(`/api/runtime/interactions/${encodeURIComponent(interactionId)}/presentation-complete`, {}),
});
