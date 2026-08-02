export type RealtimeTurnAdmission<T> =
  | { duplicate: false; value: T; idempotencyKey: string }
  | { duplicate: true; idempotencyKey: string };

/**
 * Binds every provider completion emitted for one detected speech turn to one
 * stable Runtime idempotency key and one normalized transcript. A duplicate
 * waits on the original admission instead of creating another upstream call.
 */
export class RealtimeTurnAdmissionLedger<T> {
  private activeKey: string | null = null;
  private readonly issued = new Set<string>();
  private readonly bindings = new Map<string, string>();
  private readonly admissions = new Map<string, Promise<T>>();
  private readonly completed = new Set<string>();

  beginTurn(): string {
    if (this.activeKey !== null) {
      throw new Error("Realtime voice cannot begin a new speech turn while the current turn is unresolved.");
    }
    if (typeof globalThis.crypto?.randomUUID !== "function") {
      throw new Error("Realtime voice requires secure UUID generation for canonical interaction admission.");
    }
    this.activeKey = globalThis.crypto.randomUUID();
    this.issued.add(this.activeKey);
    return this.activeKey;
  }

  activeTurnKey(): string | null {
    return this.activeKey;
  }

  isActiveTurn(idempotencyKey: string): boolean {
    return this.activeKey === idempotencyKey && this.issued.has(idempotencyKey);
  }

  endTurn(): void {
    this.activeKey = null;
  }

  async admit(
    idempotencyKey: string,
    transcriptBinding: string,
    factory: (stableIdempotencyKey: string) => Promise<T>,
  ): Promise<RealtimeTurnAdmission<T>> {
    if (!idempotencyKey || !this.issued.has(idempotencyKey)) {
      throw new Error("Realtime transcript has no issued speech-turn binding.");
    }
    const binding = transcriptBinding.trim();
    if (!binding) throw new Error("Realtime transcript binding is empty.");
    const registeredBinding = this.bindings.get(idempotencyKey);
    if (registeredBinding && registeredBinding !== binding) {
      throw new Error("Realtime provider emitted conflicting transcripts for one speech turn.");
    }
    if (!registeredBinding) this.bindings.set(idempotencyKey, binding);
    if (this.completed.has(idempotencyKey)) {
      return { duplicate: true, idempotencyKey };
    }

    const existing = this.admissions.get(idempotencyKey);
    const created = !existing;
    const admission = existing ?? Promise.resolve().then(() => factory(idempotencyKey));
    if (created) this.admissions.set(idempotencyKey, admission);
    try {
      const value = await admission;
      if (!created) return { duplicate: true, idempotencyKey };
      this.completed.add(idempotencyKey);
      return { duplicate: false, value, idempotencyKey };
    } catch (error) {
      if (this.admissions.get(idempotencyKey) === admission) {
        this.admissions.delete(idempotencyKey);
      }
      throw error;
    }
  }
}
