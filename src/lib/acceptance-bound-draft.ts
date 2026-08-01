export type AcceptanceBoundDraft = Readonly<{
  visibleDraft: string;
}>;

export function beginAcceptanceBoundDraft(value: string): AcceptanceBoundDraft {
  const visibleDraft = value.trim();
  if (!visibleDraft) throw new Error("An acceptance-bound draft cannot be empty.");
  return Object.freeze({ visibleDraft });
}

export function clearDraftAfterAcceptance(
  operation: AcceptanceBoundDraft,
): { draft: string; pending: null } {
  void operation;
  return { draft: "", pending: null };
}

export function retainDraftAfterUnacceptedFailure(
  operation: AcceptanceBoundDraft,
): { draft: string; pending: null } {
  return { draft: operation.visibleDraft, pending: null };
}
