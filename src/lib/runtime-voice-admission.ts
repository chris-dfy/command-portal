import {
  localNexusClient,
  newExecutiveInteractionRequest,
  type ExecutiveInteractionApprovalResponse,
  type ExecutiveInteractionClassification,
  type ExecutiveInteractionRequest,
  type ExecutiveInteractionResult,
  type ExecutiveInteractionStatus,
} from "./local-client";

export type RuntimeInteractionAdmission = {
  admitted: true;
  spokenSummary: string;
  path: "executive_interaction";
  classification: ExecutiveInteractionClassification;
  status: ExecutiveInteractionStatus;
  interactionResult: ExecutiveInteractionResult;
  interactionRequest: ExecutiveInteractionRequest;
  proofIds: string[];
  receiptIds: string[];
  limitations: string[];
};

const CLASSIFICATIONS = new Set<ExecutiveInteractionClassification>([
  "question",
  "action",
  "clarification",
  "blocked",
]);

const STATUSES = new Set<ExecutiveInteractionStatus>([
  "answered",
  "approval_required",
  "executed",
  "failed",
  "blocked",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,199}$/;
const TERMINAL_INTERACTION_LOOKUP_STATES = new Set(["approval_required", "completed", "blocked", "failed"]);
const PENDING_INTERACTION_STORAGE_KEY = "nexus-command:pending-executive-interaction:v1";
const PENDING_RECONCILIATION_STORAGE_KEY = "nexus-command:pending-executive-interaction-reconciliation:v1";

const recordOf = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const hasVerifiedNonEffect = (verification: Record<string, unknown>): boolean => {
  if (verification.verified !== true) return verification.verified === false;
  const evidence = recordOf(verification.evidence);
  if (!evidence) return false;
  if (
    verification.method === "approval_denial_non_execution"
    && evidence.execution_attempted === false
  ) return true;
  if (
    verification.method === "governed_postcondition_checks"
    && Array.isArray(evidence.checks)
  ) {
    return evidence.checks.some((item) => {
      const check = recordOf(item);
      return check?.name === "execution_attempted"
        && check.passed === true
        && check.observed === false;
    });
  }
  return false;
};

export class CanonicalInteractionIndeterminateError extends Error {
  readonly interactionId: string;
  readonly retryProhibited = true;

  constructor(interactionId: string, detail: string) {
    super(
      `Interaction ${interactionId} has an indeterminate Runtime outcome. ${detail} `
      + "Do not retry it with a new interaction identifier; reconcile this exact interaction first.",
    );
    this.name = "CanonicalInteractionIndeterminateError";
    this.interactionId = interactionId;
  }
}

export function isCanonicalInteractionIndeterminateError(
  value: unknown,
): value is CanonicalInteractionIndeterminateError {
  return value instanceof CanonicalInteractionIndeterminateError
    || Boolean(
      value
      && typeof value === "object"
      && (value as { retryProhibited?: unknown }).retryProhibited === true
      && UUID_PATTERN.test(String((value as { interactionId?: unknown }).interactionId ?? "")),
    );
}

const boundedSummary = (value: unknown): string => {
  const summary = typeof value === "string" ? value.trim() : "";
  if (!summary || summary.length > 4_000) {
    throw new Error("NEXUS Runtime returned no bounded canonical interaction response.");
  }
  return summary;
};

const boundedIds = (values: unknown[]): string[] => [...new Set(values.filter(
  (value): value is string => typeof value === "string" && STABLE_ID_PATTERN.test(value),
))];

const approvalIdFrom = (result: ExecutiveInteractionResult): string | null => {
  const value = result.authority_decision?.approval_id;
  return typeof value === "string" && STABLE_ID_PATTERN.test(value) ? value : null;
};

const durableReceiptIdFrom = (result: ExecutiveInteractionResult): string | null => {
  const value = result.receipt_id;
  return typeof value === "string" && STABLE_ID_PATTERN.test(value) ? value : null;
};

const underlyingExecutionReceiptIdFrom = (result: ExecutiveInteractionResult): string | null => {
  const value = result.execution?.underlying_execution_receipt_id;
  return typeof value === "string" && STABLE_ID_PATTERN.test(value) ? value : null;
};

const presentationNavigationTarget = (result: ExecutiveInteractionResult): string | null => {
  const presentation = result.presentation;
  if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) return null;
  const keys = Object.keys(presentation);
  if (keys.length !== 2 || !keys.includes("action") || !keys.includes("target")) return null;
  if (presentation.action !== "navigate") return null;
  return typeof presentation.target === "string" && STABLE_ID_PATTERN.test(presentation.target)
    ? presentation.target
    : null;
};

