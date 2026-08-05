import { newExecutiveInteractionId } from "./local-client";
import {
  admitExecutiveInteraction,
  rememberPendingExecutiveApproval,
  type RuntimeInteractionAdmission,
} from "./runtime-voice-admission";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const conversationId = newExecutiveInteractionId();
const legacyRetryIds = new Map<string, string>();

function canonicalInteractionId(retryKey?: string): string {
  if (retryKey && UUID_PATTERN.test(retryKey)) return retryKey;
  if (!retryKey) return newExecutiveInteractionId();
  const retained = legacyRetryIds.get(retryKey);
  if (retained) return retained;
  const interactionId = newExecutiveInteractionId();
  legacyRetryIds.set(retryKey, interactionId);
  return interactionId;
}

/**
 * The sole browser action adapter. It captures an operator's requested effect
 * as text and submits it to the Runtime coordinator. It never classifies,
 * authorizes, or executes the request locally. Runtime outcomes are returned
 * unchanged so the owning workspace can render them and refresh read models.
 */
export async function admitCanonicalActionIntent(
  request: string,
  retryKey?: string,
): Promise<RuntimeInteractionAdmission> {
  const text = request.trim();
  if (!text) throw new Error("A canonical action request must not be empty.");
  if (text.length > 4_000) throw new Error("The canonical action request exceeds the 4,000 character interaction limit.");
  const interactionId = canonicalInteractionId(retryKey);
  const admission = await admitExecutiveInteraction(
    text,
    "text",
    conversationId,
    interactionId,
  );
  if (retryKey && !UUID_PATTERN.test(retryKey)) legacyRetryIds.delete(retryKey);
  rememberPendingExecutiveApproval(admission);
  return admission;
}

export function canonicalExecutionResult(
  admission: RuntimeInteractionAdmission,
): Record<string, unknown> {
  const execution = admission.interactionResult.execution;
  const result = execution && typeof execution === "object" && !Array.isArray(execution)
    ? (execution as Record<string, unknown>).result
    : null;
  return result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : admission.interactionResult;
}
