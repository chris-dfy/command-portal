import type {
  CapabilityClassification,
  CapabilityRegistryProjection,
  ConnectionState,
  GatewayEnvelope,
  RuntimeRoute,
  RuntimeSnapshot,
} from "./types";
import {
  createSerializedRefresh,
  registryFirstSettledMap,
  runBoundedTask,
} from "./request-coordination.mjs";

export const RUNTIME_ROUTES: RuntimeRoute[] = [
  "status", "health", "ready", "version", "providers", "capabilities",
  "proofs", "receipts", "environment", "diagnostics", "governance", "connectors",
  "capability-registry", "eox", "conclave"
];

const SNAPSHOT_CONCURRENCY = 3;
const CLIENT_REQUEST_TIMEOUT_MS = 10_000;
const CLIENT_SNAPSHOT_TIMEOUT_MS = 20_000;
const SUPPORTED_SCHEMA_VERSION = "1.0.0";
const SUPPORTED_RUNTIME_VERSION = "0.1.0";
const SEMANTIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
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
const CONNECTION_STATES = new Set<ConnectionState>([
  "Connecting",
  "Healthy",
  "Degraded",
  "Unavailable",
  "Retrying",
  "Timed Out",
  "Version Mismatch",
  "Schema Mismatch",
  "Unauthorized",
  "Unknown",
]);
const ROOT_REVISION_PATTERN = /^[0-9a-f]{40}$/;

const objectRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);
const stringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((item) => typeof item === "string")
);
const nullableString = (value: unknown): value is string | null => (
  value === null || typeof value === "string"
);
const nullableNonNegativeNumber = (value: unknown): value is number | null => (
  value === null
  || (typeof value === "number" && Number.isFinite(value) && value >= 0)
);
const validIdentity = (value: unknown): value is string => (
  typeof value === "string" && value.length > 0 && value.length <= 191
);
const unique = (records: Record<string, unknown>[], key: string) => (
  new Set(records.map((item) => item[key])).size === records.length
);
const compatibleRuntimeVersion = (value: unknown) => {
  if (typeof value !== "string") return false;
  const supported = SEMANTIC_VERSION_PATTERN.exec(SUPPORTED_RUNTIME_VERSION);
  const received = SEMANTIC_VERSION_PATTERN.exec(value);
  return Boolean(
    supported
    && received
    && received[1] === supported[1]
    && received[2] === supported[2],
  );
};

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
    || !objectRecord(projection.capabilityRegistryContract)
    || !objectRecord(projection.sourceIdentity)
    || !objectRecord(projection.summary)
    || !Array.isArray(projection.verificationReceipts)
    || !stringArray(projection.limitations)
    || projection.secretValuesExposed !== false
  ) return null;
  const contract = objectRecord(projection.capabilityRegistryContract);
  const sourceIdentity = objectRecord(projection.sourceIdentity);
  if (
    contract?.recordType !== "nexus_capability_registry_contract_identity"
    || contract.schemaVersion !== CAPABILITY_REGISTRY_SCHEMA_VERSION
    || typeof contract.schemaDigest !== "string"
    || !/^sha256:[a-f0-9]{64}$/.test(contract.schemaDigest)
    || contract.validatorVersion !== "nexus.capability-registry-validator@1.0.0"
    || typeof sourceIdentity?.rootRevision !== "string"
    || !ROOT_REVISION_PATTERN.test(sourceIdentity.rootRevision)
    || sourceIdentity?.rootRevisionVerified !== true
    || !["local_git_worktree", "program_alpha_source_attestation"].includes(
      String(sourceIdentity?.verificationMethod ?? ""),
    )
    || typeof sourceIdentity?.sourceTreeDigest !== "string"
    || !/^sha256:[a-f0-9]{64}$/.test(sourceIdentity.sourceTreeDigest)
    || sourceIdentity?.sourceTreeClean !== true
    || sourceIdentity?.environmentRevisionMatched !== true
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
  const exactInvocationPath = contract.actionId.startsWith("canonical.route.")
    ? `${contract.surface}:canonical-adapter:${contract.actionId}`
    : `${contract.surface}:${contract.method} ${contract.pathTemplate}`;
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

export function portalFailureEnvelope(
  route: RuntimeRoute,
  code?: string,
  message = `The Experience Gateway did not return a valid ${route} response.`,
  connectionState: ConnectionState = "Unavailable",
): GatewayEnvelope {
  return {
    ok: false,
    data: null,
    runtime: null,
    gateway: {
      status: "Degraded",
      connectionState,
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

function asGatewayEnvelope<T>(value: unknown): GatewayEnvelope<T> | null {
  const envelope = objectRecord(value);
  const gateway = objectRecord(envelope?.gateway);
  const truth = objectRecord(envelope?.truth);
  const cache = objectRecord(gateway?.cache);
  const runtime = envelope?.runtime === null
    ? null
    : objectRecord(envelope?.runtime);
  const error = envelope?.error === undefined
    ? null
    : objectRecord(envelope.error);
  const connectionState = gateway?.connectionState as ConnectionState;
  const expectedGatewayStatus = connectionState === "Healthy"
    ? "Healthy"
    : connectionState === "Connecting" || connectionState === "Retrying"
      ? connectionState
      : "Degraded";
  if (
    !envelope
    || typeof envelope.ok !== "boolean"
    || !("data" in envelope)
    || !gateway
    || !["Healthy", "Degraded", "Connecting", "Retrying"].includes(String(gateway.status))
    || !CONNECTION_STATES.has(connectionState)
    || gateway.status !== expectedGatewayStatus
    || typeof gateway.route !== "string"
    || typeof gateway.runtimeUrl !== "string"
    || !nullableString(gateway.lastSuccessfulConnection)
    || !nullableString(gateway.lastSuccessfulRefresh)
    || !cache
    || !nullableString(cache.lastRefresh)
    || !nullableNonNegativeNumber(cache.age)
    || typeof cache.stale !== "boolean"
    || !nullableString(cache.expires)
    || typeof cache.cached !== "boolean"
    || gateway.readOnly !== true
    || gateway.secretValuesExposed !== false
    || !truth
    || truth.productionReady !== false
    || truth.enterpriseReady !== false
    || truth.cloudPrimary !== false
    || truth.localSourceOfTruth !== true
    || truth.defaultProvider !== "mock_model"
    || truth.conclave !== "unavailable"
    || truth.actualTrainedSLMs !== 0
    || truth.secretValuesExposed !== false
    || (envelope.ok === true
      ? (
        envelope.data === null
        || !runtime
        || !["Healthy", "Degraded"].includes(connectionState)
        || typeof runtime.status !== "string"
        || typeof runtime.timestamp !== "string"
        || runtime.schemaVersion !== SUPPORTED_SCHEMA_VERSION
        || !compatibleRuntimeVersion(runtime.runtimeVersion)
        || !stringArray(runtime.proofIds)
        || !stringArray(runtime.limitations)
        || envelope.error !== undefined
      )
      : (
        envelope.data !== null
        || envelope.runtime !== null
        || ![
          "Unauthorized",
          "Schema Mismatch",
          "Version Mismatch",
          "Timed Out",
          "Unavailable",
          "Unknown",
        ].includes(connectionState)
        || !error
        || typeof error.code !== "string"
        || typeof error.message !== "string"
      ))
  ) {
    return null;
  }
  return envelope as GatewayEnvelope<T>;
}

function envelopeFailure(envelope: GatewayEnvelope) {
  return Object.assign(
    new Error(envelope.error?.message ?? "The Gateway request failed safely."),
    { envelope },
  );
}

async function get<T>(
  route: RuntimeRoute,
  forceRefresh = false,
  parentSignal?: AbortSignal,
): Promise<GatewayEnvelope<T>> {
  try {
    return await runBoundedTask(async (signal) => {
      const response = await fetch(`/api/runtime/${route}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(forceRefresh ? { "Cache-Control": "no-cache" } : {})
        },
        credentials: "same-origin",
        signal,
      });
      let body: GatewayEnvelope<T>;
      try {
        const parsed = await response.json() as unknown;
        const validated = asGatewayEnvelope<T>(parsed);
        if (!validated) throw new Error("invalid Gateway envelope");
        body = validated;
      } catch {
        throw envelopeFailure(portalFailureEnvelope(
          route,
          "gateway_response_invalid",
          `The Experience Gateway returned an invalid ${route} response.`,
          "Unknown",
        ));
      }
      if (
        body.gateway.route !== `/api/runtime/${route}`
        || response.ok !== body.ok
      ) {
        throw envelopeFailure(portalFailureEnvelope(
          route,
          "gateway_response_invalid",
          `The Experience Gateway returned a mismatched ${route} response envelope.`,
          "Unknown",
        ));
      }
      if (!body.ok) {
        throw envelopeFailure(body);
      }
      if (route === "capability-registry" && !asCapabilityRegistryProjection(body.data)) {
        throw envelopeFailure(portalFailureEnvelope(
          route,
          "capability_registry_response_invalid",
          "The Runtime-owned Capability Registry projection was invalid or incompatible.",
          "Unknown",
        ));
      }
      return body;
    }, {
      timeoutMs: CLIENT_REQUEST_TIMEOUT_MS,
      ...(parentSignal ? { parentSignal } : {}),
    });
  } catch (error) {
    const known = error as {
      code?: string;
      envelope?: GatewayEnvelope;
    };
    if (known.envelope) throw error;
    const timedOut = known.code === "task_timed_out";
    const snapshotAborted = known.code === "task_parent_aborted";
    const envelope = portalFailureEnvelope(
      route,
      timedOut
        ? "gateway_request_timed_out"
        : snapshotAborted
          ? "gateway_snapshot_timed_out"
          : "gateway_unreachable",
      timedOut
        ? `The ${route} request exceeded the bounded client response window.`
        : snapshotAborted
          ? `The ${route} request was cancelled when the bounded startup snapshot expired.`
          : `The Experience Gateway could not complete the ${route} request.`,
      timedOut || snapshotAborted ? "Timed Out" : "Unavailable",
    );
    throw envelopeFailure(envelope);
  }
}

async function collectSnapshot(
  forceRefresh: boolean,
  signal: AbortSignal,
): Promise<{ data: RuntimeSnapshot; failures: GatewayEnvelope[] }> {
  const results = await registryFirstSettledMap(RUNTIME_ROUTES, {
    registryItem: "capability-registry" as RuntimeRoute,
    concurrency: SNAPSHOT_CONCURRENCY,
    task: (route) => get(route, forceRefresh, signal),
  });
  const data: RuntimeSnapshot = {};
  const failures: GatewayEnvelope[] = [];
  results.forEach((result, index) => {
    const route = RUNTIME_ROUTES[index];
    if (result.status === "fulfilled") data[route] = result.value;
    else {
      const envelope = (result.reason as { envelope?: GatewayEnvelope }).envelope ?? portalFailureEnvelope(route);
      data[route] = envelope;
      failures.push(envelope);
    }
  });
  return { data, failures };
}

async function loadSnapshot(
  forceRefresh = false,
): Promise<{ data: RuntimeSnapshot; failures: GatewayEnvelope[] }> {
  try {
    return await runBoundedTask(
      (signal) => collectSnapshot(forceRefresh, signal),
      { timeoutMs: CLIENT_SNAPSHOT_TIMEOUT_MS },
    );
  } catch (error) {
    const timedOut = (error as { code?: string }).code === "task_timed_out";
    const data: RuntimeSnapshot = {};
    const failures = RUNTIME_ROUTES.map((route) => portalFailureEnvelope(
      route,
      timedOut ? "gateway_snapshot_timed_out" : "gateway_snapshot_failed",
      timedOut
        ? "The bounded startup snapshot expired and failed closed. Retry to request a fresh Runtime snapshot."
        : "The browser snapshot coordinator failed closed before it could establish current Runtime state.",
      timedOut ? "Timed Out" : "Unknown",
    ));
    RUNTIME_ROUTES.forEach((route, index) => {
      data[route] = failures[index];
    });
    return { data, failures };
  }
}

const snapshot = createSerializedRefresh(loadSnapshot);

export const portalClient = Object.freeze({ get, snapshot });