export function runtimeInteractionTrace(admission: RuntimeInteractionAdmission): string {
  const approvalId = approvalIdFrom(admission.interactionResult);
  return [
    `Runtime classification: ${admission.classification}`,
    `Status: ${admission.status.replaceAll("_", " ")}`,
    approvalId ? `Approval ${approvalId}` : "",
    admission.receiptIds.length ? `Receipt ${admission.receiptIds.join(", ")}` : "",
    admission.proofIds.length ? `Proof ${admission.proofIds.join(", ")}` : "",
    admission.interactionResult.verification?.verified === true ? "Postconditions verified" : "",
  ].filter(Boolean).join(" · ");
}

export function pendingExecutiveApprovalId(admission: RuntimeInteractionAdmission | null): string | null {
  if (admission?.status !== "approval_required") return null;
  return approvalIdFrom(admission.interactionResult);
}

function pendingInteractionPointer(): string | null {
  if (typeof globalThis.sessionStorage === "undefined") return null;
  const value = globalThis.sessionStorage.getItem(PENDING_INTERACTION_STORAGE_KEY)?.trim() ?? "";
  if (UUID_PATTERN.test(value)) return value;
  if (value) globalThis.sessionStorage.removeItem(PENDING_INTERACTION_STORAGE_KEY);
  return null;
}

export function pendingExecutiveInteractionReconciliationId(): string | null {
  if (typeof globalThis.sessionStorage === "undefined") return null;
  const value = globalThis.sessionStorage.getItem(PENDING_RECONCILIATION_STORAGE_KEY)?.trim() ?? "";
  if (UUID_PATTERN.test(value)) return value;
  if (value) globalThis.sessionStorage.removeItem(PENDING_RECONCILIATION_STORAGE_KEY);
  return null;
}

function rememberPendingInteractionReconciliation(interactionId: string): void {
  if (typeof globalThis.sessionStorage === "undefined") return;
  globalThis.sessionStorage.setItem(PENDING_RECONCILIATION_STORAGE_KEY, interactionId);
}

function clearPendingInteractionReconciliation(interactionId: string): void {
  if (typeof globalThis.sessionStorage === "undefined") return;
  if (pendingExecutiveInteractionReconciliationId() === interactionId) {
    globalThis.sessionStorage.removeItem(PENDING_RECONCILIATION_STORAGE_KEY);
  }
}

export function rememberPendingExecutiveApproval(admission: RuntimeInteractionAdmission): void {
  if (typeof globalThis.sessionStorage === "undefined") return;
  const interactionId = admission.interactionResult.interaction_id;
  if (pendingExecutiveApprovalId(admission)) {
    globalThis.sessionStorage.setItem(PENDING_INTERACTION_STORAGE_KEY, interactionId);
  } else if (pendingInteractionPointer() === interactionId) {
    globalThis.sessionStorage.removeItem(PENDING_INTERACTION_STORAGE_KEY);
  }
}

export function clearPendingExecutiveApproval(interactionId?: string): void {
  if (typeof globalThis.sessionStorage === "undefined") return;
  const pending = pendingInteractionPointer();
  if (!interactionId || pending === interactionId) {
    globalThis.sessionStorage.removeItem(PENDING_INTERACTION_STORAGE_KEY);
  }
}

