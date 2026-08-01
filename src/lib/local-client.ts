import {
  createSerializedRefresh,
  runBoundedTask,
} from "./request-coordination.mjs";
import type {
  ConclaveEvidenceAdmissionRequest,
  ConclavePredecessor,
  ConclaveWorkspaceCreateRequest,
} from "./conclave-request-identity";

const CLIENT_READ_TIMEOUT_MS = 10_000;

export type LocalEnvelope<T> = {
  ok: boolean;
  data: T | null;
  local: {
    mode: "local_first";
    route: string;
    runtimeUrl: string;
    enabled: boolean;
    authoritative: "NEXUS Runtime";
    contextAssemblyOwner: "NEXUS Runtime";
    connectionState?: string;
    secretValuesExposed: false;
  };
  truth: {
    productionReady: false;
    enterpriseReady: false;
    cloudPrimary: false;
    localSourceOfTruth: true;
    secretValuesExposed: false;
  };
  error?: {
    code: string;
    message: string;
    details?: {
      reason?: string;
      missingDependencies?: string[];
      retryable?: boolean;
      requiredNextAction?: string;
      capabilityId?: string;
      capabilityState?: string;
    };
  };
};

export type IntakeSource = {
  sourceId: string;
  normalizedTitle?: string;
  originalFilename?: string;
  sourceType?: string;
  extractionStatus?: string;
  secretScanStatus?: string;
  projectId?: string | null;
  evidenceIds?: string[];
  proofId?: string;
};

export type IntakeHistory = {
  recordType: string;
  jobs: Array<Record<string, unknown>>;
  sources: IntakeSource[];
  secretValuesExposed: false;
};

export type ArtifactDefinition = {
  artifactType: string;
  name: string;
  status: string;
  sections: string[];
};

export type ProjectScope = {
  projectId: string;
  requirements?: Array<Record<string, unknown>>;
  risks?: Array<Record<string, unknown>>;
  assumptions?: Array<Record<string, unknown> | string>;
  exclusions?: Array<Record<string, unknown>>;
  sourceIdsUsed?: string[];
  evidenceIdsUsed?: string[];
  unavailableSources?: string[];
  unsupportedSources?: string[];
};

export type ProjectEstimate = {
  projectId: string;
  pricingStatus?: string;
  estimateRange?: { low?: number | null; likely?: number | null; high?: number | null; currency?: string | null; status?: string };
  estimatedTotal?: number | null;
  currency?: string | null;
  confidence?: { score?: number; level?: string } | number;
  assumptionsCreatedDueToMissingEvidence?: string[];
  sourcePricingEvidence?: Array<Record<string, unknown>>;
};

export type PlanningModel = {
  projectId: string;
  projectName?: string;
  objective?: string;
  requirements?: Array<Record<string, unknown>>;
  risks?: Array<Record<string, unknown>>;
  assumptions?: Array<Record<string, unknown>>;
  openQuestions?: Array<Record<string, unknown>>;
  pricing?: ProjectEstimate;
  sourceCount?: number;
};

export type CompiledArtifact = {
  artifactId?: string;
  artifactType?: string;
  status?: string;
  reason?: string;
  proofId?: string;
  receiptId?: string;
  confidence?: string;
  estimateStatus?: string;
  artifact?: {
    phases?: Array<{ phaseId: string; name: string; durationEstimate?: { minimum?: number; maximum?: number; unit?: string; basis?: string } | null }>;
    openInputs?: string[];
  };
};

export type VoiceRouteResult = {
  status?: string;
  spokenSummary?: string;
  event?: { resolvedIntent?: string; routedCapability?: string; proofId?: string; receiptId?: string; failureReason?: string };
  proof?: { proofId?: string };
  receipt?: { receiptId?: string };
  result?: unknown;
};

export type ClientCapabilityContract = {
  contractVersion: "1.1.0";
  inventoryScope: "registered_runtime_operations_v1";
  completeNativeInventory: false;
  surfaceInventoryOwnedByExperienceRegistry: true;
  runtimeOwner: "NEXUS Runtime";
  operationalBehaviorInClients: false;
  capabilities: Array<{
    capabilityId: string;
    name: string;
    workspace: string;
    portability: "portable" | "local_hardware" | "staged";
    implementationState: string;
    clients: Record<string, string>;
    operations: Array<{ operationId: string; method: string; runtimePath: string; risk: string; approvalRequired: boolean; proofRequired: boolean; receiptRequired: boolean }>;
    limitations: string[];
  }>;
  parity: {
    scope: "listed_portable_runtime_operations";
    surfaceParityClaimed: false;
    portableCapabilityCount: number;
    nexusCommandImplemented: number;
    nexusWebImplemented: number;
    driftCount: number;
    driftCapabilityIds: string[];
  };
  truth: {
    source: string;
    localRuntimeRequired: boolean;
    hostedExecutionAvailable: boolean;
    hostedExecutionMode: "single_workspace_alpha" | "disabled";
    productionMultiTenantReady: false;
    surfaceRegistry: {
      registryId: "nexus.experience.surface-registry";
      contractVersion: "1.0.0";
      scope: "all_known_top_level_surfaces";
      clientStateVocabulary: Array<"functional" | "read_only" | "local_only" | "unavailable">;
    };
    secretValuesExposed: false;
  };
};

