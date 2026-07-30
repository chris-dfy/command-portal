import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import {
  CAPABILITY_REGISTRY_RECORD_TYPE,
  CAPABILITY_REGISTRY_SCHEMA_VERSION,
  createPortalServer,
  deriveMission3Admission,
  MISSION3_SESSION_CAPABILITIES,
  MISSION3_SESSION_ESTABLISHMENT_RECEIPT_TYPE,
} from "../server/portal-server.mjs";

const servers = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))));

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function resign(projection) {
  delete projection.projectionDigest;
  const digestBasis = Object.fromEntries(
    Object.entries(projection).filter(([key]) => key !== "projectionDigest"),
  );
  projection.projectionDigest = `sha256:${createHash("sha256").update(canonicalJson(digestBasis), "utf8").digest("hex")}`;
  return projection;
}

const GITHUB_AUTHORIZATION = (
  "Fine-grained GitHub token scoped only to chris-dfy/nexus-assistant: "
  + "Metadata read (implicit), Contents read, Actions read."
);
const GITHUB_LIMITATIONS = Object.freeze([
  "Read-only repository metadata, exact deployed-commit, and Actions workflow-run inspection only.",
  "The token is restricted to chris-dfy/nexus-assistant with Metadata read (implicit), Contents read, and Actions read only.",
  "Connector health never grants execution Authority.",
]);
const GITHUB_RECEIPT_ID = "CONN-VERIFY-TEST-GITHUB";

function baseLiveProjection(generatedAt = new Date().toISOString()) {
  const projection = {
    recordType: CAPABILITY_REGISTRY_RECORD_TYPE,
    schemaVersion: CAPABILITY_REGISTRY_SCHEMA_VERSION,
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
    scope: { tenantId: "nexicron", workspaceId: "primary", derivedByRuntime: true },
    classificationVocabulary: [
      "live_verified", "live_degraded", "configured_unverified", "staged", "simulated", "unavailable",
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
      actionCount: 1,
      verificationReceiptCount: 1,
      actionClassifications: { live_verified: 1 },
    },
    capabilityCount: 1,
    connectorCount: 1,
    actionCount: 1,
    receiptCount: 1,
    capabilities: [{
      capabilityId: "observe.github_repository_ci",
      classification: "live_verified",
      operationalAvailability: true,
      authorityGranted: false,
      availabilityIndependent: true,
      evidenceRefs: [`runtime-evidence:${GITHUB_RECEIPT_ID}`],
      receiptRefs: [`connector-receipt:${GITHUB_RECEIPT_ID}`],
      limitations: [...GITHUB_LIMITATIONS],
      requiredNextAction: "No connector remediation is required.",
    }],
    connectors: [{
      connectorId: "github",
      classification: "live_verified",
      registration: "registered",
      configuration: "configured",
      reachability: "reachable",
      verification: "verified",
      health: "healthy",
      operationalAvailability: "available",
      authorizationRequirement: GITHUB_AUTHORIZATION,
      authorityGranted: false,
      lastSuccessfulVerification: generatedAt,
      verificationFresh: true,
      freshness: { policySeconds: 300, ageSeconds: 0, state: "current" },
      evidenceReferences: [`runtime-evidence:${GITHUB_RECEIPT_ID}`],
      receiptReferences: [`connector-receipt:${GITHUB_RECEIPT_ID}`],
      limitations: [...GITHUB_LIMITATIONS],
      requiredNextAction: "No connector remediation is required.",
    }],
    actions: [{
      actionId: "github.repository.read",
      capabilityId: "observe.github_repository_ci",
      connectorId: "github",
      handlerId: "connectors.github.verify_repository",
      operationId: "github.repository.read",
      inputSchemaId: "contracts/capabilities/capability-registry-projection.schema.json#/$defs/githubRepositoryReadInput",
      method: "GET",
      fixedTarget: "https://api.github.com/repos/chris-dfy/nexus-assistant",
      invocationSurfaces: ["api", "assistant", "ui", "voice", "model_tool"],
      invocationPaths: ["api", "assistant", "ui", "voice", "model_tool"],
      classification: "live_verified",
      operationalAvailability: true,
      invocable: true,
      authorizationRequirement: GITHUB_AUTHORIZATION,
      authorityGranted: false,
      receiptRefs: [`connector-receipt:${GITHUB_RECEIPT_ID}`],
      limitations: [...GITHUB_LIMITATIONS],
      requiredNextAction: "No connector remediation is required.",
    }],
    verificationReceipts: [{
      receiptId: GITHUB_RECEIPT_ID,
      receiptType: "connector_read_only_verification",
      connectorId: "github",
      verifiedAt: generatedAt,
      successful: true,
      evidenceRefs: [`runtime-evidence:${GITHUB_RECEIPT_ID}`],
      sanitized: true,
      secretValuesExposed: false,
    }],
    executiveContinuity: {
      impediments: [],
      impedimentClassificationVocabulary: [
        "hard_blocking", "safely_remediable", "non_blocking_degraded", "operator_action_required",
      ],
      impedimentCount: 0,
      remediationActionCount: 0,
      remediationActions: [],
      duplicateIdentitiesRejected: true,
      dispatchAvailable: false,
      authorityGranted: false,
    },
    limitations: ["Read-only observation projection for admission tests."],
    secretValuesExposed: false,
  };
  return resign(projection);
}