function requestFromRuntimeEnvelope(value: unknown, expectedInteractionId: string): ExecutiveInteractionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NEXUS Runtime retained no original interaction envelope.");
  }
  const envelope = value as Record<string, unknown>;
  const input = envelope.input;
  const context = envelope.context;
  if (!input || typeof input !== "object" || Array.isArray(input)
      || !context || typeof context !== "object" || Array.isArray(context)) {
    throw new Error("NEXUS Runtime retained a malformed original interaction envelope.");
  }
  const inputValue = input as Record<string, unknown>;
  const contextValue = context as Record<string, unknown>;
  const interactionId = String(envelope.interaction_id ?? "");
  const sessionId = String(envelope.session_id ?? "");
  const modality = String(inputValue.modality ?? "");
  const text = typeof inputValue.text === "string" ? inputValue.text.trim() : "";
  const activeObjectIds = contextValue.active_object_ids;
  const conversationId = contextValue.conversation_id;
  if (interactionId !== expectedInteractionId || !UUID_PATTERN.test(interactionId) || !UUID_PATTERN.test(sessionId)) {
    throw new Error("NEXUS Runtime lookup did not bind the original interaction identifiers.");
  }
  if (!new Set(["text", "voice", "api"]).has(modality) || inputValue.source_client !== "nexus-command" || !text || text.length > 4_000) {
    throw new Error("NEXUS Runtime lookup retained invalid canonical interaction input.");
  }
  if (!Array.isArray(activeObjectIds) || activeObjectIds.some((item) => typeof item !== "string" || !STABLE_ID_PATTERN.test(item))) {
    throw new Error("NEXUS Runtime lookup retained invalid active object bindings.");
  }
  if (conversationId !== null && (typeof conversationId !== "string" || !UUID_PATTERN.test(conversationId))) {
    throw new Error("NEXUS Runtime lookup retained an invalid conversation binding.");
  }
  return {
    interaction_id: interactionId,
    session_id: sessionId,
    input: {
      modality: modality as "text" | "voice" | "api",
      text,
      source_client: "nexus-command",
    },
    context: {
      active_object_ids: [...activeObjectIds],
      conversation_id: conversationId,
    },
  };
}

function sameInteractionRequest(
  expected: ExecutiveInteractionRequest,
  retained: ExecutiveInteractionRequest,
): boolean {
  return expected.interaction_id === retained.interaction_id
    && expected.session_id === retained.session_id
    && expected.input.modality === retained.input.modality
    && expected.input.text === retained.input.text
    && expected.input.source_client === retained.input.source_client
    && JSON.stringify(expected.context) === JSON.stringify(retained.context);
}

function ambiguousInteractionFailure(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status);
  return !Number.isFinite(status)
    || (status >= 200 && status < 300)
    || status === 408
    || status === 409
    || status === 429
    || status >= 500;
}

