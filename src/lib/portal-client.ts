import type {
  CapabilityClassification,
  CapabilityRegistryProjection,
  GatewayEnvelope,
  RuntimeRoute,
  RuntimeSnapshot,
} from "./types";

export const RUNTIME_ROUTES: RuntimeRoute[] = [
  "status", "health", "ready", "version", "providers", "capabilities",
  "proofs", "receipts", "environment", "diagnostics", "governance", "connectors",
  "capability-registry", "eox", "conclave"
];

const CAPABILITY_REGISTRY_RECORD_TYPE = "nexus_live_capability_registry_projection";
const CAPABILITY_REGISTRY_SCHEMA_VERSION = "nexus.live-capability-registry@1.0.0";
const CAPABILITY_CLASSIFICATIONS = new Set<CapabilityClassification>([
  "live_verified",
  "live_degraded",
  "configured_unverified",
  "staged",
  "simulated",
  "unavailable",
]);
const EXECUTIVE_CONTINUITY_CLASSIFICATIONS = new Set([
  "hard_blocking",
  "safely_remediable",
  "non_blocking_degraded",
  "operator_action_required",
]);

const objectRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);
const stringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((item) => typeof item === "string")
);
const validIdentity = (value: unknown): value is string => (
  typeof value === "string" && value.length > 0 && value.length <= 191
);
const unique = (records: Record<string, unknown>[], key: string) => (
  new Set(records.map((item) => item[key])).size === records.length
);

export function asCapabilityRegistryProjection(value: unknown): CapabilityRegistryProjection | null {
  const projection = objectRecord(value);
  if (
    !projection
    || projection.recordType !== CAPABILITY_REGISTRY_RECORD_TYPE
    || projection.schemaVersion !== CAPABILITY_REGISTRY_SCHEMA_VERSION
    || !validIdentity(projection.owner)
    || !validIdentity(projection.generatedAt)
    || Number.isNaN(Date.parse(projection.generatedAt))
    || !objectRecord(projection.constitutionalBasis)
    || !objectRecord(projection.verificationPolicy)
    || !objectRecord(projection.summary)
    || !Array.isArray(projection.verificationReceipts)
    || !stringArray(projection.limitations)
    || projection.secretValuesExposed !== false
  ) return null;
  const authority = objectRecord(projection.authority);
  if (!authority || authority.authorityGranted !== false || authority.executionAuthorityIntroduced === true) return null;
  if (!Array.isArray(projection.capabilities) || !Array.isArray(projection.connectors) || !Array.isArray(projection.actions)) return null;

  const capabilities = projection.capabilities.map(objectRecord);
  const connectors = projection.connectors.map(objectRecord);
  const actions = projection.actions.map(objectRecord);
  if ([...capabilities, ...connectors, ...actions].some((item) => item === null)) return null;
  const capabilityRecords = capabilities as Record<string, unknown>[];
  const connectorRecords = connectors as Record<string, unknown>[];
  const actionRecords = actions as Record<string, unknown>[];
  if (
    !unique(capabilityRecords, "capabilityId")
    || !unique(connectorRecords, "connectorId")
    || !unique(actionRecords, "actionId")
  ) return null;
  if (capabilityRecords.some((item) => (
    !validIdentity(item.capabilityId)
    || !CAPABILITY_CLASSIFICATIONS.has(item.classification as CapabilityClassification)
    || !stringArray(item.limitations)
  ))) return null;
  if (connectorRecords.some((item) => (
    !validIdentity(item.connectorId)
    || typeof item.registration !== "string"
    || typeof item.configuration !== "string"
    || typeof item.reachability !== "string"
    || typeof item.verification !== "string"
    || typeof item.health !== "string"
    || typeof item.operationalAvailability !== "string"
    || typeof item.authorizationRequirement !== "string"
    || (item.lastSuccessfulVerification !== null && typeof item.lastSuccessfulVerification !== "string")
    || !objectRecord(item.freshness)
    || !stringArray(item.evidenceReferences)
    || !stringArray(item.receiptReferences)
    || !stringArray(item.limitations)
    || typeof item.requiredNextAction !== "string"
  ))) return null;
  const unavailable = new Set<CapabilityClassification>([
    "configured_unverified",
    "staged",
    "simulated",
    "unavailable",
  ]);
  if (actionRecords.some((item) => (
    !validIdentity(item.actionId)
    || !validIdentity(item.capabilityId)
    || !validIdentity(item.handlerId)
    || !validIdentity(item.operationId)
    || !validIdentity(item.inputSchemaId)
    || (item.fixedTarget !== undefined && !validIdentity(item.fixedTarget))
    || !CAPABILITY_CLASSIFICATIONS.has(item.classification as CapabilityClassification)
    || typeof item.invocable !== "boolean"
    || item.authorityGranted !== false
    || !stringArray(item.invocationPaths)
    || typeof item.authorizationRequirement !== "string"
    || !stringArray(item.limitations)
    || typeof item.requiredNextAction !== "string"
    || (unavailable.has(item.classification as CapabilityClassification) && item.invocable !== false)
  ))) return null;

  const executiveContinuity = objectRecord(projection.executiveContinuity);
  if (!executiveContinuity || !Array.isArray(executiveContinuity.impediments)) return null;
  const impediments = executiveContinuity.impediments.map(objectRecord);
  if (impediments.some((item) => !item)) return null;
  const impedimentRecords = impediments as Record<string, unknown>[];
  if (!unique(impedimentRecords, "impedimentId")) return null;
  if (impedimentRecords.some((item) => {
    if (
      !validIdentity(item.impedimentId)
      || !EXECUTIVE_CONTINUITY_CLASSIFICATIONS.has(String(item.classification))
      || typeof item.limitation !== "string"
      || typeof item.requiredNextAction !== "string"
    ) return true;
    if (item.remediationAction === undefined || item.remediationAction === null) return false;
    const remediation = objectRecord(item.remediationAction);
    return !remediation
      || !["staged", "unavailable"].includes(String(remediation.classification))
      || remediation.invocable !== false;
  })) return null;
  return projection as CapabilityRegistryProjection;
}

