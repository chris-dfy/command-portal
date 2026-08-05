import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const transpile = (source, fileName) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName,
}).outputText;

const coordinationSource = `
export const runBoundedTask = (task) => task(new AbortController().signal);
export const createSerializedRefresh = (refresh) => {
  let pending = null;
  return () => pending ??= Promise.resolve(refresh()).finally(() => { pending = null; });
};`;
const coordinationUrl = `data:text/javascript;base64,${Buffer.from(coordinationSource).toString("base64")}`;
const localSource = (await readFile(new URL("../src/lib/local-client.ts", import.meta.url), "utf8"))
  .replace('from "./request-coordination.mjs"', `from "${coordinationUrl}"`);
const localUrl = `data:text/javascript;base64,${Buffer.from(transpile(localSource, "local-client.ts")).toString("base64")}`;
const admissionSource = (await readFile(new URL("../src/lib/runtime-voice-admission.ts", import.meta.url), "utf8"))
  .replace('from "./local-client"', `from "${localUrl}"`);
const admissionUrl = `data:text/javascript;base64,${Buffer.from(transpile(admissionSource, "runtime-voice-admission.ts")).toString("base64")}`;
const admission = await import(admissionUrl);

const INTERACTION_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const request = {
  interaction_id: INTERACTION_ID,
  session_id: SESSION_ID,
  input: { modality: "text", text: "Open Projects", source_client: "nexus-command" },
  context: { active_object_ids: [], conversation_id: SESSION_ID },
};
const result = (overrides = {}) => ({
  interaction_id: INTERACTION_ID,
  classification: "question",
  status: "answered",
  response_text: "Canonical Runtime response.",
  intent: { intent_type: "informational" },
  mission_id: null,
  authority_decision: { decision: "not_applicable" },
  execution: { attempted: false, executed: false, execution_scope: null },
  verification: { verified: false },
  receipt_id: null,
  execution_scope: null,
  ...overrides,
});

const localEnvelope = (data) => ({
  ok: true,
  data,
  local: {
    mode: "local_first",
    route: "/executive/interactions",
    runtimeUrl: "http://127.0.0.1:8765",
    enabled: true,
    authoritative: "NEXUS Runtime",
    contextAssemblyOwner: "NEXUS Runtime",
    secretValuesExposed: false,
  },
  truth: {
    productionReady: false,
    enterpriseReady: false,
    cloudPrimary: false,
    localSourceOfTruth: true,
    secretValuesExposed: false,
  },
});

const retainedEnvelope = (inputRequest = request) => ({
  ...inputRequest,
  actor: { actor_id: "operator-1", tenant_id: "tenant-alpha", roles: ["admin"] },
  context: { ...inputRequest.context, workspace_id: "workspace-alpha" },
});

const executedResult = () => result({
  classification: "action",
  status: "executed",
  response_text: "Executed and independently verified.",
  authority_decision: { decision: "allow" },
  execution_scope: "runtime",
  execution: {
    attempted: true,
    executed: true,
    execution_scope: "runtime",
    underlying_execution_receipt_id: "EXECUTION-RECEIPT-001",
  },
  verification: { verified: true },
  receipt_id: "INTERACTION-RECEIPT-001",
});

test("canonical projection admits informational answers and validates the interaction binding", () => {
  const projected = admission.projectExecutiveInteraction(result(), request, INTERACTION_ID);
  assert.equal(projected.path, "executive_interaction");
  assert.equal(projected.status, "answered");
  assert.equal(projected.spokenSummary, "Canonical Runtime response.");
  const verifiedAnswer = result({
    verification: {
      verified: true,
      method: "read_only_response_proof",
      evidence: { checks: [{ name: "external_effects", passed: true, observed: false }] },
    },
  });
  assert.equal(
    admission.projectExecutiveInteraction(verifiedAnswer, request, INTERACTION_ID).status,
    "answered",
  );
  assert.throws(
    () => admission.projectExecutiveInteraction(result({ interaction_id: "33333333-3333-4333-8333-333333333333" }), request, INTERACTION_ID),
    /different interaction/,
  );
  for (const invalid of [
    { authority_decision: { decision: "allow" } },
    { execution: { attempted: true, executed: false, execution_scope: "runtime" } },
    { execution: { attempted: false, executed: true, execution_scope: "runtime" } },
    { execution_scope: "runtime" },
    { verification: {} },
  ]) {
    assert.throws(
      () => admission.projectExecutiveInteraction(result(invalid), request, INTERACTION_ID),
      /answer without matching non-execution and Authority semantics|explicit execution and verification truth values/,
    );
  }
});