async function lookupUncertainInteraction(
  request: ExecutiveInteractionRequest,
): Promise<RuntimeInteractionAdmission | null> {
  let lookup;
  try {
    lookup = await localNexusClient.executiveInteractionLookup(request.interaction_id);
  } catch {
    rememberPendingInteractionReconciliation(request.interaction_id);
    throw new CanonicalInteractionIndeterminateError(
      request.interaction_id,
      "The canonical interaction lookup was unavailable after submission.",
    );
  }
  if (lookup.interaction_id !== request.interaction_id) {
    rememberPendingInteractionReconciliation(request.interaction_id);
    throw new CanonicalInteractionIndeterminateError(
      request.interaction_id,
      "Runtime lookup returned a different interaction binding.",
    );
  }
  if (!lookup.found) return null;

  if (!lookup.original_envelope) {
    rememberPendingInteractionReconciliation(request.interaction_id);
    throw new CanonicalInteractionIndeterminateError(
      request.interaction_id,
      "Runtime retained no original interaction envelope for identity reconciliation.",
    );
  }
  let retainedRequest;
  try {
    retainedRequest = requestFromRuntimeEnvelope(lookup.original_envelope, request.interaction_id);
  } catch {
    rememberPendingInteractionReconciliation(request.interaction_id);
    throw new CanonicalInteractionIndeterminateError(
      request.interaction_id,
      "Runtime retained a malformed original interaction envelope.",
    );
  }
  if (!sameInteractionRequest(request, retainedRequest)) {
    rememberPendingInteractionReconciliation(request.interaction_id);
    throw new CanonicalInteractionIndeterminateError(
      request.interaction_id,
      "Runtime retained an interaction envelope that does not match the submitted request.",
    );
  }
  if (!TERMINAL_INTERACTION_LOOKUP_STATES.has(String(lookup.state ?? "")) || !lookup.latest_response) {
    rememberPendingInteractionReconciliation(request.interaction_id);
    throw new CanonicalInteractionIndeterminateError(
      request.interaction_id,
      `Runtime retained the interaction in state ${lookup.state ?? "unknown"} without a terminal response.`,
    );
  }
  try {
    const admission = projectExecutiveInteraction(
      lookup.latest_response,
      retainedRequest,
      request.interaction_id,
    );
    clearPendingInteractionReconciliation(request.interaction_id);
    return admission;
  } catch {
    rememberPendingInteractionReconciliation(request.interaction_id);
    throw new CanonicalInteractionIndeterminateError(
      request.interaction_id,
      "Runtime retained a response that did not satisfy the canonical semantic admission contract.",
    );
  }
}

async function reconcilePendingInteractionBeforeSubmission(
  text: string,
  modality: "text" | "voice",
  sessionId: string,
): Promise<RuntimeInteractionAdmission | null> {
  const interactionId = pendingExecutiveInteractionReconciliationId();
  if (!interactionId) return null;
  let lookup;
  try {
    lookup = await localNexusClient.executiveInteractionLookup(interactionId);
  } catch {
    throw new CanonicalInteractionIndeterminateError(
      interactionId,
      "A previous canonical interaction is still awaiting Runtime reconciliation.",
    );
  }
  if (!lookup.found || lookup.interaction_id !== interactionId || !lookup.original_envelope) {
    throw new CanonicalInteractionIndeterminateError(
      interactionId,
      "A previous canonical interaction cannot yet be reconciled, so a new request is blocked.",
    );
  }
  let retainedRequest;
  try {
    retainedRequest = requestFromRuntimeEnvelope(lookup.original_envelope, interactionId);
  } catch {
    throw new CanonicalInteractionIndeterminateError(
      interactionId,
      "A previous canonical interaction retained no valid original envelope.",
    );
  }
  if (
    retainedRequest.session_id !== sessionId
    || retainedRequest.input.modality !== modality
    || retainedRequest.input.text !== text
  ) {
    throw new CanonicalInteractionIndeterminateError(
      interactionId,
      "A previous canonical interaction blocks submission of a different request.",
    );
  }
  if (!TERMINAL_INTERACTION_LOOKUP_STATES.has(String(lookup.state ?? "")) || !lookup.latest_response) {
    throw new CanonicalInteractionIndeterminateError(
      interactionId,
      `Runtime still reports state ${lookup.state ?? "unknown"} without a terminal response.`,
    );
  }
  try {
    const admission = projectExecutiveInteraction(
      lookup.latest_response,
      retainedRequest,
      interactionId,
    );
    clearPendingInteractionReconciliation(interactionId);
    return admission;
  } catch {
    throw new CanonicalInteractionIndeterminateError(
      interactionId,
      "The retained Runtime response still fails canonical semantic admission.",
    );
  }
}

