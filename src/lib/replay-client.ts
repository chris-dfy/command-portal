import type { GatewayEnvelope } from "./types";

async function replayFetch(path: string): Promise<GatewayEnvelope> {
  try {
    const response = await fetch(path, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" }
    });
    const body: GatewayEnvelope = await response.json();
    return body;
  } catch {
    return {
      ok: false,
      data: null,
      runtime: null,
      gateway: {
        status: "Degraded",
        connectionState: "Unavailable",
        route: path,
        runtimeUrl: "",
        lastSuccessfulConnection: null,
        lastSuccessfulRefresh: null,
        cache: { lastRefresh: null, age: null, stale: false, expires: null, cached: false },
        readOnly: true,
        secretValuesExposed: false
      },
      truth: {
        productionReady: false,
        enterpriseReady: false,
        cloudPrimary: false,
        localSourceOfTruth: true,
        defaultProvider: "mock_model",
        conclave: "available_bounded_review",
        actualTrainedSLMs: 0,
        secretValuesExposed: false
      },
      error: { code: "replay_fetch_failed", message: "Replay request could not reach the Experience Gateway." }
    };
  }
}

export const replayClient = {
  listReplays: (): Promise<GatewayEnvelope> =>
    replayFetch("/api/runtime/replay"),

  getReplay: (id: string): Promise<GatewayEnvelope> =>
    replayFetch(`/api/runtime/replay/${encodeURIComponent(id)}`),

  getEvents: (id: string): Promise<GatewayEnvelope> =>
    replayFetch(`/api/runtime/replay/${encodeURIComponent(id)}/events`),

  explainStage: (id: string, stage: string): Promise<GatewayEnvelope> =>
    replayFetch(`/api/runtime/replay/${encodeURIComponent(id)}/stages/${stage}/explain`)
};
