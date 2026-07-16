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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const hosted = capabilityTransport.mode === "hosted";
  const response = await fetch(`${hosted ? "/api/operations" : "/api/local"}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(hosted && options.method === "POST" ? { "X-CSRF-Token": capabilityTransport.csrfToken, "Idempotency-Key": globalThis.crypto.randomUUID() } : {}),
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

const post = <T,>(path: string, body: Record<string, unknown>) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

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
  proofs: () => request<Record<string, unknown>>("/proofs"),
  receipts: () => request<Record<string, unknown>>("/receipts")
});