async function submitExecutiveInteractionWithReconciliation(
  request: ExecutiveInteractionRequest,
  approvalId?: string,
): Promise<RuntimeInteractionAdmission> {
  const submit = () => localNexusClient.executiveInteraction(request, approvalId);
  let result: ExecutiveInteractionResult;
  try {
    result = await submit();
  } catch (error) {
    if (!ambiguousInteractionFailure(error)) throw error;
    const recovered = await lookupUncertainInteraction(request);
    if (recovered) return recovered;
    try {
      result = await submit();
    } catch (retryError) {
      if (!ambiguousInteractionFailure(retryError)) throw retryError;
      const retryRecovered = await lookupUncertainInteraction(request);
      if (retryRecovered) return retryRecovered;
      rememberPendingInteractionReconciliation(request.interaction_id);
      throw new CanonicalInteractionIndeterminateError(
        request.interaction_id,
        "Two same-key submissions had no response and Runtime has not retained a terminal result.",
      );
    }
  }
  try {
    const admission = projectExecutiveInteraction(result, request, request.interaction_id);
    clearPendingInteractionReconciliation(request.interaction_id);
    return admission;
  } catch {
    const recovered = await lookupUncertainInteraction(request);
    if (recovered) return recovered;
    rememberPendingInteractionReconciliation(request.interaction_id);
    throw new CanonicalInteractionIndeterminateError(
      request.interaction_id,
      "The submitted Runtime response failed canonical semantic admission and no retained result was available.",
    );
  }
}

/**
 * Rehydrates only a Runtime-retained pending interaction after a page refresh.
 * Browser storage contains a UUID pointer, never the action envelope; Runtime
 * lookup remains tenant-scoped and supplies the exact original request.
 */
export async function recoverPendingExecutiveApproval(): Promise<RuntimeInteractionAdmission | null> {
  const interactionId = pendingInteractionPointer();
  if (!interactionId) return null;
  const lookup = await localNexusClient.executiveInteractionLookup(interactionId);
  if (!lookup.found || lookup.interaction_id !== interactionId || !lookup.latest_response || !lookup.original_envelope) {
    clearPendingExecutiveApproval(interactionId);
    return null;
  }
  const request = requestFromRuntimeEnvelope(lookup.original_envelope, interactionId);
  const admission = projectExecutiveInteraction(lookup.latest_response, request, interactionId);
  if (!pendingExecutiveApprovalId(admission)) {
    clearPendingExecutiveApproval(interactionId);
    return null;
  }
  return admission;
}

/**
 * Presentation is a Runtime-returned effect, never a phrase match or local
 * classification. Unknown targets are ignored by the consuming presentation
 * adapter, and no effect is admitted without the explicit execution scope.
 */
export function runtimePresentationNavigation(admission: RuntimeInteractionAdmission): string | null {
  if (admission.classification !== "action") return null;
  if (admission.status !== "answered") return null;
  if (admission.interactionResult.execution_scope !== "client_presentation") return null;
  return presentationNavigationTarget(admission.interactionResult);
}