export type RuntimeCoordinationNode = {
  nodeId: string;
  displayName: string;
  tenantId?: string;
  workspaceId?: string;
  desiredConfiguration?: Record<string, unknown>;
  observedManifest?: Record<string, unknown> | null;
  stateVector?: Record<string, unknown>;
  trust?: string | Record<string, unknown>;
  freshness?: string | Record<string, unknown>;
  healthDimensions?: Record<string, unknown> | null;
  stateDivergence?: Record<string, unknown>;
  posture?: string;
  lastHeartbeatAt?: string | null;
  evidenceRefs?: string[];
  receiptRefs?: string[];
  replayRefs?: string[];
  coordinationEventRefs?: string[];
  enrollment?: {
    issuedAt?: string;
    expiresAt?: string;
    credentialVersion?: number;
    status?: string;
  };
  limitations?: string[];
};

export type AdmissionDependency = {
  dependencyId?: string;
  capabilityId?: string;
  id?: string;
  name?: string;
  state?: string;
  available?: boolean;
  healthy?: boolean;
  reason?: string;
};

export type RuntimeAdmissionCapability = {
  capabilityId?: string;
  version?: string;
  availability?: string;
  available: boolean;
  reason?: string;
  dependencies?: AdmissionDependency[] | Record<string, AdmissionDependency | boolean | string>;
  environmentAvailability?: Record<string, boolean>;
  conditionalDependencies?: Record<string, Record<string, boolean>>;
  constitutionalRequirements?: string[];
  knownLimitations?: string[];
  clientAccess?: { authenticated?: boolean; requestPermissionGranted?: boolean; allowed?: boolean; reason?: string };
  session?: { authenticated?: boolean; reason?: string };
  permission?: { allowed?: boolean; granted?: boolean; reason?: string };
  authenticated?: boolean;
  requestPermissionGranted?: boolean;
  secretValuesExposed?: false;
};

export type RuntimeNodeFleet = {
  recordType: string;
  nodes: RuntimeCoordinationNode[];
  summary?: Record<string, number>;
  admissionCapability?: RuntimeAdmissionCapability;
  limitations?: string[];
  secretValuesExposed: false;
};

export type RuntimeAdmissionIntentRequest = {
  missionId: string;
  intent: {
    displayName: string;
    nodeClass: string;
    requestedCapabilities: string[];
    operationalPurpose: string;
    location?: string;
    deploymentMetadata?: Record<string, string | number | boolean | null>;
    evidenceRefs?: string[];
  };
};

export type RuntimeAdmission = {
  admissionRequestId: string;
  version?: string | number;
  tenantId?: string;
  workspaceId?: string;
  missionId: string;
  requestingPrincipalId?: string;
  intent: RuntimeAdmissionIntentRequest["intent"];
  lifecycleState: string;
  operationalState?: string;
  awaitingNodeProof?: boolean;
  requiredNextAction?: string;
  replayId?: string;
  taskGraph?: Array<Record<string, unknown>> | { tasks?: Array<Record<string, unknown>> };
  policy?: Record<string, unknown> | null;
  authority?: Record<string, unknown> | null;
  challenge?: {
    state?: string;
    status?: string;
    issuedAt?: string;
    expiresAt?: string;
    attemptsRemaining?: number;
    reissueCount?: number;
    reissueAvailable?: boolean;
    secretValuesExposed?: false;
  } | null;
  verification?: Record<string, unknown> | null;
  operationalAsset?: Record<string, unknown> | null;
  firstHeartbeat?: Record<string, unknown> | null;
  proofRefs?: string[];
  receiptRefs?: string[];
  replayRefs?: string[];
  failure?: {
    code?: string;
    category?: string;
    message?: string;
    reason?: string;
    retryable?: boolean;
    remediation?: string;
    nextAction?: string;
    occurredAt?: string;
  } | null;
  allowedOperations?: string[] | Record<string, boolean>;
  createdAt?: string;
  updatedAt?: string;
  secretValuesExposed: false;
};

export type RuntimeAdmissionList = {
  recordType: string;
  admissions?: RuntimeAdmission[];
  admissionRequests?: RuntimeAdmission[];
  requests?: RuntimeAdmission[];
  admissionCapability?: RuntimeAdmissionCapability;
  limitations?: string[];
  secretValuesExposed: false;
};

export type RuntimeAdmissionResponse = RuntimeAdmission | {
  recordType?: string;
  admission?: RuntimeAdmission;
  admissionRequest?: RuntimeAdmission;
  request?: RuntimeAdmission;
  secretValuesExposed?: false;
};

export type ConclaveTask = {
  task_id: string;
  objective: string;
  expected_outputs: string[];
  evidence_required: string[];
  completion_criteria: string[];
  confidence: number | null;
  priority: number;
  dependencies: string[];
  status: string;
  specialist_id: string | null;
  evidence_ids: string[];
};

export type ConclaveSpecialist = {
  specialist_id: string;
  name: string;
  purpose: string;
  task_domains: string[];
  required_evidence: string[];
  enabled: boolean;
  assignedTaskIds: string[];
  taskStatuses: string[];
};

export type ConclaveEvidence = {
  evidence_id: string;
  workspace_id: string;
  origin: string;
  source_classification: string;
  collected_at: string;
  collector: string;
  confidence: number;
  claim: string;
  supporting_artifacts: string[];
  relationships: string[];
  operational_context: Record<string, unknown>;
  content_digest: string;
};

