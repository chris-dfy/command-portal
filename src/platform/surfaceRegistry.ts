import registryDocument from "./surface-registry.json";
import { assertPortableLimitationProofs } from "./portable-limitation-proof";

export type NexusClientId = "desktop" | "web";
export type NexusSurfaceState = "functional" | "read_only" | "local_only" | "unavailable";
export type NexusModulePortability = "portable" | "local_only" | "hosted_only";
export type NexusSurfaceGroup = "Platform" | "Intelligence" | "Infrastructure" | "Governance" | "Experience" | "Operations";
export type NexusSurfaceIcon =
  | "dashboard"
  | "missions"
  | "replay"
  | "conclave"
  | "knowledge"
  | "edge"
  | "mission-control"
  | "settings"
  | "documents"
  | "projects"
  | "data-platform"
  | "providers"
  | "runtime"
  | "connectors"
  | "storage"
  | "cloud"
  | "team"
  | "governance"
  | "capability-ledger"
  | "evidence"
  | "security"
  | "receipts"
  | "voice"
  | "executive-views"
  | "work-sessions"
  | "government";

export type NexusSurfaceId = NexusSurfaceIcon;

export type NexusSurfaceClientState = {
  route: string;
  state: NexusSurfaceState;
  reason: string;
};

export type NexusModuleClientState = {
  state: NexusSurfaceState;
  reason: string;
  componentKey: string | null;
  limitationProof?: {
    basis: "runtime_contract" | "authority_boundary" | "hardware_dependency" | "external_provider_evidence";
    evidenceRefs: string[];
  };
};

export type NexusModuleDefinition = {
  moduleId: string;
  label: string;
  portability: NexusModulePortability;
  capabilityIds: string[];
  clients: Record<NexusClientId, NexusModuleClientState>;
};

export type NexusSurfaceDefinition = {
  id: NexusSurfaceId;
  label: string;
  detail: string;
  group: NexusSurfaceGroup;
  icon: NexusSurfaceIcon;
  executive: boolean;
  capabilityIds: string[];
  webOperationalSessionRequired: boolean;
  webHostedContract: boolean;
  clients: Record<NexusClientId, NexusSurfaceClientState>;
  modules: NexusModuleDefinition[];
};

export type NexusSurfaceRegistryDocument = {
  recordType: "nexus_experience_surface_registry";
  schemaVersion: "nexus.experience-surface-registry@1.0.0";
  constitutionalBasis: {
    registryId: "NCR";
    releaseId: "NCR-1.0.0";
    releaseDigest: "sha256:212678643019c07c38d11c6abf4b4810fb87b5b8cf543b6ccdc958dcb9bdaffa";
    resolverVersion: "1.0.0";
    principleEntryIds: string[];
  };
  principleImpact: "no_constitutional_change";
  clients: NexusClientId[];
  surfaces: NexusSurfaceDefinition[];
};

export const NEXUS_SURFACE_REGISTRY = Object.freeze(
  registryDocument as NexusSurfaceRegistryDocument,
);

export const NEXUS_SURFACES = Object.freeze(
  NEXUS_SURFACE_REGISTRY.surfaces,
);

export const NEXUS_MODULES = Object.freeze(
  NEXUS_SURFACES.flatMap((surface) => surface.modules),
);

export function assertNexusPortableLimitationProofs(
  modules: readonly NexusModuleDefinition[] = NEXUS_MODULES,
): void {
  assertPortableLimitationProofs(modules);
}

assertNexusPortableLimitationProofs();

export const NEXUS_WEB_SURFACES = Object.freeze(
  NEXUS_SURFACES.map((surface) => Object.freeze({
    ...surface,
    capabilityIds: Object.freeze([...surface.capabilityIds]),
    client: Object.freeze({ ...surface.clients.web }),
  })),
);

export const NEXUS_EXECUTIVE_SURFACES = Object.freeze(
  NEXUS_WEB_SURFACES.filter((surface) => surface.executive),
);

export const NEXUS_SURFACE_GROUPS: readonly NexusSurfaceGroup[] = Object.freeze([
  "Platform",
  "Intelligence",
  "Infrastructure",
  "Governance",
  "Experience",
  "Operations",
]);

export function nexusSurfaceById(id: string): NexusSurfaceDefinition | null {
  return NEXUS_SURFACES.find((surface) => surface.id === id) ?? null;
}

export function nexusModulesForSurface(
  surfaceId: string,
): readonly NexusModuleDefinition[] {
  return nexusSurfaceById(surfaceId)?.modules ?? [];
}

export function nexusModuleById(
  moduleId: string,
): NexusModuleDefinition | null {
  return NEXUS_MODULES.find((module) => module.moduleId === moduleId) ?? null;
}

export function nexusModuleComponentKeys(
  client: NexusClientId,
): readonly string[] {
  return NEXUS_MODULES.flatMap((module) => {
    const key = module.clients[client].componentKey;
    return key ? [key] : [];
  });
}

export function assertNexusModuleComponentMap(
  client: NexusClientId,
  components: Readonly<Record<string, unknown>>,
): void {
  const expected = [...nexusModuleComponentKeys(client)].sort();
  const unique = [...new Set(expected)];
  if (unique.length !== expected.length) {
    const duplicate = expected.find((key, index) => key === expected[index - 1]);
    throw new Error(`The canonical ${client} module registry repeats component key: ${duplicate ?? "unknown"}.`);
  }
  const actual = Object.keys(components).sort();
  const missing = expected.filter((key) => !Object.prototype.hasOwnProperty.call(components, key));
  const extra = actual.filter((key) => !unique.includes(key));
  if (missing.length || extra.length) {
    throw new Error(
      `The ${client} component map does not match the canonical module registry. `
      + `Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`,
    );
  }
}

export function nexusSurfaceSourceClass(
  surface: Pick<NexusSurfaceDefinition, "clients">,
  client: NexusClientId,
  runtimeEvidenceVerified = false,
): "runtime_evidence" | "platform_knowledge" | "presentation_only" {
  const projection = surface.clients[client];
  if (projection.state === "unavailable" || projection.state === "local_only") {
    return "presentation_only";
  }
  return runtimeEvidenceVerified ? "runtime_evidence" : "platform_knowledge";
}

export function nexusSurfaceFromWebPath(pathname: string): NexusSurfaceDefinition | null {
  const normalized = `/${pathname}`.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  return NEXUS_SURFACES.find(({ clients }) => (
    normalized === clients.web.route
    || (clients.web.route !== "/" && normalized.startsWith(`${clients.web.route}/`))
  )) ?? null;
}