export function projectExecutiveInteraction(
  result: ExecutiveInteractionResult,
  interactionRequest: ExecutiveInteractionRequest,
  expectedInteractionId?: string,
): RuntimeInteractionAdmission {
  if (!result || typeof result !== "object") {
    throw new Error("NEXUS Runtime returned no canonical interaction result.");
  }
  if (!UUID_PATTERN.test(String(result.interaction_id ?? ""))) {
    throw new Error("NEXUS Runtime returned no valid interaction identifier.");
  }
  if (expectedInteractionId && result.interaction_id !== expectedInteractionId) {
    throw new Error("NEXUS Runtime returned a result for a different interaction.");
  }
  if (!CLASSIFICATIONS.has(result.classification)) {
    throw new Error("NEXUS Runtime returned an unregistered interaction classification.");
  }
  if (!STATUSES.has(result.status)) {
    throw new Error("NEXUS Runtime returned an unregistered interaction status.");
  }
  if (!result.intent || typeof result.intent !== "object" || Array.isArray(result.intent)) {
    throw new Error("NEXUS Runtime returned no structured intent classification.");
  }
  if (!result.authority_decision || typeof result.authority_decision !== "object" || Array.isArray(result.authority_decision)) {
    throw new Error("NEXUS Runtime returned no explicit Authority decision.");
  }
  if (!result.execution || typeof result.execution !== "object" || Array.isArray(result.execution)) {
    throw new Error("NEXUS Runtime returned no structured execution state.");
  }
  if (!result.verification || typeof result.verification !== "object" || Array.isArray(result.verification)) {
    throw new Error("NEXUS Runtime returned no structured verification state.");
  }
  if (
    typeof result.execution.attempted !== "boolean"
    || typeof result.execution.executed !== "boolean"
    || typeof result.verification.verified !== "boolean"
  ) {
    throw new Error("NEXUS Runtime returned no explicit execution and verification truth values.");
  }
  const hasPresentationClaim = result.presentation != null
    || result.execution_scope === "client_presentation";
  const admittedPresentation = result.classification === "action"
    && result.status === "answered"
    && result.execution_scope === "client_presentation"
    && presentationNavigationTarget(result) !== null;
  if (hasPresentationClaim && !admittedPresentation) {
    throw new Error("NEXUS Runtime returned a malformed or unscoped client presentation effect.");
  }
  if (result.status === "answered" && !new Set(["question", "clarification"]).has(result.classification) && !admittedPresentation) {
    throw new Error("NEXUS Runtime marked a non-conversational interaction as answered without an explicit client presentation effect.");
  }
  if (new Set(["approval_required", "executed"]).has(result.status) && result.classification !== "action") {
    throw new Error("NEXUS Runtime returned an operational status for a non-action interaction.");
  }
  if (result.classification === "blocked" && !new Set(["blocked", "failed"]).has(result.status)) {
    throw new Error("NEXUS Runtime returned a blocked classification with a non-blocking status.");
  }
  if (result.status === "answered") {
    const conversationalAnswer = new Set(["question", "clarification"]).has(result.classification)
      && result.execution_scope == null;
    const clientPresentationAnswer = admittedPresentation;
    if (
      !(conversationalAnswer || clientPresentationAnswer)
      || result.authority_decision.decision !== "not_applicable"
      || result.execution.attempted !== false
      || result.execution.executed !== false
      || result.execution.execution_scope != null
    ) {
      throw new Error("NEXUS Runtime returned an answer without matching non-execution and Authority semantics.");
    }
  }
  if (result.status === "approval_required") {
    if (
      result.authority_decision.decision !== "approval_required"
      || !approvalIdFrom(result)
      || !durableReceiptIdFrom(result)
      || result.execution.attempted !== false
      || result.execution.executed !== false
      || result.execution_scope != null
      || result.execution.execution_scope != null
      || result.verification.verified !== false
    ) {
      throw new Error("NEXUS Runtime returned an approval gate without matching Authority, non-execution state, and a durable receipt.");
    }
  }
  if (result.status === "executed") {
    if (
      result.authority_decision.decision !== "allow"
      || result.execution_scope !== "runtime"
      || result.execution.execution_scope !== "runtime"
      || result.execution.attempted !== true
      || result.execution.executed !== true
      || result.verification.verified !== true
      || !durableReceiptIdFrom(result)
      || !underlyingExecutionReceiptIdFrom(result)
    ) {
      throw new Error("NEXUS Runtime did not return allowed, attempted, executed, verified Runtime execution with durable receipts.");
    }
  }
  const operationalBlockOrFailure = new Set(["action", "blocked"]).has(result.classification)
    && new Set(["blocked", "failed"]).has(result.status);
  if (operationalBlockOrFailure) {
    const authorityDecision = result.authority_decision.decision;
    const attempted = result.execution.attempted;
    const runtimeAttempt = attempted === true
      && result.execution_scope === "runtime"
      && result.execution.execution_scope === "runtime";
    const noAttempt = attempted === false
      && result.execution_scope == null
      && result.execution.execution_scope == null;
    if (
      !durableReceiptIdFrom(result)
      || result.execution.executed !== false
      || (result.status === "blocked"
        ? !hasVerifiedNonEffect(result.verification)
        : result.verification.verified !== false)
      || !(runtimeAttempt || noAttempt)
      || (result.status === "blocked" && !new Set(["deny", "capability_unavailable", "insufficient_context"]).has(String(authorityDecision)))
      || (result.status === "failed" && !new Set(["deny", "withhold"]).has(String(authorityDecision)))
    ) {
      throw new Error("NEXUS Runtime returned an operational block or failure without matching Authority, execution state, and a durable receipt.");
    }
  }

  return {
    admitted: true,
    spokenSummary: boundedSummary(result.response_text),
    path: "executive_interaction",
    classification: result.classification,
    status: result.status,
    interactionResult: result,
    interactionRequest,
    proofIds: boundedIds(Array.isArray(result.proof_ids) ? result.proof_ids : []),
    receiptIds: boundedIds([durableReceiptIdFrom(result)]),
    limitations: Array.isArray(result.limitations)
      ? result.limitations.filter((value): value is string => typeof value === "string").slice(0, 64)
      : [],
  };
}

