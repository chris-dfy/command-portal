import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { afterEach, test } from "node:test";
import {
  CAPABILITY_REGISTRY_CONTRACT_RECORD_TYPE,
  CAPABILITY_REGISTRY_RECORD_TYPE,
  CAPABILITY_REGISTRY_SCHEMA_DIGEST,
  CAPABILITY_REGISTRY_SCHEMA_VERSION,
  CAPABILITY_REGISTRY_VALIDATOR_VERSION,
  CANONICAL_OPERATIONAL_ROUTES,
  createPortalServer,
  FIXED_RUNTIME_ACTION_ALIASES,
  loadConfig,
  LOCAL_CAPABILITY_ROUTES,
  publicTrustBootstrap,
  REPLAY_ROUTES,
  resolveCanonicalCapabilityActionAlias,
  resolveGatewayRuntimeActionAlias,
  ROOT_RUNTIME_ACTION_TEMPLATES,
  RUNTIME_MUTATION_ROUTES,
  RUNTIME_ROUTES,
} from "../server/portal-server.mjs";

const servers = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))));

const GITHUB_READ_ONLY_AUTHORIZATION = (
  "Fine-grained GitHub token scoped only to chris-dfy/nexus-assistant: "
  + "Metadata read (implicit), Contents read, Actions read."
);
const GITHUB_READ_ONLY_LIMITATIONS = Object.freeze([
  "Read-only repository metadata, exact deployed-commit, and Actions workflow-run inspection only.",
  "The token is restricted to chris-dfy/nexus-assistant with Metadata read (implicit), Contents read, and Actions read only.",
  "Connector health never grants execution Authority.",
]);
const GITHUB_TOKEN_NEXT_ACTION = (
  "Confirm GITHUB_TOKEN is configured in the Runtime secret boundary for "
  + "chris-dfy/nexus-assistant with Metadata read (implicit), Contents read, and Actions read only."
);
const GITHUB_READ_ONLY_OPERATIONS = Object.freeze([
  Object.freeze({
    actionId: "github.repository.read",
    handlerId: "connectors.github.verify_repository",
    fixedTarget: "https://api.github.com/repos/chris-dfy/nexus-assistant",
    inputSchemaId: "contracts/capabilities/capability-registry-projection.schema.json#/$defs/githubRepositoryReadInput",
  }),
  Object.freeze({
    actionId: "github.commit.read",
    handlerId: "connectors.github.verify_commit",
    fixedTarget: "https://api.github.com/repos/chris-dfy/nexus-assistant/commits/{deployedCommitSha}",
    inputSchemaId: "contracts/capabilities/capability-registry-projection.schema.json#/$defs/githubCommitReadInput",
  }),
  Object.freeze({
    actionId: "github.actions.runs.read",
    handlerId: "connectors.github.verify_actions_runs",
    fixedTarget: "https://api.github.com/repos/chris-dfy/nexus-assistant/actions/runs?head_sha={deployedCommitSha}&per_page=100",
    inputSchemaId: "contracts/capabilities/capability-registry-projection.schema.json#/$defs/githubActionsRunsReadInput",
  }),
]);

function runtimeEnvelope(data = { observed: true }, overrides = {}) {
  return {
    status: "ok",
    timestamp: "2026-07-15T00:00:00Z",
    schemaVersion: "1.0.0",
    runtimeVersion: "0.1.0",
    proofIds: ["runtime-proof-1"],
    limitations: ["read only"],
    data,
    ...overrides
  };
}

function runtimeResponse(data, options = {}) {
  return new Response(JSON.stringify(runtimeEnvelope(data, options.body)), {
    status: options.status ?? 200,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) }
  });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function capabilityProjectionDigest(projection) {
  const digestBasis = Object.fromEntries(
    Object.entries(projection).filter(([key]) => key !== "projectionDigest"),
  );
  return `sha256:${createHash("sha256").update(canonicalJson(digestBasis), "utf8").digest("hex")}`;
}

function resignCapabilityProjection(projection) {
  delete projection.projectionDigest;
  projection.projectionDigest = capabilityProjectionDigest(projection);
  return projection;
}

function capabilityRegistryProjection(overrides = {}) {
  const generatedAt = overrides.generatedAt ?? new Date().toISOString();
  const projection = {
    recordType: CAPABILITY_REGISTRY_RECORD_TYPE,
    schemaVersion: CAPABILITY_REGISTRY_SCHEMA_VERSION,
    capabilityRegistryContract: {
      recordType: CAPABILITY_REGISTRY_CONTRACT_RECORD_TYPE,
      schemaVersion: CAPABILITY_REGISTRY_SCHEMA_VERSION,
      schemaDigest: CAPABILITY_REGISTRY_SCHEMA_DIGEST,
      validatorVersion: CAPABILITY_REGISTRY_VALIDATOR_VERSION,
    },
    sourceIdentity: {
      rootRevision: "a".repeat(40),
      runtimeRevision: "b".repeat(40),
      rootRevisionVerified: true,
      runtimeRevisionVerified: true,
      verificationMethod: "program_alpha_source_attestation",
      sourceTreeDigest: `sha256:${"c".repeat(64)}`,
      sourceTreeClean: true,
      environmentRevisionMatched: true,
    },
    owner: "context_runtime",
    projectionOwner: "runtime.state.RuntimeState.capability_registry_projection",
    generatedAt,
    constitutionalBasis: {
      registryId: "NCR",
      releaseId: "NCR-1.0.0",
      releaseDigest: "sha256:212678643019c07c38d11c6abf4b4810fb87b5b8cf543b6ccdc958dcb9bdaffa",
      resolverVersion: "1.0.0",
      resolutionDigest: "sha256:376331b2fdde7bbe38e6bad7d09d265666353166e78f71c7c2928e59793ec996",
      principleEntryIds: Array.from(
        { length: 48 },
        (_, index) => `NCR-TEST-${String(index + 1).padStart(4, "0")}@1`,
      ),
    },
    verificationPolicy: {
      policyId: "nexus.connector-verification-freshness@1.0.0",
      maxAgeSeconds: 300,
      evaluatedAt: generatedAt,
      staleVerificationEstablishesAvailability: false,
      networkFailureRewritesConfiguration: false,
    },
    scope: {
      tenantId: "nexicron",
      workspaceId: "primary",
      derivedByRuntime: true,
    },
    classificationVocabulary: [
      "live_verified",
      "live_degraded",
      "configured_unverified",
      "staged",
      "simulated",
      "unavailable",
    ],
    inventory: { canonicalSource: "test-runtime-projection" },
    authority: {
      authorityGranted: false,
      executionAuthorityIntroduced: false,
      healthyCapabilityImpliesAuthority: false,
    },
    authorityGranted: false,
    capabilityHealthGrantsAuthority: false,
    availabilityIndependent: true,
    noExecutionAuthorityIntroduced: true,
    mission3Admitted: false,
    summary: {
      capabilityCount: 1,
      connectorCount: 1,
      actionCount: GITHUB_READ_ONLY_OPERATIONS.length,
      verificationReceiptCount: 0,
      actionClassifications: { unavailable: GITHUB_READ_ONLY_OPERATIONS.length },
    },
    capabilityCount: 1,
    connectorCount: 1,
    actionCount: GITHUB_READ_ONLY_OPERATIONS.length,
    receiptCount: 0,
    capabilities: [{
      capabilityId: "observe.github_repository_ci",
      classification: "unavailable",
      operationalAvailability: false,
      authorityGranted: false,
      availabilityIndependent: true,
      evidenceRefs: [],
      receiptRefs: [],
      limitations: [...GITHUB_READ_ONLY_LIMITATIONS, "GitHub configuration is absent."],
      requiredNextAction: GITHUB_TOKEN_NEXT_ACTION,
    }],
    connectors: [{
      connectorId: "github",
      classification: "unavailable",
      registration: "registered",
      configuration: "unconfigured",
      reachability: "unknown",
      verification: "unverified",
      health: "unknown",
      operationalAvailability: "unavailable",
      authorizationRequirement: GITHUB_READ_ONLY_AUTHORIZATION,
      authorityGranted: false,
      lastSuccessfulVerification: null,
      verificationFresh: false,
      freshness: { policySeconds: 300, ageSeconds: null, state: "never" },
      evidenceReferences: [],
      receiptReferences: [],
      limitations: [...GITHUB_READ_ONLY_LIMITATIONS, "GitHub configuration is absent."],
      requiredNextAction: GITHUB_TOKEN_NEXT_ACTION,
    }],
    actions: GITHUB_READ_ONLY_OPERATIONS.map((operation) => ({
      actionId: operation.actionId,
      capabilityId: "observe.github_repository_ci",
      connectorId: "github",
      handlerId: operation.handlerId,
      operationId: operation.actionId,
      inputSchemaId: operation.inputSchemaId,
      method: "GET",
      fixedTarget: operation.fixedTarget,
      invocationSurfaces: ["api", "assistant", "ui", "voice", "model_tool"],
      invocationPaths: ["api", "assistant", "ui", "voice", "model_tool"],
      classification: "unavailable",
      operationalAvailability: false,
      invocable: false,
      authorizationRequirement: GITHUB_READ_ONLY_AUTHORIZATION,
      authorityGranted: false,
      receiptRefs: [],
      limitations: [...GITHUB_READ_ONLY_LIMITATIONS, "GitHub configuration is absent."],
      requiredNextAction: GITHUB_TOKEN_NEXT_ACTION,
    })),
    verificationReceipts: [],
    executiveContinuity: {
      impediments: [{
        impedimentId: "github-configuration",
        classification: "operator_action_required",
        limitation: "GitHub is not configured.",
        requiredNextAction: GITHUB_TOKEN_NEXT_ACTION,
        remediationAction: {
          actionId: "provision.github.read_only",
          classification: "staged",
          invocable: false,
          authorityGranted: false,
          dispatchAvailable: false,
        },
      }],
      impedimentClassificationVocabulary: [
        "hard_blocking",
        "safely_remediable",
        "non_blocking_degraded",
        "operator_action_required",
      ],
      impedimentCount: 1,
      remediationActionCount: 1,
      remediationActions: [{
        remediationActionId: "remediation.connector.github.verify",
        classification: "unavailable",
        operationalAvailability: false,
        invocable: false,
        dispatchAvailable: false,
        authorityGranted: false,
      }],
      duplicateIdentitiesRejected: true,
      dispatchAvailable: false,
      authorityGranted: false,
    },
    limitations: ["No configured GitHub credential was observed."],
    secretValuesExposed: false,
    ...overrides,
  };
  if (!Object.hasOwn(overrides, "verificationPolicy")) {
    projection.verificationPolicy = {
      ...projection.verificationPolicy,
      evaluatedAt: projection.generatedAt,
    };
  }
  return resignCapabilityProjection(projection);
}

function liveCapabilityRegistryProjection() {
  const projection = capabilityRegistryProjection();
  const observedAt = projection.verificationPolicy.evaluatedAt;
  const receiptId = "CONN-VERIFY-TEST-GITHUB";
  projection.capabilities[0] = {
    ...projection.capabilities[0],
    classification: "live_verified",
    operationalAvailability: true,
    evidenceRefs: [`runtime-evidence:${receiptId}`],
    receiptRefs: [`connector-receipt:${receiptId}`],
    limitations: [...GITHUB_READ_ONLY_LIMITATIONS],
    requiredNextAction: "No connector remediation is required.",
  };
  projection.connectors[0] = {
    ...projection.connectors[0],
    classification: "live_verified",
    configuration: "configured",
    reachability: "reachable",
    verification: "verified",
    health: "healthy",
    operationalAvailability: "available",
    lastSuccessfulVerification: observedAt,
    verificationFresh: true,
    freshness: { policySeconds: 300, ageSeconds: 0, state: "current" },
    evidenceReferences: [`runtime-evidence:${receiptId}`],
    receiptReferences: [`connector-receipt:${receiptId}`],
    limitations: [...GITHUB_READ_ONLY_LIMITATIONS],
    requiredNextAction: "No connector remediation is required.",
  };
  projection.actions = projection.actions.map((action) => ({
    ...action,
    classification: "live_verified",
    operationalAvailability: true,
    receiptRefs: [`connector-receipt:${receiptId}`],
    limitations: [...GITHUB_READ_ONLY_LIMITATIONS],
    requiredNextAction: "No connector remediation is required.",
  }));
  projection.verificationReceipts = [{
    receiptId,
    receiptType: "connector_read_only_verification",
    connectorId: "github",
    verifiedAt: observedAt,
    successful: true,
    evidenceRefs: [`runtime-evidence:${receiptId}`],
    sanitized: true,
    secretValuesExposed: false,
  }];
  projection.executiveContinuity = {
    ...projection.executiveContinuity,
    impedimentCount: 0,
    remediationActionCount: 0,
    impediments: [],
    remediationActions: [],
  };
  projection.receiptCount = 1;
  projection.summary = {
    capabilityCount: 1,
    connectorCount: 1,
    actionCount: GITHUB_READ_ONLY_OPERATIONS.length,
    verificationReceiptCount: 1,
    actionClassifications: { live_verified: GITHUB_READ_ONLY_OPERATIONS.length },
  };
  return resignCapabilityProjection(projection);
}

const CONTEXT_ACTION_CLASSIFICATIONS = Object.freeze({
  "context.runtime.route.post.runtime.interactions": "live_verified",
  "context.runtime.route.get.runtime.interactions.events": "live_verified",
  "context.runtime.route.post.runtime.interactions.interrupt": "staged",
  "context.runtime.route.post.runtime.interactions.resume": "staged",
  "context.runtime.route.post.runtime.interactions.presentation_complete": "staged",
  "context.runtime.route.post.runtime.executive_operating_loop.briefing": "staged",
  "context.runtime.route.post.runtime.conclave.reviews": "unavailable",
  "context.runtime.route.post.runtime.voice.realtime.call": "unavailable",
});

const EXPLICIT_CONTEXT_ADMISSION_ACTIONS = Object.freeze([
  ["context.runtime.route.post.runtime.interactions", "POST", "/runtime/interactions", ["api", "assistant", "ui", "voice"], "live_verified"],
  ["context.runtime.route.get.runtime.interactions.events", "GET", "/runtime/interactions/{interaction_id}/events", ["api", "assistant", "ui", "voice"], "live_verified"],
  ["context.runtime.route.post.runtime.interactions.interrupt", "POST", "/runtime/interactions/{interaction_id}/interrupt", ["api", "assistant", "ui", "voice"], "staged"],
  ["context.runtime.route.post.runtime.interactions.resume", "POST", "/runtime/interactions/{interaction_id}/resume", ["api", "assistant", "ui", "voice"], "staged"],
  ["context.runtime.route.post.runtime.interactions.presentation_complete", "POST", "/runtime/interactions/{interaction_id}/presentation-complete", ["api", "ui"], "staged"],
  ["context.runtime.route.post.runtime.executive_operating_loop.briefing", "POST", "/runtime/executive-operating-loop/briefing", ["api", "assistant", "ui", "voice"], "staged"],
  ["context.runtime.route.post.runtime.conclave.reviews", "POST", "/runtime/conclave/reviews", ["api", "assistant", "ui"], "unavailable"],
  ["context.runtime.route.post.runtime.voice.realtime.call", "POST", "/runtime/voice/realtime/call", ["api", "voice"], "unavailable"],
]);

const ADMISSION_ACTIONS = Object.freeze([
  ...new Map([
    ...Object.values(FIXED_RUNTIME_ACTION_ALIASES).flatMap((methods) => (
      Object.values(methods).map((alias) => [
        alias.actionId,
        [
          alias.actionId,
          alias.runtimeMethod,
          alias.runtimePathTemplate,
          alias.requiredSurfaces,
          alias.forwarding === "canonical"
            ? (CONTEXT_ACTION_CLASSIFICATIONS[alias.actionId] ?? "live_verified")
            : "unavailable",
        ],
      ])
    )),
    ...EXPLICIT_CONTEXT_ADMISSION_ACTIONS.map((action) => [action[0], action]),
    ...ROOT_RUNTIME_ACTION_TEMPLATES.map(([method, pathTemplate]) => {
      const alias = resolveCanonicalCapabilityActionAlias({
        method,
        runtimePath: pathTemplate.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "test-id"),
      });
      return [
        alias.actionId,
        [alias.actionId, method, pathTemplate, ["api"], "live_verified"],
      ];
    }),
  ]).values(),
]);

