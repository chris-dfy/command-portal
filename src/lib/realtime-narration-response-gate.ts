export const NEXUS_NARRATION_CORRELATION_METADATA_KEY = "nexus_narration_correlation_id";

const RESPONSE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;

export type RealtimeResponseDescriptor = {
  id?: unknown;
  metadata?: unknown;
};

export type RealtimeResponseAuthorization =
  | { authorized: true; responseId: string }
  | { authorized: false; responseId: string | null };

function responseId(value: unknown): string | null {
  return typeof value === "string" && RESPONSE_ID_PATTERN.test(value) ? value : null;
}

function correlationIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[NEXUS_NARRATION_CORRELATION_METADATA_KEY];
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value) ? value : null;
}

/**
 * Binds one Runtime-admitted narration request to the exact Realtime response
 * resource that echoes its high-entropy metadata. Provider responses are not
 * audible merely because they are next in event order.
 */
export class RealtimeNarrationResponseGate {
  private pendingCorrelationId: string | null = null;
  private authorizedResponseId: string | null = null;

  begin(correlationId: string): void {
    if (!CORRELATION_ID_PATTERN.test(correlationId)) throw new Error("Invalid narration correlation identifier.");
    if (this.pendingCorrelationId || this.authorizedResponseId) {
      throw new Error("A governed narration response is already pending or active.");
    }
    this.pendingCorrelationId = correlationId;
  }

  authorize(response: RealtimeResponseDescriptor | undefined): RealtimeResponseAuthorization {
    const id = responseId(response?.id);
    const correlationId = correlationIdFromMetadata(response?.metadata);
    if (!id || !this.pendingCorrelationId || correlationId !== this.pendingCorrelationId) {
      return { authorized: false, responseId: id };
    }
    this.pendingCorrelationId = null;
    this.authorizedResponseId = id;
    return { authorized: true, responseId: id };
  }

  allows(responseIdCandidate: unknown): boolean {
    return responseId(responseIdCandidate) === this.authorizedResponseId && this.authorizedResponseId !== null;
  }

  complete(responseIdCandidate: unknown): boolean {
    if (!this.allows(responseIdCandidate)) return false;
    this.authorizedResponseId = null;
    return true;
  }

  activeResponse(): string | null {
    return this.authorizedResponseId;
  }

  hasPendingResponse(): boolean {
    return this.pendingCorrelationId !== null;
  }

  reset(): string | null {
    const active = this.authorizedResponseId;
    this.pendingCorrelationId = null;
    this.authorizedResponseId = null;
    return active;
  }
}