/**
 * Consume only the Runtime-owned approval continuation. The browser never
 * reconstructs or reclassifies the original text and never creates Authority;
 * it resumes the exact stored interaction only through the same endpoint.
 */
export async function admitApprovedExecutiveInteraction(
  response: ExecutiveInteractionApprovalResponse,
  pendingAdmission: RuntimeInteractionAdmission,
): Promise<RuntimeInteractionAdmission> {
  const expectedApprovalId = pendingExecutiveApprovalId(pendingAdmission);
  if (!expectedApprovalId) {
    throw new Error("NEXUS Runtime has no pending approval bound to this interaction.");
  }
  const approvalId = typeof response?.approval_id === "string" ? response.approval_id : "";
  if (!STABLE_ID_PATTERN.test(approvalId) || approvalId !== expectedApprovalId) {
    throw new Error("NEXUS Runtime returned an approval response for a different request.");
  }
  if (!new Set(["approved", "consumed"]).has(String(response.status ?? ""))) {
    throw new Error("NEXUS Runtime did not approve the pending request.");
  }
  const decisionRecorded = response.status === "approved" && response.resume_required === true;
  const executionAlreadyConsumed = response.status === "consumed" && response.resume_required === false;
  if ((!decisionRecorded && !executionAlreadyConsumed) || response.interaction_id !== pendingAdmission.interactionResult.interaction_id) {
    throw new Error("NEXUS Runtime did not bind approval to the pending canonical interaction.");
  }
  const admission = await submitExecutiveInteractionWithReconciliation(
    pendingAdmission.interactionRequest,
    approvalId,
  );
  if (admission.status === "approval_required") {
    throw new Error("NEXUS Runtime returned another unresolved approval gate instead of a completed continuation.");
  }
  return admission;
}

export function validateExecutiveInteractionDenial(
  response: ExecutiveInteractionApprovalResponse,
  expectedApprovalId: string,
  expectedInteractionId: string,
): void {
  if (
    response?.approval_id !== expectedApprovalId
    || response.interaction_id !== expectedInteractionId
    || response.status !== "denied"
  ) {
    throw new Error("NEXUS Runtime did not confirm the approval denial for this request.");
  }
  if (response.resume_required === true) throw new Error("NEXUS Runtime marked a denied interaction resumable.");
}

/**
 * The sole browser admission path for both text and finalized voice input.
 * There is no HIF, Voice Operator, model, or client-classification fallback.
 * Ambiguous submission outcomes reconcile only through the Runtime-retained
 * interaction with the same UUID; an unresolved outcome blocks every new ID.
 */
export async function admitExecutiveInteraction(
  text: string,
  modality: "text" | "voice",
  sessionId: string,
  interactionId?: string,
): Promise<RuntimeInteractionAdmission> {
  const reconciled = await reconcilePendingInteractionBeforeSubmission(text, modality, sessionId);
  if (reconciled) return reconciled;
  const request = newExecutiveInteractionRequest(text, modality, sessionId, interactionId);
  return submitExecutiveInteractionWithReconciliation(request);
}

export const admitRuntimeVoiceTranscript = (
  transcript: string,
  sessionId: string,
  interactionId: string,
) => admitExecutiveInteraction(transcript, "voice", sessionId, interactionId);
