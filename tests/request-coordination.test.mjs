import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  createSerializedRefresh,
  derivePortalConnectionState,
  registryFirstSettledMap,
  runBoundedTask,
  selectPortalPrimaryFailure,
} from "../src/lib/request-coordination.mjs";

const immediate = () => new Promise((resolve) => setImmediate(resolve));

test("registry-first startup bounds remaining read concurrency", async () => {
  const events = [];
  let active = 0;
  let maximumActive = 0;
  let releaseRegistry;
  const registryGate = new Promise((resolve) => {
    releaseRegistry = resolve;
  });
  const task = async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    events.push(`start:${item}`);
    try {
      if (item === "registry") await registryGate;
      else await immediate();
      return item;
    } finally {
      events.push(`finish:${item}`);
      active -= 1;
    }
  };

  const pending = registryFirstSettledMap(
    ["status", "registry", "health", "ready", "version", "providers"],
    {
      registryItem: "registry",
      concurrency: 2,
      task,
    },
  );
  await immediate();
  assert.deepEqual(events, ["start:registry"]);

  releaseRegistry();
  const results = await pending;
  assert.equal(results.every((result) => result.status === "fulfilled"), true);
  assert.equal(maximumActive, 2);
  assert.equal(events.indexOf("finish:registry") < events.indexOf("start:status"), true);
});

test("registry failure is retained while independent reads continue within the bound", async () => {
  const calls = [];
  let active = 0;
  let maximumActive = 0;
  const results = await registryFirstSettledMap(
    ["status", "registry", "health", "ready", "version"],
    {
      registryItem: "registry",
      concurrency: 2,
      task: async (item) => {
        calls.push(item);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          if (item === "registry") throw new Error("registry unavailable");
          await immediate();
          return item;
        } finally {
          active -= 1;
        }
      },
    },
  );

  assert.equal(results[1].status, "rejected");
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 4);
  assert.deepEqual(calls.slice(0, 1), ["registry"]);
  assert.deepEqual(new Set(calls), new Set(["status", "registry", "health", "ready", "version"]));
  assert.ok(maximumActive <= 2);
});

test("non-force snapshots coalesce and one force refresh queues without overlap", async () => {
  const calls = [];
  const releases = [];
  let active = 0;
  let maximumActive = 0;
  const refresh = createSerializedRefresh(async (forceRefresh) => {
    calls.push(forceRefresh);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    try {
      return await new Promise((resolve) => {
        releases.push(() => resolve(forceRefresh));
      });
    } finally {
      active -= 1;
    }
  });

  const first = refresh(false);
  const repeated = refresh(false);
  assert.equal(first, repeated);
  await immediate();
  assert.deepEqual(calls, [false]);

  const forced = refresh(true);
  const repeatedForce = refresh(true);
  assert.equal(forced, repeatedForce);
  assert.deepEqual(calls, [false]);

  releases.shift()();
  assert.equal(await first, false);
  await immediate();
  assert.deepEqual(calls, [false, true]);
  releases.shift()();
  assert.equal(await forced, true);
  assert.equal(maximumActive, 1);
});

test("an initial serialized snapshot remains useful while its queued force refresh is pending", async () => {
  const releases = [];
  const applied = [];
  const refresh = createSerializedRefresh((forceRefresh) => new Promise((resolve) => {
    releases.push(() => resolve(forceRefresh ? "forced" : "initial"));
  }));

  const initial = refresh(false).then((value) => {
    applied.push(value);
  });
  await immediate();
  const forced = refresh(true).then((value) => {
    applied.push(value);
  });

  releases.shift()();
  await initial;
  assert.deepEqual(applied, ["initial"]);
  await immediate();
  assert.equal(releases.length, 1);

  releases.shift()();
  await forced;
  assert.deepEqual(applied, ["initial", "forced"]);
});

test("bounded tasks abort and reject instead of remaining pending", async () => {
  let aborted = false;
  const started = Date.now();
  await assert.rejects(
    runBoundedTask(
      (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        }, { once: true });
      }),
      { timeoutMs: 15 },
    ),
    (error) => error?.code === "task_timed_out",
  );
  assert.equal(aborted, true);
  assert.ok(Date.now() - started < 500);
});

test("an already-aborted parent prevents bounded task invocation", async () => {
  const parent = new AbortController();
  parent.abort();
  let invoked = 0;

  await assert.rejects(
    runBoundedTask(
      () => {
        invoked += 1;
      },
      { timeoutMs: 50, parentSignal: parent.signal },
    ),
    (error) => error?.code === "task_parent_aborted",
  );
  assert.equal(invoked, 0);
});