function actionAdmissionProjection({
  tenantId = "nexicron",
  workspaceId = "primary",
  classifications = {},
  omitActionId = null,
} = {}) {
  const projection = liveCapabilityRegistryProjection();
  const receiptRef = projection.connectors[0].receiptReferences[0];
  projection.scope = { tenantId, workspaceId, derivedByRuntime: true };
  projection.actions = ADMISSION_ACTIONS
    .filter(([actionId]) => actionId !== omitActionId)
    .map(([actionId, method, pathTemplate, invocationSurfaces, defaultClassification], index) => {
      const classification = classifications[actionId] ?? defaultClassification;
      const operational = classification === "live_verified" || classification === "live_degraded";
      return {
        actionId,
        capabilityId: "observe.github_repository_ci",
        connectorId: "github",
        handlerId: `context_runtime.gateway_action_${index + 1}`,
        operationId: `context.runtime.gateway_action_${index + 1}`,
        inputSchemaId: `contracts.capabilities.gatewayAction${index + 1}Input`,
        method,
        pathTemplate,
        invocationSurfaces,
        invocationPaths: invocationSurfaces.map((surface) => (
          surface === "api" || !actionId.startsWith("canonical.route.")
            ? `${surface}:${method} ${pathTemplate}`
            : `${surface}:canonical-adapter:${actionId}`
        )),
        classification,
        operationalAvailability: operational,
        invocable: operational,
        authorizationRequirement: "Mission 1 authenticated Runtime boundary; no execution Authority is granted.",
        authorityGranted: false,
        receiptRefs: classification === "live_verified" ? [receiptRef] : [],
        limitations: operational
          ? ["The typed action is bounded by the signed Runtime interaction contract."]
          : [`The typed action is ${classification} and cannot be invoked.`],
        requiredNextAction: operational
          ? "No Gateway remediation is required."
          : "Complete Runtime registration and current verification before invocation.",
      };
    });
  projection.actionCount = projection.actions.length;
  projection.summary = {
    ...projection.summary,
    actionCount: projection.actions.length,
    actionClassifications: projection.actions.reduce((counts, action) => ({
      ...counts,
      [action.classification]: (counts[action.classification] ?? 0) + 1,
    }), {}),
  };
  return resignCapabilityProjection(projection);
}

function withActionRegistry(runtimeFetch, projection = actionAdmissionProjection()) {
  const wrapped = async (url, options) => (
    url.endsWith("/runtime/capability-registry")
      ? runtimeResponse(projection)
      : runtimeFetch(url, options)
  );
  wrapped.suppliesCapabilityRegistry = true;
  return wrapped;
}

async function primeActionAdmission(base) {
  const response = await fetch(`${base}/api/runtime/capability-registry`, {
    headers: { "Cache-Control": "no-cache" },
  });
  assert.equal(response.status, 200);
}

async function start(runtimeFetch, config = {}, localFetch = runtimeFetch, operationalFetch = localFetch, replayFetch = operationalFetch, clock) {
  const {
    testUseProvidedCapabilityRegistry = false,
    ...gatewayConfig
  } = config;
  const admittedRuntimeFetch = (
    testUseProvidedCapabilityRegistry
    || runtimeFetch.suppliesCapabilityRegistry === true
  )
    ? runtimeFetch
    : withActionRegistry(runtimeFetch, actionAdmissionProjection({
      tenantId: gatewayConfig.operationalTenantId ?? "nexicron",
      workspaceId: gatewayConfig.operationalWorkspaceId ?? "primary",
    }));
  const server = createPortalServer({
    config: {
      port: 0,
      runtimeBaseUrl: "https://runtime.invalid",
      runtimeToken: "server-only-test-token",
      timeoutMs: 30,
      cacheTtlMs: 500,
      maxAttempts: 3,
      retryDelayMs: 0,
      ...gatewayConfig
    },
    runtimeFetch: admittedRuntimeFetch,
    localFetch,
    operationalFetch,
    replayFetch,
    clock,
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

const localResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" }
});

test("every Experience Gateway route maps to exactly one literal runtime endpoint", async () => {
  const observed = [];
  const runtimeFetch = async (url, options) => {
    observed.push({ url, options });
    if (url.endsWith("/runtime/capability-registry")) {
      return runtimeResponse(actionAdmissionProjection());
    }
    return runtimeResponse({ route: url });
  };
  const base = await start(runtimeFetch, {
    testUseProvidedCapabilityRegistry: true,
  });
  await primeActionAdmission(base);
  observed.length = 0;
  for (const [gatewayPath, runtimePath] of Object.entries(RUNTIME_ROUTES)) {
    const callsBefore = observed.length;
    const response = await fetch(`${base}${gatewayPath}`, { headers: { "Cache-Control": "no-cache" } });
    if (gatewayPath === "/api/runtime/replay") {
      assert.equal(response.status, 503, gatewayPath);
      assert.equal((await response.json()).error.code, "canonical_action_unavailable");
      assert.equal(observed.length, callsBefore);
      continue;
    }
    assert.equal(response.status, 200, gatewayPath);
    const call = observed.at(-1);
    assert.equal(call.url, `https://runtime.invalid${runtimePath}`);
    assert.equal(call.options.method, "GET");
  }
  assert.equal(observed.length, Object.keys(RUNTIME_ROUTES).length - 1);
});

test("every fixed Runtime and local interaction alias resolves to one exact canonical action", () => {
  for (const [path, methods] of Object.entries(FIXED_RUNTIME_ACTION_ALIASES)) {
    for (const [method, expected] of Object.entries(methods)) {
      assert.deepEqual(resolveGatewayRuntimeActionAlias(method, path), expected, `${method} ${path}`);
    }
  }
  assert.equal(resolveGatewayRuntimeActionAlias("POST", "/api/runtime/not-registered"), null);
  assert.equal(resolveGatewayRuntimeActionAlias("GET", "/api/runtime/interactions/ambiguous/events"), null);
  assert.equal(
    resolveGatewayRuntimeActionAlias("GET", "/api/runtime/interactions/INT-1/events").actionId,
    "context.runtime.route.get.runtime.interactions.events",
  );
  assert.equal(
    resolveGatewayRuntimeActionAlias("POST", "/api/local/interactions/INT-1/interrupt").forwarding,
    "unavailable_adapter",
  );
});

test("Capability Registry uses one exact static read-only Runtime mapping", async () => {
  const observed = [];
  const projection = capabilityRegistryProjection();
  const base = await start(async (url, options) => {
    observed.push({ url, options });
    return runtimeResponse(projection);
  }, { testUseProvidedCapabilityRegistry: true });
  const response = await fetch(`${base}/api/runtime/capability-registry`, { headers: { "Cache-Control": "no-cache" } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(observed[0].url, "https://runtime.invalid/runtime/capability-registry");
  assert.equal(observed[0].options.method, "GET");
  assert.equal(body.data.recordType, CAPABILITY_REGISTRY_RECORD_TYPE);
  assert.equal(body.data.authority.authorityGranted, false);
  assert.equal(body.data.actions[0].invocable, false);
});

test("Capability Registry accepts a direct canonical projection only by exact record type", async () => {
  const projection = capabilityRegistryProjection();
  const base = await start(async () => new Response(JSON.stringify(projection), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }), { testUseProvidedCapabilityRegistry: true });
  const response = await fetch(`${base}/api/runtime/capability-registry`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.schemaVersion, CAPABILITY_REGISTRY_SCHEMA_VERSION);
  assert.equal(body.runtime.timestamp, projection.generatedAt);
});

test("Capability Registry accepts a live state only with a current sanitized successful receipt", async () => {
  const projection = liveCapabilityRegistryProjection();
  const base = await start(
    async () => runtimeResponse(projection),
    { testUseProvidedCapabilityRegistry: true },
  );
  const response = await fetch(`${base}/api/runtime/capability-registry`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.connectors[0].classification, "live_verified");
  assert.equal(body.data.connectors[0].verificationFresh, true);
  assert.equal(body.data.verificationReceipts[0].sanitized, true);
  assert.equal(body.data.verificationReceipts[0].successful, true);
  assert.equal(body.data.authority.authorityGranted, false);
  assert.equal(body.data.executiveContinuity.dispatchAvailable, false);
});

test("Capability Registry preserves the bounded GitHub metadata, commit, and Actions read contract", async () => {
  const projection = liveCapabilityRegistryProjection();
  const base = await start(
    async () => runtimeResponse(projection),
    { testUseProvidedCapabilityRegistry: true },
  );
  const response = await fetch(`${base}/api/runtime/capability-registry`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.connectors[0].authorizationRequirement, GITHUB_READ_ONLY_AUTHORIZATION);
  assert.deepEqual(
    body.data.actions.map(({ actionId, handlerId, fixedTarget, inputSchemaId }) => ({
      actionId,
      handlerId,
      fixedTarget,
      inputSchemaId,
    })),
    GITHUB_READ_ONLY_OPERATIONS,
  );
  for (const action of body.data.actions) {
    assert.equal(action.method, "GET");
    assert.equal(action.invocable, false);
    assert.equal(action.authorityGranted, false);
  }
  const serialized = JSON.stringify(body.data);
  assert.doesNotMatch(serialized, /check[-_. /]?runs|github\.ci\.read|githubCiReadInput/i);
  assert.doesNotMatch(serialized, /\bwrite[-_. ]?(?:permission|access|operation)\b/i);
  assert.equal(body.data.secretValuesExposed, false);
});

test("Capability Registry fails closed on invalid identity, Authority, or invocability claims", async () => {
  const validSourceIdentity = capabilityRegistryProjection().sourceIdentity;
  for (const projection of [
    capabilityRegistryProjection({ recordType: "presentation_only_registry" }),
    capabilityRegistryProjection({ authority: { authorityGranted: true } }),
    capabilityRegistryProjection({
      sourceIdentity: {
        ...validSourceIdentity,
        runtimeRevision: "short",
      },
    }),
    capabilityRegistryProjection({
      sourceIdentity: {
        ...validSourceIdentity,
        runtimeRevisionVerified: false,
      },
    }),
    capabilityRegistryProjection({
      sourceIdentity: {
        ...validSourceIdentity,
        runtimeRevision: undefined,
      },
    }),
    capabilityRegistryProjection({
      actions: [{
        ...capabilityRegistryProjection().actions[0],
        invocable: true,
      }],
    }),
    capabilityRegistryProjection({
      capabilities: [
        capabilityRegistryProjection().capabilities[0],
        capabilityRegistryProjection().capabilities[0],
      ],
    }),
    capabilityRegistryProjection({
      executiveContinuity: {
        impediments: [{
          ...capabilityRegistryProjection().executiveContinuity.impediments[0],
          remediationAction: {
            classification: "live_verified",
            invocable: true,
          },
        }],
      },
    }),
  ]) {
    const base = await start(async () => runtimeResponse(projection), {
      maxAttempts: 1,
      testUseProvidedCapabilityRegistry: true,
    });
    const response = await fetch(`${base}/api/runtime/capability-registry`);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.data, null);
    assert.match(body.error.code, /capability_registry_response_invalid|runtime_response_invalid/);
  }
});

test("Capability Registry rejects tampering, invalid pins, impossible freshness, unsafe receipts, and dispatch claims", async () => {
  const tamperedDigest = liveCapabilityRegistryProjection();
  tamperedDigest.connectors[0].health = "unhealthy";

  const invalidConstitutionalBasis = liveCapabilityRegistryProjection();
  invalidConstitutionalBasis.constitutionalBasis.releaseDigest = `sha256:${"0".repeat(64)}`;
  resignCapabilityProjection(invalidConstitutionalBasis);

  const invalidVocabulary = liveCapabilityRegistryProjection();
  invalidVocabulary.classificationVocabulary = [...invalidVocabulary.classificationVocabulary].reverse();
  resignCapabilityProjection(invalidVocabulary);

  const liveWithoutReceipt = liveCapabilityRegistryProjection();
  liveWithoutReceipt.verificationReceipts = [];
  liveWithoutReceipt.receiptCount = 0;
  liveWithoutReceipt.summary.verificationReceiptCount = 0;
  liveWithoutReceipt.capabilities[0].receiptRefs = [];
  liveWithoutReceipt.connectors[0].receiptReferences = [];
  liveWithoutReceipt.actions[0].receiptRefs = [];
  resignCapabilityProjection(liveWithoutReceipt);

  const impossibleFreshness = liveCapabilityRegistryProjection();
  impossibleFreshness.connectors[0].freshness.ageSeconds = 300;
  resignCapabilityProjection(impossibleFreshness);

  const unsanitizedReceipt = liveCapabilityRegistryProjection();
  unsanitizedReceipt.verificationReceipts[0].sanitized = false;
  resignCapabilityProjection(unsanitizedReceipt);

  const failedReceiptClaimedLive = liveCapabilityRegistryProjection();
  failedReceiptClaimedLive.verificationReceipts[0].successful = false;
  resignCapabilityProjection(failedReceiptClaimedLive);

  const staleCapabilityAndActionReceipt = liveCapabilityRegistryProjection();
  const staleReceiptId = "CONN-VERIFY-TEST-GITHUB-STALE";
  const staleVerifiedAt = new Date(
    Date.parse(staleCapabilityAndActionReceipt.verificationPolicy.evaluatedAt) - 301_000,
  ).toISOString();
  staleCapabilityAndActionReceipt.verificationReceipts.push({
    ...staleCapabilityAndActionReceipt.verificationReceipts[0],
    receiptId: staleReceiptId,
    verifiedAt: staleVerifiedAt,
  });
  staleCapabilityAndActionReceipt.capabilities[0].receiptRefs = [
    `connector-receipt:${staleReceiptId}`,
  ];
  staleCapabilityAndActionReceipt.actions[0].receiptRefs = [
    `connector-receipt:${staleReceiptId}`,
  ];
  staleCapabilityAndActionReceipt.receiptCount = 2;
  staleCapabilityAndActionReceipt.summary.verificationReceiptCount = 2;
  resignCapabilityProjection(staleCapabilityAndActionReceipt);

  const dispatchClaim = liveCapabilityRegistryProjection();
  dispatchClaim.executiveContinuity.dispatchAvailable = true;
  dispatchClaim.actions[0].dispatchAuthorized = true;
  resignCapabilityProjection(dispatchClaim);

  for (const projection of [
    tamperedDigest,
    invalidConstitutionalBasis,
    invalidVocabulary,
    liveWithoutReceipt,
    impossibleFreshness,
    unsanitizedReceipt,
    failedReceiptClaimedLive,
    staleCapabilityAndActionReceipt,
    dispatchClaim,
  ]) {
    const base = await start(async () => runtimeResponse(projection), {
      maxAttempts: 1,
      testUseProvidedCapabilityRegistry: true,
    });
    const response = await fetch(`${base}/api/runtime/capability-registry`);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.data, null);
    assert.equal(body.error.code, "capability_registry_response_invalid");
  }
});

test("Capability Registry has an exact route-specific four MiB response bound", async () => {
  const withinBound = capabilityRegistryProjection({
    inventory: {
      canonicalSource: "full-size-regression",
      measuredProjectionPadding: "x".repeat(2_350_000),
    },
  });
  const acceptedBase = await start(async () => runtimeResponse(withinBound), {
    maxAttempts: 1,
    maxResponseBytes: 1_048_576,
    testUseProvidedCapabilityRegistry: true,
  });
  const accepted = await fetch(`${acceptedBase}/api/runtime/capability-registry`);
  assert.equal(accepted.status, 200);

  const overBound = capabilityRegistryProjection({
    inventory: {
      canonicalSource: "over-limit-regression",
      measuredProjectionPadding: "x".repeat((4 * 1024 * 1024) + 1),
    },
  });
  const rejectedBase = await start(async () => runtimeResponse(overBound), {
    maxAttempts: 1,
    maxResponseBytes: 8 * 1024 * 1024,
    testUseProvidedCapabilityRegistry: true,
  });
  const rejected = await fetch(`${rejectedBase}/api/runtime/capability-registry`);
  const body = await rejected.json();
  assert.equal(rejected.status, 502);
  assert.equal(body.error.code, "runtime_response_too_large");
});