test("client presentation is admitted only from explicit Runtime execution_scope", () => {
  const scoped = admission.projectExecutiveInteraction(result({
    classification: "action",
    execution_scope: "client_presentation",
    presentation: { action: "navigate", target: "projects" },
  }), request, INTERACTION_ID);
  assert.equal(admission.runtimePresentationNavigation(scoped), "projects");

  assert.throws(() => admission.projectExecutiveInteraction(result({
    classification: "action",
    presentation: { action: "navigate", target: "projects" },
  }), request, INTERACTION_ID), /malformed or unscoped client presentation effect/);
  assert.throws(() => admission.projectExecutiveInteraction(result({
    classification: "action",
    execution_scope: "client_presentation",
    presentation: {},
  }), request, INTERACTION_ID), /malformed or unscoped client presentation effect/);

  assert.throws(() => admission.projectExecutiveInteraction(result({
    classification: "action",
    execution_scope: "client_presentation",
    presentation: Object.fromEntries([["navigate", "projects"]]),
  }), request, INTERACTION_ID), /malformed or unscoped client presentation effect/);

  assert.throws(() => admission.projectExecutiveInteraction(result({
    classification: "action",
    execution_scope: "client_presentation",
    presentation: { action: "navigate", target: "projects", focus: "project-list" },
  }), request, INTERACTION_ID), /malformed or unscoped client presentation effect/);

  assert.throws(() => admission.projectExecutiveInteraction(result({
    execution_scope: "runtime",
    presentation: { action: "navigate", target: "projects" },
  }), request, INTERACTION_ID), /malformed or unscoped client presentation effect/);

  assert.throws(() => admission.projectExecutiveInteraction(result({
    execution_scope: "client_presentation",
    presentation: { action: "navigate", target: "projects" },
  }), request, INTERACTION_ID), /malformed or unscoped client presentation effect/);
});

test("executed narration requires exact Runtime scope, execution, verification, and receipt proof", () => {
  const executed = {
    classification: "action",
    status: "executed",
    authority_decision: { decision: "allow" },
    execution_scope: "runtime",
    execution: {
      attempted: true,
      executed: true,
      execution_scope: "runtime",
      underlying_execution_receipt_id: "EXECUTION-RECEIPT-001",
      result: { ok: true },
    },
    verification: { verified: true },
    receipt_id: "INTERACTION-RECEIPT-001",
  };
  assert.equal(admission.projectExecutiveInteraction(result(executed), request, INTERACTION_ID).status, "executed");
  for (const invalid of [
    { ...executed, authority_decision: { decision: "deny" } },
    { ...executed, execution_scope: null },
    { ...executed, execution: { ...executed.execution, execution_scope: null } },
    { ...executed, execution: { ...executed.execution, attempted: false } },
    { ...executed, execution: { ...executed.execution, executed: false } },
    { ...executed, verification: { verified: false } },
    { ...executed, receipt_id: null },
    { ...executed, execution: { ...executed.execution, underlying_execution_receipt_id: null } },
  ]) {
    assert.throws(
      () => admission.projectExecutiveInteraction(result(invalid), request, INTERACTION_ID),
      /attempted, executed, verified Runtime execution with durable receipts/,
    );
  }
});