export const PORTAL_CANONICAL_ACTIONS = Object.freeze({
  copilotInteractionStart: Object.freeze({
    actionId: "context.runtime.route.post.runtime.interactions",
    method: "POST",
    pathTemplate: "/runtime/interactions",
    surface: "assistant",
  }),
  hifInteractionEvents: Object.freeze({
    actionId: "context.runtime.route.get.runtime.interactions.events",
    method: "GET",
    pathTemplate: "/runtime/interactions/{interaction_id}/events",
    surface: "assistant",
  }),
  hifInteractionInterrupt: Object.freeze({
    actionId: "context.runtime.route.post.runtime.interactions.interrupt",
    method: "POST",
    pathTemplate: "/runtime/interactions/{interaction_id}/interrupt",
    surface: "assistant",
  }),
  realtimeVoiceCall: Object.freeze({
    actionId: "context.runtime.route.post.runtime.voice.realtime.call",
    method: "POST",
    pathTemplate: "/runtime/voice/realtime/call",
    surface: "voice",
  }),
  voiceOperatorTranscript: Object.freeze({
    actionId: "canonical.route.post.voice-operator.route-transcript",
    method: "POST",
    pathTemplate: "/voice-operator/route-transcript",
    surface: "voice",
  }),
});

export type CanonicalActionAvailability = {
  available: boolean;
  state: CapabilityClassification | "checking" | "invalid";
  actionId: string;
  reason: string;
};

export function canonicalActionAvailability(
  projection: CapabilityRegistryProjection | null,
  contract: typeof PORTAL_CANONICAL_ACTIONS[keyof typeof PORTAL_CANONICAL_ACTIONS],
  registryFailure = "",
): CanonicalActionAvailability {
  if (registryFailure) {
    return {
      available: false,
      state: "invalid",
      actionId: contract.actionId,
      reason: registryFailure,
    };
  }
  if (!projection) {
    return {
      available: false,
      state: "checking",
      actionId: contract.actionId,
      reason: "The Runtime-owned Capability Registry projection is not currently available.",
    };
  }
  const matches = projection.actions.filter((action) => action.actionId === contract.actionId);
  if (matches.length !== 1) {
    return {
      available: false,
      state: "invalid",
      actionId: contract.actionId,
      reason: "The canonical action identity is missing or ambiguous.",
    };
  }
  const action = matches[0];
  const exactInvocationPath = `${contract.surface}:${contract.method} ${contract.pathTemplate}`;
  const contractMatches = (
    action.method === contract.method
    && action.pathTemplate === contract.pathTemplate
    && action.invocationSurfaces?.includes(contract.surface) === true
    && action.invocationPaths.includes(exactInvocationPath)
  );
  const available = contractMatches
    && ["live_verified", "live_degraded"].includes(action.classification)
    && action.invocable === true
    && action.operationalAvailability === true
    && action.authorityGranted === false;
  const reasons = [
    !contractMatches ? "The canonical action no longer matches the fixed portal invocation contract." : "",
    action.requiredNextAction,
    ...action.limitations,
  ].filter(Boolean);
  return {
    available,
    state: action.classification,
    actionId: action.actionId,
    reason: available
      ? `${action.classification === "live_degraded" ? "Degraded" : "Live"} canonical action; Authority remains separate.`
      : [...new Set(reasons)].join(" ") || `The canonical action is ${action.classification}.`,
  };
}

function unavailableEnvelope(
  route: RuntimeRoute,
  code?: string,
  message = `The Experience Gateway did not return a valid ${route} response.`,
): GatewayEnvelope {
  return {
    ok: false,
    data: null,
    runtime: null,
    gateway: {
      status: "Degraded",
      connectionState: "Unavailable",
      route: `/api/runtime/${route}`,
      runtimeUrl: "",
      lastSuccessfulConnection: null,
      lastSuccessfulRefresh: null,
      cache: { lastRefresh: null, age: null, stale: false, expires: null, cached: false },
      readOnly: true,
      secretValuesExposed: false,
    },
    truth: {
      productionReady: false,
      enterpriseReady: false,
      cloudPrimary: false,
      localSourceOfTruth: true,
      defaultProvider: "mock_model",
      conclave: "unavailable",
      actualTrainedSLMs: 0,
      secretValuesExposed: false,
    },
    error: code ? { code, message } : { code: "gateway_unreachable", message },
  };
}

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
  if (route === "capability-registry" && !asCapabilityRegistryProjection(body.data)) {
    const envelope = unavailableEnvelope(
      route,
      "capability_registry_response_invalid",
      "The Runtime-owned Capability Registry projection was invalid or incompatible.",
    );
    throw Object.assign(new Error(envelope.error?.message), { envelope });
  }
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
      const envelope = (result.reason as { envelope?: GatewayEnvelope }).envelope ?? unavailableEnvelope(route);
      data[route] = envelope;
      failures.push(envelope);
    }
  });
  return { data, failures };
}

export const portalClient = Object.freeze({ get, snapshot });
