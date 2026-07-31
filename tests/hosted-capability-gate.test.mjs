import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/hosted-capability-gate.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const gate = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const action = ({
  actionId,
  capabilityId,
  method,
  pathTemplate,
  invocable,
  classification,
}) => ({
  actionId,
  capabilityId,
  handlerId: actionId,
  operationId: actionId,
  inputSchemaId: "schema",
  method,
  pathTemplate,
  invocationPaths: [],
  classification,
  invocable,
  authorizationRequirement: "per_action",
  authorityGranted: false,
  limitations: invocable ? [] : [`${actionId} remains unavailable.`],
  requiredNextAction: invocable ? "" : `Verify ${actionId}.`,
});

function projection(actions) {
  return {
    capabilities: [{
      capabilityId: "operational.work_sessions",
      classification: "live_verified",
      limitations: [],
      requiredNextAction: "",
    }],
    actions,
  };
}

const readRequirement = {
  capabilityId: "operational.work_sessions",
  method: "GET",
  pathTemplate: "/work-sessions",
};

test("a partially available Work Session capability still mounts its workspace", () => {
  const state = gate.capabilityStateView(
    projection([
      action({
        actionId: "work-sessions.read",
        capabilityId: "operational.work_sessions",
        method: "GET",
        pathTemplate: "/work-sessions",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "work-sessions.step",
        capabilityId: "operational.work_sessions",
        method: "POST",
        pathTemplate: "/work-sessions/{session_id}/step",
        invocable: false,
        classification: "unavailable",
      }),
    ]),
    ["operational.work_sessions"],
    "",
    [readRequirement],
  );
  assert.equal(state.state, "degraded");
  assert.match(state.reason, /required hosted read\/base action is usable/i);
  assert.match(state.reason, /independent action remains unavailable/i);
});

test("the same unavailable mutation stays disabled at its own control", () => {
  const result = gate.canonicalHostedActionAvailability(
    projection([
      action({
        actionId: "work-sessions.read",
        capabilityId: "operational.work_sessions",
        method: "GET",
        pathTemplate: "/work-sessions",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "work-sessions.step",
        capabilityId: "operational.work_sessions",
        method: "POST",
        pathTemplate: "/work-sessions/{session_id}/step",
        invocable: false,
        classification: "unavailable",
      }),
    ]),
    {
      capabilityId: "operational.work_sessions",
      method: "POST",
      pathTemplate: "/work-sessions/{session_id}/step",
    },
  );
  assert.equal(result.available, false);
  assert.match(result.reason, /step/);
});

test("a missing or blocked required read/base action fails closed", () => {
  for (const actions of [
    [],
    [action({
      actionId: "work-sessions.read",
      capabilityId: "operational.work_sessions",
      method: "GET",
      pathTemplate: "/work-sessions",
      invocable: false,
      classification: "unavailable",
    })],
  ]) {
    const state = gate.capabilityStateView(
      projection(actions),
      ["operational.work_sessions"],
      "",
      [readRequirement],
    );
    assert.equal(state.state, "unavailable");
  }
});

test("Mission planning stays available when only execute-step is unavailable", () => {
  const missionProjection = {
    capabilities: [{
      capabilityId: "mission_executor",
      classification: "live_degraded",
      limitations: ["Step execution is unavailable."],
      requiredNextAction: "Verify per-step Authority.",
    }],
    actions: [
      action({
        actionId: "missions.plan",
        capabilityId: "mission_executor",
        method: "POST",
        pathTemplate: "/missions/plan",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "missions.execute-step",
        capabilityId: "mission_executor",
        method: "POST",
        pathTemplate: "/missions/{mission_id}/execute-step",
        invocable: false,
        classification: "unavailable",
      }),
    ],
  };
  assert.equal(gate.canonicalHostedActionAvailability(
    missionProjection,
    {
      capabilityId: "mission_executor",
      method: "POST",
      pathTemplate: "/missions/plan",
    },
  ).available, true);
  assert.equal(gate.canonicalHostedActionAvailability(
    missionProjection,
    {
      capabilityId: "mission_executor",
      method: "POST",
      pathTemplate: "/missions/{mission_id}/execute-step",
    },
  ).available, false);
});

