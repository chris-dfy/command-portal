export const RUNTIME_BOOTSTRAP_ROUTE: "/api/runtime/bootstrap";
export const RUNTIME_BOOTSTRAP_RECORD_TYPE: "nexus_experience_runtime_bootstrap";
export const RUNTIME_BOOTSTRAP_SCHEMA_VERSION: "1.0.0";

export const RUNTIME_BOOTSTRAP_ROUTE_ENTRIES: readonly [
  readonly ["status", "/api/runtime/status"],
  readonly ["health", "/api/runtime/health"],
  readonly ["ready", "/api/runtime/ready"],
  readonly ["version", "/api/runtime/version"],
  readonly ["providers", "/api/runtime/providers"],
  readonly ["capabilities", "/api/runtime/capabilities"],
  readonly ["proofs", "/api/runtime/proofs"],
  readonly ["receipts", "/api/runtime/receipts"],
  readonly ["environment", "/api/runtime/environment"],
  readonly ["diagnostics", "/api/runtime/diagnostics"],
  readonly ["governance", "/api/runtime/governance"],
  readonly ["connectors", "/api/runtime/connectors"],
  readonly ["capability-registry", "/api/runtime/capability-registry"],
  readonly ["eox", "/api/runtime/eox"],
  readonly ["conclave", "/api/runtime/conclave"],
];

export type RuntimeBootstrapRouteKey =
  typeof RUNTIME_BOOTSTRAP_ROUTE_ENTRIES[number][0];

export const RUNTIME_BOOTSTRAP_ROUTE_KEYS: readonly RuntimeBootstrapRouteKey[];
export const RUNTIME_BOOTSTRAP_ROUTES: Readonly<Record<
  RuntimeBootstrapRouteKey,
  string
>>;
