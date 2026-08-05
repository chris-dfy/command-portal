import type {
  CanonicalActionRecord,
  CapabilityRegistryProjection,
} from "./types";

export type HostedActionRequirement = {
  capabilityId: string;
  method: string;
  pathTemplate: string;
};

export type HostedSessionAccess = {
  hosted: boolean;
  authenticated: boolean;
  scopes?: readonly string[];
};

export type HostedCapabilityStateView = {
  state: string;
  reason: string;
  diagnostics: readonly string[];
};

// Compatibility identity from the canonical Runtime registry. Keep it out of
// presentation copy while the versioned Runtime contract retains this ID.
export const PROJECTS_PLANNING_CAPABILITY_ID = "projects.nexicron_planning";

export const MODULE_MOUNT_ACTION_REQUIREMENTS: Readonly<
  Record<string, readonly HostedActionRequirement[]>
> = Object.freeze({
  "missions.dashboard": [
    { capabilityId: "mission_executor", method: "GET", pathTemplate: "/missions" },
  ],
  "missions.runtime-evidence": [
    { capabilityId: "mission_executor", method: "GET", pathTemplate: "/missions" },
  ],
  "missions.step-execution": [
    { capabilityId: "mission_executor", method: "GET", pathTemplate: "/missions" },
  ],
  "mission-control.operations-center": [
    { capabilityId: "mission_executor", method: "GET", pathTemplate: "/missions" },
  ],
  "mission-control.mission-dashboard": [
    { capabilityId: "mission_executor", method: "GET", pathTemplate: "/missions" },
  ],
  "mission-control.runtime-missions": [
    { capabilityId: "mission_executor", method: "GET", pathTemplate: "/missions" },
  ],
  "work-sessions.workspace": [
    { capabilityId: "operational.work_sessions", method: "GET", pathTemplate: "/work-sessions" },
  ],
  "replay.timeline": [
    { capabilityId: "operational_replay", method: "GET", pathTemplate: "/operational-replay" },
  ],
  "conclave.workspace": [
    { capabilityId: "conclave", method: "GET", pathTemplate: "/conclave/workspaces" },
  ],
  "knowledge.workspace": [
    { capabilityId: "mission_store", method: "GET", pathTemplate: "/mission-store" },
  ],
  "documents.intake": [
    { capabilityId: "knowledge.document_intake", method: "GET", pathTemplate: "/intake/history" },
  ],
  "edge.monitoring": [
    { capabilityId: "edge_monitoring", method: "GET", pathTemplate: "/runtime-coordination/nodes" },
  ],
  "edge.admission-request": [
    { capabilityId: "edge_node_admission", method: "GET", pathTemplate: "/runtime-coordination/admissions" },
  ],
  "projects.planning": [
    { capabilityId: PROJECTS_PLANNING_CAPABILITY_ID, method: "GET", pathTemplate: "/projects/artifact-types" },
  ],
  "governance.readiness-diagnostics": [
    { capabilityId: "governance", method: "GET", pathTemplate: "/governance/readiness" },
  ],
  "governance.authority-diagnostics": [
    { capabilityId: "authority", method: "GET", pathTemplate: "/authority/readiness" },
  ],
  "voice.operator": [
    { capabilityId: "interaction.human", method: "GET", pathTemplate: "/voice-operator/status" },
  ],
  "voice.runtime-status": [
    { capabilityId: "interaction.human", method: "GET", pathTemplate: "/voice-operator/status" },
  ],
});

function live(classification: string): boolean {
  return ["live_verified", "live_degraded"].includes(classification);
}