test("an exact live action still requires its exact hosted session scope", () => {
  const workSessionProjection = projection([
    action({
      actionId: "work-sessions.plan",
      capabilityId: "operational.work_sessions",
      method: "POST",
      pathTemplate: "/work-sessions/plan",
      invocable: true,
      classification: "live_verified",
    }),
  ]);
  const requirement = {
    capabilityId: "operational.work_sessions",
    method: "POST",
    pathTemplate: "/work-sessions/plan",
  };
  const denied = gate.canonicalHostedControlAvailability(
    workSessionProjection,
    requirement,
    {
      hosted: true,
      authenticated: true,
      scopes: ["operations:read"],
    },
    "operations:write",
  );
  assert.equal(denied.available, false);
  assert.match(denied.reason, /lacks operations:write/);

  const admitted = gate.canonicalHostedControlAvailability(
    workSessionProjection,
    requirement,
    {
      hosted: true,
      authenticated: true,
      scopes: ["operations:read", "operations:write"],
    },
    "operations:write",
  );
  assert.equal(admitted.available, true);
});

test("Conclave create, run, and Evidence controls retain independent action and scope truth", () => {
  const conclaveProjection = {
    capabilities: [
      {
        capabilityId: "conclave",
        classification: "live_degraded",
        limitations: ["Run remains unavailable."],
        requiredNextAction: "Verify the canonical run action.",
      },
      {
        capabilityId: "evidence",
        classification: "live_verified",
        limitations: [],
        requiredNextAction: "",
      },
    ],
    actions: [
      action({
        actionId: "conclave.create",
        capabilityId: "conclave",
        method: "POST",
        pathTemplate: "/conclave/workspaces",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "conclave.run",
        capabilityId: "conclave",
        method: "POST",
        pathTemplate: "/conclave/workspaces/{mission_id}/run",
        invocable: false,
        classification: "unavailable",
      }),
      action({
        actionId: "conclave.evidence",
        capabilityId: "evidence",
        method: "POST",
        pathTemplate: "/conclave/workspaces/{mission_id}/tasks/{task_id}/evidence",
        invocable: true,
        classification: "live_verified",
      }),
    ],
  };
  const access = {
    hosted: true,
    authenticated: true,
    scopes: ["operations:read", "operations:write", "evidence:write"],
  };
  const create = gate.canonicalHostedControlAvailability(
    conclaveProjection,
    {
      capabilityId: "conclave",
      method: "POST",
      pathTemplate: "/conclave/workspaces",
    },
    access,
    "operations:write",
  );
  const run = gate.canonicalHostedControlAvailability(
    conclaveProjection,
    {
      capabilityId: "conclave",
      method: "POST",
      pathTemplate: "/conclave/workspaces/{mission_id}/run",
    },
    access,
    "operations:write",
  );
  const evidence = gate.canonicalHostedControlAvailability(
    conclaveProjection,
    {
      capabilityId: "evidence",
      method: "POST",
      pathTemplate: "/conclave/workspaces/{mission_id}/tasks/{task_id}/evidence",
    },
    access,
    "evidence:write",
  );
  assert.equal(create.available, true);
  assert.equal(run.available, false);
  assert.match(run.reason, /run/);
  assert.equal(evidence.available, true);
  assert.equal(gate.canonicalHostedControlAvailability(
    conclaveProjection,
    {
      capabilityId: "evidence",
      method: "POST",
      pathTemplate: "/conclave/workspaces/{mission_id}/tasks/{task_id}/evidence",
    },
    { ...access, scopes: ["operations:read", "operations:write"] },
    "evidence:write",
  ).available, false);
});