test("an unavailable GitHub connector remains visible without blocking other Runtime reads", async () => {
  const projection = actionAdmissionProjection();
  projection.connectors[0] = {
    ...projection.connectors[0],
    classification: "unavailable",
    configuration: "unconfigured",
    reachability: "unknown",
    verification: "unverified",
    health: "unknown",
    operationalAvailability: "unavailable",
    verificationFresh: false,
    freshness: {
      state: "never",
      ageSeconds: null,
      policySeconds: 300,
    },
    lastSuccessfulVerification: null,
    receiptReferences: [],
  };
  projection.executiveContinuity.impediments = [{
    impedimentId: "github.authorization.missing",
    classification: "operator_action_required",
    limitation: "GitHub authorization is absent.",
    requiredNextAction: GITHUB_TOKEN_NEXT_ACTION,
  }];
  projection.executiveContinuity.impedimentCount = 1;
  resignCapabilityProjection(projection);
  const base = await start(async (url) => (
    url.endsWith("/runtime/capability-registry")
      ? runtimeResponse(projection)
      : runtimeResponse({ environment: "test" })
  ), { testUseProvidedCapabilityRegistry: true });
  const registry = await (await fetch(`${base}/api/runtime/capability-registry`)).json();
  const status = await (await fetch(`${base}/api/runtime/status`)).json();
  assert.equal(registry.ok, true, JSON.stringify(registry.error));
  assert.equal(registry.data.connectors[0].operationalAvailability, "unavailable");
  assert.equal(registry.data.executiveContinuity.impediments[0].classification, "operator_action_required");
  assert.equal(status.ok, true);
});

test("Capability Registry removes forbidden credential-shaped keys structurally", async () => {
  const projection = capabilityRegistryProjection();
  projection.connectors[0].credentialRef = null;
  projection.connectors[0].accessToken = null;
  const base = await start(
    async () => runtimeResponse(projection),
    { testUseProvidedCapabilityRegistry: true },
  );
  const response = await fetch(`${base}/api/runtime/capability-registry`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(Object.hasOwn(body.data.connectors[0], "credentialRef"), false);
  assert.equal(Object.hasOwn(body.data.connectors[0], "accessToken"), false);
  assert.equal(body.data.secretValuesExposed, false);
});

test("Capability Registry bypasses Gateway cache so freshness is always Runtime-owned", async () => {
  let calls = 0;
  const base = await start(async () => {
    calls += 1;
    return runtimeResponse(capabilityRegistryProjection({
      generatedAt: new Date(Date.now() + calls).toISOString(),
    }));
  }, { testUseProvidedCapabilityRegistry: true });
  const first = await (await fetch(`${base}/api/runtime/capability-registry`)).json();
  const second = await (await fetch(`${base}/api/runtime/capability-registry`)).json();
  assert.equal(calls, 2);
  assert.notEqual(first.data.generatedAt, second.data.generatedAt);
  assert.equal(second.gateway.cache.cached, false);
});

test("arbitrary routes, queries, and every mutation method are rejected", async () => {
  let calls = 0;
  const base = await start(async () => { calls += 1; return runtimeResponse({}); });
  assert.equal((await fetch(`${base}/api/runtime/not-allowlisted`)).status, 404);
  assert.equal((await fetch(`${base}/api/runtime/status?target=/anything`)).status, 400);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await fetch(`${base}/api/runtime/status`, { method });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("allow"), "GET, OPTIONS");
  }
  assert.equal(calls, 0);
});

test("only live canonical HIF actions cross the signed Runtime boundary", async () => {
  const observed = [];
  const runtimeFetch = async (url, options) => {
    observed.push({ url, options });
    return runtimeResponse({ interaction: { interactionId: "INT-EOX-1" }, events: [{ type: "SpeechStarted", payload: { text: "Briefing" } }] });
  };
  const base = await start(withActionRegistry(runtimeFetch));
  await primeActionAdmission(base);
  assert.deepEqual(RUNTIME_MUTATION_ROUTES, {
    "/api/runtime/executive-briefing": "/runtime/executive-operating-loop/briefing",
    "/api/runtime/conclave/reviews": "/runtime/conclave/reviews",
    "/api/runtime/interactions": "/runtime/interactions"
  });
  const response = await fetch(`${base}/api/runtime/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", inputText: "Brief me", modality: "text" })
  });
  assert.equal(response.status, 200);
  assert.equal(observed[0].url, "https://runtime.invalid/runtime/interactions");
  assert.equal(observed[0].options.method, "POST");
  assert.equal(observed[0].options.headers.Authorization, "Bearer server-only-test-token");
  assert.equal(JSON.stringify(await response.json()).includes("server-only-test-token"), false);
  const events = await fetch(`${base}/api/runtime/interactions/INT-EOX-1/events`);
  assert.equal(events.status, 200);
  assert.equal(observed.at(-1).url, "https://runtime.invalid/runtime/interactions/INT-EOX-1/events");
  assert.equal(observed.at(-1).options.method, "GET");
  const callsBeforeUnavailable = observed.length;
  for (const [path, body] of [
    ["/api/runtime/executive-briefing", { clientId: "nexus-web", modality: "text", speechRequested: true }],
    ["/api/runtime/conclave/reviews", { clientId: "nexus-web", proposal: "Challenge this proposal" }],
    ["/api/runtime/interactions/INT-EOX-1/resume", {}],
    ["/api/runtime/interactions/INT-EOX-1/interrupt", { reason: "barge_in" }],
    ["/api/runtime/interactions/INT-EOX-1/presentation-complete", {}],
  ]) {
    const blocked = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(blocked.status, 503, path);
    assert.equal((await blocked.json()).error.code, "canonical_action_unavailable");
  }
  assert.equal(observed.length, callsBeforeUnavailable);
});

test("configured, staged, simulated, and unavailable actions fail closed without upstream calls", async () => {
  const actionId = "context.runtime.route.post.runtime.interactions";
  for (const classification of ["configured_unverified", "staged", "simulated", "unavailable"]) {
    let calls = 0;
    const projection = actionAdmissionProjection({ classifications: { [actionId]: classification } });
    const base = await start(withActionRegistry(async () => {
      calls += 1;
      return runtimeResponse({});
    }, projection));
    await primeActionAdmission(base);
    const response = await fetch(`${base}/api/runtime/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "nexus-web", inputText: "Do not forward", modality: "text" }),
    });
    assert.equal(response.status, 503, classification);
    assert.equal((await response.json()).error.code, "canonical_action_unavailable", classification);
    assert.equal(calls, 0, classification);
  }
});

test("unavailable read, local, and hosted aliases fail closed before every target upstream", async () => {
  const classifications = {
    "context.runtime.route.get.runtime.status": "unavailable",
    "canonical.route.get.health": "unavailable",
    "canonical.route.get.capabilities.readiness": "unavailable",
  };
  const projection = actionAdmissionProjection({ classifications });
  let runtimeCalls = 0;
  let localCalls = 0;
  let operationalCalls = 0;
  const runtimeFetch = withActionRegistry(async () => {
    runtimeCalls += 1;
    return runtimeResponse({});
  }, projection);
  const localBase = await start(
    runtimeFetch,
    { localCapabilitiesEnabled: true },
    async () => {
      localCalls += 1;
      return localResponse({});
    },
  );
  await primeActionAdmission(localBase);

  const runtimeRead = await fetch(`${localBase}/api/runtime/status`);
  assert.equal(runtimeRead.status, 503);
  assert.equal((await runtimeRead.json()).error.code, "canonical_action_unavailable");

  const localRead = await fetch(`${localBase}/api/local/status`);
  assert.equal(localRead.status, 503);
  assert.equal((await localRead.json()).error.code, "canonical_action_unavailable");

  const hostedConfig = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: randomBytes(32).toString("base64url"),
    operationalSessionSecret: randomBytes(32).toString("base64url"),
    operationalAccessKey: randomBytes(24).toString("base64url"),
    operationalUserId: "operator-1",
    operationalRole: "observer",
    operationalScopes: ["operations:read"],
    operationalCookieSecure: false,
  };
  const hostedBase = await start(
    runtimeFetch,
    hostedConfig,
    undefined,
    async () => {
      operationalCalls += 1;
      return localResponse({});
    },
  );
  await primeActionAdmission(hostedBase);

  const login = await fetch(`${hostedBase}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey: hostedConfig.operationalAccessKey }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const hostedRead = await fetch(`${hostedBase}/api/operations/capabilities/readiness`, {
    headers: { Cookie: cookie },
  });
  assert.equal(hostedRead.status, 503);
  assert.equal((await hostedRead.json()).error.code, "canonical_action_unavailable");
  assert.deepEqual(
    { runtimeCalls, localCalls, operationalCalls },
    { runtimeCalls: 0, localCalls: 0, operationalCalls: 0 },
  );
});

test("missing, stale, mismatched, or contract-invalid action truth fails closed", async () => {
  const body = JSON.stringify({ clientId: "nexus-web", inputText: "Do not forward", modality: "text" });

  let unprimedCalls = 0;
  const unprimedBase = await start(async () => {
    unprimedCalls += 1;
    return runtimeResponse({});
  }, { testUseProvidedCapabilityRegistry: true });
  const unprimed = await fetch(`${unprimedBase}/api/runtime/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  assert.equal(unprimed.status, 502);
  assert.equal((await unprimed.json()).error.code, "capability_registry_response_invalid");
  assert.equal(unprimedCalls, 1);

  let missingCalls = 0;
  const missingProjection = actionAdmissionProjection({
    omitActionId: "context.runtime.route.post.runtime.interactions",
  });
  const missingBase = await start(withActionRegistry(async () => {
    missingCalls += 1;
    return runtimeResponse({});
  }, missingProjection));
  await primeActionAdmission(missingBase);
  const missing = await fetch(`${missingBase}/api/runtime/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error.code, "canonical_action_identity_invalid");
  assert.equal(missingCalls, 0);

  let contractCalls = 0;
  const contractProjection = actionAdmissionProjection();
  contractProjection.actions.find((action) => (
    action.actionId === "context.runtime.route.post.runtime.interactions"
  )).invocationPaths = ["api:POST /runtime/interactions"];
  resignCapabilityProjection(contractProjection);
  const contractBase = await start(withActionRegistry(async () => {
    contractCalls += 1;
    return runtimeResponse({});
  }, contractProjection));
  await primeActionAdmission(contractBase);
  const invalidContract = await fetch(`${contractBase}/api/runtime/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  assert.equal(invalidContract.status, 503);
  assert.equal((await invalidContract.json()).error.code, "canonical_action_contract_mismatch");
  assert.equal(contractCalls, 0);

  let scopeCalls = 0;
  const scopeProjection = actionAdmissionProjection({ tenantId: "other-tenant" });
  const scopeBase = await start(withActionRegistry(async () => {
    scopeCalls += 1;
    return runtimeResponse({});
  }, scopeProjection));
  const scopeResponse = await fetch(`${scopeBase}/api/runtime/capability-registry`);
  assert.equal(scopeResponse.status, 502);
  assert.equal((await scopeResponse.json()).error.code, "capability_registry_scope_mismatch");
  const scopedAction = await fetch(`${scopeBase}/api/runtime/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  assert.equal(scopedAction.status, 502);
  assert.equal((await scopedAction.json()).error.code, "capability_registry_scope_mismatch");
  assert.equal(scopeCalls, 0);

  const currentProjection = actionAdmissionProjection();
  const staleClock = () => (
    Date.parse(currentProjection.verificationPolicy.evaluatedAt)
    + ((currentProjection.verificationPolicy.maxAgeSeconds + 1) * 1000)
  );
  const staleBase = await start(
    withActionRegistry(async () => runtimeResponse({}), currentProjection),
    {},
    undefined,
    undefined,
    undefined,
    staleClock,
  );
  const staleRegistry = await fetch(`${staleBase}/api/runtime/capability-registry`);
  assert.equal(staleRegistry.status, 503);
  assert.equal((await staleRegistry.json()).error.code, "capability_registry_verification_stale");
});

test("concurrent unprimed Runtime reads share one Capability Registry admission refresh", async () => {
  let registryCalls = 0;
  let runtimeCalls = 0;
  let releaseRegistry;
  const registryGate = new Promise((resolve) => {
    releaseRegistry = resolve;
  });
  const runtimeFetch = async (url) => {
    if (url.endsWith("/runtime/capability-registry")) {
      registryCalls += 1;
      await registryGate;
      return runtimeResponse(actionAdmissionProjection());
    }
    runtimeCalls += 1;
    return runtimeResponse({ route: url });
  };
  const base = await start(runtimeFetch, {
    testUseProvidedCapabilityRegistry: true,
  });
  const routes = ["status", "health", "version", "providers", "environment", "diagnostics"];
  const pending = Promise.all(routes.map((route) => fetch(`${base}/api/runtime/${route}`, {
    headers: { "Cache-Control": "no-cache" },
  })));

  for (let index = 0; index < 20 && registryCalls === 0; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(registryCalls, 1);
  assert.equal(runtimeCalls, 0);

  releaseRegistry();
  const responses = await pending;
  assert.deepEqual(responses.map((response) => response.status), routes.map(() => 200));
  assert.equal(registryCalls, 1);
  assert.equal(runtimeCalls, routes.length);
});

test("a failed concurrent admission refresh has a bounded cooldown instead of creating sequential herds", async () => {
  let registryCalls = 0;
  let runtimeCalls = 0;
  const runtimeFetch = async (url) => {
    if (url.endsWith("/runtime/capability-registry")) {
      registryCalls += 1;
      return runtimeResponse({});
    }
    runtimeCalls += 1;
    return runtimeResponse({ route: url });
  };
  const base = await start(runtimeFetch, {
    testUseProvidedCapabilityRegistry: true,
    retryDelayMs: 500,
  });
  const routes = ["status", "health", "version", "providers", "environment", "diagnostics"];
  const responses = await Promise.all(routes.map((route) => fetch(`${base}/api/runtime/${route}`)));

  assert.deepEqual(responses.map((response) => response.status), routes.map(() => 502));
  for (const response of responses) {
    assert.equal((await response.json()).error.code, "capability_registry_response_invalid");
  }
  assert.equal(registryCalls, 1);
  assert.equal(runtimeCalls, 0);

  const immediateRetry = await fetch(`${base}/api/runtime/status`);
  assert.equal(immediateRetry.status, 502);
  assert.equal((await immediateRetry.json()).error.code, "capability_registry_response_invalid");
  assert.equal(registryCalls, 1);
  assert.equal(runtimeCalls, 0);
});

test("a live-degraded typed action remains bounded and grants no Authority", async () => {
  const actionId = "context.runtime.route.post.runtime.interactions";
  let calls = 0;
  const projection = actionAdmissionProjection({ classifications: { [actionId]: "live_degraded" } });
  const base = await start(withActionRegistry(async () => {
    calls += 1;
    return runtimeResponse({ interaction: { responseText: "Degraded but bounded" }, events: [] });
  }, projection));
  await primeActionAdmission(base);
  const response = await fetch(`${base}/api/runtime/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", inputText: "Assess", modality: "text" }),
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(projection.actions.find((action) => action.actionId === actionId).authorityGranted, false);
});

test("hosted conversational reasoning has a dedicated bounded timeout", async () => {
  const started = Date.now();
  const runtimeFetch = async (_url, options) => new Promise((resolve, reject) => {
    const completion = setTimeout(() => resolve(runtimeResponse({ interaction: { responseText: "Verified response" }, events: [] })), 18);
    options.signal.addEventListener("abort", () => { clearTimeout(completion); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); });
  });
  const base = await start(withActionRegistry(runtimeFetch), { timeoutMs: 5, reasoningTimeoutMs: 60 });
  await primeActionAdmission(base);
  const response = await fetch(`${base}/api/runtime/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", inputText: "Assess readiness", modality: "text" })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.interaction.responseText, "Verified response");
  assert.equal("data" in body.data, false);
  assert.ok(Date.now() - started >= 15);
});

test("Experience Gateway signs authoritative Runtime tenant context without exposing the secret", async () => {
  const secret = randomBytes(48).toString("base64url");
  let observed;
  const runtimeFetch = async (url, options) => {
    observed = { url, options };
    return runtimeResponse({ interaction: { responseText: "Context received" }, events: [] });
  };
  const base = await start(
    withActionRegistry(runtimeFetch),
    { contextAssertionSecret: secret, operationalTenantId: "nexicron" },
  );
  await primeActionAdmission(base);
  const response = await fetch(`${base}/api/runtime/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: "nexus-web",
      inputText: "What is Nexicron's mission?",
      modality: "text",
      metadata: { tenantId: "untrusted-browser-tenant", contextAssemblyOwner: "browser" }
    })
  });
  assert.equal(response.status, 200);
  const token = observed.options.headers["X-NEXUS-Context-Assertion"];
  const [encodedPayload, signature] = token.split(".");
  const assertion = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  assert.equal(assertion.v, 2);
  assert.equal(assertion.contract, "nexus.context-assertion@2.0.0");
  assert.equal(assertion.alg, "hmac-sha256");
  assert.equal(assertion.kid, "context-assertion-current");
  assert.equal(assertion.iss, "command-portal-experience-gateway");
  assert.equal(assertion.aud, "nexus-runtime");
  assert.equal(assertion.tid, "nexicron");
  assert.equal(assertion.wid, "primary");
  assert.equal(assertion.sub, "command-portal-experience-gateway");
  assert.deepEqual(assertion.roles, ["observer"]);
  assert.equal(assertion.clientId, "nexus-web");
  assert.equal(assertion.trustBindingId, "runtime-experience-trust-bootstrap");
  assert.equal(assertion.authorityGranted, false);
  assert.equal(assertion.exp - assertion.iat, 60);
  assert.equal(signature, createHmac("sha256", secret).update(encodedPayload).digest("base64url"));
  const forwarded = JSON.parse(observed.options.body);
  assert.equal(forwarded.metadata.tenantId, "nexicron");
  assert.equal(forwarded.metadata.contextAssemblyOwner, "nexus-runtime");
  assert.equal(JSON.stringify(await response.json()).includes(secret), false);
});

