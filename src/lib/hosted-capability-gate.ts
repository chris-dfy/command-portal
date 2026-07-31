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
});

function live(classification: string): boolean {
  return ["live_verified", "live_degraded"].includes(classification);
}

function actionMatches(
  action: CanonicalActionRecord,
  requirement: HostedActionRequirement,
): boolean {
  return action.capabilityId === requirement.capabilityId
    && action.method === requirement.method
    && action.pathTemplate === requirement.pathTemplate;
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
  const action = canonicalHostedActionAvailability(projection, requirement);
  if (!action.available || !access.hosted) return action;
  if (!access.authenticated) {
    return {
      available: false,
      reason: "The hosted operational session is not authenticated.",
    };
  }
  if (requiredScope && !access.scopes?.includes(requiredScope)) {
    return {
      available: false,
      reason: `The hosted session lacks ${requiredScope}.`,
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
) {
  if (!required.length) {
    return {
      state: "not_applicable",
      reason: "This workspace has no hosted capability contract.",
    };
  }
  if (registryFailure) return { state: "unavailable", reason: registryFailure };
  if (!projection) {
    return {
      state: "checking",
      reason: "The Runtime-owned Capability Registry projection is being verified.",
    };
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
    const reasons = [
      ...blockedMountActions.map((item) => item.reason),
      ...applicable
        .filter((item) => !live(item.classification))
        .flatMap((item) => [item.requiredNextAction ?? "", ...item.limitations]),
    ].filter(Boolean);
    return {
      state: "unavailable",
      reason: [...new Set(reasons)].join(" ")
        || "The required hosted read/base action set is unavailable.",
    };
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
  const limitations = blockedActions.flatMap(
    (item) => [item.requiredNextAction ?? "", ...item.limitations],
  ).filter(Boolean);
  return {
    state: degraded ? "degraded" : "live",
    reason: [
      mountRequirements.length
        ? `${mountRequirements.length} required hosted read/base action${mountRequirements.length === 1 ? " is" : "s are"} usable.`
        : `${liveActions.length} canonical action${liveActions.length === 1 ? " is" : "s are"} usable.`,
      blockedActions.length
        ? `${blockedActions.length} independent action${blockedActions.length === 1 ? " remains" : "s remain"} unavailable and must stay disabled at its control.`
        : "",
      missingCapabilities.length
        ? `Supplemental capabilities not returned: ${missingCapabilities.join(", ")}.`
        : "",
      ...limitations,
      "Authority remains a separate per-action requirement.",
    ].filter(Boolean).join(" "),
  };
}
