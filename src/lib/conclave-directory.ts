import type { ConclaveWorkspaceRecord } from "./local-client";

export type ConclaveDirectoryDisposition =
  | "verified_review_result"
  | "canonical_review_active"
  | "canonical_review_unverified"
  | "legacy_record"
  | "legacy_prompt_only";

const hasReceipt = (workspace: ConclaveWorkspaceRecord) => Boolean(
  workspace.completionReceipt
  || workspace.runReceipt,
);

export const isVerifiedCanonicalReview = (
  workspace: ConclaveWorkspaceRecord,
) => (
  workspace.lifecyclePosture === "canonical_operational"
  && workspace.displayStatus === "completed"
  && workspace.reviewCompleted === true
  && workspace.reviewIntegrityVerified === true
  && workspace.terminalReceiptVerified === true
  && hasReceipt(workspace)
);

export const isLegacyPromptOnly = (
  workspace: ConclaveWorkspaceRecord,
) => (
  workspace.lifecyclePosture === "legacy_read_only"
  && workspace.evidence.length === 0
  && workspace.reviewCompleted !== true
  && !workspace.executiveSummary
  && !workspace.completionReceipt
  && !workspace.runReceipt
);

export function conclaveDirectoryDisposition(
  workspace: ConclaveWorkspaceRecord,
): ConclaveDirectoryDisposition {
  if (isVerifiedCanonicalReview(workspace)) return "verified_review_result";
  if (isLegacyPromptOnly(workspace)) return "legacy_prompt_only";
  if (workspace.lifecyclePosture === "legacy_read_only") return "legacy_record";
  if (workspace.displayStatus === "completed") return "canonical_review_unverified";
  return "canonical_review_active";
}

const dispositionRank: Record<ConclaveDirectoryDisposition, number> = {
  verified_review_result: 0,
  canonical_review_active: 1,
  canonical_review_unverified: 2,
  legacy_record: 3,
  legacy_prompt_only: 4,
};

export const orderConclaveDirectory = (
  workspaces: ConclaveWorkspaceRecord[],
) => workspaces
  .map((workspace, index) => ({ workspace, index }))
  .sort((left, right) => (
    dispositionRank[conclaveDirectoryDisposition(left.workspace)]
    - dispositionRank[conclaveDirectoryDisposition(right.workspace)]
    || left.index - right.index
  ))
  .map(({ workspace }) => workspace);

export function defaultConclaveWorkspace(
  workspaces: ConclaveWorkspaceRecord[],
): ConclaveWorkspaceRecord | null {
  const ordered = orderConclaveDirectory(workspaces);
  return ordered.find(isVerifiedCanonicalReview)
    ?? ordered.find((workspace) => (
      workspace.lifecyclePosture === "canonical_operational"
      && workspace.displayStatus !== "completed"
    ))
    ?? ordered.find((workspace) => (
      conclaveDirectoryDisposition(workspace) === "legacy_record"
    ))
    ?? null;
}

export function conclaveDirectoryLabel(
  workspace: ConclaveWorkspaceRecord,
) {
  const disposition = conclaveDirectoryDisposition(workspace);
  const prefix: Record<ConclaveDirectoryDisposition, string> = {
    verified_review_result: "Verified Review result",
    canonical_review_active: "Canonical Review in progress",
    canonical_review_unverified: "Canonical record — verification incomplete",
    legacy_record: "Legacy read-only record",
    legacy_prompt_only: "Legacy prompt only — zero Evidence",
  };
  return `${prefix[disposition]} · ${workspace.proposal}`;
}