test("approval, blocked, and failed operational narration requires matching semantics and durable receipts", () => {
  const approvalRequired = {
    classification: "action",
    status: "approval_required",
    authority_decision: { decision: "approval_required", approval_id: "APPROVAL-001" },
    execution: { attempted: false, executed: false, execution_scope: null },
    execution_scope: null,
    verification: { verified: false },
    receipt_id: "INTERACTION-RECEIPT-APPROVAL",
  };
  assert.equal(
    admission.projectExecutiveInteraction(result(approvalRequired), request, INTERACTION_ID).status,
    "approval_required",
  );
  for (const invalid of [
    { ...approvalRequired, authority_decision: { decision: "allow", approval_id: "APPROVAL-001" } },
    { ...approvalRequired, authority_decision: { decision: "approval_required", approval_id: null } },
    { ...approvalRequired, receipt_id: null },
    { ...approvalRequired, execution: { ...approvalRequired.execution, attempted: true } },
    { ...approvalRequired, execution: { ...approvalRequired.execution, executed: true } },
    { ...approvalRequired, execution_scope: "runtime" },
    { ...approvalRequired, verification: { verified: true } },
  ]) {
    assert.throws(
      () => admission.projectExecutiveInteraction(result(invalid), request, INTERACTION_ID),
      /approval gate without matching Authority, non-execution state, and a durable receipt/,
    );
  }

  const blocked = {
    classification: "blocked",
    status: "blocked",
    authority_decision: { decision: "capability_unavailable" },
    execution: { attempted: false, executed: false, execution_scope: null },
    execution_scope: null,
    verification: {
      verified: true,
      method: "governed_postcondition_checks",
      evidence: {
        checks: [{ name: "execution_attempted", passed: true, observed: false }],
      },
    },
    receipt_id: "INTERACTION-RECEIPT-BLOCKED",
  };
  const failed = {
    classification: "action",
    status: "failed",
    authority_decision: { decision: "deny" },
    execution: { attempted: true, executed: false, execution_scope: "runtime" },
    execution_scope: "runtime",
    verification: { verified: false },
    receipt_id: "INTERACTION-RECEIPT-FAILED",
  };
  assert.equal(admission.projectExecutiveInteraction(result(blocked), request, INTERACTION_ID).status, "blocked");
  assert.equal(admission.projectExecutiveInteraction(result(failed), request, INTERACTION_ID).status, "failed");
  for (const invalid of [
    { ...blocked, status: "answered" },
    { ...blocked, receipt_id: null },
    { ...blocked, authority_decision: { decision: "allow" } },
    { ...blocked, execution: { ...blocked.execution, executed: true } },
    { ...blocked, verification: { verified: true, method: "model_assertion", evidence: {} } },
    { ...failed, receipt_id: null },
    { ...failed, authority_decision: { decision: "allow" } },
    { ...failed, execution: { ...failed.execution, attempted: false } },
    { ...failed, execution: { ...failed.execution, executed: true } },
    { ...failed, verification: { verified: true } },
  ]) {
    assert.throws(
      () => admission.projectExecutiveInteraction(result(invalid), request, INTERACTION_ID),
      /non-conversational interaction as answered|blocked classification with a non-blocking status|operational block or failure without matching Authority, execution state, and a durable receipt/,
    );
  }
});

test("approval denial is accepted only for the exact pending interaction", () => {
  const denial = {
    approval_id: "APPROVAL-001",
    interaction_id: INTERACTION_ID,
    status: "denied",
    resume_required: false,
  };
  assert.doesNotThrow(() => admission.validateExecutiveInteractionDenial(
    denial,
    "APPROVAL-001",
    INTERACTION_ID,
  ));
  assert.throws(
    () => admission.validateExecutiveInteractionDenial(
      { ...denial, interaction_id: "33333333-3333-4333-8333-333333333333" },
      "APPROVAL-001",
      INTERACTION_ID,
    ),
    /did not confirm the approval denial/,
  );
  assert.throws(
    () => admission.validateExecutiveInteractionDenial(
      { ...denial, resume_required: true },
      "APPROVAL-001",
      INTERACTION_ID,
    ),
    /marked a denied interaction resumable/,
  );
});

