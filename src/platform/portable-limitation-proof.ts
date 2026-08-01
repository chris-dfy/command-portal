type PortableLimitationProjection = {
  state: string;
  reason: string;
  limitationProof?: {
    basis: string;
    evidenceRefs: string[];
  };
};

type PortableLimitationModule = {
  moduleId: string;
  portability: string;
  clients: Record<"desktop" | "web", PortableLimitationProjection>;
};

const LIMITATION_PROOF_BASES = new Set([
  "runtime_contract",
  "authority_boundary",
  "hardware_dependency",
  "external_provider_evidence",
]);
const EVIDENCE_REFERENCE = /^(contract|boundary|evidence):([^#\s]+)#[A-Za-z0-9._:-]+$/;

const RUNTIME_CONTRACT_REFS = Object.freeze([
  "boundary:docs/nexus-runtime-contract/ASSET_PROVISIONING.md#model-native-knowledge-and-explicit-provisioning",
  "contract:docs/ClientParityContract.md#current-registered-operational-scope",
  "contract:server/portal-server.mjs#CANONICAL_OPERATIONAL_ROUTES",
]);
const AUTHORITY_BOUNDARY_REFS = Object.freeze([
  "boundary:docs/nexus-runtime-contract/ASSET_PROVISIONING.md#model-native-knowledge-and-explicit-provisioning",
  "contract:docs/ClientParityContract.md#ownership-boundary",
  "contract:server/portal-server.mjs#CANONICAL_OPERATIONAL_ROUTES",
]);
const HARDWARE_DEPENDENCY_REFS = Object.freeze([
  "boundary:docs/nexus-runtime-contract/ASSET_PROVISIONING.md#model-native-knowledge-and-explicit-provisioning",
  "contract:docs/ClientParityContract.md#ownership-boundary",
  "evidence:src/components/EdgeAdmissionWorkspace.tsx#awaitingNodeProof",
]);
const EXTERNAL_PROVIDER_REFS = Object.freeze([
  "boundary:docs/nexus-runtime-contract/TRUTH_BOUNDARIES.md#truth-boundaries",
  "evidence:server/portal-server.mjs#TRUTH",
  "evidence:src/lib/portal-client.ts#productionReady",
]);

type ApprovedEvidence = Readonly<{
  evidenceRefs: readonly string[];
  reasonTerms: readonly string[];
}>;

const approved = (
  evidenceRefs: readonly string[],
  ...reasonTerms: string[]
): ApprovedEvidence => Object.freeze({ evidenceRefs, reasonTerms: Object.freeze(reasonTerms) });

const BOTH_CLIENTS = Object.freeze(["desktop", "web"] as const);
const WEB_CLIENT = Object.freeze(["web"] as const);

const projectionEntries = (
  moduleId: string,
  basis: string,
  clients: readonly ("desktop" | "web")[],
  evidenceRefs: readonly string[],
  ...reasonTerms: string[]
): readonly (readonly [string, ApprovedEvidence])[] => {
  const evidence = approved(evidenceRefs, ...reasonTerms);
  return clients.map((client) => [`${moduleId}:${client}:${basis}`, evidence] as const);
};

export const PORTABLE_LIMITATION_EVIDENCE_CATALOG: Readonly<Record<string, ApprovedEvidence>> = Object.freeze(Object.fromEntries([
  ...projectionEntries("cloud.hosted-alpha-blockers", "external_provider_evidence", BOTH_CLIENTS, EXTERNAL_PROVIDER_REFS, "alpha blocker", "evidence"),
  ...projectionEntries("cloud.observability-components", "external_provider_evidence", BOTH_CLIENTS, EXTERNAL_PROVIDER_REFS, "observability", "deployment"),
  ...projectionEntries("cloud.observability-readiness", "external_provider_evidence", BOTH_CLIENTS, EXTERNAL_PROVIDER_REFS, "observability", "receipt"),
  ...projectionEntries("cloud.postgres-readiness", "external_provider_evidence", BOTH_CLIENTS, EXTERNAL_PROVIDER_REFS, "Postgres", "provider evidence"),
  ...projectionEntries("cloud.production-boundary", "authority_boundary", BOTH_CLIENTS, AUTHORITY_BOUNDARY_REFS, "Production", "non-production"),
  ...projectionEntries("cloud.team-alpha", "external_provider_evidence", BOTH_CLIENTS, EXTERNAL_PROVIDER_REFS, "team alpha", "verified external provider evidence"),
  ...projectionEntries("cloud.tenant-isolation", "external_provider_evidence", BOTH_CLIENTS, EXTERNAL_PROVIDER_REFS, "tenant-isolation", "postconditions"),
  ...projectionEntries("cloud.workspace-isolation", "external_provider_evidence", BOTH_CLIENTS, EXTERNAL_PROVIDER_REFS, "workspace-isolation", "postconditions"),
  ...projectionEntries("data-platform.workspace", "runtime_contract", BOTH_CLIENTS, RUNTIME_CONTRACT_REFS, "Data Platform", "contract"),
  ...projectionEntries("edge.physical-node-admission", "hardware_dependency", BOTH_CLIENTS, HARDWARE_DEPENDENCY_REFS, "identity", "postcondition"),
  ...projectionEntries("evidence.acceptance-receipt", "runtime_contract", WEB_CLIENT, RUNTIME_CONTRACT_REFS, "acceptance-receipt", "record type"),
  ...projectionEntries("evidence.distribution-receipt", "runtime_contract", WEB_CLIENT, RUNTIME_CONTRACT_REFS, "distribution-receipt", "record type"),
  ...projectionEntries("evidence.package-manifest", "runtime_contract", WEB_CLIENT, RUNTIME_CONTRACT_REFS, "package-manifest", "record type"),
  ...projectionEntries("governance.acceptance-checklist", "runtime_contract", BOTH_CLIENTS, RUNTIME_CONTRACT_REFS, "Acceptance", "postconditions", "receipt"),
  ...projectionEntries("governance.boundary-acknowledgement", "authority_boundary", BOTH_CLIENTS, AUTHORITY_BOUNDARY_REFS, "boundary-acknowledgement", "mutation"),
  ...projectionEntries("governance.first-workflow", "authority_boundary", BOTH_CLIENTS, AUTHORITY_BOUNDARY_REFS, "first-workflow", "exact capability routes"),
  ...projectionEntries("government.workspace", "runtime_contract", BOTH_CLIENTS, RUNTIME_CONTRACT_REFS, "government-specific", "executive operating system"),
  ...projectionEntries("receipts.acceptance-trial", "runtime_contract", WEB_CLIENT, RUNTIME_CONTRACT_REFS, "acceptance-trial", "record type"),
  ...projectionEntries("receipts.distribution-receipt", "runtime_contract", WEB_CLIENT, RUNTIME_CONTRACT_REFS, "distribution receipt", "record type"),
  ...projectionEntries("security.install-checklist", "runtime_contract", BOTH_CLIENTS, RUNTIME_CONTRACT_REFS, "install checklist", "security capability"),
  ...projectionEntries("security.launch-verification", "external_provider_evidence", BOTH_CLIENTS, EXTERNAL_PROVIDER_REFS, "Production launch", "productionReady", "provider postconditions"),
  ...projectionEntries("security.secret-boundary", "authority_boundary", BOTH_CLIENTS, AUTHORITY_BOUNDARY_REFS, "Secret-manager", "administration"),
  ...projectionEntries("storage.provider-summary", "runtime_contract", BOTH_CLIENTS, RUNTIME_CONTRACT_REFS, "storage capability", "provider contract"),
  ...projectionEntries("team.approval-hygiene", "authority_boundary", BOTH_CLIENTS, AUTHORITY_BOUNDARY_REFS, "approval administration", "Authority contract"),
  ...projectionEntries("team.first-run-checklist", "runtime_contract", BOTH_CLIENTS, RUNTIME_CONTRACT_REFS, "First-run readiness", "Runtime contract"),
  ...projectionEntries("team.operator-alpha-readiness", "external_provider_evidence", BOTH_CLIENTS, EXTERNAL_PROVIDER_REFS, "Operator alpha readiness", "not verified"),
  ...projectionEntries("team.operator-handoff", "authority_boundary", BOTH_CLIENTS, AUTHORITY_BOUNDARY_REFS, "operator handoff", "workflow"),
  ...projectionEntries("team.operator-runbook", "runtime_contract", BOTH_CLIENTS, RUNTIME_CONTRACT_REFS, "operator runbook", "registered Runtime operation", "receipt contract"),
  ...projectionEntries("team.operator-trial", "runtime_contract", BOTH_CLIENTS, RUNTIME_CONTRACT_REFS, "operator trial", "capability"),
  ...projectionEntries("team.readiness", "external_provider_evidence", BOTH_CLIENTS, EXTERNAL_PROVIDER_REFS, "team readiness", "not verified"),
  ...projectionEntries("work-sessions.continuation", "authority_boundary", BOTH_CLIENTS, AUTHORITY_BOUNDARY_REFS, "Continuation", "Authority"),
  ...projectionEntries("work-sessions.step-execution", "authority_boundary", BOTH_CLIENTS, AUTHORITY_BOUNDARY_REFS, "Step execution", "Authority", "postcondition"),
]));

export function assertPortableLimitationProjection(
  moduleId: string,
  client: "desktop" | "web",
  projection: PortableLimitationProjection,
): void {
  if (projection.state !== "unavailable") return;
  const proof = projection.limitationProof;
  if (!proof || !LIMITATION_PROOF_BASES.has(proof.basis)) {
    throw new Error(`Portable module ${moduleId} is unavailable in ${client} without a contract-backed limitation proof.`);
  }
  const catalogKey = `${moduleId}:${client}:${proof.basis}`;
  const catalog = PORTABLE_LIMITATION_EVIDENCE_CATALOG[catalogKey];
  if (!catalog) {
    throw new Error(`Portable module ${moduleId} has no approved evidence catalog entry for ${proof.basis}.`);
  }
  if (proof.evidenceRefs.length < 2 || new Set(proof.evidenceRefs).size !== proof.evidenceRefs.length) {
    throw new Error(`Portable module ${moduleId} requires two distinct ${client} limitation evidence references.`);
  }
  if (proof.evidenceRefs.some((reference) => !EVIDENCE_REFERENCE.test(reference))) {
    throw new Error(`Portable module ${moduleId} has a malformed ${client} limitation evidence reference.`);
  }
  if (!proof.evidenceRefs.some((reference) => reference.startsWith("boundary:"))) {
    throw new Error(`Portable module ${moduleId} has no explicit ${client} truth-boundary evidence reference.`);
  }
  if (proof.evidenceRefs.some((reference) => /surface-registry|source[-_ ]presence|implementation[-_ ]absence/i.test(reference))) {
    throw new Error(`Portable module ${moduleId} uses circular or implementation-absence ${client} evidence.`);
  }
  if (
    proof.evidenceRefs.length !== catalog.evidenceRefs.length
    || proof.evidenceRefs.some((reference, index) => reference !== catalog.evidenceRefs[index])
  ) {
    throw new Error(`Portable module ${moduleId} does not match its approved ${client} limitation evidence catalog.`);
  }
  if (catalog.reasonTerms.some((term) => !projection.reason.toLowerCase().includes(term.toLowerCase()))) {
    throw new Error(`Portable module ${moduleId} does not state its approved ${client} limitation basis.`);
  }
  if (/not (?:copied|implemented)|source (?:is|was) absent|source presence|source artifact|implementation absence/i.test(projection.reason)) {
    throw new Error(`Portable module ${moduleId} uses implementation absence as a ${client} limitation.`);
  }
}

export function assertPortableLimitationProofs(
  modules: readonly PortableLimitationModule[],
): void {
  for (const module of modules) {
    if (module.portability !== "portable") continue;
    for (const client of ["desktop", "web"] as const) {
      assertPortableLimitationProjection(module.moduleId, client, module.clients[client]);
    }
  }
}