test("redacted trust bootstrap requires secret-manager references but never returns material", () => {
  const runtimeCredential = randomBytes(48).toString("base64url");
  const assertionKey = randomBytes(48).toString("base64url");
  const config = loadConfig({
    runtimeBaseUrl: "https://runtime.invalid",
    runtimeToken: runtimeCredential,
    runtimeTokenRef: "secret-manager:nexus/runtime/experience-gateway-read",
    contextAssertionSecret: assertionKey,
    contextAssertionSecretRef: "secret-manager:nexus/runtime/context-assertion-current",
    trustBootstrapRequired: true
  });
  const trust = publicTrustBootstrap(config);
  assert.equal(trust.state, "configured_not_verified");
  assert.equal(trust.provisioningReady, true);
  assert.equal(trust.targetEnvironmentVerified, false);
  assert.equal(trust.secureRuntimeTransport, true);
  assert.equal(trust.publicBindingsValid, true);
  assert.equal(trust.assertionSubjectId, "command-portal-experience-gateway");
  assert.deepEqual(trust.assertionRoles, ["observer"]);
  assert.equal(trust.runtimeCredentialKeyId, "runtime-read-current");
  assert.equal(trust.authenticationGrantsAuthority, false);
  assert.equal(trust.provisioningContractGrantsAuthority, false);
  assert.equal(trust.secretValuesExposed, false);
  assert.equal(JSON.stringify(trust).includes(runtimeCredential), false);
  assert.equal(JSON.stringify(trust).includes(assertionKey), false);
  assert.equal(JSON.stringify(trust).includes(config.runtimeTokenRef), false);
  assert.equal(JSON.stringify(trust).includes(config.contextAssertionSecretRef), false);

  assert.throws(() => loadConfig({
    runtimeBaseUrl: "https://runtime.invalid",
    runtimeToken: runtimeCredential,
    contextAssertionSecret: assertionKey,
    trustBootstrapRequired: true
  }), /opaque secret-provider references/);
  assert.throws(() => loadConfig({
    runtimeBaseUrl: "https://runtime.invalid",
    runtimeToken: runtimeCredential,
    contextAssertionSecret: runtimeCredential
  }), /distinct by purpose/);
  assert.throws(() => loadConfig({
    runtimeBaseUrl: "https://runtime.invalid",
    runtimeToken: runtimeCredential,
    runtimeTokenRef: "secret-manager:nexus/runtime/experience-gateway-read",
    contextAssertionSecret: assertionKey,
    contextAssertionSecretRef: "secret-manager:nexus/runtime/context-assertion-current",
    contextAssertionIssuer: "unregistered-experience-gateway",
    trustBootstrapRequired: true
  }), /registered Mission 1 binding/);
  assert.throws(() => loadConfig({
    runtimeBaseUrl: "http://runtime.invalid",
    runtimeToken: runtimeCredential,
    runtimeTokenRef: "secret-manager:nexus/runtime/experience-gateway-read",
    contextAssertionSecret: assertionKey,
    contextAssertionSecretRef: "secret-manager:nexus/runtime/context-assertion-current",
    trustBootstrapRequired: true
  }), /HTTPS Runtime endpoint/);
  assert.throws(() => loadConfig({
    runtimeBaseUrl: "https://runtime.invalid",
    runtimeToken: runtimeCredential,
    runtimeTokenRef: "file:local/runtime-read",
    contextAssertionSecret: assertionKey,
    contextAssertionSecretRef: "secret-manager:nexus/runtime/context-assertion-current"
  }), /opaque secret-provider reference/);

  const disabled = publicTrustBootstrap({
    ...config,
    trustBootstrapRequired: false
  });
  assert.equal(disabled.state, "disabled");
  assert.equal(disabled.provisioningReady, false);

  const invalidPublicBinding = publicTrustBootstrap({
    ...config,
    contextAssertionAudience: "unregistered-runtime"
  });
  assert.equal(invalidPublicBinding.state, "invalid");
  assert.equal(invalidPublicBinding.publicBindingsValid, false);
  assert.equal(invalidPublicBinding.provisioningReady, false);
});

test("hosted conversational reasoning reports its own timeout truthfully", async () => {
  const runtimeFetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const base = await start(withActionRegistry(runtimeFetch), { timeoutMs: 50, reasoningTimeoutMs: 5 });
  await primeActionAdmission(base);
  const response = await fetch(`${base}/api/runtime/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", inputText: "Assess readiness", modality: "text" })
  });
  const body = await response.json();
  assert.equal(response.status, 504);
  assert.equal(body.gateway.connectionState, "Timed Out");
  assert.equal(body.error.code, "runtime_reasoning_timeout");
});

test("unavailable Realtime WebRTC never crosses the same-origin gateway", async () => {
  const offer = "v=0\r\na=offer\r\n".repeat(12);
  let calls = 0;
  const base = await start(withActionRegistry(async () => {
    calls += 1;
    return new Response("v=0\r\na=answer\r\n", { status: 201, headers: { "Content-Type": "application/sdp" } });
  }));
  await primeActionAdmission(base);
  const response = await fetch(`${base}/api/runtime/realtime/call`, {
    method: "POST", headers: { "Content-Type": "application/sdp", Accept: "application/sdp" }, body: offer
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "canonical_action_unavailable");
  assert.equal(calls, 0);
});

test("Realtime gateway rejects unavailable actions and unsafe methods before contacting Runtime", async () => {
  let calls = 0;
  const base = await start(withActionRegistry(async () => { calls += 1; return runtimeResponse({}); }));
  await primeActionAdmission(base);
  const invalid = await fetch(`${base}/api/runtime/realtime/call`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
  });
  assert.equal(invalid.status, 503);
  assert.equal((await invalid.json()).error.code, "canonical_action_unavailable");
  assert.equal((await fetch(`${base}/api/runtime/realtime/call`)).status, 405);
  assert.equal(calls, 0);
});

test("hosted HIF requires session/CSRF while unavailable Realtime remains blocked", async () => {
  const calls = [];
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: ["operations:read", "operations:write"],
    operationalCookieSecure: false,
  };
  const runtimeFetch = async (url, options) => {
    calls.push({ url, options });
    return runtimeResponse({ interaction: { responseText: "Verified response" }, events: [] });
  };
  const projection = actionAdmissionProjection({
    tenantId: config.operationalTenantId,
    workspaceId: config.operationalWorkspaceId,
  });
  const base = await start(withActionRegistry(runtimeFetch, projection), config);
  await primeActionAdmission(base);
  const interactionBody = JSON.stringify({ clientId: "nexus-web", inputText: "Assess readiness", modality: "text" });
  assert.equal((await fetch(`${base}/api/runtime/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: interactionBody,
  })).status, 401);
  assert.equal(calls.length, 0);

  const login = await fetch(`${base}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey: config.operationalAccessKey }),
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${base}/api/runtime/interactions`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: interactionBody,
  })).status, 403);
  assert.equal((await fetch(`${base}/api/runtime/interactions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken },
    body: interactionBody,
  })).status, 200);
  assert.equal((await fetch(`${base}/api/runtime/interactions/INT-EOX-1/events`)).status, 401);
  assert.equal((await fetch(`${base}/api/runtime/interactions/INT-EOX-1/events`, {
    headers: { Cookie: cookie },
  })).status, 200);

  const offer = "v=0\r\na=offer\r\n".repeat(12);
  assert.equal((await fetch(`${base}/api/runtime/realtime/call`, {
    method: "POST", headers: { "Content-Type": "application/sdp" }, body: offer,
  })).status, 401);
  assert.equal((await fetch(`${base}/api/runtime/realtime/call`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/sdp" }, body: offer,
  })).status, 403);
  const realtime = await fetch(`${base}/api/runtime/realtime/call`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/sdp", "X-CSRF-Token": session.session.csrfToken },
    body: offer,
  });
  assert.equal(realtime.status, 503);
  assert.equal((await realtime.json()).error.code, "canonical_action_unavailable");
  assert.equal(calls.length, 2);
});

test("runtime credential is server-only and never serialized", async () => {
  const token = "server-only-test-token";
  let authorization;
  const base = await start(async (_url, options) => {
    authorization = options.headers.Authorization;
    return runtimeResponse({ safe: true });
  }, { runtimeToken: token });
  const text = await (await fetch(`${base}/api/runtime/status`)).text();
  assert.equal(authorization, `Bearer ${token}`);
  assert.equal(text.includes(token), false);
  assert.equal(text.includes("Authorization"), false);
  assert.equal(JSON.parse(text).gateway.secretValuesExposed, false);
});

test("unauthorized runtime is classified without exposing credentials", async () => {
  const base = await start(async () => new Response("unauthorized", { status: 401 }));
  const response = await fetch(`${base}/api/runtime/health`);
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.gateway.connectionState, "Unauthorized");
  assert.equal(body.error.code, "runtime_unauthorized");
});

test("timeout is explicit after bounded retries", async () => {
  let calls = 0;
  const base = await start(async (_url, options) => {
    calls += 1;
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  }, { timeoutMs: 5 });
  const response = await fetch(`${base}/api/runtime/health`);
  const body = await response.json();
  assert.equal(response.status, 504);
  assert.equal(body.gateway.connectionState, "Timed Out");
  assert.equal(calls, 3);
});

test("slow runtime is aborted instead of holding the browser request open", async () => {
  const started = Date.now();
  const base = await start(async (_url, options) => new Promise((_resolve, reject) => {
    const slow = setTimeout(() => _resolve(runtimeResponse({ late: true })), 500);
    options.signal.addEventListener("abort", () => { clearTimeout(slow); reject(Object.assign(new Error("slow"), { name: "AbortError" })); });
  }), { timeoutMs: 10, maxAttempts: 1 });
  const response = await fetch(`${base}/api/runtime/ready`);
  assert.equal(response.status, 504);
  assert.ok(Date.now() - started < 300);
});

test("transient failure retries and then returns a validated response", async () => {
  let calls = 0;
  const base = await start(async () => {
    calls += 1;
    if (calls < 3) throw new Error("transient network failure");
    return runtimeResponse({ recovered: true });
  });
  const body = await (await fetch(`${base}/api/runtime/diagnostics`)).json();
  assert.equal(body.ok, true);
  assert.equal(body.data.recovered, true);
  assert.equal(body.gateway.attempts, 3);
  assert.equal(calls, 3);
});

test("successful read-only responses are cached and no-cache invalidates them", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({ generation: ++calls }));
  const first = await (await fetch(`${base}/api/runtime/status`)).json();
  const second = await (await fetch(`${base}/api/runtime/status`)).json();
  const third = await (await fetch(`${base}/api/runtime/status`, { headers: { "Cache-Control": "no-cache" } })).json();
  assert.equal(first.data.generation, 1);
  assert.equal(second.data.generation, 1);
  assert.equal(second.gateway.cache.cached, true);
  assert.equal(second.gateway.cache.stale, false);
  assert.equal(typeof second.gateway.cache.age, "number");
  assert.ok(second.gateway.cache.lastRefresh);
  assert.ok(second.gateway.cache.expires);
  assert.equal(third.data.generation, 2);
});

test("proofs, receipts, health, readiness, and diagnostics bypass cache", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({ generation: ++calls }));
  for (const route of ["proofs", "receipts", "health", "ready", "diagnostics"]) {
    const first = await (await fetch(`${base}/api/runtime/${route}`)).json();
    const second = await (await fetch(`${base}/api/runtime/${route}`)).json();
    assert.notEqual(first.data.generation, second.data.generation, route);
    assert.equal(second.gateway.cache.cached, false, route);
  }
});

test("process-ready Runtime 503 maps to one-attempt Degraded readiness without degrading healthy modules", async () => {
  let readinessCalls = 0;
  let healthCalls = 0;
  const base = await start(async (url) => {
    if (url.endsWith("/ready")) {
      readinessCalls += 1;
      return runtimeResponse({
        processReady: true,
        platformContractReady: false,
        canonicalCapabilitySetComplete: true,
        allCapabilitiesAvailable: false,
        productionReady: false,
        enterpriseReady: false,
      }, {
        status: 503,
        body: { status: "not_ready" },
      });
    }
    healthCalls += 1;
    return runtimeResponse({ processLivenessOnly: true });
  });

  const readyResponse = await fetch(`${base}/api/runtime/ready`);
  const ready = await readyResponse.json();
  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assert.equal(ready.runtime.status, "not_ready");
  assert.equal(ready.data.processReady, true);
  assert.equal(ready.data.platformContractReady, false);
  assert.equal(ready.gateway.connectionState, "Degraded");
  assert.equal(ready.gateway.attempts, 1);
  assert.match(ready.gateway.warning, /process is reachable/i);
  assert.equal(readinessCalls, 1);

  const health = await (await fetch(`${base}/api/runtime/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.gateway.connectionState, "Healthy");
  assert.equal(health.data.processLivenessOnly, true);
  assert.equal(healthCalls, 1);
});

test("malformed Runtime readiness 503 fails closed once without deterministic retries", async () => {
  let calls = 0;
  const base = await start(async () => {
    calls += 1;
    return runtimeResponse({
      processReady: true,
      platformContractReady: true,
    }, {
      status: 503,
      body: { status: "not_ready" },
    });
  });
  const response = await fetch(`${base}/api/runtime/ready`);
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.data, null);
  assert.equal(body.gateway.connectionState, "Unknown");
  assert.equal(body.error.code, "runtime_readiness_response_invalid");
  assert.equal(calls, 1);
});

test("expired validated cache degrades visibly when runtime becomes unavailable", async () => {
  let available = true;
  const base = await start(async () => {
    if (!available) throw new Error("offline");
    return runtimeResponse({ lastKnown: "validated" });
  }, { cacheTtlMs: 1, maxAttempts: 1 });
  await fetch(`${base}/api/runtime/providers`);
  await new Promise((resolve) => setTimeout(resolve, 3));
  available = false;
  const response = await fetch(`${base}/api/runtime/providers`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.lastKnown, "validated");
  assert.equal(body.gateway.connectionState, "Degraded");
  assert.equal(body.gateway.cache.stale, true);
  assert.match(body.gateway.warning, /last validated response/i);
});

test("schema mismatch is rejected explicitly and never cached", async () => {
  let calls = 0;
  const base = await start(async () => { calls += 1; return runtimeResponse({}, { body: { schemaVersion: "2.0.0" } }); });
  for (let index = 0; index < 2; index += 1) {
    const response = await fetch(`${base}/api/runtime/version`);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.gateway.connectionState, "Schema Mismatch");
  }
  assert.equal(calls, 2);
});

test("version mismatch is rejected explicitly", async () => {
  const base = await start(async () => runtimeResponse({}, { body: { runtimeVersion: "1.0.0" } }));
  const response = await fetch(`${base}/api/runtime/version`);
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.gateway.connectionState, "Version Mismatch");
});