test("approval continuation never treats a stale pending response as a terminal Runtime result", async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.sessionStorage;
  const storage = new Map();
  const pendingResult = result({
    classification: "action",
    status: "approval_required",
    response_text: "Approval is required.",
    authority_decision: { decision: "approval_required", approval_id: "APPROVAL-001" },
    receipt_id: "INTERACTION-RECEIPT-APPROVAL",
  });
  const pendingAdmission = admission.projectExecutiveInteraction(
    pendingResult,
    request,
    INTERACTION_ID,
  );
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });
  try {
    globalThis.fetch = async (_url, options = {}) => {
      if (options.method === "POST") throw new TypeError("approval continuation response lost");
      return new Response(JSON.stringify(localEnvelope({
        record_type: "nexus_interaction_lookup",
        interaction_id: INTERACTION_ID,
        found: true,
        state: "executing",
        transitions: [],
        latest_response: pendingResult,
        original_envelope: retainedEnvelope(),
      })), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await assert.rejects(
      admission.admitApprovedExecutiveInteraction({
        approval_id: "APPROVAL-001",
        interaction_id: INTERACTION_ID,
        status: "approved",
        resume_required: true,
      }, pendingAdmission),
      (error) => {
        assert.equal(error.name, "CanonicalInteractionIndeterminateError");
        assert.equal(error.interactionId, INTERACTION_ID);
        assert.match(error.message, /state executing without a terminal response/);
        return true;
      },
    );
    assert.equal(admission.pendingExecutiveInteractionReconciliationId(), INTERACTION_ID);
  } finally {
    globalThis.fetch = previousFetch;
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: previousStorage });
  }
});

test("pending approval recovery uses only a browser UUID pointer and the Runtime-retained envelope", async () => {
  const storage = new Map();
  const previousStorage = globalThis.sessionStorage;
  const previousFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });
  let requestedUrl = "";
  try {
    const pendingResult = result({
      classification: "action",
      status: "approval_required",
      response_text: "Approval is required.",
      authority_decision: { decision: "approval_required", approval_id: "APPROVAL-001" },
      receipt_id: "INTERACTION-RECEIPT-APPROVAL",
    });
    admission.rememberPendingExecutiveApproval(
      admission.projectExecutiveInteraction(pendingResult, request, INTERACTION_ID),
    );
    assert.deepEqual([...storage.values()], [INTERACTION_ID]);
    globalThis.fetch = async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({
        ok: true,
        data: {
          record_type: "nexus_interaction_lookup",
          interaction_id: INTERACTION_ID,
          found: true,
          state: "approval_required",
          transitions: [],
          latest_response: pendingResult,
          original_envelope: {
            ...request,
            actor: { actor_id: "operator-1", tenant_id: "tenant-alpha", roles: ["admin"] },
            context: { ...request.context, workspace_id: "workspace-alpha" },
          },
        },
        local: {
          mode: "local_first",
          route: "/executive/interactions",
          runtimeUrl: "http://127.0.0.1:8765",
          enabled: true,
          authoritative: "NEXUS Runtime",
          contextAssemblyOwner: "NEXUS Runtime",
          secretValuesExposed: false,
        },
        truth: {
          productionReady: false,
          enterpriseReady: false,
          cloudPrimary: false,
          localSourceOfTruth: true,
          secretValuesExposed: false,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const recovered = await admission.recoverPendingExecutiveApproval();
    assert.equal(requestedUrl, `/api/local/executive-interactions/${INTERACTION_ID}`);
    assert.equal(recovered.status, "approval_required");
    assert.deepEqual(recovered.interactionRequest, request);
    assert.equal("actor" in recovered.interactionRequest, false);
    assert.equal("workspace_id" in recovered.interactionRequest.context, false);
  } finally {
    globalThis.fetch = previousFetch;
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: previousStorage });
  }
});