test("Document history, upload, and query controls cannot borrow sibling action or scope availability", () => {
  const documentProjection = {
    capabilities: [{
      capabilityId: "knowledge.document_intake",
      classification: "live_degraded",
      limitations: ["Upload remains unavailable."],
      requiredNextAction: "Verify document upload.",
    }],
    actions: [
      action({
        actionId: "intake.history",
        capabilityId: "knowledge.document_intake",
        method: "GET",
        pathTemplate: "/intake/history",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "intake.upload",
        capabilityId: "knowledge.document_intake",
        method: "POST",
        pathTemplate: "/intake/upload",
        invocable: false,
        classification: "unavailable",
      }),
      action({
        actionId: "intake.query",
        capabilityId: "knowledge.document_intake",
        method: "POST",
        pathTemplate: "/intake/query",
        invocable: true,
        classification: "live_verified",
      }),
    ],
  };
  const readOnlyAccess = {
    hosted: true,
    authenticated: true,
    scopes: ["operations:read", "evidence:write"],
  };
  const mountRequirement = gate.MODULE_MOUNT_ACTION_REQUIREMENTS["documents.intake"];
  assert.equal(mountRequirement.length, 1);
  assert.equal(gate.capabilityStateView(
    documentProjection,
    ["knowledge.document_intake"],
    "",
    mountRequirement,
  ).state, "degraded");
  assert.equal(gate.canonicalHostedControlAvailability(
    documentProjection,
    {
      capabilityId: "knowledge.document_intake",
      method: "GET",
      pathTemplate: "/intake/history",
    },
    readOnlyAccess,
    "operations:read",
  ).available, true);
  assert.equal(gate.canonicalHostedControlAvailability(
    documentProjection,
    {
      capabilityId: "knowledge.document_intake",
      method: "POST",
      pathTemplate: "/intake/upload",
    },
    readOnlyAccess,
    "evidence:write",
  ).available, false);
  const queryAllowed = gate.canonicalHostedControlAvailability(
    documentProjection,
    {
      capabilityId: "knowledge.document_intake",
      method: "POST",
      pathTemplate: "/intake/query",
    },
    readOnlyAccess,
    "operations:read",
  );
  assert.equal(queryAllowed.available, true);
  assert.equal(gate.canonicalHostedControlAvailability(
    documentProjection,
    {
      capabilityId: "knowledge.document_intake",
      method: "POST",
      pathTemplate: "/intake/query",
    },
    { ...readOnlyAccess, scopes: ["evidence:write"] },
    "operations:read",
  ).available, false);
  const blockedHistoryProjection = {
    ...documentProjection,
    actions: documentProjection.actions.map((item) => (
      item.actionId === "intake.history"
        ? { ...item, invocable: false, classification: "unavailable" }
        : item
    )),
  };
  assert.equal(gate.capabilityStateView(
    blockedHistoryProjection,
    ["knowledge.document_intake"],
    "",
    mountRequirement,
  ).state, "unavailable");
});

