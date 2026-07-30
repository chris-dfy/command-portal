export type ConnectionState =
  | "Connecting"
  | "Healthy"
  | "Degraded"
  | "Unavailable"
  | "Retrying"
  | "Timed Out"
  | "Version Mismatch"
  | "Schema Mismatch"
  | "Unauthorized"
  | "Unknown";

export type TruthState = {
  productionReady: false;
  enterpriseReady: false;
  cloudPrimary: false;
  localSourceOfTruth: true;
  defaultProvider: "mock_model";
  conclave: "unavailable";
  actualTrainedSLMs: 0;
  secretValuesExposed: false;
};

export type RuntimeMeta = {
  status: string;
  timestamp: string;
  schemaVersion: string;
  runtimeVersion: string;
  proofIds: string[];
  limitations: string[];
};

export type CacheState = {
  lastRefresh: string | null;
  age: number | null;
  stale: boolean;
  expires: string | null;
  cached: boolean;
};

export type GatewayMeta = {
  status: "Healthy" | "Degraded" | "Connecting" | "Retrying";
  connectionState: ConnectionState;
  route: string;
  runtimeUrl: string;
  lastSuccessfulConnection: string | null;
  lastSuccessfulRefresh: string | null;
  cache: CacheState;
  readOnly: true;
  secretValuesExposed: false;
  attempts?: number;
  warning?: string | null;
};

export type GatewayEnvelope<T = unknown> = {
  ok: boolean;
  data: T | null;
  runtime: RuntimeMeta | null;
  gateway: GatewayMeta;
  truth: TruthState;
  error?: { code: string; message: string };
};

export type RuntimeRoute =
  | "status"
  | "health"
  | "ready"
  | "version"
  | "providers"
  | "capabilities"
  | "proofs"
  | "receipts"
  | "environment"
  | "diagnostics"
  | "governance"
  | "connectors"
  | "capability-registry"
  | "conclave"
  | "eox";

export type RuntimeSnapshot = Partial<Record<RuntimeRoute, GatewayEnvelope>>;

export type ProviderRecord = {
  id: string;
  displayName: string;
  modelId?: string | null;
  configured: boolean;
  reachable: boolean;
  verified: boolean;
  liveInferenceVerified?: boolean;
  lastVerificationAt?: string | null;
  lastSuccessfulInferenceAt?: string | null;
  default: boolean;
  hostingMode: string;
  limitations: string[];
};

export type CapabilityClassification =
  | "live_verified"
  | "live_degraded"
  | "configured_unverified"
  | "staged"
  | "simulated"
  | "unavailable";

export type CapabilityDisplayState = "Live" | "Degraded" | "Simulated" | "Unavailable";

export type RegistryFreshness = {
  state?: string;
  stale?: boolean;
  ageSeconds?: number | null;
  maxAgeSeconds?: number | null;
  lastSuccessfulVerification?: string | null;
  expiresAt?: string | null;
  [key: string]: unknown;
};

export type CanonicalCapabilityRecord = {
  capabilityId: string;
  connectorId?: string | null;
  classification: CapabilityClassification;
  operationalAvailability?: string;
  authorizationRequirement?: string;
  lastSuccessfulVerification?: string | null;
  freshness?: RegistryFreshness;
  evidenceReferences?: string[];
  receiptReferences?: string[];
  limitations: string[];
  requiredNextAction?: string;
  [key: string]: unknown;
};

export type CanonicalConnectorRecord = {
  connectorId: string;
  classification?: CapabilityClassification;
  registration: unknown;
  configuration: unknown;
  reachability: unknown;
  verification: unknown;
  health: unknown;
  operationalAvailability: string;
  authorizationRequirement: string;
  lastSuccessfulVerification: string | null;
  freshness: RegistryFreshness;
  evidenceReferences: string[];
  receiptReferences: string[];
  limitations: string[];
  requiredNextAction: string;
  [key: string]: unknown;
};

export type CanonicalActionRecord = {
  actionId: string;
  capabilityId: string;
  connectorId?: string | null;
  handlerId: string;
  operationId: string;
  inputSchemaId: string;
  method?: string;
  pathTemplate?: string;
  fixedTarget?: string;
  invocationSurfaces?: string[];
  invocationPaths: string[];
  classification: CapabilityClassification;
  operationalAvailability?: boolean;
  invocable: boolean;
  authorizationRequirement: string;
  authorityGranted: false;
  limitations: string[];
  requiredNextAction: string;
  [key: string]: unknown;
};

export type ExecutiveContinuityClassification =
  | "hard_blocking"
  | "safely_remediable"
  | "non_blocking_degraded"
  | "operator_action_required";

export type ExecutiveContinuityImpediment = {
  impedimentId: string;
  classification: ExecutiveContinuityClassification;
  limitation: string;
  requiredNextAction: string;
  remediationAction?: {
    actionId?: string;
    classification: "staged" | "unavailable";
    invocable: false;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

export type CapabilityRegistryProjection = {
  recordType: "nexus_live_capability_registry_projection";
  schemaVersion: "nexus.live-capability-registry@1.0.0";
  owner: string;
  generatedAt: string;
  constitutionalBasis: Record<string, unknown>;
  verificationPolicy: Record<string, unknown>;
  authority: {
    authorityGranted: false;
    executionAuthorityIntroduced: false;
    healthyCapabilityImpliesAuthority: false;
    [key: string]: unknown;
  };
  authorityGranted: false;
  noExecutionAuthorityIntroduced: true;
  mission3Admitted: false;
  summary: Record<string, unknown>;
  capabilities: CanonicalCapabilityRecord[];
  connectors: CanonicalConnectorRecord[];
  actions: CanonicalActionRecord[];
  verificationReceipts: Array<string | Record<string, unknown>>;
  executiveContinuity: {
    impediments: ExecutiveContinuityImpediment[];
    [key: string]: unknown;
  };
  limitations: string[];
  secretValuesExposed: false;
};