export type ConclaveWorkspaceRecord = {
  recordType: "nexus_conclave_workspace";
  schemaVersion: "nexus.conclave-workspace@2.0.0";
  created: boolean;
  workspaceVersion: string;
  workspaceId: string;
  missionId: string;
  proposal: string;
  predecessor: ConclavePredecessor | null;
  lifecyclePosture: "canonical_operational" | "legacy_read_only";
  availableActions: Array<"run" | "restart_canonical">;
  status: string;
  operationalStatus: string;
  executionAuthorized: false;
  externalExecutionPerformed: false;
  coordinationActive: boolean;
  waitingForEvidence: boolean;
  mission: Record<string, unknown>;
  dashboard: Record<string, unknown>;
  objectives: string[];
  questions: Array<{ questionId: string; text: string }>;
  unknowns: Array<{ unknownId: string; text: string }>;
  tasks: ConclaveTask[];
  specialistRegistry: ConclaveSpecialist[];
  evidence: ConclaveEvidence[];
  waitingTaskIds: string[];
  contradictions: Array<Record<string, unknown>>;
  executiveSummary: Record<string, unknown> | null;
  completionReceipt: Record<string, unknown> | null;
  displayStatus: string;
  reviewCompleted?: boolean;
  reviewIntegrityVerified?: boolean;
  terminalReceiptVerified?: boolean;
  runRepeated?: boolean;
  runReceipt?: Record<string, unknown> | null;
  canonicalReview?: Record<string, unknown> | null;
  lifecycleReceipt: {
    receiptId: string;
    missionId: string;
    replayId: string;
    recordedStatus: string;
    contentDigest: string;
    completionClaimed: false;
  } | null;
  operationalReplay: {
    runId: string;
    status: string;
    contentDigest: string;
    stageCount: number;
    stages: Array<{
      sequence: number;
      stageId: string;
      stageName: string;
      status: string;
      explanation: string;
      startedAt: string;
      completedAt: string;
      evidenceRefs: string[];
    }>;
  };
  scope: { tenantId: string; workspaceId: string; requestingPrincipalId?: string };
  recommendedNextAction: string;
  constitutionalBasis: Record<string, unknown>;
  limitations: string[];
  secretValuesExposed: false;
};

export type ConclaveWorkspaceList = {
  recordType: "nexus_conclave_workspace_list";
  schemaVersion: "nexus.conclave-workspace@2.0.0";
  workspaceCount: number;
  workspaces: ConclaveWorkspaceRecord[];
  scope: { tenantId: string; workspaceId: string };
  constitutionalBasis: Record<string, unknown>;
  secretValuesExposed: false;
};