test("disconnected runtime returns unavailable with no fabricated data", async () => {
  const base = await start(async () => { throw new Error("offline"); }, { maxAttempts: 1 });
  const response = await fetch(`${base}/api/runtime/status`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.data, null);
  assert.equal(body.gateway.connectionState, "Unavailable");
  assert.equal(body.gateway.lastSuccessfulConnection, null);
});

test("invalid runtime envelopes are unavailable to the browser", async () => {
  const base = await start(async () => new Response(JSON.stringify({ data: { fabricated: true } }), { status: 200 }));
  const response = await fetch(`${base}/api/runtime/status`);
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.data, null);
  assert.equal(body.error.code, "runtime_response_invalid");
});

test("truth-boundary regression remains fixed in every gateway envelope", async () => {
  const base = await start(async () => runtimeResponse({}));
  const body = await (await fetch(`${base}/api/runtime/status`)).json();
  assert.deepEqual(body.truth, {
    productionReady: false,
    enterpriseReady: false,
    cloudPrimary: false,
    localSourceOfTruth: true,
    defaultProvider: "mock_model",
    conclave: "unavailable",
    actualTrainedSLMs: 0,
    secretValuesExposed: false
  });
});

test("local capability mode is explicit and disabled by default", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({}), {}, async () => { calls += 1; return localResponse({}); });
  const response = await fetch(`${base}/api/local/status`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "local_capabilities_disabled");
  assert.equal(body.local.enabled, false);
  assert.equal(calls, 0);
});

test("legacy Operational Replay exports remain registered but unavailable", async () => {
  const observed = [];
  const replayFetch = async (url, options) => {
    observed.push({ url, options });
    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  };
  const base = await start(async () => runtimeResponse({}), {
    replayEnabled: true,
    replayBaseUrl: "http://127.0.0.1:4317"
  }, async () => localResponse({}), async () => localResponse({}), replayFetch);
  const response = await fetch(`${base}/api/replay/replay.json`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "canonical_action_unavailable");
  assert.equal(observed.length, 0);
  assert.equal((await fetch(`${base}/api/replay/replay.json`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${base}/api/replay/private`)).status, 404);
  assert.equal((await fetch(`${base}/api/replay/replay.json?path=/etc/passwd`)).status, 400);
  assert.deepEqual(Object.keys(REPLAY_ROUTES).sort(), [
    "/api/replay/events",
    "/api/replay/export/audit-package.zip",
    "/api/replay/export/replay-package.zip",
    "/api/replay/export/replay-receipt.json",
    "/api/replay/export/replay.json",
    "/api/replay/export/replay.pdf",
    "/api/replay/replay.json"
  ]);
});

test("Operational Replay is disabled unless the deployment explicitly enables it", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({}), {}, undefined, undefined, async () => { calls += 1; return localResponse({}); });
  const response = await fetch(`${base}/api/replay/replay.json`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "replay_gateway_disabled");
  assert.equal(calls, 0);
});

test("enabling local capabilities does not implicitly expose Operational Replay exports", async () => {
  let replayCalls = 0;
  const base = await start(
    async () => runtimeResponse({}),
    { localCapabilitiesEnabled: true },
    async () => localResponse({}),
    async () => localResponse({}),
    async () => { replayCalls += 1; return localResponse({}); }
  );
  const response = await fetch(`${base}/api/replay/replay.json`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "replay_gateway_disabled");
  assert.equal(replayCalls, 0);
});

test("local capability allowlist maps only literal governed Runtime operations", async () => {
  const observed = [];
  const localFetch = async (url, options) => {
    observed.push({ url, options });
    return localResponse({ recordType: "local_test", runtimePath: url });
  };
  const base = await start(async () => runtimeResponse({}), {
    localCapabilitiesEnabled: true,
    localApiBaseUrl: "http://127.0.0.1:8765"
  }, localFetch);

  const postBodies = {
    "/api/local/intake/upload": { filename: "brief.txt", contentBase64: "SGVsbG8=" },
    "/api/local/intake/query": { question: "What is in the brief?" },
    "/api/local/projects": { name: "Nexicron Alpha" },
    "/api/local/missions/plan": { objective: "Plan a governed launch" },
    "/api/local/work-sessions/plan": { objective: "Plan a bounded audit" },
    "/api/local/work-sessions/start": { objective: "Start a bounded audit" },
    "/api/local/actions/dry-run": { action: "inspect local project status" },
    "/api/local/actions/execute": { action: "run approved local test", explicitRequest: true },
    "/api/local/voice-operator/route-transcript": { transcript: "Summarize project Alpha", source: "text_fallback" },
    "/api/local/interactions": { clientId: "nexus-web", inputText: "Summarize project Alpha", modality: "text" }
  };
  for (const [route, definition] of Object.entries(LOCAL_CAPABILITY_ROUTES)) {
    const callsBefore = observed.length;
    const response = await fetch(`${base}${route}`, {
      method: definition.method,
      headers: definition.method === "POST" ? { "Content-Type": "application/json" } : {},
      ...(definition.method === "POST" ? { body: JSON.stringify(postBodies[route]) } : {})
    });
    if (route.startsWith("/api/local/interactions")) {
      assert.equal(response.status, 503, route);
      assert.equal((await response.json()).error.code, "canonical_action_unavailable");
      assert.equal(observed.length, callsBefore);
      continue;
    }
    assert.equal(response.status, 200, route);
    const expectedBase = definition.target === "platform" ? "http://127.0.0.1:8080" : "http://127.0.0.1:8765";
    assert.equal(observed.at(-1).url, `${expectedBase}${definition.runtimePath}`);
    assert.equal(observed.at(-1).options.method, definition.method);
    assert.equal(observed.at(-1).options.headers.Authorization, undefined);
  }
});

test("operational parity routes are explicit, validated, and remain Runtime-owned", async () => {
  const observed = [];
  const base = await start(async () => runtimeResponse({}), { localCapabilitiesEnabled: true }, async (url, options) => {
    observed.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    return localResponse({ recordType: "runtime_owned_operation", secretValuesExposed: false });
  });
  const cases = [
    ["/api/local/missions/MISSION-1/execute-step", { stepId: "STEP-1" }, "/missions/MISSION-1/execute-step"],
    ["/api/local/work-sessions/WORK-1/step", {}, "/work-sessions/WORK-1/step"],
    ["/api/local/work-sessions/WORK-1/pause", {}, "/work-sessions/WORK-1/pause"],
    ["/api/local/approvals/APPROVAL-1/approve", {}, "/approvals/APPROVAL-1/approve"],
    ["/api/local/approvals/APPROVAL-1/deny", { reason: "Insufficient evidence" }, "/approvals/APPROVAL-1/deny"]
  ];
  for (const [route, body, runtimePath] of cases) {
    const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 200, route);
    assert.equal(observed.at(-1).url, `http://127.0.0.1:8765${runtimePath}`);
    assert.equal((await response.json()).local.contextAssemblyOwner, "NEXUS Runtime");
  }
  assert.equal((await fetch(`${base}/api/local/work-sessions/WORK-1`)).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/work-sessions/WORK-1");
});

test("Conclave workspace routes use the operational gateway and preserve evidence validation", async () => {
  const observed = [];
  const base = await start(async () => runtimeResponse({}), {
    localCapabilitiesEnabled: true
  }, async (url, options) => {
    observed.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return localResponse({
      recordType: "nexus_conclave_workspace", missionId: "conclave-001",
      workspaceId: "conclave-001", status: "investigation_running", tasks: [],
      specialistRegistry: [], evidence: [], operationalReplay: { stageCount: 21 },
      executionAuthorized: false, externalExecutionPerformed: false, secretValuesExposed: false
    });
  });

  const created = await fetch(`${base}/api/local/conclave/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "conclave-create-0001" },
    body: JSON.stringify({ proposal: "Investigate an unfamiliar operational asset without control." })
  });
  assert.equal(created.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/conclave/workspaces");
  assert.deepEqual(observed.at(-1).body, { proposal: "Investigate an unfamiliar operational asset without control." });
  assert.equal((await created.json()).data.executionAuthorized, false);

  const predecessor = {
    missionId: "conclave-legacy-001",
    workspaceId: "workspace-legacy-001",
    workspaceVersion: `sha256:${"c".repeat(64)}`,
  };
  const restarted = await fetch(`${base}/api/local/conclave/workspaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "conclave-restart-0001",
    },
    body: JSON.stringify({
      proposal: "Investigate an unfamiliar operational asset without control.",
      predecessor,
    }),
  });
  assert.equal(restarted.status, 200);
  assert.deepEqual(observed.at(-1).body, {
    proposal: "Investigate an unfamiliar operational asset without control.",
    predecessor,
  });

  assert.equal((await fetch(`${base}/api/local/conclave/workspaces/conclave-001`)).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/conclave/workspaces/conclave-001");

  const workspaceVersion = `sha256:${"a".repeat(64)}`;
  const run = await fetch(`${base}/api/local/conclave/workspaces/conclave-001/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "conclave-run-0001",
    },
    body: JSON.stringify({ expectedWorkspaceVersion: workspaceVersion }),
  });
  assert.equal(run.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/conclave/workspaces/conclave-001/run");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], "conclave-run-0001");
  assert.deepEqual(observed.at(-1).body, { expectedWorkspaceVersion: workspaceVersion });

  const beforeInvalidRun = observed.length;
  for (const [body, headers = { "Idempotency-Key": "conclave-run-invalid" }] of [
    [{ expectedWorkspaceVersion: "not-a-version" }],
    [{ expectedWorkspaceVersion: workspaceVersion, authorityGranted: true }],
    [{ expectedWorkspaceVersion: workspaceVersion }, {}],
  ]) {
    const invalid = await fetch(`${base}/api/local/conclave/workspaces/conclave-001/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    assert.equal(invalid.status, 400);
  }
  assert.equal(observed.length, beforeInvalidRun);

  const evidence = await fetch(`${base}/api/local/conclave/workspaces/conclave-001/tasks/task-001/evidence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "conclave-evidence-0001",
    },
    body: JSON.stringify({
      origin: "operator://workspace/observation-1", sourceClassification: "tenant_knowledge",
      confidence: 0.9, claim: "A bounded observation was admitted.",
      supportingArtifacts: ["observation-1"], relationships: ["observed_on"],
      operationalContext: { controlAttempted: false }
    })
  });
  assert.equal(evidence.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/conclave/workspaces/conclave-001/tasks/task-001/evidence");
  assert.equal(observed.at(-1).body.sourceClassification, "tenant_knowledge");
  const beforeInvalid = observed.length;
  assert.equal((await fetch(`${base}/api/local/conclave/workspaces/conclave-001/tasks/task-001/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: "edge-runtime://node-1/observation-no-key",
      sourceClassification: "tenant_knowledge",
      confidence: 0.9,
      claim: "A stable operation identity is required.",
      supportingArtifacts: [],
      relationships: [],
      operationalContext: {},
    }),
  })).status, 400);
  for (const invalidPayload of [
    { origin: "x", sourceClassification: "unclassified", confidence: 2, claim: "x" },
    {
      origin: "edge-runtime://node-1/observation-2",
      sourceClassification: "tenant_knowledge",
      collector: "client-selected",
      confidence: 0.9,
      claim: "The browser must not select the collector.",
      supportingArtifacts: [],
      relationships: [],
      operationalContext: {},
    },
    {
      origin: "edge-runtime://node-1/observation-3",
      sourceClassification: "tenant_knowledge",
      completeTask: true,
      confidence: 0.9,
      claim: "The browser must not select task completion.",
      supportingArtifacts: [],
      relationships: [],
      operationalContext: {},
    },
  ]) {
    assert.equal((await fetch(`${base}/api/local/conclave/workspaces/conclave-001/tasks/task-001/evidence`, {
      method: "POST", headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "conclave-evidence-invalid",
      },
      body: JSON.stringify(invalidPayload)
    })).status, 400);
  }
  for (const sourceClassification of [
    "runtime_evidence",
    "live_external_source",
    "platform_knowledge",
    "model_native",
  ]) {
    assert.equal((await fetch(`${base}/api/local/conclave/workspaces/conclave-001/tasks/task-001/evidence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `conclave-evidence-forbidden-${sourceClassification}`,
      },
      body: JSON.stringify({
        origin: "operator://workspace/forbidden-provenance",
        sourceClassification,
        confidence: 0.9,
        claim: "An operator must not claim producer-owned provenance.",
        supportingArtifacts: [],
        relationships: [],
        operationalContext: {},
      }),
    })).status, 400);
  }
  assert.equal(observed.length, beforeInvalid);

  for (const invalidPredecessor of [
    { ...predecessor, workspaceVersion: "sha256:short" },
    { ...predecessor, workspaceId: "" },
    { ...predecessor, authorityGranted: true },
  ]) {
    assert.equal((await fetch(`${base}/api/local/conclave/workspaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "conclave-restart-invalid",
      },
      body: JSON.stringify({
        proposal: "Investigate an unfamiliar operational asset without control.",
        predecessor: invalidPredecessor,
      }),
    })).status, 400);
  }
  assert.equal(observed.length, beforeInvalid);
});

test("Runtime Coordination exposes fleet reads and exact governed admission routes only", async () => {
  const observed = [];
  const base = await start(async () => runtimeResponse({}), { localCapabilitiesEnabled: true }, async (url, options) => {
    observed.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith("/runtime-coordination/nodes")) return localResponse({
      recordType: "runtime_node_fleet",
      nodes: [{ nodeId: "NEXUS-EDGE-0002", enrollment: { status: "pending", challengeId: "raw-one-time-value" }, credentialRef: "must-not-reach-browser" }],
      summary: { total: 1 }, secretValuesExposed: false
    });
    return localResponse({ recordType: "runtime_projection", secretValuesExposed: false });
  });

  const listed = await fetch(`${base}/api/local/runtime-coordination/nodes`);
  assert.equal(listed.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/runtime-coordination/nodes");
  assert.equal(observed.at(-1).options.method, "GET");
  const listedText = await listed.text();
  assert.equal(listedText.includes("raw-one-time-value"), false);
  assert.equal(listedText.includes("must-not-reach-browser"), false);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/nodes/NEXUS-EDGE-0002`)).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/runtime-coordination/nodes/NEXUS-EDGE-0002");

  assert.equal((await fetch(`${base}/api/local/runtime-coordination/admissions`)).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/runtime-coordination/admissions");

  const admissionIntent = {
    missionId: "MISSION-EDGE-001",
    intent: {
      displayName: "Plant gateway east",
      nodeClass: "edge_runtime_node",
      requestedCapabilities: ["nexus.edge.runtime.host", "nexus.edge.runtime.heartbeat"],
      operationalPurpose: "Provide governed Runtime Coordination at the east plant.",
      location: "East plant",
      deploymentMetadata: { profile: "raspberry-pi" },
      evidenceRefs: ["EVIDENCE-EDGE-001"]
    }
  };
  const idempotencyKey = "edge-admission:request-001";
  const created = await fetch(`${base}/api/local/runtime-coordination/admissions`, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(admissionIntent)
  });
  assert.equal(created.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/runtime-coordination/admissions");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], idempotencyKey);
  assert.deepEqual(observed.at(-1).body, admissionIntent);
  assert.equal((await created.json()).truth.enterpriseReady, false);

  for (const [route, method] of [
    ["/api/local/runtime-coordination/admissions/ADMISSION-001", "GET"],
    ["/api/local/runtime-coordination/admissions/ADMISSION-001/receipt", "GET"],
    ["/api/local/runtime-coordination/admissions/ADMISSION-001/replay", "GET"],
  ]) {
    assert.equal((await fetch(`${base}${route}`, { method })).status, 200);
  }

  for (const action of ["cancel", "challenge/reissue"]) {
    const key = `edge-admission:${action.replace("/", "-")}-001`;
    const expectedVersion = action === "cancel" ? 7 : 8;
    const response = await fetch(`${base}/api/local/runtime-coordination/admissions/ADMISSION-001/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ expectedVersion, reason: `Operator requested ${action}` })
    });
    assert.equal(response.status, 200);
    assert.equal(observed.at(-1).url, `http://127.0.0.1:8765/runtime-coordination/admissions/ADMISSION-001/${action}`);
    assert.equal(observed.at(-1).options.headers["Idempotency-Key"], key);
    assert.deepEqual(observed.at(-1).body, { expectedVersion, reason: `Operator requested ${action}` });
  }

  const callsBeforeRejectedRequests = observed.length;
  for (const payload of [
    { ...admissionIntent, tenantId: "browser-tenant" },
    { ...admissionIntent, workspaceId: "browser-workspace" },
    { ...admissionIntent, requestingPrincipalId: "browser-principal" },
    { ...admissionIntent, authorityGrantId: "browser-authority" },
    { ...admissionIntent, nodeId: "NEXUS-EDGE-BROWSER" },
    { ...admissionIntent, intent: { ...admissionIntent.intent, verificationState: "verified" } },
    { ...admissionIntent, intent: { ...admissionIntent.intent, deploymentMetadata: { tenantId: "browser-tenant" } } },
    { ...admissionIntent, intent: { ...admissionIntent.intent, requestedCapabilities: ["vendor.device.control"] } },
  ]) {
    const response = await fetch(`${base}/api/local/runtime-coordination/admissions`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(payload)
    });
    assert.equal(response.status, 400);
  }
  const mismatched = await fetch(`${base}/api/local/runtime-coordination/admissions`, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ ...admissionIntent, idempotencyKey: "edge-admission:different" })
  });
  assert.equal(mismatched.status, 400);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/nodes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 405);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/admissions/ADMISSION-001/claim`)).status, 404);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/admissions/ADMISSION-001/proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 404);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/nodes/NEXUS-EDGE-0002/enrollment-challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 404);
  assert.equal(observed.length, callsBeforeRejectedRequests);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/nodes`, { method: "DELETE" })).status, 405);
  assert.equal((await fetch(`${base}/api/local/runtime-coordination/nodes?tenant=other`)).status, 400);
});