const sessionReceiptId = (capabilityId) => `SESSION-ESTABLISH-${capabilityId.split(".").pop().toUpperCase()}`;

function sessionCapability(capabilityId, verifiedAt) {
  const receiptRef = `connector-receipt:${sessionReceiptId(capabilityId)}`;
  return {
    capabilityId,
    classification: "live_verified",
    operationalAvailability: true,
    verification: "verified",
    verificationFresh: true,
    lastSuccessfulVerification: verifiedAt,
    authorityGranted: false,
    availabilityIndependent: true,
    evidenceRefs: [`runtime-evidence:${sessionReceiptId(capabilityId)}`],
    receiptRefs: [receiptRef],
    limitations: ["Registered executive session capability grants no execution Authority."],
    requiredNextAction: "No session remediation is required.",
  };
}

function sessionAction(capabilityId, verifiedAt) {
  const suffix = capabilityId.split(".").pop();
  return {
    actionId: `executive_session.action.${suffix}`,
    capabilityId,
    connectorId: "replit-auth",
    handlerId: `executive_session.gateway.${suffix}`,
    operationId: `executive_session.gateway.${suffix}`,
    inputSchemaId: `contracts.capabilities.executiveSession.${suffix}Input`,
    method: "POST",
    invocationSurfaces: ["api", "ui"],
    invocationPaths: ["api", "ui"],
    classification: "live_verified",
    operationalAvailability: true,
    invocable: true,
    authorizationRequirement: "Mission 3 registered executive session; no execution Authority is granted.",
    authorityGranted: false,
    lastSuccessfulVerification: verifiedAt,
    receiptRefs: [`connector-receipt:${sessionReceiptId(capabilityId)}`],
    limitations: ["The typed session action is bounded by the Mission 3 contract."],
    requiredNextAction: "No Gateway remediation is required.",
  };
}

function sessionReceipt(capabilityId, verifiedAt) {
  return {
    receiptId: sessionReceiptId(capabilityId),
    receiptType: MISSION3_SESSION_ESTABLISHMENT_RECEIPT_TYPE,
    connectorId: "replit-auth",
    verifiedAt,
    successful: true,
    evidenceRefs: [`runtime-evidence:${sessionReceiptId(capabilityId)}`],
    sanitized: true,
    secretValuesExposed: false,
  };
}

