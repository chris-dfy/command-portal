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
  conclave: "staged";
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