test("operational payloads cannot smuggle client-side governance decisions", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({}), { localCapabilitiesEnabled: true }, async () => { calls += 1; return localResponse({}); });
  const response = await fetch(`${base}/api/local/actions/execute`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "change production", explicitRequest: true, approved: true })
  });
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("unsigned local HIF aliases never forward around the signed Runtime boundary", async () => {
  const observed = [];
  const base = await start(async () => runtimeResponse({}), {
    localCapabilitiesEnabled: true,
    platformRuntimeBaseUrl: "http://127.0.0.1:8080"
  }, async (url, options) => {
    observed.push({ url, options });
    return localResponse({ status: "ok", data: { interaction: { interactionId: "INT-1" }, events: [] } });
  });
  const created = await fetch(`${base}/api/local/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "nexus-web", inputText: "Brief me", presentation: { navigate: "projects", focus: "alpha" } })
  });
  assert.equal(created.status, 503);
  assert.equal((await created.json()).error.code, "canonical_action_unavailable");
  const events = await fetch(`${base}/api/local/interactions/INT-1/events`);
  assert.equal(events.status, 503);
  assert.equal((await events.json()).error.code, "canonical_action_unavailable");
  const interrupted = await fetch(`${base}/api/local/interactions/INT-1/interrupt`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "barge_in" })
  });
  assert.equal(interrupted.status, 503);
  assert.equal((await interrupted.json()).error.code, "canonical_action_unavailable");
  assert.equal(observed.length, 0);
});

test("project scope estimate planning and compile use one dynamic Runtime project contract", async () => {
  const observed = [];
  const base = await start(async () => runtimeResponse({}), {
    localCapabilitiesEnabled: true
  }, async (url, options) => {
    observed.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return localResponse({ projectId: "PROJECT-1", truth: "runtime-owned" });
  });

  for (const action of ["scope", "estimate", "planning-model", "sources", "evidence", "artifacts"]) {
    assert.equal((await fetch(`${base}/api/local/projects/PROJECT-1/${action}`)).status, 200);
  }
  const compile = await fetch(`${base}/api/local/projects/PROJECT-1/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactType: "roadmap", options: { defaultPhaseDurationWeeks: 2, assumptions: ["Operator supplied"] } })
  });
  assert.equal(compile.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:8765/projects/PROJECT-1/compile");
  assert.deepEqual(observed.at(-1).body, { artifactType: "roadmap", options: { defaultPhaseDurationWeeks: 2, assumptions: ["Operator supplied"] } });
  const body = await compile.json();
  assert.equal(body.local.contextAssemblyOwner, "NEXUS Runtime");
});

test("local gateway rejects arbitrary routes methods queries and unsafe payloads before Runtime", async () => {
  let calls = 0;
  const base = await start(async () => runtimeResponse({}), { localCapabilitiesEnabled: true }, async () => { calls += 1; return localResponse({}); });
  assert.equal((await fetch(`${base}/api/local/arbitrary`)).status, 404);
  assert.equal((await fetch(`${base}/api/local/status?path=/etc/passwd`)).status, 400);
  assert.equal((await fetch(`${base}/api/local/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 405);
  assert.equal((await fetch(`${base}/api/local/intake/upload`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: "../secret.txt", contentBase64: "SGVsbG8=" })
  })).status, 400);
  assert.equal((await fetch(`${base}/api/local/projects/PROJECT-1/compile`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artifactType: "unknown", options: {} })
  })).status, 400);
  assert.equal(calls, 0);
});

test("local capability failures preserve truth boundaries and hide server configuration", async () => {
  const secret = "server-only-test-token";
  const base = await start(async () => runtimeResponse({}), {
    runtimeToken: secret,
    localCapabilitiesEnabled: true,
    localApiBaseUrl: "http://localhost:8765"
  }, async () => { throw new Error(`offline ${secret}`); });
  const text = await (await fetch(`${base}/api/local/status`)).text();
  const body = JSON.parse(text);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "local_runtime_unavailable");
  assert.equal(text.includes(secret), false);
  assert.equal(body.truth.localSourceOfTruth, true);
  assert.equal(body.truth.productionReady, false);
});

test("hosted operational gateway requires a signed session CSRF scope and idempotency", async () => {
  const observed = [];
  const operationalFetch = async (url, options) => {
    observed.push({ url, options });
    return localResponse({ recordType: "hosted_runtime_result", secretValuesExposed: false });
  };
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: ["operations:read", "operations:write", "actions:simulate", "evidence:write"],
    operationalCookieSecure: false,
    localCapabilitiesEnabled: false
  };
  const base = await start(async () => runtimeResponse({}), config, async () => localResponse({}), operationalFetch);
  assert.equal((await fetch(`${base}/api/operations/missions`)).status, 401);
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey })
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  assert.equal(loginBody.session.authenticated, true);
  assert.equal(loginBody.session.tenantId, "tenant-alpha");
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${base}/api/operations/missions`, { headers: {
    Cookie: cookie,
    "X-NEXUS-User-ID": "browser-controlled-identity",
    "X-NEXUS-Role": "observer",
    "X-NEXUS-Scopes": "operations:write"
  } })).status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/missions");
  assert.equal(observed.at(-1).options.headers.Authorization, `Bearer ${config.operationalRuntimeToken}`);
  assert.equal(observed.at(-1).options.headers["X-NEXUS-User-ID"], "operator-1");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Role"], "admin");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Scopes"], "operations:read,operations:write,actions:simulate,evidence:write");
  const callsBeforeMissionPlan = observed.length;
  assert.equal((await fetch(`${base}/api/operations/missions/plan`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ objective: "Plan alpha" })
  })).status, 403);
  const missionPlan = await fetch(`${base}/api/operations/missions/plan`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": loginBody.session.csrfToken, "Idempotency-Key": "legacy-plan-12345" }, body: JSON.stringify({ objective: "Plan alpha" })
  });
  assert.equal(missionPlan.status, 200);
  assert.equal(observed.length, callsBeforeMissionPlan + 1);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/missions/plan");
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), { objective: "Plan alpha" });

  const missionStep = await fetch(`${base}/api/operations/missions/MISSION-001/execute-step`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": loginBody.session.csrfToken,
      "Idempotency-Key": "mission-step-12345",
    },
    body: JSON.stringify({ stepId: "STEP-001" }),
  });
  assert.equal(missionStep.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/missions/MISSION-001/execute-step");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], "mission-step-12345");
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), { stepId: "STEP-001" });

  assert.equal((await fetch(`${base}/api/operations/conclave/workspaces`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ proposal: "Investigate an unfamiliar asset through an Edge Runtime." })
  })).status, 403);
  assert.equal((await fetch(`${base}/api/operations/conclave/workspaces`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": loginBody.session.csrfToken }, body: JSON.stringify({ proposal: "Investigate an unfamiliar asset through an Edge Runtime." })
  })).status, 400);

  const conclaveMutation = await fetch(`${base}/api/operations/conclave/workspaces`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": loginBody.session.csrfToken, "Idempotency-Key": "conclave-operation-12345" },
    body: JSON.stringify({ proposal: "Investigate an unfamiliar asset through an Edge Runtime." })
  });
  assert.equal(conclaveMutation.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/conclave/workspaces");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], "conclave-operation-12345");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), { proposal: "Investigate an unfamiliar asset through an Edge Runtime." });
  const body = await conclaveMutation.json();
  assert.equal(body.operational.productionMultiTenantReady, false);
  assert.equal(JSON.stringify(body).includes(config.operationalRuntimeToken), false);

  const hostedPredecessor = {
    missionId: "MISSION-LEGACY-001",
    workspaceId: "WORKSPACE-LEGACY-001",
    workspaceVersion: `sha256:${"d".repeat(64)}`,
  };
  const conclaveRestart = await fetch(`${base}/api/operations/conclave/workspaces`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": loginBody.session.csrfToken,
      "Idempotency-Key": "conclave-restart-12345",
    },
    body: JSON.stringify({
      proposal: "Investigate an unfamiliar asset through an Edge Runtime.",
      predecessor: hostedPredecessor,
    }),
  });
  assert.equal(conclaveRestart.status, 200);
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], "conclave-restart-12345");
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), {
    proposal: "Investigate an unfamiliar asset through an Edge Runtime.",
    predecessor: hostedPredecessor,
  });

  const workspaceVersion = `sha256:${"b".repeat(64)}`;
  const conclaveRun = await fetch(`${base}/api/operations/conclave/workspaces/MISSION-001/run`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": loginBody.session.csrfToken,
      "Idempotency-Key": "conclave-run-12345",
    },
    body: JSON.stringify({ expectedWorkspaceVersion: workspaceVersion }),
  });
  assert.equal(conclaveRun.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/conclave/workspaces/MISSION-001/run");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], "conclave-run-12345");
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), {
    expectedWorkspaceVersion: workspaceVersion,
  });

  const evidencePayload = {
    origin: "runtime://edge/node-1/observation-1",
    sourceClassification: "retrieved_evidence",
    confidence: 0.91,
    claim: "A bounded observation was admitted through the hosted gateway.",
    supportingArtifacts: ["observation-1"],
    relationships: ["observed_on"],
    operationalContext: { controlAttempted: false },
  };
  const conclaveEvidence = await fetch(
    `${base}/api/operations/conclave/workspaces/MISSION-001/tasks/TASK-001/evidence`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": loginBody.session.csrfToken,
        "Idempotency-Key": "conclave-evidence-12345",
      },
      body: JSON.stringify(evidencePayload),
    },
  );
  assert.equal(conclaveEvidence.status, 200);
  assert.equal(
    observed.at(-1).url,
    "http://127.0.0.1:9876/conclave/workspaces/MISSION-001/tasks/TASK-001/evidence",
  );
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), evidencePayload);

  const beforeInvalidConclaveRun = observed.length;
  for (const invalidPayload of [
    { expectedWorkspaceVersion: "sha256:short" },
    { expectedWorkspaceVersion: workspaceVersion, executionAuthorized: true },
  ]) {
    const invalidRun = await fetch(`${base}/api/operations/conclave/workspaces/MISSION-001/run`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": loginBody.session.csrfToken,
        "Idempotency-Key": "conclave-run-invalid",
      },
      body: JSON.stringify(invalidPayload),
    });
    assert.equal(invalidRun.status, 400);
  }
  assert.equal(observed.length, beforeInvalidConclaveRun);

  const invalidEvidence = await fetch(
    `${base}/api/operations/conclave/workspaces/MISSION-001/tasks/TASK-001/evidence`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": loginBody.session.csrfToken,
        "Idempotency-Key": "conclave-evidence-invalid",
      },
      body: JSON.stringify({ ...evidencePayload, collector: "client-selected" }),
    },
  );
  assert.equal(invalidEvidence.status, 400);
  for (const sourceClassification of [
    "runtime_evidence",
    "live_external_source",
    "platform_knowledge",
    "model_native",
  ]) {
    const forbiddenEvidence = await fetch(
      `${base}/api/operations/conclave/workspaces/MISSION-001/tasks/TASK-001/evidence`,
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-CSRF-Token": loginBody.session.csrfToken,
          "Idempotency-Key": `conclave-evidence-forbidden-${sourceClassification}`,
        },
        body: JSON.stringify({ ...evidencePayload, sourceClassification }),
      },
    );
    assert.equal(forbiddenEvidence.status, 400);
  }
  assert.equal(observed.length, beforeInvalidConclaveRun);

  for (const invalidPredecessor of [
    { ...hostedPredecessor, workspaceVersion: "not-a-digest" },
    { ...hostedPredecessor, missionId: "" },
    { ...hostedPredecessor, completionClaimed: true },
    { ...hostedPredecessor, tenantId: "browser-selected-tenant" },
    { ...hostedPredecessor, authorityGrantId: "browser-selected-authority" },
    { ...hostedPredecessor, requestingPrincipalId: "browser-selected-principal" },
  ]) {
    const invalidRestart = await fetch(`${base}/api/operations/conclave/workspaces`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": loginBody.session.csrfToken,
        "Idempotency-Key": "conclave-restart-invalid",
      },
      body: JSON.stringify({
        proposal: "Investigate an unfamiliar asset through an Edge Runtime.",
        predecessor: invalidPredecessor,
      }),
    });
    assert.equal(invalidRestart.status, 400);
  }
  for (const privilegedTopLevelField of [
    { workspaceId: "browser-selected-workspace" },
    { tenantId: "browser-selected-tenant" },
    { authorityGranted: true },
  ]) {
    const invalidRestart = await fetch(`${base}/api/operations/conclave/workspaces`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": loginBody.session.csrfToken,
        "Idempotency-Key": "conclave-restart-privileged",
      },
      body: JSON.stringify({
        proposal: "Investigate an unfamiliar asset through an Edge Runtime.",
        predecessor: hostedPredecessor,
        ...privilegedTopLevelField,
      }),
    });
    assert.equal(invalidRestart.status, 400);
  }
  assert.equal(observed.length, beforeInvalidConclaveRun);
});