test("a completed bounded task clears its timer without a later abort", async () => {
  let signal;
  assert.equal(
    await runBoundedTask(
      (taskSignal) => {
        signal = taskSignal;
        return "complete";
      },
      { timeoutMs: 15 },
    ),
    "complete",
  );
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(signal.aborted, false);
});

test("portal connection state keeps capability readiness separate from healthy transport", () => {
  const envelope = (connectionState) => ({
    gateway: { connectionState },
  });

  assert.equal(derivePortalConnectionState({}, [], true), "Connecting");
  assert.equal(derivePortalConnectionState({}, [], false), "Unavailable");
  assert.equal(derivePortalConnectionState({}, [envelope("Unknown")], false), "Unknown");
  assert.equal(derivePortalConnectionState({}, [envelope("Timed Out")], false), "Timed Out");
  assert.equal(derivePortalConnectionState({}, [envelope("Unauthorized")], false), "Unauthorized");
  assert.equal(derivePortalConnectionState({
    health: envelope("Healthy"),
    ready: envelope("Degraded"),
    providers: envelope("Healthy"),
  }, [], false), "Healthy");
  assert.equal(derivePortalConnectionState({
    health: envelope("Healthy"),
    ready: envelope("Healthy"),
    providers: envelope("Healthy"),
  }, [], true), "Healthy");
  assert.equal(derivePortalConnectionState({
    health: envelope("Healthy"),
    ready: envelope("Healthy"),
    providers: envelope("Unavailable"),
  }, [envelope("Unavailable")], false), "Healthy");
  assert.equal(derivePortalConnectionState({
    health: envelope("Healthy"),
    ready: envelope("Healthy"),
  }, [envelope("Unauthorized")], false), "Unauthorized");
  assert.equal(derivePortalConnectionState({
    health: envelope("Timed Out"),
    ready: envelope("Unavailable"),
    providers: envelope("Healthy"),
  }, [], false), "Timed Out");
});

test("primary failure follows the selected trust state instead of route order", () => {
  const failures = [
    {
      gateway: { connectionState: "Unavailable" },
      error: { message: "Optional provider read failed." },
    },
    {
      gateway: { connectionState: "Unauthorized" },
      error: { message: "Runtime rejected the server credential." },
    },
  ];
  assert.equal(
    selectPortalPrimaryFailure(failures, "Unauthorized")?.error?.message,
    "Runtime rejected the server credential.",
  );
  assert.equal(
    selectPortalPrimaryFailure(failures, "Degraded")?.error?.message,
    "Optional provider read failed.",
  );
  assert.equal(selectPortalPrimaryFailure([], "Unavailable"), null);
});

test("portal startup wires one bounded serialized bootstrap request", async () => {
  const [source, app, localClient] = await Promise.all([
    readFile(new URL("../src/lib/portal-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/local-client.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /const CLIENT_REQUEST_TIMEOUT_MS = 10_000;/);
  assert.match(source, /const CLIENT_SNAPSHOT_TIMEOUT_MS = 20_000;/);
  assert.match(source, /from "\.\.\/\.\.\/shared\/runtime-bootstrap-contract\.mjs";/);
  assert.match(source, /RUNTIME_BOOTSTRAP_ROUTE,/);
  assert.doesNotMatch(source, /const RUNTIME_BOOTSTRAP_ROUTE =/);
  assert.match(source, /response = await fetch\(RUNTIME_BOOTSTRAP_ROUTE/);
  assert.doesNotMatch(source, /registryFirstSettledMap\(RUNTIME_ROUTES/);
  assert.match(source, /const snapshot = createSerializedRefresh\(loadSnapshot\);/);
  assert.match(source, /gateway_snapshot_timed_out/);
  assert.match(app, /setSnapshot\(\(current\) => \(\{ \.\.\.current, \.\.\.result\.data \}\)\);/);
  assert.doesNotMatch(
    app,
    /\.then\(\(result\) => \{\s*if \(refreshGeneration\.current !== generation\) return;/,
  );
  assert.match(
    localClient,
    /const operationalSessionStatus = createSerializedRefresh\(/,
  );
  assert.match(localClient, /const CLIENT_READ_TIMEOUT_MS = 10_000;/);
});
