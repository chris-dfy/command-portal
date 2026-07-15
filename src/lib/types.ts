export type ConnectionState = "connected" | "local_only" | "hosted_sandbox_connected" | "externally_reachable" | "configured_not_connected" | "disconnected" | "stale" | "unavailable";

export type PortalMeta = {
  schemaVersion: "1.0";
  generatedAt: string;
  sourceOfTruth: "nexus_runtime" | "contract_fixture";
  readOnly: true;
  dataMode: "contract_fixture" | "local_runtime" | "disconnected";
  verificationEnvironment: string;
  connectionState: ConnectionState;
  cached: boolean;
  stale: boolean;
  fetchedAt?: string;
  expiresAt?: string;
  limitations: string[];
  proofIds: string[];
  receiptIds: string[];
  productionReady: false;
  enterpriseReady: false;
  cloudPrimary: false;
  localSourceOfTruth: true;
  secretValuesExposed: false;
};

export type PortalEnvelope<T = unknown> = {
  ok: boolean;
  data: T | null;
  meta: PortalMeta;
  error?: { code: string; message: string };
};

export type DomainEnvelope = PortalEnvelope<Record<string, unknown>>;
export type PortalSnapshot = {
  brand: { appId: string; displayName: string; shortName: string; parentBrand: string };
  referenceFixture: boolean;
  fixtureLabel?: string;
  domains: Record<string, DomainEnvelope>;
  failedDomains: string[];
};