function uniqueDiagnosticText(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hostedCapabilityStateView(
  state: string,
  values: readonly string[],
  fallback = "",
): HostedCapabilityStateView {
  const diagnostics = uniqueDiagnosticText(values);
  const normalized = diagnostics.length > 0
    ? diagnostics
    : fallback
      ? [fallback]
      : [];
  return {
    state,
    reason: normalized.join(" "),
    diagnostics: normalized,
  };
}

function actionMatches(
  action: CanonicalActionRecord,
  requirement: HostedActionRequirement,
): boolean {
  return action.capabilityId === requirement.capabilityId
    && action.method === requirement.method
    && action.pathTemplate === requirement.pathTemplate;
}

function canonicalInteractionAvailability(
  projection: CapabilityRegistryProjection | null,
): { available: boolean; reason: string } {
  if (!projection) {
    return {
      available: false,
      reason: "The Runtime-owned Capability Registry projection is being verified.",
    };
  }
  const matches = projection.actions.filter(
    (action) => action.actionId === "canonical.route.post.executive.interactions",
  );
  if (matches.length !== 1) {
    return {
      available: false,
      reason: "The canonical interaction action is missing or ambiguous.",
    };
  }
  const action = matches[0];
  const exact = action.method === "POST"
    && action.pathTemplate === "/executive/interactions"
    && action.invocationSurfaces?.includes("assistant") === true
    && action.invocationPaths.includes(
      "assistant:canonical-adapter:canonical.route.post.executive.interactions",
    );
  const available = exact
    && action.invocable === true
    && action.operationalAvailability === true
    && action.authorityGranted === false
    && live(action.classification);
  return {
    available,
    reason: available
      ? "User intent will enter the live canonical Runtime interaction coordinator; Authority remains separate."
      : [
        exact ? "" : "The canonical interaction action does not match the fixed browser admission contract.",
        action.requiredNextAction,
        ...action.limitations,
      ].filter(Boolean).join(" ") || "The canonical interaction action is unavailable.",
  };
}

export function canonicalHostedActionAvailability(
  projection: CapabilityRegistryProjection | null,
  requirement: HostedActionRequirement,
): { available: boolean; reason: string } {
  if (!projection) {
    return {
      available: false,
      reason: "The Runtime-owned Capability Registry projection is being verified.",
    };
  }
  const action = projection.actions.find((item) => actionMatches(item, requirement));
  if (!action) {
    return {
      available: false,
      reason: `The canonical Registry did not return ${requirement.method} ${requirement.pathTemplate}.`,
    };
  }
  if (action.invocable === true && live(action.classification)) {
    return {
      available: true,
      reason: action.classification === "live_degraded"
        ? "The exact action is available with a recorded degraded limitation."
        : "The exact canonical action is live verified.",
    };
  }
  return {
    available: false,
    reason: [
      action.requiredNextAction,
      ...action.limitations,
    ].filter(Boolean).join(" ")
      || `${requirement.method} ${requirement.pathTemplate} is unavailable.`,
  };
}

export function canonicalHostedControlAvailability(
  projection: CapabilityRegistryProjection | null,
  requirement: HostedActionRequirement,
  access: HostedSessionAccess,
  requiredScope?: string,
): { available: boolean; reason: string } {
  const action = requirement.method === "GET"
    ? canonicalHostedActionAvailability(projection, requirement)
    : canonicalInteractionAvailability(projection);
  if (!action.available || !access.hosted) return action;
  if (!access.authenticated) {
    return {
      available: false,
      reason: "The hosted operational session is not authenticated.",
    };
  }
  const admittedScope = requirement.method === "GET" ? requiredScope : "operations:read";
  if (admittedScope && !access.scopes?.includes(admittedScope)) {
    return {
      available: false,
      reason: `The hosted session lacks ${admittedScope}.`,
    };
  }
  return action;
}

export function hostedSessionActionAvailability<
  T extends { available: boolean; reason: string },
>(
  action: T,
  access: HostedSessionAccess,
  requiredScope?: string,
): T {
  if (!action.available || !access.hosted) return action;
  if (!access.authenticated) {
    return {
      ...action,
      available: false,
      reason: "The hosted operational session is not authenticated.",
    };
  }
  if (requiredScope && !access.scopes?.includes(requiredScope)) {
    return {
      ...action,
      available: false,
      reason: `The hosted session lacks ${requiredScope}.`,
    };
  }
  return action;
}

export function capabilityStateView(
  projection: CapabilityRegistryProjection | null,
  required: readonly string[],
  registryFailure: string,
  mountRequirements: readonly HostedActionRequirement[] = [],
): HostedCapabilityStateView {
  if (!required.length) {
    return hostedCapabilityStateView("not_applicable", [
      "This workspace has no hosted capability contract.",
    ]);
  }
  if (registryFailure) return hostedCapabilityStateView("unavailable", [registryFailure]);
  if (!projection) {
    return hostedCapabilityStateView("checking", [
      "The Runtime-owned Capability Registry projection is being verified.",
    ]);
  }

  const applicable = projection.capabilities.filter(
    (item) => required.includes(item.capabilityId),
  );
  const present = new Set(applicable.map((item) => item.capabilityId));
  const missingCapabilities = required.filter((id) => !present.has(id));
  const liveCapabilities = applicable.filter((item) => live(item.classification));
  const capabilityActions = projection.actions.filter(
    (item) => required.includes(item.capabilityId),
  );
  const liveActions = capabilityActions.filter(
    (action) => action.invocable === true && live(action.classification),
  );
  const mountActionResults = mountRequirements.map((requirement) => ({
    requirement,
    ...canonicalHostedActionAvailability(projection, requirement),
  }));
  const blockedMountActions = mountActionResults.filter(
    (item) => !item.available,
  );

  if (
    (mountRequirements.length > 0 && blockedMountActions.length > 0)
    || (mountRequirements.length === 0
      && (!liveCapabilities.length || !liveActions.length))
  ) {
    const reasons = uniqueDiagnosticText([
      ...blockedMountActions.map((item) => item.reason),
      ...applicable
        .filter((item) => item.classification !== "live_verified")
        .flatMap((item) => [item.requiredNextAction ?? "", ...item.limitations]),
    ]);
    return hostedCapabilityStateView(
      "unavailable",
      reasons,
      "The required hosted read/base action set is unavailable.",
    );
  }

  const blockedActions = capabilityActions.filter(
    (action) => action.invocable !== true || !live(action.classification),
  );
  const degraded = missingCapabilities.length > 0
    || applicable.some((item) => item.classification !== "live_verified")
    || mountActionResults.some((item) => {
      const action = capabilityActions.find((candidate) => (
        actionMatches(candidate, item.requirement)
      ));
      return action?.classification === "live_degraded";
    })
    || blockedActions.length > 0;
  const limitations = uniqueDiagnosticText(blockedActions.flatMap(
    (item) => [item.requiredNextAction ?? "", ...item.limitations],
  ));
  const capabilityLimitations = uniqueDiagnosticText(applicable
    .filter((item) => item.classification !== "live_verified")
    .flatMap((item) => [item.requiredNextAction ?? "", ...item.limitations]));
  return hostedCapabilityStateView(
    degraded ? "degraded" : "live",
    [
      mountRequirements.length
        ? `${mountRequirements.length} required hosted read/base action${mountRequirements.length === 1 ? " is" : "s are"} usable.`
        : `${liveActions.length} canonical action${liveActions.length === 1 ? " is" : "s are"} usable.`,
      blockedActions.length
        ? `${blockedActions.length} independent action${blockedActions.length === 1 ? " remains" : "s remain"} unavailable and must stay disabled at its control.`
        : "",
      missingCapabilities.length
        ? `Supplemental capabilities not returned: ${missingCapabilities.join(", ")}.`
        : "",
      ...capabilityLimitations,
      ...limitations,
      "Authority remains a separate per-action requirement.",
    ],
  );
}

export function moduleCapabilityStateView(
  projection: CapabilityRegistryProjection | null,
  moduleId: string,
  required: readonly string[],
  registryFailure: string,
): HostedCapabilityStateView {
  if (!Object.prototype.hasOwnProperty.call(MODULE_MOUNT_ACTION_REQUIREMENTS, moduleId)) {
    return hostedCapabilityStateView("unavailable", [
      `The hosted mount contract for ${moduleId} is not registered.`,
    ]);
  }
  return capabilityStateView(
    projection,
    required,
    registryFailure,
    MODULE_MOUNT_ACTION_REQUIREMENTS[moduleId],
  );
}