function admittedProjection({ generatedAt = new Date().toISOString(), mutate } = {}) {
  const projection = baseLiveProjection(generatedAt);
  for (const capabilityId of MISSION3_SESSION_CAPABILITIES) {
    projection.capabilities.push(sessionCapability(capabilityId, generatedAt));
    projection.actions.push(sessionAction(capabilityId, generatedAt));
    projection.verificationReceipts.push(sessionReceipt(capabilityId, generatedAt));
  }
  projection.mission3Admitted = true;
  if (mutate) mutate(projection);
  projection.capabilityCount = projection.capabilities.length;
  projection.actionCount = projection.actions.length;
  projection.receiptCount = projection.verificationReceipts.length;
  projection.summary = {
    capabilityCount: projection.capabilities.length,
    connectorCount: projection.connectors.length,
    actionCount: projection.actions.length,
    verificationReceiptCount: projection.verificationReceipts.length,
    actionClassifications: projection.actions.reduce((counts, action) => ({
      ...counts,
      [action.classification]: (counts[action.classification] ?? 0) + 1,
    }), {}),
  };
  return resign(projection);
}

async function start(projection) {
  const runtimeFetch = async (url) => new Response(JSON.stringify({
    status: "ok",
    timestamp: "2026-07-30T00:00:00Z",
    schemaVersion: "1.0.0",
    runtimeVersion: "0.1.0",
    proofIds: ["runtime-proof-1"],
    limitations: ["read only"],
    data: url.endsWith("/runtime/capability-registry") ? projection : { observed: true },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const server = createPortalServer({
    config: {
      port: 0,
      runtimeBaseUrl: "https://runtime.invalid",
      runtimeToken: "server-only-test-token",
      timeoutMs: 30,
      cacheTtlMs: 500,
      maxAttempts: 1,
      retryDelayMs: 0,
    },
    runtimeFetch,
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

const fetchRegistry = async (base) => fetch(`${base}/api/runtime/capability-registry`, {
  headers: { "Cache-Control": "no-cache" },
});

test("mission3Admitted is true only under the full per-capability session-establishment conjunction", async () => {
  const projection = admittedProjection();
  assert.equal(deriveMission3Admission(projection), true);
  const base = await start(projection);
  const response = await fetchRegistry(base);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.mission3Admitted, true);
  assert.equal(typeof body.data.mission3Admitted, "boolean");
});

test("capability health and admission never imply Authority", async () => {
  const projection = admittedProjection();
  const base = await start(projection);
  const body = await (await fetchRegistry(base)).json();
  assert.equal(body.data.mission3Admitted, true);
  assert.equal(body.data.authorityGranted, false);
  assert.equal(body.data.authority.authorityGranted, false);
  assert.equal(body.data.authority.healthyCapabilityImpliesAuthority, false);
  assert.equal(body.data.capabilityHealthGrantsAuthority, false);
  assert.ok(body.data.actions.every((action) => action.authorityGranted === false));
});

test("session evidence older than 300 seconds yields mission3Admitted=false", () => {
  const now = Date.now();
  const staleAt = new Date(now - 301_000).toISOString();
  const projection = admittedProjection({
    generatedAt: new Date(now).toISOString(),
    mutate: (candidate) => {
      for (const capability of candidate.capabilities) {
        if (MISSION3_SESSION_CAPABILITIES.includes(capability.capabilityId)) {
          capability.lastSuccessfulVerification = staleAt;
        }
      }
      for (const action of candidate.actions) {
        if (MISSION3_SESSION_CAPABILITIES.includes(action.capabilityId)) {
          action.lastSuccessfulVerification = staleAt;
        }
      }
      for (const receipt of candidate.verificationReceipts) {
        if (receipt.receiptType === MISSION3_SESSION_ESTABLISHMENT_RECEIPT_TYPE) {
          receipt.verifiedAt = staleAt;
        }
      }
    },
  });
  assert.equal(deriveMission3Admission(projection), false);
});

test("a fresh unrelated canonical-route receipt never keeps stale session evidence live", () => {
  const now = Date.now();
  const staleAt = new Date(now - 400_000).toISOString();
  const projection = admittedProjection({
    generatedAt: new Date(now).toISOString(),
    mutate: (candidate) => {
      // Session evidence goes stale while the unrelated GitHub canonical-route
      // receipt stays perfectly fresh; the fresh receipt is even attached to the
      // session capabilities to attempt to keep them live.
      for (const capability of candidate.capabilities) {
        if (MISSION3_SESSION_CAPABILITIES.includes(capability.capabilityId)) {
          capability.lastSuccessfulVerification = staleAt;
          capability.receiptRefs = [
            ...capability.receiptRefs,
            `connector-receipt:${GITHUB_RECEIPT_ID}`,
          ];
        }
      }
      for (const action of candidate.actions) {
        if (MISSION3_SESSION_CAPABILITIES.includes(action.capabilityId)) {
          action.lastSuccessfulVerification = staleAt;
          action.receiptRefs = [
            ...action.receiptRefs,
            `connector-receipt:${GITHUB_RECEIPT_ID}`,
          ];
        }
      }
      for (const receipt of candidate.verificationReceipts) {
        if (receipt.receiptType === MISSION3_SESSION_ESTABLISHMENT_RECEIPT_TYPE) {
          receipt.verifiedAt = staleAt;
        }
      }
    },
  });
  assert.equal(deriveMission3Admission(projection), false);
});

test("a missing matching executive-session action yields mission3Admitted=false", () => {
  const projection = admittedProjection({
    mutate: (candidate) => {
      candidate.actions = candidate.actions.filter(
        (action) => action.capabilityId !== "executive_session.read",
      );
    },
  });
  assert.equal(deriveMission3Admission(projection), false);
});

test("a mismatched action (wrong capability or wrong verification timestamp) yields mission3Admitted=false", () => {
  const wrongCapability = admittedProjection({
    mutate: (candidate) => {
      const action = candidate.actions.find(
        (item) => item.capabilityId === "executive_session.revoke",
      );
      action.capabilityId = "executive_session.read";
    },
  });
  assert.equal(deriveMission3Admission(wrongCapability), false);

  const wrongTimestamp = admittedProjection({
    mutate: (candidate) => {
      const action = candidate.actions.find(
        (item) => item.capabilityId === "executive_session.authenticate",
      );
      action.lastSuccessfulVerification = new Date(
        Date.parse(action.lastSuccessfulVerification) - 5_000,
      ).toISOString();
    },
  });
  assert.equal(deriveMission3Admission(wrongTimestamp), false);
});

test("duplicate executive-session capability entries are rejected", async () => {
  const projection = admittedProjection({
    mutate: (candidate) => {
      candidate.capabilities.push(
        sessionCapability("executive_session.read", candidate.generatedAt),
      );
    },
  });
  assert.equal(deriveMission3Admission(projection), false);
  const base = await start(projection);
  const response = await fetchRegistry(base);
  assert.equal(response.ok, false);
});

test("a projection that claims admission without evidence fails closed at the Gateway", async () => {
  const projection = baseLiveProjection();
  projection.mission3Admitted = true;
  resign(projection);
  const base = await start(projection);
  const response = await fetchRegistry(base);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.ok, false);
});

test("existing M2 projections that report false are preserved unchanged", async () => {
  const projection = baseLiveProjection();
  assert.equal(projection.mission3Admitted, false);
  assert.equal(deriveMission3Admission(projection), false);
  const base = await start(projection);
  const response = await fetchRegistry(base);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.mission3Admitted, false);
});

test("restart/readback: a fresh Gateway instance derives the same admission boolean", async () => {
  const projection = admittedProjection();
  const first = await start(projection);
  const firstBody = await (await fetchRegistry(first)).json();
  const second = await start(projection);
  const secondBody = await (await fetchRegistry(second)).json();
  assert.equal(firstBody.data.mission3Admitted, true);
  assert.equal(secondBody.data.mission3Admitted, true);
  assert.equal(firstBody.data.projectionDigest, secondBody.data.projectionDigest);
});
