import type { GatewayEnvelope, RuntimeRoute, RuntimeSnapshot } from "./types";

export const RUNTIME_ROUTES: RuntimeRoute[] = [
  "status", "health", "ready", "version", "providers", "capabilities",
  "proofs", "receipts", "environment", "diagnostics", "governance", "connectors", "eox", "conclave"
];

async function get<T>(route: RuntimeRoute, forceRefresh = false): Promise<GatewayEnvelope<T>> {
  const response = await fetch(`/api/runtime/${route}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(forceRefresh ? { "Cache-Control": "no-cache" } : {})
    },
    credentials: "same-origin"
  });
  const body = await response.json() as GatewayEnvelope<T>;
  if (!response.ok || !body.ok) throw Object.assign(new Error(body.error?.message ?? `Gateway read failed (${response.status})`), { envelope: body });
  return body;
}

async function snapshot(forceRefresh = false): Promise<{ data: RuntimeSnapshot; failures: GatewayEnvelope[] }> {
  const results = await Promise.allSettled(RUNTIME_ROUTES.map((route) => get(route, forceRefresh)));
  const data: RuntimeSnapshot = {};
  const failures: GatewayEnvelope[] = [];
  results.forEach((result, index) => {
    const route = RUNTIME_ROUTES[index];
    if (result.status === "fulfilled") data[route] = result.value;
    else {
      const envelope = (result.reason as { envelope?: GatewayEnvelope }).envelope;
      if (envelope) {
        data[route] = envelope;
        failures.push(envelope);
      }
    }
  });
  return { data, failures };
}

export const portalClient = Object.freeze({ get, snapshot });
