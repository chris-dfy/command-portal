export const RUNTIME_BOOTSTRAP_ROUTE = "/api/runtime/bootstrap";
export const RUNTIME_BOOTSTRAP_RECORD_TYPE = "nexus_experience_runtime_bootstrap";
export const RUNTIME_BOOTSTRAP_SCHEMA_VERSION = "1.0.0";

export const RUNTIME_BOOTSTRAP_ROUTE_ENTRIES = Object.freeze([
  Object.freeze(["status", "/api/runtime/status"]),
  Object.freeze(["health", "/api/runtime/health"]),
  Object.freeze(["ready", "/api/runtime/ready"]),
  Object.freeze(["version", "/api/runtime/version"]),
  Object.freeze(["providers", "/api/runtime/providers"]),
  Object.freeze(["capabilities", "/api/runtime/capabilities"]),
  Object.freeze(["proofs", "/api/runtime/proofs"]),
  Object.freeze(["receipts", "/api/runtime/receipts"]),
  Object.freeze(["environment", "/api/runtime/environment"]),
  Object.freeze(["diagnostics", "/api/runtime/diagnostics"]),
  Object.freeze(["governance", "/api/runtime/governance"]),
  Object.freeze(["connectors", "/api/runtime/connectors"]),
  Object.freeze(["capability-registry", "/api/runtime/capability-registry"]),
  Object.freeze(["eox", "/api/runtime/eox"]),
  Object.freeze(["conclave", "/api/runtime/conclave"]),
]);

export const RUNTIME_BOOTSTRAP_ROUTE_KEYS = Object.freeze(
  RUNTIME_BOOTSTRAP_ROUTE_ENTRIES.map(([route]) => route),
);

export const RUNTIME_BOOTSTRAP_ROUTES = Object.freeze(
  Object.fromEntries(RUNTIME_BOOTSTRAP_ROUTE_ENTRIES),
);
