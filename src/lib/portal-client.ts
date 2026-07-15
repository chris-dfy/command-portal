import type { PortalEnvelope, PortalSnapshot } from "./types";

async function get<T>(path: string): Promise<PortalEnvelope<T>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(path, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal, credentials: "same-origin" });
    const body = await response.json() as PortalEnvelope<T>;
    if (!response.ok && !body.data) throw new Error(body.error?.message ?? `Portal read failed (${response.status})`);
    return body;
  } finally {
    window.clearTimeout(timer);
  }
}

export const portalClient = Object.freeze({
  snapshot: () => get<PortalSnapshot>("/api/portal/snapshot"),
  detail: (kind: "proof" | "receipt" | "claim", id: string) => get<Record<string, unknown>>(`/api/portal/${kind}/${encodeURIComponent(id)}`)
});