test("Project, Knowledge, Edge, and canonical execution mutations retain exact sibling action truth", () => {
  const exactProjection = {
    capabilities: [],
    actions: [
      action({
        actionId: "projects.create",
        capabilityId: "projects.nexicron_planning",
        method: "POST",
        pathTemplate: "/projects",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "projects.compile",
        capabilityId: "projects.nexicron_planning",
        method: "POST",
        pathTemplate: "/projects/{project_id}/compile",
        invocable: false,
        classification: "unavailable",
      }),
      action({
        actionId: "knowledge.baseline",
        capabilityId: "knowledge_acquisition",
        method: "POST",
        pathTemplate: "/runtime/baselines",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "knowledge.candidate",
        capabilityId: "knowledge_promotion",
        method: "POST",
        pathTemplate: "/knowledge/acquisitions/{mission_id}/promotion-candidates",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "knowledge.promote",
        capabilityId: "knowledge_promotion",
        method: "POST",
        pathTemplate: "/knowledge/promotions",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "edge.create",
        capabilityId: "edge_node_admission",
        method: "POST",
        pathTemplate: "/runtime-coordination/admissions",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "edge.cancel",
        capabilityId: "edge_node_admission",
        method: "POST",
        pathTemplate: "/runtime-coordination/admissions/{admission_id}/cancel",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "edge.reissue",
        capabilityId: "edge_node_admission",
        method: "POST",
        pathTemplate: "/runtime-coordination/admissions/{admission_id}/challenge/reissue",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "canonical.create",
        capabilityId: "canonical_execution_spine",
        method: "POST",
        pathTemplate: "/executive-authority/canonical-execution/missions",
        invocable: true,
        classification: "live_verified",
      }),
      action({
        actionId: "canonical.execute",
        capabilityId: "canonical_execution_spine",
        method: "POST",
        pathTemplate: "/executive-authority/canonical-execution/missions/{mission_id}/actions",
        invocable: false,
        classification: "unavailable",
      }),
    ],
  };
  const operationsWrite = {
    hosted: true,
    authenticated: true,
    scopes: ["operations:write", "edge:node_admission:request"],
  };
  const available = (capabilityId, pathTemplate, scope = "operations:write") => (
    gate.canonicalHostedControlAvailability(
      exactProjection,
      { capabilityId, method: "POST", pathTemplate },
      operationsWrite,
      scope,
    )
  );

  assert.equal(available("projects.nexicron_planning", "/projects").available, true);
  assert.equal(available(
    "projects.nexicron_planning",
    "/projects/{project_id}/compile",
  ).available, false);
  assert.equal(available("knowledge_acquisition", "/runtime/baselines").available, true);
  assert.equal(available(
    "knowledge_promotion",
    "/knowledge/acquisitions/{mission_id}/promotion-candidates",
  ).available, true);
  assert.equal(available(
    "knowledge_promotion",
    "/knowledge/promotions",
    "knowledge:promote",
  ).available, false);
  assert.equal(available(
    "edge_node_admission",
    "/runtime-coordination/admissions",
    "edge:node_admission:request",
  ).available, true);
  assert.equal(available(
    "edge_node_admission",
    "/runtime-coordination/admissions/{admission_id}/cancel",
    "edge:node_admission:request",
  ).available, true);
  assert.equal(available(
    "edge_node_admission",
    "/runtime-coordination/admissions/{admission_id}/challenge/reissue",
    "edge:node_admission:review",
  ).available, false);
  assert.equal(gate.canonicalHostedActionAvailability(
    exactProjection,
    {
      capabilityId: "canonical_execution_spine",
      method: "POST",
      pathTemplate: "/executive-authority/canonical-execution/missions",
    },
  ).available, true);
  assert.equal(gate.canonicalHostedActionAvailability(
    exactProjection,
    {
      capabilityId: "canonical_execution_spine",
      method: "POST",
      pathTemplate: "/executive-authority/canonical-execution/missions/{mission_id}/actions",
    },
  ).available, false);
});

test("global HIF and voice actions require the hosted operations write scope independently", () => {
  const actionState = {
    available: true,
    state: "live_verified",
    actionId: "context.runtime.route.post.runtime.interactions",
    reason: "The exact canonical action is live verified.",
  };
  const denied = gate.hostedSessionActionAvailability(
    actionState,
    {
      hosted: true,
      authenticated: true,
      scopes: ["operations:read"],
    },
    "operations:write",
  );
  assert.equal(denied.available, false);
  assert.equal(denied.actionId, actionState.actionId);
  assert.match(denied.reason, /lacks operations:write/);
  const available = gate.hostedSessionActionAvailability(
    actionState,
    {
      hosted: true,
      authenticated: true,
      scopes: ["operations:read", "operations:write"],
    },
    "operations:write",
  );
  assert.deepEqual(available, actionState);
  const independentlyUnavailable = gate.hostedSessionActionAvailability(
    { ...actionState, available: false, reason: "Realtime voice is unavailable." },
    {
      hosted: true,
      authenticated: true,
      scopes: ["operations:write"],
    },
    "operations:write",
  );
  assert.equal(independentlyUnavailable.available, false);
  assert.match(independentlyUnavailable.reason, /Realtime voice/);
});
