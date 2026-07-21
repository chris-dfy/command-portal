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
  error?: { code: string; message: string };
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
  contractVersion: string;
  inventoryScope: "operational_core_v1";
  completeNativeInventory: false;
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
  parity: { portableCapabilityCount: number; nexusCommandImplemented: number; nexusWebImplemented: number; driftCount: number; driftCapabilityIds: string[] };
  truth: { source: string; localRuntimeRequired: boolean; hostedExecutionAvailable: boolean; hostedExecutionMode: "single_workspace_alpha" | "disabled"; productionMultiTenantReady: false; remainingNativeSurfaces: string[]; secretValuesExposed: false };
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
  schemaVersion: string;
  created: boolean;
  workspaceId: string;
  missionId: string;
  proposal: string;
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
  contradictions: Array<Record<string, unknown>>;
  executiveSummary: Record<string, unknown> | null;
  completionReceipt: Record<string, unknown> | null;
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
  schemaVersion: string;
  workspaceCount: number;
  workspaces: ConclaveWorkspaceRecord[];
  scope: { tenantId: string; workspaceId: string };
  constitutionalBasis: Record<string, unknown>;
  secretValuesExposed: false;
};

async function request<T>(path: string, options: RequestInit = {}, idempotencyKey?: string): Promise<T> {
  const hosted = capabilityTransport.mode === "hosted";
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
    credentials: "same-origin"
  });
  const envelope = await response.json() as LocalEnvelope<T>;
  if (!response.ok || !envelope.ok || envelope.data === null) {
    throw Object.assign(new Error(envelope.error?.message ?? `Local NEXUS request failed (${response.status})`), { envelope });
  }
  return envelope.data;
}

const capabilityTransport: { mode: "local" | "hosted"; csrfToken: string } = { mode: "local", csrfToken: "" };

export type OperationalSession = {
  authenticated: boolean;
  userId?: string;
  tenantId?: string;
  workspaceId?: string;
  role?: string;
  scopes?: string[];
  expiresAt?: string;
  csrfToken?: string;
};

async function sessionRequest(path: string, options: RequestInit = {}): Promise<OperationalSession> {
  const response = await fetch(`/api/session${path}`, {
    ...options, credentials: "same-origin",
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers ?? {}) }
  });
  const body = await response.json() as { ok: boolean; session?: OperationalSession; error?: { message?: string } };
  if (!response.ok || !body.ok || !body.session) throw new Error(body.error?.message ?? `Operational session request failed (${response.status})`);
  return body.session;
}

export const operationalSessionClient = Object.freeze({
  status: () => sessionRequest(""),
  login: (accessKey: string) => sessionRequest("/login", { method: "POST", body: JSON.stringify({ accessKey }) }),
  logout: () => sessionRequest("/logout", { method: "POST", headers: { "X-CSRF-Token": capabilityTransport.csrfToken }, body: JSON.stringify({}) }),
  use: (session: OperationalSession) => {
    capabilityTransport.mode = session.authenticated ? "hosted" : "local";
    capabilityTransport.csrfToken = session.csrfToken ?? "";
  },
  mode: () => capabilityTransport.mode
});

const post = <T, B extends object = Record<string, unknown>>(path: string, body: B, idempotencyKey?: string) => request<T>(
  path,
  { method: "POST", body: JSON.stringify(body) },
  idempotencyKey,
);

export const localNexusClient = Object.freeze({
  status: () => request<Record<string, unknown>>("/status"),
  clientCapabilities: () => request<ClientCapabilityContract>("/client-capabilities"),
  intakeHistory: () => request<IntakeHistory>("/intake/history"),
  intakeUpload: (filename: string, contentBase64: string, projectId?: string) => post<Record<string, unknown>>("/intake/upload", { filename, contentBase64, ...(projectId ? { projectId } : {}) }),
  intakeQuery: (question: string, projectId?: string) => post<{ status: string; answer: string; citations?: Array<Record<string, unknown>> }>("/intake/query", { question, ...(projectId ? { projectId } : {}) }),
  projectCreate: (name: string) => post<{ projectId: string; name: string }>("/projects", { name }),
  artifactTypes: () => request<{ artifacts: ArtifactDefinition[] }>("/projects/artifact-types"),
  projectScope: (projectId: string) => request<ProjectScope>(`/projects/${encodeURIComponent(projectId)}/scope`),
  projectEstimate: (projectId: string) => request<ProjectEstimate>(`/projects/${encodeURIComponent(projectId)}/estimate`),
  projectPlanningModel: (projectId: string) => request<PlanningModel>(`/projects/${encodeURIComponent(projectId)}/planning-model`),
  projectCompile: (projectId: string, artifactType: string, options: Record<string, unknown>) => post<CompiledArtifact>(`/projects/${encodeURIComponent(projectId)}/compile`, { artifactType, options }),
  voiceStatus: () => request<Record<string, unknown>>("/voice-operator/status"),
  voiceHistory: () => request<{ events?: Array<Record<string, unknown>> }>("/voice-operator/history"),
  routeTranscript: (transcript: string, source: "browser_speech" | "text_fallback") => post<VoiceRouteResult>("/voice-operator/route-transcript", { transcript, source }),
  missions: () => request<Record<string, unknown>>("/missions"),
  planMission: (objective: string) => post<Record<string, unknown>>("/missions/plan", { objective }),
  executeMissionStep: (missionId: string, stepId: string) => post<Record<string, unknown>>(`/missions/${encodeURIComponent(missionId)}/execute-step`, { stepId }),
  conclaveWorkspaces: () => request<ConclaveWorkspaceList>("/conclave/workspaces"),
  createConclaveWorkspace: (proposal: string, idempotencyKey: string) => post<ConclaveWorkspaceRecord>(
    "/conclave/workspaces",
    { proposal },
    idempotencyKey,
  ),
  conclaveWorkspace: (missionId: string) => request<ConclaveWorkspaceRecord>(
    `/conclave/workspaces/${encodeURIComponent(missionId)}`,
  ),
  workSessions: () => request<Record<string, unknown>>("/work-sessions"),
  planWorkSession: (objective: string) => post<Record<string, unknown>>("/work-sessions/plan", { objective }),
  startWorkSession: (objective: string) => post<Record<string, unknown>>("/work-sessions/start", { objective }),
  workSession: (sessionId: string) => request<Record<string, unknown>>(`/work-sessions/${encodeURIComponent(sessionId)}`),
  controlWorkSession: (sessionId: string, action: "step" | "continue" | "pause" | "cancel") => post<Record<string, unknown>>(`/work-sessions/${encodeURIComponent(sessionId)}/${action}`, {}),
  workSessionReceipt: (sessionId: string) => request<Record<string, unknown>>(`/work-sessions/${encodeURIComponent(sessionId)}/receipt`),
  approvals: () => request<Record<string, unknown>>("/approvals"),
  approve: (approvalId: string) => post<Record<string, unknown>>(`/approvals/${encodeURIComponent(approvalId)}/approve`, {}),
  deny: (approvalId: string, reason: string) => post<Record<string, unknown>>(`/approvals/${encodeURIComponent(approvalId)}/deny`, { reason }),
  dryRunAction: (action: string) => post<Record<string, unknown>>("/actions/dry-run", { action }),
  executeAction: (action: string) => post<Record<string, unknown>>("/actions/execute", { action, explicitRequest: true }),
  connectors: () => request<Record<string, unknown>>("/connectors"),
  connectorHealth: () => request<Record<string, unknown>>("/connectors/health"),
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
  receipts: () => request<Record<string, unknown>>("/receipts")
});
