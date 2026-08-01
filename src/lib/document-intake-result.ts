export type DocumentHistoryAvailability = {
  available: boolean;
  reason: string;
};

export function successfulDocumentUploadMessage(
  documentCount: number,
  history: DocumentHistoryAvailability,
  refreshFailure = "",
): string {
  const success = `${documentCount} document${documentCount === 1 ? "" : "s"} ingested by the workspace-scoped NEXUS Runtime with evidence and proof.`;
  if (!history.available) {
    return `${success} Source inventory remains degraded: ${history.reason}`;
  }
  if (refreshFailure) {
    return `${success} Source inventory refresh is degraded: ${refreshFailure}`;
  }
  return success;
}
