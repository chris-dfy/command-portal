export type BoundedTaskFailure = Error & {
  code: "task_timed_out" | "task_parent_aborted";
};

export type ConnectionEnvelope = {
  gateway?: {
    connectionState?: string;
  };
};

export function derivePortalConnectionState(
  snapshot: Record<string, ConnectionEnvelope | undefined>,
  failures: ConnectionEnvelope[],
  loading: boolean,
): string;

export function selectPortalPrimaryFailure<Envelope extends ConnectionEnvelope>(
  failures: Envelope[],
  connectionState: string,
): Envelope | null;

export function runBoundedTask<T>(
  task: (signal: AbortSignal) => Promise<T> | T,
  options: {
    timeoutMs: number;
    parentSignal?: AbortSignal;
  },
): Promise<T>;

export function registryFirstSettledMap<Item, Value>(
  items: readonly Item[],
  options: {
    registryItem: Item;
    concurrency: number;
    task: (item: Item, index: number) => Promise<Value> | Value;
  },
): Promise<PromiseSettledResult<Value>[]>;

export function createSerializedRefresh<Value>(
  run: (forceRefresh: boolean) => Promise<Value> | Value,
): (forceRefresh?: boolean) => Promise<Value>;
