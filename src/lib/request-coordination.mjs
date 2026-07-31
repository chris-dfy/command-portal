function boundedFailure(code, message) {
  return Object.assign(new Error(message), { code });
}

const TRUST_FAILURE_PRIORITY = [
  "Unauthorized",
  "Schema Mismatch",
  "Version Mismatch",
];
const CONNECTION_FAILURE_PRIORITY = [
  "Timed Out",
  "Unavailable",
  "Unknown",
  "Retrying",
  "Connecting",
];

export function derivePortalConnectionState(
  snapshot,
  failures,
  loading,
) {
  if (!Object.keys(snapshot).length) {
    return loading ? "Connecting" : "Unavailable";
  }
  const envelopes = [
    ...Object.values(snapshot),
    ...failures,
  ].filter(Boolean);
  const states = envelopes
    .map((item) => item?.gateway?.connectionState)
    .filter(Boolean);
  const trustFailure = TRUST_FAILURE_PRIORITY.find(
    (state) => states.includes(state),
  );
  if (trustFailure) return trustFailure;

  const anchorStates = [snapshot.health, snapshot.ready]
    .map((item) => item?.gateway?.connectionState)
    .filter(Boolean);
  const hasUsableAnchor = anchorStates.some(
    (state) => state === "Healthy" || state === "Degraded",
  );
  if (hasUsableAnchor) {
    return states.every((state) => state === "Healthy")
      ? "Healthy"
      : "Degraded";
  }
  return CONNECTION_FAILURE_PRIORITY.find(
    (state) => anchorStates.includes(state),
  ) ?? "Unavailable";
}

export async function runBoundedTask(
  task,
  {
    timeoutMs,
    parentSignal,
  },
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive integer.");
  }
  const controller = new AbortController();
  let timer;
  let removeParentListener = () => {};
  const boundary = new Promise((_, reject) => {
    const abortFromParent = () => {
      controller.abort();
      reject(boundedFailure(
        "task_parent_aborted",
        "The parent request boundary was aborted.",
      ));
    };
    if (parentSignal) {
      if (parentSignal.aborted) {
        abortFromParent();
        return;
      }
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
      removeParentListener = () => parentSignal.removeEventListener(
        "abort",
        abortFromParent,
      );
    }
    timer = setTimeout(() => {
      controller.abort();
      reject(boundedFailure(
        "task_timed_out",
        `The task exceeded its ${timeoutMs}ms bounded response window.`,
      ));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) {
          throw boundedFailure(
            parentSignal?.aborted ? "task_parent_aborted" : "task_timed_out",
            "The task boundary closed before execution began.",
          );
        }
        return task(controller.signal);
      }),
      boundary,
    ]);
  } finally {
    clearTimeout(timer);
    removeParentListener();
  }
}

export async function registryFirstSettledMap(
  items,
  {
    registryItem,
    concurrency,
    task,
  },
) {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new TypeError("concurrency must be a positive integer.");
  }
  const registryIndex = items.indexOf(registryItem);
  if (
    registryIndex < 0
    || items.indexOf(registryItem, registryIndex + 1) >= 0
  ) {
    throw new TypeError("registryItem must occur exactly once.");
  }
  const results = new Array(items.length);
  try {
    results[registryIndex] = {
      status: "fulfilled",
      value: await task(registryItem, registryIndex),
    };
  } catch (reason) {
    results[registryIndex] = { status: "rejected", reason };
  }

  const remaining = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => index !== registryIndex);
  let cursor = 0;
  const worker = async () => {
    while (cursor < remaining.length) {
      const current = remaining[cursor];
      cursor += 1;
      try {
        results[current.index] = {
          status: "fulfilled",
          value: await task(current.item, current.index),
        };
      } catch (reason) {
        results[current.index] = { status: "rejected", reason };
      }
    }
  };
  const workerCount = Math.min(concurrency, remaining.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function createSerializedRefresh(run) {
  let active = null;
  let queuedForce = null;

  const launch = (forceRefresh) => {
    const operation = Promise.resolve().then(() => run(forceRefresh));
    active = operation;
    void operation.finally(() => {
      if (active === operation) active = null;
    }).catch(() => {});
    return operation;
  };

  return (forceRefresh = false) => {
    if (!active) return queuedForce ?? launch(forceRefresh);
    if (!forceRefresh) return active;
    if (queuedForce) return queuedForce;

    const predecessor = active;
    const queued = predecessor
      .catch(() => undefined)
      .then(() => launch(true));
    queuedForce = queued;
    void queued.finally(() => {
      if (queuedForce === queued) queuedForce = null;
    }).catch(() => {});
    return queued;
  };
}