async function request<T>(path: string, options: RequestInit = {}, idempotencyKey?: string): Promise<T> {
  const hosted = capabilityTransport.mode === "hosted";
  const readOnly = !options.method || options.method === "GET";
  const perform = async (signal?: AbortSignal) => {
    const response = await fetch(`${hosted ? "/api/operations" : "/api/local"}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.method === "POST" ? {
          ...(hosted ? { "X-CSRF-Token": capabilityTransport.csrfToken } : {}),
          ...(idempotencyKey || hosted ? { "Idempotency-Key": idempotencyKey ?? globalThis.crypto.randomUUID() } : {}),
        } : {}),
        ...(options.headers ?? {})
      },
      credentials: "same-origin",
      ...(signal ? { signal } : {}),
    });
    return {
      response,
      envelope: await response.json() as LocalEnvelope<T>,
    };
  };
  const { response, envelope } = readOnly
    ? await runBoundedTask(
      (signal) => perform(signal),
      {
        timeoutMs: CLIENT_READ_TIMEOUT_MS,
        ...(options.signal ? { parentSignal: options.signal } : {}),
      },
    )
    : await perform();
  if (!response.ok || !envelope.ok || envelope.data === null) {
    if (hosted && response.status === 401) window.dispatchEvent(new Event(OPERATIONAL_SESSION_INVALID_EVENT));
    const details = envelope.error?.details;
    const explanation = [
      envelope.error?.message,
      details?.reason,
      details?.missingDependencies?.length ? `Missing dependencies: ${details.missingDependencies.join(", ")}.` : "",
      details?.requiredNextAction,
    ].filter((item): item is string => Boolean(item));
    throw Object.assign(
      new Error([...new Set(explanation)].join(" ") || `${hosted ? "Hosted" : "Local"} NEXUS request failed (${response.status})`),
      { envelope, details },
    );
  }
  return envelope.data;
}

const capabilityTransport: { mode: "local" | "hosted"; csrfToken: string } = { mode: "local", csrfToken: "" };
export const OPERATIONAL_SESSION_INVALID_EVENT = "nexus:operational-session-invalid";
const hostedMutationHeaders = (): Record<string, string> => capabilityTransport.mode === "hosted" && capabilityTransport.csrfToken
  ? { "X-CSRF-Token": capabilityTransport.csrfToken }
  : {};

export type OperationalSession = {
  authenticated: boolean;
  userId?: string;
  tenantId?: string;
  workspaceId?: string;
  role?: string;
  scopes?: string[];
  expiresAt?: string;
  csrfToken?: string;
  connectionMode?: "access_key" | "automatic_private_workspace";
  principalType?: "named_operator" | "workspace_service";
  accessBasis?: "operator_access_key" | "replit_private_deployment";
  managed?: boolean;
};

const operationalSessionRecord = (
  value: unknown,
): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);
const boundedOperationalSessionString = (
  value: unknown,
  maximum = 191,
): value is string => (
  typeof value === "string"
  && value.length > 0
  && value.length <= maximum
);
const exactOperationalSessionKeys = (
  record: Record<string, unknown>,
  keys: readonly string[],
) => (
  Object.keys(record).length === keys.length
  && keys.every((key) => key in record)
);
const AUTHENTICATED_OPERATIONAL_SESSION_KEYS = [
  "authenticated",
  "userId",
  "tenantId",
  "workspaceId",
  "role",
  "scopes",
  "expiresAt",
  "csrfToken",
  "connectionMode",
  "principalType",
  "accessBasis",
  "managed",
] as const;

export function asOperationalSession(
  value: unknown,
  now = Date.now(),
): OperationalSession | null {
  const session = operationalSessionRecord(value);
  if (!session || typeof session.authenticated !== "boolean") return null;
  if (!session.authenticated) {
    return exactOperationalSessionKeys(session, ["authenticated"])
      ? { authenticated: false }
      : null;
  }
  if (
    !exactOperationalSessionKeys(
      session,
      AUTHENTICATED_OPERATIONAL_SESSION_KEYS,
    )
    || !boundedOperationalSessionString(session.userId)
    || !boundedOperationalSessionString(session.tenantId)
    || !boundedOperationalSessionString(session.workspaceId)
    || !boundedOperationalSessionString(session.role)
    || !Array.isArray(session.scopes)
    || session.scopes.length === 0
    || session.scopes.length > 64
    || session.scopes.some(
      (scope) => !boundedOperationalSessionString(scope),
    )
    || new Set(session.scopes).size !== session.scopes.length
    || !boundedOperationalSessionString(session.expiresAt)
    || !Number.isFinite(Date.parse(session.expiresAt))
    || Date.parse(session.expiresAt) <= now
    || !boundedOperationalSessionString(session.csrfToken, 512)
    || !["access_key", "automatic_private_workspace"].includes(
      String(session.connectionMode),
    )
    || !["named_operator", "workspace_service"].includes(
      String(session.principalType),
    )
    || !["operator_access_key", "replit_private_deployment"].includes(
      String(session.accessBasis),
    )
    || typeof session.managed !== "boolean"
  ) {
    return null;
  }
  const automatic = session.connectionMode === "automatic_private_workspace";
  if (
    (automatic && (
      session.principalType !== "workspace_service"
      || session.accessBasis !== "replit_private_deployment"
      || session.managed !== true
    ))
    || (!automatic && (
      session.principalType !== "named_operator"
      || session.accessBasis !== "operator_access_key"
      || session.managed !== false
    ))
  ) {
    return null;
  }
  return session as OperationalSession;
}

export type RegisteredExecutiveSessionRecord = {
  recordType: "nexus_registered_executive_session";
  schemaVersion: "nexus.registered-executive-session@1.0.0";
  sessionId: string;
  state: "active" | "revoked";
  humanIdentity: {
    registrationId: string;
    principalId: string;
    principalType: "registered_human_executive";
    provider: "replit-auth";
    providerIssuer: string;
    providerSubjectBinding: "server_verified_opaque_subject_to_preprovisioned_registration";
    providerSubjectClientControlled: false;
    providerSubjectRetained: false;
    providerAssertionVerified: true;
    humanVerified: true;
    authenticationMethods: string[];
    authenticationTime: string;
  };
  serviceIdentity: {
    principalId: string;
    principalType: "experience_gateway_service";
    authenticationMethod: "bound_service_credential";
    authenticatedBeforeHumanAssertion: true;
    distinctFromHumanPrincipal: true;
  };
  scopeBinding: {
    tenantId: string;
    workspaceId: string;
    selectionOwner: "server_registration_and_runtime";
    clientControlled: false;
    exactRuntimeMatch: true;
  };
  role: "executive";
  scopes: ["executive_session.read", "executive_session.revoke"];
  policyBinding: {
    policyId: "registered-executive-session-policy";
    policyVersion: "1.0.0";
    policyDigest: string;
    state: "current_verified";
    clientControlled: false;
  };
  assertionBinding: {
    contractVersion: "nexus.registered-executive-session-assertion@1.0.0";
    algorithm: "hmac-sha256";
    keyId: string;
    issuer: string;
    audience: string;
    serviceBindingId: string;
    maximumLifetimeSeconds: 60;
    singleUseRequired: true;
    tokenRetained: false;
    authorityClaimAccepted: false;
  };
  lifecycle: {
    sessionVersion: number;
    authenticatedAt: string;
    issuedAt: string;
    expiresAt: string;
    revokedAt: string | null;
    maximumSessionLifetimeSeconds: number;
    bounded: true;
  };
  replayAndRevocation: {
    assertionReplayState: "admitted_single_use";
    sessionReplayRef: string;
    revocationState: "active" | "revoked";
    revocationCheckpoint: number;
    durable: true;
    rejectedRequestMutatedState: false;
  };
  authorityBoundary: {
    authorityGranted: false;
    actionAuthorized: false;
    approvalRef: null;
    decisionRef: null;
    authorityGrantRefs: [];
    missionExecutionAdmitted: false;
    capabilityHealthGrantsAuthority: false;
  };
  receipt: {
    receiptId: string;
    receiptDigest: string;
    accountabilityRef: string;
    replayRef: string;
    postconditionVerified: true;
    credentialMaterialRetained: false;
    rawProviderSubjectRetained: false;
  };
  secretValuesExposed: false;
};

export type RegisteredExecutiveSessionAbsent = {
  authenticated: false;
  runtimeVerified: false;
  authorityGranted: false;
  actionAuthorized: false;
  decisionCreated: false;
  missionCreated: false;
  secretValuesExposed: false;
};

export type RegisteredExecutiveSessionEnvelope = {
  ok: boolean;
  session?: RegisteredExecutiveSessionRecord | RegisteredExecutiveSessionAbsent;
  sessionAccess?: {
    csrfToken: string;
    cookieHttpOnly: true;
    cookieSameSite: "Strict";
    providerTokenRetained: false;
    providerSubjectRetained: false;
    authorityGranted: false;
    actionAuthorized: false;
    secretValuesExposed: false;
  };
  executiveSession: {
    mode: "registered_executive_nonproduction";
    route: string;
    enabled: boolean;
    provider: "replit-auth";
    identityOwner: "server_owned_registration";
    runtimeOwner: "NEXUS Runtime";
    serviceIdentityDistinct: true;
    tenantWorkspaceServerSelected: true;
    authenticationGrantsAuthority: false;
    sessionCreatesDecision: false;
    sessionCreatesMission: false;
    sessionAuthorizesAction: false;
    productionMultiTenantReady: false;
    runtimeVerified?: boolean;
    lifecycleState?: "absent" | "active" | "revoked";
    connectionState?: string;
    secretValuesExposed: false;
  };
  error?: { code: string; message: string };
};

export class RegisteredExecutiveSessionRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "RegisteredExecutiveSessionRequestError";
    this.code = code;
    this.status = status;
  }
}

export type RuntimeBaselineRequest = {
  expectedDeployedCommit?: string;
};

export type KnowledgePromotionRequest = {
  candidateId: string;
};

export type KnowledgeIntakeRequest = {
  missionId: string;
  taskId: string;
  origin: string;
  sourceClassification: "model_native" | "platform_knowledge" | "tenant_knowledge" | "retrieved_evidence" | "live_external_source" | "runtime_evidence";
  confidence: number;
  claim: string;
  supportingArtifacts?: string[];
  relationships?: string[];
  operationalContext?: Record<string, unknown>;
  completeTask?: boolean;
};

async function sessionRequest(path: string, options: RequestInit = {}): Promise<OperationalSession> {
  const readOnly = !options.method || options.method === "GET";
  const perform = async (signal?: AbortSignal) => {
    const response = await fetch(`/api/session${path}`, {
      ...options, credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers ?? {}) },
      ...(signal ? { signal } : {}),
    });
    const parsed = await response.json() as unknown;
    return {
      response,
      body: operationalSessionRecord(parsed),
    };
  };
  const { response, body } = readOnly
    ? await runBoundedTask(
      (signal) => perform(signal),
      {
        timeoutMs: CLIENT_READ_TIMEOUT_MS,
        ...(options.signal ? { parentSignal: options.signal } : {}),
      },
    )
    : await perform();
  const truth = operationalSessionRecord(body?.truth);
  const error = operationalSessionRecord(body?.error);
  const session = asOperationalSession(body?.session);
  const validTruth = (
    truth?.productionReady === false
    && truth.enterpriseReady === false
    && truth.cloudPrimary === false
    && truth.localSourceOfTruth === true
    && truth.defaultProvider === "mock_model"
    && truth.conclave === "unavailable"
    && truth.actualTrainedSLMs === 0
    && truth.secretValuesExposed === false
  );
  if (
    !body
    || typeof body.ok !== "boolean"
    || response.ok !== body.ok
    || body.ok !== true
    || !validTruth
    || !session
  ) {
    throw new Error(
      typeof error?.message === "string"
        ? error.message
        : `Operational session response failed validation (${response.status})`,
    );
  }
  return session;
}

const operationalSessionStatus = createSerializedRefresh(
  () => sessionRequest(""),
);

export const operationalSessionClient = Object.freeze({
  status: () => operationalSessionStatus(false),
  logout: () => sessionRequest("/logout", { method: "POST", headers: { "X-CSRF-Token": capabilityTransport.csrfToken }, body: JSON.stringify({}) }),
  use: (session: OperationalSession) => {
    capabilityTransport.mode = session.authenticated ? "hosted" : "local";
    capabilityTransport.csrfToken = session.csrfToken ?? "";
  },
  hostedMutationHeaders,
  mode: () => capabilityTransport.mode
});

let registeredExecutiveSessionCsrfToken = "";

async function registeredExecutiveSessionRequest(
  path: "" | "/login" | "/revoke",
  options: RequestInit = {},
): Promise<RegisteredExecutiveSessionEnvelope> {
  const response = await fetch(`/api/executive-session${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  let envelope: RegisteredExecutiveSessionEnvelope;
  try {
    envelope = await response.json() as RegisteredExecutiveSessionEnvelope;
  } catch {
    throw new RegisteredExecutiveSessionRequestError(
      "executive_session_response_invalid",
      "The Experience Gateway returned an invalid Registered Executive session response.",
      response.status,
    );
  }
  if (!response.ok || !envelope.ok || !envelope.session) {
    if (
      path === "/revoke"
      || (response.status >= 400 && response.status < 500)
    ) {
      registeredExecutiveSessionCsrfToken = "";
    }
    throw new RegisteredExecutiveSessionRequestError(
      envelope.error?.code ?? "executive_session_request_failed",
      envelope.error?.message ?? `Registered Executive session request failed (${response.status}).`,
      response.status,
    );
  }
  registeredExecutiveSessionCsrfToken = envelope.sessionAccess?.csrfToken ?? "";
  if (envelope.executiveSession.lifecycleState === "revoked") {
    registeredExecutiveSessionCsrfToken = "";
  }
  return envelope;
}

export function isRegisteredExecutiveSessionRecord(
  value: RegisteredExecutiveSessionEnvelope["session"],
): value is RegisteredExecutiveSessionRecord {
  return Boolean(
    value
      && "recordType" in value
      && value.recordType === "nexus_registered_executive_session"
      && value.schemaVersion === "nexus.registered-executive-session@1.0.0",
  );
}

export const registeredExecutiveSessionClient = Object.freeze({
  status: () => registeredExecutiveSessionRequest(""),
  login() {
    return registeredExecutiveSessionRequest(
      "/login",
      { method: "POST", body: JSON.stringify({}) },
    );
  },
  revoke: () => registeredExecutiveSessionRequest(
    "/revoke",
    {
      method: "POST",
      headers: { "X-CSRF-Token": registeredExecutiveSessionCsrfToken },
      body: JSON.stringify({}),
    },
  ),
});

export type CanonicalExecutionGatewayResponse = {
  ok: boolean;
  recordType?: "nexus_canonical_execution_gateway_response";
  route?: string;
  data?: {
    recordType?: string;
    mission?: {
      missionId: string;
      state: string;
      fixture: {
        path: string;
        baselineDigest: string;
        currentDigest: string;
        version: number;
      };
      actions: Array<{
        action: string;
        status: string;
        beforeDigest: string;
        afterDigest: string;
      }>;
      missionTerminalReceiptId?: string | null;
    };
    capabilities?: Array<{
      capabilityId: string;
      action: string;
      classification: string;
      operationalAvailability: boolean;
      reason: string;
    }>;
    status?: string;
    result?: {
      path: string;
      priorSha256: string;
      currentSha256: string;
      effectCount: number;
    };
    accountabilityIntegrity?: { valid: boolean; recordCount: number };
    replay?: { passive: boolean; dispatchesActions: boolean; eventCount: number };
    secretValuesExposed: false;
  };
  error?: { code?: string; message?: string };
  registeredExecutiveSessionVerified?: boolean;
  authorityGranted?: false;
  secretValuesExposed?: false;
};

async function canonicalExecutionRequest(
  path: string,
  options: RequestInit = {},
  requestKey = "",
): Promise<CanonicalExecutionGatewayResponse> {
  if (options.method === "POST" && !registeredExecutiveSessionCsrfToken) {
    await registeredExecutiveSessionClient.status();
  }
  const response = await fetch(`/api/canonical-execution${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.method === "POST"
        ? {
          "X-CSRF-Token": registeredExecutiveSessionCsrfToken,
          "Idempotency-Key": requestKey || `m4-${crypto.randomUUID()}`,
        }
        : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json() as CanonicalExecutionGatewayResponse;
  if (!response.ok || !body.ok || !body.data) {
    throw new RegisteredExecutiveSessionRequestError(
      body.error?.code ?? "canonical_execution_request_failed",
      body.error?.message
        ?? `Canonical execution request failed (${response.status}).`,
      response.status,
    );
  }
  return body;
}

export const canonicalExecutionClient = Object.freeze({
  status: () => canonicalExecutionRequest(""),
  createMission: () => canonicalExecutionRequest(
    "/missions",
    {
      method: "POST",
      body: JSON.stringify({
        objective: "Prove one governed reversible non-production repository fixture Action.",
        authorizationAcknowledged: true,
      }),
    },
  ),
  mission: (missionId: string) => canonicalExecutionRequest(
    `/missions/${encodeURIComponent(missionId)}`,
  ),
  edit: (
    missionId: string,
    path: string,
    expectedSha256: string,
    content: string,
  ) => canonicalExecutionRequest(
    `/missions/${encodeURIComponent(missionId)}/actions`,
    {
      method: "POST",
      body: JSON.stringify({
        action: "repository.edit",
        path,
        expectedSha256,
        content,
      }),
    },
  ),
  restore: (
    missionId: string,
    path: string,
    expectedSha256: string,
    restoreSha256: string,
  ) => canonicalExecutionRequest(
    `/missions/${encodeURIComponent(missionId)}/actions`,
    {
      method: "POST",
      body: JSON.stringify({
        action: "repository.restore",
        path,
        expectedSha256,
        restoreSha256,
      }),
    },
  ),
});

const post = <T, B extends object = Record<string, unknown>>(path: string, body: B, idempotencyKey?: string) => request<T>(
  path,
  { method: "POST", body: JSON.stringify(body) },
  idempotencyKey,
);

export const localNexusClient = Object.freeze({
  status: () => request<Record<string, unknown>>("/status"),
  capabilityReadiness: () => request<Record<string, unknown>>("/capabilities/readiness"),
  clientCapabilities: () => request<ClientCapabilityContract>("/client-capabilities"),
  intakeHistory: () => request<IntakeHistory>("/intake/history"),
  intakeUpload: (filename: string, contentBase64: string, projectId?: string) => post<Record<string, unknown>>("/intake/upload", { filename, contentBase64, ...(projectId ? { projectId } : {}) }),
  intakeQuery: (question: string, projectId?: string, idempotencyKey?: string) => post<{ status: string; answer: string; citations?: Array<Record<string, unknown>> }>("/intake/query", { question, ...(projectId ? { projectId } : {}) }, idempotencyKey),
  projectCreate: (name: string, idempotencyKey?: string) => post<{ projectId: string; name: string }>("/projects", { name }, idempotencyKey),
  artifactTypes: () => request<{ artifacts: ArtifactDefinition[] }>("/projects/artifact-types"),
  projectScope: (projectId: string) => request<ProjectScope>(`/projects/${encodeURIComponent(projectId)}/scope`),
  projectEstimate: (projectId: string) => request<ProjectEstimate>(`/projects/${encodeURIComponent(projectId)}/estimate`),
  projectPlanningModel: (projectId: string) => request<PlanningModel>(`/projects/${encodeURIComponent(projectId)}/planning-model`),
  projectCompile: (projectId: string, artifactType: string, options: Record<string, unknown>, idempotencyKey?: string) => post<CompiledArtifact>(`/projects/${encodeURIComponent(projectId)}/compile`, { artifactType, options }, idempotencyKey),
  voiceStatus: () => request<Record<string, unknown>>("/voice-operator/status"),
  voiceHistory: () => request<{ events?: Array<Record<string, unknown>> }>("/voice-operator/history"),
  routeTranscript: (
    transcript: string,
    source: "browser_speech" | "text_fallback",
    signal?: AbortSignal,
    idempotencyKey = `voice-transcript:${globalThis.crypto.randomUUID()}`,
  ) => request<VoiceRouteResult>(
    "/voice-operator/route-transcript",
    {
      method: "POST",
      body: JSON.stringify({ transcript, source }),
      ...(signal ? { signal } : {}),
    },
    idempotencyKey,
  ),
  missions: () => request<Record<string, unknown>>("/missions"),
  mission: (missionId: string) => request<Record<string, unknown>>(
    `/missions/${encodeURIComponent(missionId)}`,
  ),
  planMission: (objective: string, idempotencyKey?: string) => post<Record<string, unknown>>(
    "/missions/plan",
    { objective },
    idempotencyKey ?? `mission-plan:${globalThis.crypto.randomUUID()}`,
  ),
  executeMissionStep: (missionId: string, stepId: string) => post<Record<string, unknown>>(
    `/missions/${encodeURIComponent(missionId)}/execute-step`,
    { stepId },
    `mission-step:${globalThis.crypto.randomUUID()}`,
  ),
  conclaveWorkspaces: () => request<ConclaveWorkspaceList>("/conclave/workspaces"),
  createConclaveWorkspace: (
    payload: ConclaveWorkspaceCreateRequest,
    idempotencyKey: string,
  ) => post<ConclaveWorkspaceRecord, ConclaveWorkspaceCreateRequest>(
    "/conclave/workspaces",
    payload,
    idempotencyKey,
  ),
  conclaveWorkspace: (missionId: string) => request<ConclaveWorkspaceRecord>(
    `/conclave/workspaces/${encodeURIComponent(missionId)}`,
  ),
  runConclaveWorkspace: (
    missionId: string,
    expectedWorkspaceVersion: string,
    idempotencyKey: string,
  ) => post<ConclaveWorkspaceRecord>(
    `/conclave/workspaces/${encodeURIComponent(missionId)}/run`,
    { expectedWorkspaceVersion },
    idempotencyKey,
  ),
  admitConclaveEvidence: (
    missionId: string,
    taskId: string,
    payload: ConclaveEvidenceAdmissionRequest,
    idempotencyKey: string,
  ) => post<ConclaveWorkspaceRecord, ConclaveEvidenceAdmissionRequest>(
    `/conclave/workspaces/${encodeURIComponent(missionId)}/tasks/${encodeURIComponent(taskId)}/evidence`,
    payload,
    idempotencyKey,
  ),
  governanceReadiness: () => request<Record<string, unknown>>(
    "/governance/readiness",
  ),
  authorityReadiness: () => request<Record<string, unknown>>(
    "/authority/readiness",
  ),
  operationalReplays: () => request<Record<string, unknown>>("/operational-replay"),
  operationalReplay: (replayId: string) => request<Record<string, unknown>>(
    `/operational-replay/${encodeURIComponent(replayId)}`,
  ),
  operationalReplayEvents: (replayId: string) => request<Record<string, unknown>>(
    `/operational-replay/${encodeURIComponent(replayId)}/events`,
  ),
  operationalReplayStage: (replayId: string, stageId: string) => request<Record<string, unknown>>(
    `/operational-replay/${encodeURIComponent(replayId)}/stages/${encodeURIComponent(stageId)}`,
  ),
  explainOperationalReplayStage: (replayId: string, stageId: string) => request<Record<string, unknown>>(
    `/operational-replay/${encodeURIComponent(replayId)}/stages/${encodeURIComponent(stageId)}/explain`,
  ),
  operationalReplayFailures: () => request<Record<string, unknown>>("/operational-replay/failures"),
  operationalReplayForMission: (missionId: string) => request<Record<string, unknown>>(
    `/operational-replay/missions/${encodeURIComponent(missionId)}`,
  ),
  operationalReplayForReceipt: (receiptId: string) => request<Record<string, unknown>>(
    `/operational-replay/receipts/${encodeURIComponent(receiptId)}`,
  ),
  workSessions: () => request<Record<string, unknown>>("/work-sessions"),
  planWorkSession: (objective: string, idempotencyKey?: string) => post<Record<string, unknown>>("/work-sessions/plan", { objective }, idempotencyKey),
  startWorkSession: (objective: string, idempotencyKey?: string) => post<Record<string, unknown>>("/work-sessions/start", { objective }, idempotencyKey),
  workSession: (sessionId: string) => request<Record<string, unknown>>(`/work-sessions/${encodeURIComponent(sessionId)}`),
  controlWorkSession: (sessionId: string, action: "step" | "continue" | "pause" | "cancel") => post<Record<string, unknown>>(`/work-sessions/${encodeURIComponent(sessionId)}/${action}`, {}),
  workSessionReceipt: (sessionId: string) => request<Record<string, unknown>>(`/work-sessions/${encodeURIComponent(sessionId)}/receipt`),
  approvals: () => request<Record<string, unknown>>("/approvals"),
  approve: (approvalId: string) => post<Record<string, unknown>>(`/approvals/${encodeURIComponent(approvalId)}/approve`, {}),
  deny: (approvalId: string, reason: string) => post<Record<string, unknown>>(`/approvals/${encodeURIComponent(approvalId)}/deny`, { reason }),
  dryRunAction: (action: string) => post<Record<string, unknown>>("/actions/dry-run", { action }),
  executeAction: (action: string) => post<Record<string, unknown>>("/actions/execute", { action, explicitRequest: true }),
  runtimeNodes: () => request<RuntimeNodeFleet>("/runtime-coordination/nodes"),
  runtimeAdmissions: () => request<RuntimeAdmissionList>("/runtime-coordination/admissions"),
  createRuntimeAdmission: (intent: RuntimeAdmissionIntentRequest, idempotencyKey: string) => post<RuntimeAdmissionResponse>(
    "/runtime-coordination/admissions",
    intent,
    idempotencyKey,
  ),
  runtimeAdmission: (admissionRequestId: string) => request<RuntimeAdmissionResponse>(
    `/runtime-coordination/admissions/${encodeURIComponent(admissionRequestId)}`,
  ),
  cancelRuntimeAdmission: (
    admissionRequestId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
  ) => post<RuntimeAdmissionResponse>(
    `/runtime-coordination/admissions/${encodeURIComponent(admissionRequestId)}/cancel`,
    { expectedVersion, reason },
    idempotencyKey,
  ),
  reissueRuntimeAdmissionChallenge: (
    admissionRequestId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
  ) => post<RuntimeAdmissionResponse>(
    `/runtime-coordination/admissions/${encodeURIComponent(admissionRequestId)}/challenge/reissue`,
    { expectedVersion, reason },
    idempotencyKey,
  ),
  runtimeAdmissionReceipt: (admissionRequestId: string) => request<Record<string, unknown>>(
    `/runtime-coordination/admissions/${encodeURIComponent(admissionRequestId)}/receipt`,
  ),
  runtimeAdmissionReplay: (admissionRequestId: string) => request<Record<string, unknown>>(
    `/runtime-coordination/admissions/${encodeURIComponent(admissionRequestId)}/replay`,
  ),
  proofs: () => request<Record<string, unknown>>("/proofs"),
  receipts: () => request<Record<string, unknown>>("/receipts"),
  receipt: (receiptId: string) => request<Record<string, unknown>>(
    `/receipts/${encodeURIComponent(receiptId)}`,
  ),
  missionReceipts: (missionId: string) => request<Record<string, unknown>>(
    `/receipts/missions/${encodeURIComponent(missionId)}`,
  ),
  missionStore: () => request<Record<string, unknown>>("/mission-store"),
  missionStoreRecord: (missionId: string) => request<Record<string, unknown>>(
    `/mission-store/${encodeURIComponent(missionId)}`,
  ),
  knowledgeIntake: (payload: KnowledgeIntakeRequest, idempotencyKey: string) => post<Record<string, unknown>, KnowledgeIntakeRequest>(
    "/knowledge/intake",
    payload,
    idempotencyKey,
  ),
  knowledgeAcquisitions: () => request<Record<string, unknown>>("/knowledge/acquisitions"),
  knowledgeAcquisition: (missionId: string) => request<Record<string, unknown>>(
    `/knowledge/acquisitions/${encodeURIComponent(missionId)}`,
  ),
  knowledgePromotionCandidates: () => request<Record<string, unknown>>("/knowledge/promotion-candidates"),
  knowledgePromotionCandidate: (candidateId: string) => request<Record<string, unknown>>(
    `/knowledge/promotion-candidates/${encodeURIComponent(candidateId)}`,
  ),
  createKnowledgePromotionCandidate: (
    missionId: string,
    expectedMissionVersion: string | number | undefined,
    idempotencyKey: string,
  ) => post<Record<string, unknown>>(
    `/knowledge/acquisitions/${encodeURIComponent(missionId)}/promotion-candidates`,
    expectedMissionVersion === undefined ? {} : { expectedMissionVersion },
    idempotencyKey,
  ),
  knowledgeStore: () => request<Record<string, unknown>>("/knowledge/store"),
  knowledgeRecord: (recordId: string) => request<Record<string, unknown>>(
    `/knowledge/store/${encodeURIComponent(recordId)}`,
  ),
  knowledgeVersions: (recordId: string) => request<Record<string, unknown>>(
    `/knowledge/store/${encodeURIComponent(recordId)}/versions`,
  ),
  knowledgeReceipts: () => request<Record<string, unknown>>("/knowledge/receipts"),
  knowledgeReceipt: (receiptId: string) => request<Record<string, unknown>>(
    `/knowledge/receipts/${encodeURIComponent(receiptId)}`,
  ),
  knowledgePromotions: () => request<Record<string, unknown>>("/knowledge/promotions"),
  establishRuntimeBaseline: (payload: RuntimeBaselineRequest, idempotencyKey: string) => post<Record<string, unknown>>(
    "/runtime/baselines",
    payload,
    idempotencyKey,
  ),
  promoteKnowledge: (payload: KnowledgePromotionRequest, idempotencyKey: string) => post<Record<string, unknown>>(
    "/knowledge/promotions",
    payload,
    idempotencyKey,
  ),
});