test("authenticated hosted reads use the canonical Runtime contracts without Replay fallback", async () => {
  const observed = [];
  let replayFallbackCalls = 0;
  let localFallbackCalls = 0;
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: [
      "operations:read",
      "operations:write",
      "knowledge:promote",
      "approvals:decide",
      "actions:simulate",
      "actions:execute",
    ],
    operationalCookieSecure: false,
    replayEnabled: false,
  };
  const base = await start(
    async () => runtimeResponse({}),
    config,
    async () => { localFallbackCalls += 1; return localResponse({ fabricatedLocalFallback: true }); },
    async (url, options) => {
      observed.push({ url, options });
      return localResponse({ recordType: "canonical_runtime_projection", secretValuesExposed: false });
    },
    async () => {
      replayFallbackCalls += 1;
      return localResponse({ fabricatedFallback: true });
    },
  );
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey: config.operationalAccessKey }),
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const routes = [
    ["/capabilities/readiness", "/capabilities/readiness"],
    ["/client-capabilities", "/client-capabilities"],
    ["/intake/history", "/intake/history"],
    ["/projects/artifact-types", "/projects/artifact-types"],
    ["/projects/PROJECT-001/scope", "/projects/PROJECT-001/scope"],
    ["/projects/PROJECT-001/estimate", "/projects/PROJECT-001/estimate"],
    ["/projects/PROJECT-001/planning-model", "/projects/PROJECT-001/planning-model"],
    ["/voice-operator/status", "/voice-operator/status"],
    ["/voice-operator/history", "/voice-operator/history"],
    ["/missions", "/missions"],
    ["/missions/MISSION-001", "/missions/MISSION-001"],
    ["/work-sessions", "/work-sessions"],
    ["/work-sessions/WORK-001", "/work-sessions/WORK-001"],
    ["/work-sessions/WORK-001/receipt", "/work-sessions/WORK-001/receipt"],
    ["/approvals", "/approvals"],
    ["/proofs", "/proof/recent"],
    ["/conclave/workspaces", "/conclave/workspaces"],
    ["/conclave/workspaces/MISSION-001", "/conclave/workspaces/MISSION-001"],
    ["/operational-replay", "/operational-replay"],
    ["/operational-replay/REPLAY-001", "/operational-replay/REPLAY-001"],
    ["/operational-replay/REPLAY-001/events", "/operational-replay/REPLAY-001/events"],
    ["/operational-replay/REPLAY-001/stages/stage-17", "/operational-replay/REPLAY-001/stages/stage-17"],
    ["/operational-replay/REPLAY-001/stages/stage-17/explain", "/operational-replay/REPLAY-001/stages/stage-17/explain"],
    ["/operational-replay/failures", "/operational-replay/failures"],
    ["/operational-replay/missions/MISSION-001", "/operational-replay/missions/MISSION-001"],
    ["/operational-replay/receipts/RECEIPT-001", "/operational-replay/receipts/RECEIPT-001"],
    ["/receipts", "/receipts"],
    ["/receipts/RECEIPT-001", "/receipts/RECEIPT-001"],
    ["/receipts/missions/MISSION-001", "/receipts/missions/MISSION-001"],
    ["/mission-store", "/mission-store"],
    ["/mission-store/MISSION-001", "/mission-store/MISSION-001"],
    ["/knowledge/acquisitions", "/knowledge/acquisitions"],
    ["/knowledge/acquisitions/MISSION-001", "/knowledge/acquisitions/MISSION-001"],
    ["/knowledge/promotion-candidates", "/knowledge/promotion-candidates"],
    ["/knowledge/promotion-candidates/CANDIDATE-001", "/knowledge/promotion-candidates/CANDIDATE-001"],
    ["/knowledge/promotions", "/knowledge/promotions"],
    ["/knowledge/store", "/knowledge/store"],
    ["/knowledge/store/KNOWLEDGE-001", "/knowledge/store/KNOWLEDGE-001"],
    ["/knowledge/store/KNOWLEDGE-001/versions", "/knowledge/store/KNOWLEDGE-001/versions"],
    ["/knowledge/receipts", "/knowledge/receipts"],
    ["/knowledge/receipts/RECEIPT-001", "/knowledge/receipts/RECEIPT-001"],
    ["/runtime/baselines", "/runtime/baselines"],
    ["/runtime/baselines/BASELINE-001", "/runtime/baselines/BASELINE-001"],
    ["/governance/readiness", "/governance/readiness"],
    ["/authority/readiness", "/authority/readiness"],
    ["/runtime-coordination/nodes", "/runtime-coordination/nodes"],
    ["/runtime-coordination/events", "/runtime-coordination/events"],
    ["/runtime-coordination/admissions", "/runtime-coordination/admissions"],
    ["/runtime-coordination/admissions/ADMISSION-001", "/runtime-coordination/admissions/ADMISSION-001"],
  ];
  for (const [portalPath, runtimePath] of routes) {
    const response = await fetch(`${base}/api/operations${portalPath}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, portalPath);
    const call = observed.at(-1);
    assert.equal(call.url, `http://127.0.0.1:9876${runtimePath}`, portalPath);
    assert.equal(call.options.method, "GET", portalPath);
    assert.equal(call.options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha", portalPath);
    assert.equal(call.options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha", portalPath);
  }
  assert.equal(replayFallbackCalls, 0);
  assert.equal(localFallbackCalls, 0);
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/missions"].GET, "/missions");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/missions/plan"].POST, "/missions/plan");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/work-sessions"].GET, "/work-sessions");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/approvals"].GET, "/approvals");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/actions/dry-run"].POST, "/actions/dry-run");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/proofs"].GET, "/proof/recent");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/client-capabilities"].GET, "/client-capabilities");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/intake/upload"].POST, "/intake/upload");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/projects"].POST, "/projects");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/voice-operator/status"].GET, "/voice-operator/status");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/runtime/baselines"].POST, "/runtime/baselines");
  assert.equal(CANONICAL_OPERATIONAL_ROUTES["/api/operations/knowledge/promotions"].POST, "/knowledge/promotions");

  const portableMutations = [
    ["/work-sessions/plan", "/work-sessions/plan", { objective: "Plan a bounded verification." }],
    ["/work-sessions/start", "/work-sessions/start", { objective: "Start a bounded verification." }],
    ["/work-sessions/WORK-001/step", "/work-sessions/WORK-001/step", {}],
    ["/work-sessions/WORK-001/continue", "/work-sessions/WORK-001/continue", {}],
    ["/work-sessions/WORK-001/pause", "/work-sessions/WORK-001/pause", {}],
    ["/work-sessions/WORK-001/cancel", "/work-sessions/WORK-001/cancel", {}],
    ["/approvals/APPROVAL-001/approve", "/approvals/APPROVAL-001/approve", {}],
    ["/approvals/APPROVAL-002/deny", "/approvals/APPROVAL-002/deny", { reason: "Required Evidence is absent." }],
    ["/actions/dry-run", "/actions/dry-run", { action: "Inspect the bounded target." }],
    ["/actions/execute", "/actions/execute", { action: "Execute the bounded target.", explicitRequest: true }],
  ];
  for (const [index, [portalPath, runtimePath, payload]] of portableMutations.entries()) {
    const key = `portable-operation-${String(index + 1).padStart(4, "0")}`;
    const response = await fetch(`${base}/api/operations${portalPath}`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": session.session.csrfToken,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 200, portalPath);
    assert.equal(observed.at(-1).url, `http://127.0.0.1:9876${runtimePath}`, portalPath);
    assert.equal(observed.at(-1).options.headers["Idempotency-Key"], key, portalPath);
    assert.deepEqual(JSON.parse(observed.at(-1).options.body), payload, portalPath);
  }

  const baselineKey = "runtime-baseline-0001";
  const baseline = await fetch(`${base}/api/operations/runtime/baselines`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": baselineKey,
    },
    body: JSON.stringify({ expectedDeployedCommit: "0123456789abcdef0123456789abcdef01234567" }),
  });
  assert.equal(baseline.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/runtime/baselines");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], baselineKey);
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), {
    expectedDeployedCommit: "0123456789abcdef0123456789abcdef01234567",
  });

  const promotionKey = "knowledge-promotion-0001";
  const promotion = await fetch(`${base}/api/operations/knowledge/promotions`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": promotionKey,
    },
    body: JSON.stringify({ candidateId: "candidate-runtime-baseline-001" }),
  });
  assert.equal(promotion.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/knowledge/promotions");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], promotionKey);
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Scopes"], config.operationalScopes.join(","));
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), { candidateId: "candidate-runtime-baseline-001" });

  const candidateKey = "promotion-candidate-0001";
  const candidate = await fetch(`${base}/api/operations/knowledge/acquisitions/MISSION-001/promotion-candidates`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": candidateKey,
    },
    body: JSON.stringify({ expectedMissionVersion: 7 }),
  });
  assert.equal(candidate.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/knowledge/acquisitions/MISSION-001/promotion-candidates");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], candidateKey);
  assert.deepEqual(JSON.parse(observed.at(-1).options.body), { expectedMissionVersion: 7 });

  const callsBeforeRejectedMutations = observed.length;
  assert.equal((await fetch(`${base}/api/operations/runtime/baselines`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": "runtime-baseline-0002" },
    body: JSON.stringify({ expectedDeployedCommit: "0123456789abcdef0123456789abcdef01234567" }),
  })).status, 403);
  assert.equal((await fetch(`${base}/api/operations/knowledge/promotions`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": "knowledge-promotion-0002",
    },
    body: JSON.stringify({ candidateId: "candidate-runtime-baseline-001", tenantId: "browser-tenant" }),
  })).status, 403);
  assert.equal((await fetch(`${base}/api/operations/knowledge/acquisitions/MISSION-001/promotion-candidates`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": "promotion-candidate-0002",
    },
    body: JSON.stringify({ expectedMissionVersion: { metadata: { tenantId: "browser-tenant" } } }),
  })).status, 403);
  assert.equal(observed.length, callsBeforeRejectedMutations);
});

test("hosted Document, Project, and Voice workspaces use authenticated Runtime-owned contracts", async () => {
  const observed = [];
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: ["operations:read", "operations:write", "evidence:write"],
    operationalCookieSecure: false,
  };
  const base = await start(
    async () => runtimeResponse({}),
    config,
    async () => localResponse({ fabricatedLocalFallback: true }),
    async (url, options) => {
      observed.push({ url, options });
      return localResponse({ recordType: "workspace_runtime_result", secretValuesExposed: false });
    },
  );
  assert.equal((await fetch(`${base}/api/operations/client-capabilities`)).status, 401);
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey: config.operationalAccessKey }),
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const mutationHeaders = (key) => ({
    Cookie: cookie,
    "Content-Type": "application/json",
    "X-CSRF-Token": session.session.csrfToken,
    "Idempotency-Key": key,
  });

  assert.equal((await fetch(`${base}/api/operations/intake/upload`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": "intake-upload-0000" },
    body: JSON.stringify({ filename: "requirements.txt", contentBase64: "SGVsbG8=" }),
  })).status, 403);
  assert.equal((await fetch(`${base}/api/operations/intake/upload`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken },
    body: JSON.stringify({ filename: "requirements.txt", contentBase64: "SGVsbG8=" }),
  })).status, 400);

  const operations = [
    ["/intake/upload", "/intake/upload", "intake-upload-0001", { filename: "requirements.txt", contentBase64: "SGVsbG8=", projectId: "PROJECT-001" }],
    ["/intake/query", "/intake/query", "intake-query-0001", { question: "What requirements are supported?", projectId: "PROJECT-001" }],
    ["/projects", "/projects", "project-create-0001", { name: "Project Alpha" }],
    ["/projects/PROJECT-001/compile", "/projects/PROJECT-001/compile", "project-compile-0001", { artifactType: "roadmap", options: { defaultPhaseDurationWeeks: 2, assumptions: [] } }],
    ["/voice-operator/route-transcript", "/voice-operator/route-transcript", "voice-route-0001", { transcript: "Summarize project Alpha", source: "text_fallback" }],
  ];
  for (const [portalPath, runtimePath, key, body] of operations) {
    const response = await fetch(`${base}/api/operations${portalPath}`, {
      method: "POST",
      headers: mutationHeaders(key),
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, portalPath);
    const call = observed.at(-1);
    assert.equal(call.url, `http://127.0.0.1:9876${runtimePath}`, portalPath);
    assert.equal(call.options.headers["Idempotency-Key"], key, portalPath);
    assert.equal(call.options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha", portalPath);
    assert.equal(call.options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha", portalPath);
    assert.deepEqual(JSON.parse(call.options.body), body, portalPath);
  }

  const callsBeforeRejectedIdentity = observed.length;
  assert.equal((await fetch(`${base}/api/operations/projects`, {
    method: "POST",
    headers: mutationHeaders("project-create-0002"),
    body: JSON.stringify({ name: "Project Beta", tenantId: "browser-selected" }),
  })).status, 403);
  assert.equal(observed.length, callsBeforeRejectedIdentity);
});

test("Document query requires operations read without borrowing upload or write scope", async () => {
  const observed = [];
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "operator",
    operationalScopes: ["operations:read"],
    operationalCookieSecure: false,
  };
  const base = await start(
    async () => runtimeResponse({}),
    config,
    async () => localResponse({}),
    async (url, options) => {
      observed.push({ url, options });
      return localResponse({
        status: "completed",
        answer: "The bounded source answer.",
        secretValuesExposed: false,
      });
    },
  );
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey: config.operationalAccessKey }),
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const headers = {
    Cookie: cookie,
    "Content-Type": "application/json",
    "X-CSRF-Token": session.session.csrfToken,
    "Idempotency-Key": "intake-query-read-scope-0001",
  };
  const query = await fetch(`${base}/api/operations/intake/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ question: "What is supported by the source?" }),
  });
  assert.equal(query.status, 200);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].url, "http://127.0.0.1:9876/intake/query");
  assert.equal(observed[0].options.headers["X-NEXUS-Scopes"], "operations:read");
  const upload = await fetch(`${base}/api/operations/intake/upload`, {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "intake-upload-read-scope-0001" },
    body: JSON.stringify({ filename: "requirements.txt", contentBase64: "SGVsbG8=" }),
  });
  assert.equal(upload.status, 403);
  assert.equal(observed.length, 1);
});

test("hosted Knowledge intake is canonical, scoped, CSRF-protected, idempotent, and server-bound", async () => {
  const observed = [];
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: ["operations:read", "evidence:write"],
    operationalCookieSecure: false,
  };
  const base = await start(async () => runtimeResponse({}), config, async () => localResponse({}), async (url, options) => {
    observed.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return localResponse({ recordType: "nexus_knowledge_intake_result", evidenceId: "EVIDENCE-001", secretValuesExposed: false }, 201);
  });
  const payload = {
    missionId: "MISSION-001",
    taskId: "TASK-001",
    origin: "runtime://edge-node/observation-001",
    sourceClassification: "runtime_evidence",
    confidence: 0.94,
    claim: "The authenticated Runtime admitted this evidence-bound observation.",
    supportingArtifacts: ["OBSERVATION-001"],
    relationships: ["supports"],
    operationalContext: { observationType: "runtime_state" },
    completeTask: false,
  };
  assert.equal((await fetch(`${base}/api/operations/knowledge/intake`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  })).status, 401);
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey }),
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${base}/api/operations/knowledge/intake`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": "knowledge-intake-0001" }, body: JSON.stringify(payload),
  })).status, 403);
  assert.equal((await fetch(`${base}/api/operations/knowledge/intake`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken }, body: JSON.stringify(payload),
  })).status, 400);
  const response = await fetch(`${base}/api/operations/knowledge/intake`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": "knowledge-intake-0001",
      "X-NEXUS-Tenant-ID": "browser-tenant",
      "X-NEXUS-Workspace-ID": "browser-workspace",
    },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/knowledge/intake");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], "knowledge-intake-0001");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha");
  assert.deepEqual(observed.at(-1).body, payload);
  const callsBeforeRejected = observed.length;
  const rejected = await fetch(`${base}/api/operations/knowledge/intake`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": "knowledge-intake-0002" },
    body: JSON.stringify({ ...payload, authorityGrantId: "browser-invented-authority" }),
  });
  assert.equal(rejected.status, 403);
  assert.equal(observed.length, callsBeforeRejected);
  for (const operationalContext of [
    { verificationState: "VERIFIED" },
    { verified: true },
    { principalRole: "admin" },
    { nested: { authorizationRole: "approver" } },
  ]) {
    const denied = await fetch(`${base}/api/operations/knowledge/intake`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": `knowledge-intake-${globalThis.crypto.randomUUID()}` },
      body: JSON.stringify({ ...payload, operationalContext }),
    });
    assert.equal(denied.status, 403);
  }
  const invalidIdempotency = await fetch(`${base}/api/operations/knowledge/intake`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": "knowledge@intake@0004" },
    body: JSON.stringify(payload),
  });
  assert.equal(invalidIdempotency.status, 400);
  assert.equal(observed.length, callsBeforeRejected);
  const badOrigin = await fetch(`${base}/api/operations/knowledge/intake`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: "https://untrusted.invalid", "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": "knowledge-intake-0003" },
    body: JSON.stringify(payload),
  });
  assert.equal(badOrigin.status, 403);
  assert.equal(observed.length, callsBeforeRejected);
});

