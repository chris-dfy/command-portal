export type PrivateDraftOperation<TPayload> = Readonly<{
  payload: Readonly<TPayload>;
  idempotencyKey: string;
  attempts: number;
}>;

const clonePayload = <TPayload>(payload: TPayload): TPayload => {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(payload);
  }
  return JSON.parse(JSON.stringify(payload)) as TPayload;
};

export function snapshotPrivateDraftOperation<TPayload>(
  payload: TPayload,
  idempotencyKey: string,
): PrivateDraftOperation<TPayload> {
  if (!idempotencyKey.trim()) throw new Error("A private draft operation requires a stable idempotency key.");
  return Object.freeze({
    payload: Object.freeze(clonePayload(payload)) as Readonly<TPayload>,
    idempotencyKey,
    attempts: 0,
  });
}

export function beginPrivateDraftAttempt<TPayload>(
  operation: PrivateDraftOperation<TPayload>,
): PrivateDraftOperation<TPayload> {
  return Object.freeze({ ...operation, attempts: operation.attempts + 1 });
}

export function shouldPresentPrivateDraft(
  operation: PrivateDraftOperation<unknown>,
  alreadyVisible: boolean,
): boolean {
  return operation.attempts === 0 && !alreadyVisible;
}

export async function executeExplicitPrivateDraftAction<TPayload, TResult>(
  operation: PrivateDraftOperation<TPayload>,
  execute: (operation: PrivateDraftOperation<TPayload>) => Promise<TResult>,
): Promise<TResult> {
  return execute(operation);
}

export function retainPrivateDraftAfterFailure<TPayload>(
  operation: PrivateDraftOperation<TPayload>,
): PrivateDraftOperation<TPayload> {
  return operation;
}

export function clearPrivateDraftAfterSuccess(): null {
  return null;
}