test("a lost POST response is reconciled by same-ID lookup and never submitted under a new identity", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (options.method === "POST") throw new TypeError("response lost after submission");
      return new Response(JSON.stringify(localEnvelope({
        record_type: "nexus_interaction_lookup",
        interaction_id: INTERACTION_ID,
        found: true,
        state: "completed",
        transitions: [],
        latest_response: executedResult(),
        original_envelope: retainedEnvelope(),
      })), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const recovered = await admission.admitExecutiveInteraction(
      request.input.text,
      "text",
      SESSION_ID,
      INTERACTION_ID,
    );
    assert.equal(recovered.status, "executed");
    assert.equal(recovered.interactionResult.interaction_id, INTERACTION_ID);
    assert.deepEqual(calls.map((call) => call.options.method ?? "GET"), ["POST", "GET"]);
    assert.equal(calls[0].options.headers["Idempotency-Key"], INTERACTION_ID);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a malformed successful POST is reconciled as ambiguous and requires the retained original envelope", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (options.method === "POST") {
        return new Response(JSON.stringify({ ok: false, data: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(localEnvelope({
        record_type: "nexus_interaction_lookup",
        interaction_id: INTERACTION_ID,
        found: true,
        state: "completed",
        transitions: [],
        latest_response: executedResult(),
        original_envelope: retainedEnvelope(),
      })), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const recovered = await admission.admitExecutiveInteraction(
      request.input.text,
      "text",
      SESSION_ID,
      INTERACTION_ID,
    );
    assert.equal(recovered.status, "executed");
    assert.deepEqual(calls.map((call) => call.options.method ?? "GET"), ["POST", "GET"]);

    calls.length = 0;
    globalThis.fetch = async (_url, options = {}) => {
      if (options.method === "POST") throw new TypeError("response lost after submission");
      return new Response(JSON.stringify(localEnvelope({
        record_type: "nexus_interaction_lookup",
        interaction_id: INTERACTION_ID,
        found: true,
        state: "completed",
        transitions: [],
        latest_response: executedResult(),
        original_envelope: null,
      })), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await assert.rejects(
      admission.admitExecutiveInteraction(request.input.text, "text", SESSION_ID, INTERACTION_ID),
      /retained no original interaction envelope for identity reconciliation/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a retained nonterminal interaction blocks every new UUID until the exact original result reconciles", async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.sessionStorage;
  const storage = new Map();
  let latestResponse = null;
  let state = "executing";
  let postCalls = 0;
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });
  try {
    globalThis.fetch = async (_url, options = {}) => {
      if (options.method === "POST") {
        postCalls += 1;
        throw new TypeError("ambiguous POST failure");
      }
      return new Response(JSON.stringify(localEnvelope({
        record_type: "nexus_interaction_lookup",
        interaction_id: INTERACTION_ID,
        found: true,
        state,
        transitions: [],
        latest_response: latestResponse,
        original_envelope: retainedEnvelope(),
      })), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await assert.rejects(
      admission.admitExecutiveInteraction(request.input.text, "text", SESSION_ID, INTERACTION_ID),
      (error) => {
        assert.equal(error.name, "CanonicalInteractionIndeterminateError");
        assert.equal(error.interactionId, INTERACTION_ID);
        assert.equal(error.retryProhibited, true);
        assert.match(error.message, /Do not retry it with a new interaction identifier/);
        return true;
      },
    );
    assert.equal(admission.pendingExecutiveInteractionReconciliationId(), INTERACTION_ID);
    assert.equal(postCalls, 1);

    await assert.rejects(
      admission.admitExecutiveInteraction(
        "a different request",
        "text",
        SESSION_ID,
        "33333333-3333-4333-8333-333333333333",
      ),
      /blocks submission of a different request/,
    );
    assert.equal(postCalls, 1);

    latestResponse = executedResult();
    state = "completed";
    const recovered = await admission.admitExecutiveInteraction(
      request.input.text,
      "text",
      SESSION_ID,
      "33333333-3333-4333-8333-333333333333",
    );
    assert.equal(recovered.interactionResult.interaction_id, INTERACTION_ID);
    assert.equal(admission.pendingExecutiveInteractionReconciliationId(), null);
    assert.equal(postCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: previousStorage });
  }
});

test("a verified not-found lookup permits only one same-key resubmission", async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.sessionStorage;
  const storage = new Map();
  const observedKeys = [];
  let postCalls = 0;
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });
  try {
    globalThis.fetch = async (_url, options = {}) => {
      if (options.method === "POST") {
        postCalls += 1;
        observedKeys.push(options.headers["Idempotency-Key"]);
        if (postCalls === 1) throw new TypeError("first response unavailable");
        return new Response(JSON.stringify(localEnvelope(result())), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(localEnvelope({
        record_type: "nexus_interaction_lookup",
        interaction_id: INTERACTION_ID,
        found: false,
        state: null,
        transitions: [],
        latest_response: null,
        original_envelope: null,
      })), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const admitted = await admission.admitExecutiveInteraction(
      request.input.text,
      "text",
      SESSION_ID,
      INTERACTION_ID,
    );
    assert.equal(admitted.status, "answered");
    assert.deepEqual(observedKeys, [INTERACTION_ID, INTERACTION_ID]);
  } finally {
    globalThis.fetch = previousFetch;
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: previousStorage });
  }
});