test("canonical hosted failures retain structured reasons while upstream secrets are removed", async () => {
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalCookieSecure: false,
  };
  let fail = false;
  const base = await start(async () => runtimeResponse({}), config, async () => localResponse({}), async () => fail
    ? localResponse({
      recordType: "nexus_capability_unavailable", error: "capability_unavailable", capabilityId: "knowledge_store",
      state: "unavailable", reason: "Mandatory dependencies are unavailable.", missingDependencies: ["knowledgeGraph"],
      retryable: true, requiredNextAction: "Restore and verify knowledgeGraph.", sessionSecret: "must-not-reach-browser",
      secretValuesExposed: false,
    }, 503)
    : localResponse({
      recordType: "nexus_operational_replay_list", replays: [], runtimeToken: "must-not-reach-browser",
      token: "must-not-reach-browser", accessToken: "must-not-reach-browser", refreshToken: "must-not-reach-browser",
      authorization: "must-not-reach-browser", secret: "must-not-reach-browser", signingKey: "must-not-reach-browser",
      secretValuesExposed: false,
    }));
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const replayText = await (await fetch(`${base}/api/operations/operational-replay`, { headers: { Cookie: cookie } })).text();
  assert.equal(replayText.includes("must-not-reach-browser"), false);
  fail = true;
  const unavailable = await fetch(`${base}/api/operations/knowledge/store`, { headers: { Cookie: cookie } });
  const body = await unavailable.json();
  assert.equal(unavailable.status, 503);
  assert.equal(body.error.code, "capability_unavailable");
  assert.deepEqual(body.error.details.missingDependencies, ["knowledgeGraph"]);
  assert.equal(body.error.details.requiredNextAction, "Restore and verify knowledgeGraph.");
  assert.equal(JSON.stringify(body).includes("must-not-reach-browser"), false);
});

test("absent service-worker and manifest routes fail closed without SPA fallback", async () => {
  const base = await start(async () => runtimeResponse({}));
  for (const path of ["/service-worker.js", "/sw.js", "/manifest.json", "/manifest.webmanifest"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
    assert.equal(await response.text(), "Not found", path);
  }
});

test("hosted Runtime Coordination keeps fleet reads and requires the admission request scope", async () => {
  const observed = [];
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: ["operations:read"],
    operationalCookieSecure: false
  };
  const base = await start(async () => runtimeResponse({}), config, async () => localResponse({}), async (url, options) => {
    observed.push({ url, options });
    return localResponse({ recordType: "runtime_node_fleet", nodes: [], summary: {}, limitations: [], secretValuesExposed: false });
  });
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey })
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const listed = await fetch(`${base}/api/operations/runtime-coordination/nodes`, { headers: { Cookie: cookie } });
  assert.equal(listed.status, 200);
  assert.equal(observed[0].url, "http://127.0.0.1:9876/runtime-coordination/nodes");
  assert.equal(observed[0].options.headers["X-NEXUS-User-ID"], "operator-1");
  assert.equal(observed[0].options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.equal(observed[0].options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha");
  assert.equal(observed[0].options.headers["X-NEXUS-Role"], "admin");
  assert.equal(observed[0].options.headers["X-NEXUS-Scopes"], "operations:read");
  const denied = await fetch(`${base}/api/operations/runtime-coordination/admissions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": "edge-admission:request-001" },
    body: JSON.stringify({})
  });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "scope_denied");
  const reviewDenied = await fetch(`${base}/api/operations/runtime-coordination/admissions/ADMISSION-001/challenge/reissue`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": "edge-admission:review-001" },
    body: JSON.stringify({ expectedVersion: 1, reason: "Review permission must be independently verified." }),
  });
  assert.equal(reviewDenied.status, 403);
  assert.equal((await reviewDenied.json()).error.code, "scope_denied");
  const promotionDenied = await fetch(`${base}/api/operations/knowledge/promotions`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": "knowledge-promotion-0003",
    },
    body: JSON.stringify({ candidateId: "candidate-runtime-baseline-001" }),
  });
  assert.equal(promotionDenied.status, 403);
  assert.equal((await promotionDenied.json()).error.code, "scope_denied");
  const intakeDenied = await fetch(`${base}/api/operations/knowledge/intake`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.session.csrfToken,
      "Idempotency-Key": "knowledge-intake-denied-0001",
    },
    body: JSON.stringify({
      missionId: "MISSION-001", taskId: "TASK-001", origin: "runtime://observation/1",
      sourceClassification: "runtime_evidence", confidence: 1, claim: "Bounded claim",
      supportingArtifacts: [], relationships: [], operationalContext: {}, completeTask: false,
    }),
  });
  assert.equal(intakeDenied.status, 403);
  assert.equal((await intakeDenied.json()).error.code, "scope_denied");
  assert.equal(observed.length, 1);
});

test("hosted admission proxy derives identity, preserves one idempotency key, and excludes node proof ingress", async () => {
  const observed = [];
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "operator-1",
    operationalRole: "admin",
    operationalScopes: ["operations:read", "edge:node_admission:request", "edge:node_admission:review"],
    operationalCookieSecure: false
  };
  const base = await start(async () => runtimeResponse({}), config, async () => localResponse({}), async (url, options) => {
    observed.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return localResponse({
      recordType: "nexus_edge_node_admission", admissionRequestId: "ADMISSION-001", missionId: "MISSION-EDGE-001",
      intent: { displayName: "Plant gateway east", nodeClass: "edge_runtime_node", requestedCapabilities: ["nexus.edge.runtime.host"], operationalPurpose: "Governed operations" },
      lifecycleState: "CHALLENGE_ISSUED", challenge: { state: "issued", challengeId: "raw-one-time-value" },
      credentialRef: "must-not-reach-browser", secretValuesExposed: false
    });
  });
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey })
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const key = "edge-admission:request-001";
  const intent = {
    missionId: "MISSION-EDGE-001",
    intent: {
      displayName: "Plant gateway east", nodeClass: "edge_runtime_node",
      requestedCapabilities: ["nexus.edge.runtime.host"], operationalPurpose: "Governed operations",
      evidenceRefs: []
    },
    idempotencyKey: key
  };
  const created = await fetch(`${base}/api/operations/runtime-coordination/admissions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": key },
    body: JSON.stringify(intent)
  });
  assert.equal(created.status, 200);
  const createdText = await created.text();
  assert.equal(createdText.includes("raw-one-time-value"), false);
  assert.equal(createdText.includes("must-not-reach-browser"), false);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/runtime-coordination/admissions");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], key);
  assert.equal(observed.at(-1).options.headers["X-NEXUS-User-ID"], "operator-1");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Tenant-ID"], "tenant-alpha");
  assert.equal(observed.at(-1).options.headers["X-NEXUS-Workspace-ID"], "workspace-alpha");
  assert.equal("idempotencyKey" in observed.at(-1).body, false);
  assert.deepEqual(observed.at(-1).body, { missionId: intent.missionId, intent: intent.intent });

  const reissueKey = "edge-admission:review-001";
  const reissued = await fetch(`${base}/api/operations/runtime-coordination/admissions/ADMISSION-001/challenge/reissue`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": reissueKey },
    body: JSON.stringify({ expectedVersion: 1, reason: "Issue a governed replacement challenge." }),
  });
  assert.equal(reissued.status, 200);
  assert.equal(observed.at(-1).url, "http://127.0.0.1:9876/runtime-coordination/admissions/ADMISSION-001/challenge/reissue");
  assert.equal(observed.at(-1).options.headers["Idempotency-Key"], reissueKey);

  const callCount = observed.length;
  const trusted = await fetch(`${base}/api/operations/runtime-coordination/admissions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": key },
    body: JSON.stringify({ ...intent, tenantId: "browser-tenant" })
  });
  assert.equal(trusted.status, 403);
  const mismatch = await fetch(`${base}/api/operations/runtime-coordination/admissions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": key },
    body: JSON.stringify({ ...intent, idempotencyKey: "edge-admission:different" })
  });
  assert.equal(mismatch.status, 400);
  assert.equal((await fetch(`${base}/api/operations/runtime-coordination/admissions/ADMISSION-001/claim`, { headers: { Cookie: cookie } })).status, 404);
  assert.equal((await fetch(`${base}/api/operations/runtime-coordination/admissions/ADMISSION-001/proof`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": "edge-admission:proof-001" }, body: "{}"
  })).status, 404);
  assert.equal(observed.length, callCount);
});

test("hosted mode cannot coexist with local or legacy Replay gateways", () => {
  const hosted = {
    runtimeBaseUrl: "https://runtime.invalid",
    runtimeToken: "server-only-test-token",
    operationalEnabled: true,
    operationalApiBaseUrl: "https://nexus-runtime-dev.fly.dev",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
  };
  assert.throws(() => loadConfig({ ...hosted, localCapabilitiesEnabled: true }), /cannot coexist/);
  assert.throws(() => loadConfig({ ...hosted, replayEnabled: true }), /cannot coexist/);
});

test("published Replit mode requires its private domain boundary and no operator access key", () => {
  const hosted = {
    runtimeBaseUrl: "https://runtime.invalid",
    runtimeToken: "server-only-test-token",
    operationalEnabled: true,
    operationalApiBaseUrl: "https://nexus-runtime-dev.fly.dev",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    replitDeployment: true,
    replitDomains: "command-portal.replit.app",
  };
  const config = loadConfig(hosted);
  assert.equal(config.operationalSessionMode, "automatic_private_workspace");
  assert.equal(config.operationalPrincipalType, "workspace_service");
  assert.equal(config.operationalAccessBasis, "replit_private_deployment");
  assert.equal(config.operationalAccessKey, "automatic-session-no-access-key");
  assert.deepEqual(config.replitDomains, ["command-portal.replit.app"]);

  assert.throws(
    () => loadConfig({ ...hosted, replitDomains: "" }),
    /Automatic hosted sessions require/,
  );
  assert.throws(
    () => loadConfig({ ...hosted, replitDeployment: false, operationalSessionMode: "automatic_private_workspace" }),
    /Automatic hosted sessions require/,
  );
  assert.throws(
    () => loadConfig({ ...hosted, operationalCookieSecure: false }),
    /Automatic hosted sessions require/,
  );
});

test("private Replit ingress automatically establishes one server-derived workspace session", async () => {
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalTenantId: "tenant-alpha",
    operationalWorkspaceId: "workspace-alpha",
    operationalUserId: "nexus-workspace-service",
    operationalRole: "operator",
    operationalScopes: ["operations:read", "operations:write", "evidence:write"],
    operationalCookieSecure: true,
    replitDeployment: true,
    replitDomains: "command-portal.replit.app",
  };
  const base = await start(async () => runtimeResponse({}), config, async () => localResponse({}), async () => localResponse({ connected: true }));
  const trustedHeaders = {
    Host: "command-portal.replit.app",
    "X-Forwarded-Host": "command-portal.replit.app",
    "X-Forwarded-Proto": "https",
    "Sec-Fetch-Site": "same-origin",
  };

  const status = await fetch(`${base}/api/session`, { headers: trustedHeaders });
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.session.authenticated, true);
  assert.equal(body.session.userId, "nexus-workspace-service");
  assert.equal(body.session.tenantId, "tenant-alpha");
  assert.equal(body.session.workspaceId, "workspace-alpha");
  assert.equal(body.session.role, "operator");
  assert.deepEqual(body.session.scopes, ["operations:read", "operations:write", "evidence:write"]);
  assert.equal(body.session.connectionMode, "automatic_private_workspace");
  assert.equal(body.session.principalType, "workspace_service");
  assert.equal(body.session.accessBasis, "replit_private_deployment");
  assert.equal(body.session.managed, true);
  const cookie = status.headers.get("set-cookie").split(";")[0];
  assert.equal(cookie.includes("operator"), false);

  const repeated = await fetch(`${base}/api/session`, { headers: { ...trustedHeaders, Cookie: cookie } });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.headers.get("set-cookie"), null);
  assert.equal((await repeated.json()).session.csrfToken, body.session.csrfToken);

  const operation = await fetch(`${base}/api/operations/capabilities/readiness`, {
    headers: { ...trustedHeaders, Cookie: cookie },
  });
  assert.equal(operation.status, 200);
  assert.equal((await operation.json()).operational.userId, "nexus-workspace-service");

  const keyLogin = await fetch(`${base}/api/session/login`, {
    method: "POST",
    headers: { ...trustedHeaders, Origin: "https://command-portal.replit.app", "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey: "browser-key-must-not-be-accepted" }),
  });
  assert.equal(keyLogin.status, 404);
});

test("automatic workspace issuance fails closed outside the exact private Replit ingress", async () => {
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalCookieSecure: true,
    replitDeployment: true,
    replitDomains: "command-portal.replit.app",
  };
  const base = await start(async () => runtimeResponse({}), config);
  const valid = {
    Host: "command-portal.replit.app",
    "X-Forwarded-Host": "command-portal.replit.app",
    "X-Forwarded-Proto": "https",
    "Sec-Fetch-Site": "same-origin",
  };
  const attempts = [
    {},
    { ...valid, Host: "lookalike.replit.app", "X-Forwarded-Host": "lookalike.replit.app" },
    { ...valid, "X-Forwarded-Proto": "http" },
    { ...valid, "Sec-Fetch-Site": "cross-site" },
  ];
  for (const headers of attempts) {
    const response = await fetch(`${base}/api/session`, { headers });
    assert.equal(response.status, 401, JSON.stringify(headers));
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("secure hosted mutations require an exact same-origin Origin header", async () => {
  const config = {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalCookieSecure: true,
    operationalScopes: ["operations:read", "operations:write"],
  };
  const base = await start(async () => runtimeResponse({}), config, async () => localResponse({}), async () => localResponse({ recordType: "nexus_conclave_workspace" }, 201));
  const missing = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey }),
  });
  assert.equal(missing.status, 403);
  const wrong = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { Origin: "https://untrusted.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey }),
  });
  assert.equal(wrong.status, 403);
  const login = await fetch(`${base}/api/session/login`, {
    method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: config.operationalAccessKey }),
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${base}/api/operations/conclave/workspaces`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": "strict-origin-missing-001" },
    body: JSON.stringify({ proposal: "Origin verification must fail closed." }),
  })).status, 403);
  assert.equal((await fetch(`${base}/api/operations/conclave/workspaces`, {
    method: "POST",
    headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": session.session.csrfToken, "Idempotency-Key": "strict-origin-valid-001" },
    body: JSON.stringify({ proposal: "Origin verification is enforced." }),
  })).status, 200);
});

test("hosted operational gateway is disabled by default and rejects arbitrary forwarding", async () => {
  const disabled = await start(async () => runtimeResponse({}));
  assert.equal((await fetch(`${disabled}/api/session`)).status, 503);
  const configured = await start(async () => runtimeResponse({}), {
    operationalEnabled: true,
    operationalApiBaseUrl: "http://127.0.0.1:9876",
    operationalRuntimeToken: "runtime-token-at-least-24-characters",
    operationalSessionSecret: "session-secret-at-least-thirty-two-characters",
    operationalAccessKey: "operator-access-key-strong",
    operationalCookieSecure: false
  });
  const login = await fetch(`${configured}/api/session/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: "operator-access-key-strong" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${configured}/api/operations/arbitrary`, { headers: { Cookie: cookie } })).status, 404);
});

test("registered unavailable Replay aliases never forward to legacy Runtime paths", async () => {
  const observed = [];
  const base = await start(async (url, options) => {
    observed.push({ url, options });
    return runtimeResponse({ replay: true });
  });
  const list = await fetch(`${base}/api/runtime/replay`, { headers: { "Cache-Control": "no-cache" } });
  assert.equal(list.status, 503);
  assert.equal((await list.json()).error.code, "canonical_action_unavailable");
  const detail = await fetch(`${base}/api/runtime/replay/REPLAY-001`);
  assert.equal(detail.status, 503);
  assert.equal((await detail.json()).error.code, "canonical_action_unavailable");
  const events = await fetch(`${base}/api/runtime/replay/REPLAY-001/events`);
  assert.equal(events.status, 503);
  assert.equal((await events.json()).error.code, "canonical_action_unavailable");
  const explain = await fetch(`${base}/api/runtime/replay/REPLAY-001/stages/observation/explain`);
  assert.equal(explain.status, 503);
  assert.equal((await explain.json()).error.code, "canonical_action_unavailable");
  const priorCalls = observed.length;
  assert.equal((await fetch(`${base}/api/runtime/replay/REPLAY-001/stages/invalid-stage/explain`)).status, 404);
  assert.equal((await fetch(`${base}/api/runtime/replay/REPLAY-001/stages/observation/explain/extra`)).status, 404);
  assert.equal((await fetch(`${base}/api/runtime/replay/bad%2F..%2Fpath`)).status, 404);
  assert.equal((await fetch(`${base}/api/runtime/replay/REPLAY-001?limit=5`)).status, 400);
  assert.equal((await fetch(`${base}/api/runtime/replay/REPLAY-001`, { method: "POST" })).status, 405);
  assert.equal(priorCalls, 0);
  assert.equal(observed.length, priorCalls);
});
