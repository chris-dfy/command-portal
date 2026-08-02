import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const transpile = (source, fileName) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName,
}).outputText;

const localSource = await readFile(new URL("../src/lib/local-client.ts", import.meta.url), "utf8");
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
  authority_decision: { decision: "allow" },
  execution: {},
  verification: { verified: false },
  receipt_id: null,
  ...overrides,
});

test("canonical projection admits informational answers and validates the interaction binding", () => {
  const projected = admission.projectExecutiveInteraction(result(), request, INTERACTION_ID);
  assert.equal(projected.path, "executive_interaction");
  assert.equal(projected.status, "answered");
  assert.equal(projected.spokenSummary, "Canonical Runtime response.");
  assert.throws(
    () => admission.projectExecutiveInteraction(result({ interaction_id: "33333333-3333-4333-8333-333333333333" }), request, INTERACTION_ID),
    /different interaction/,
  );
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

test("executed narration fails closed without Authority, verification, and receipt", () => {
  const executed = {
    classification: "action",
    status: "executed",
    authority_decision: { decision: "allow" },
    execution: { attempted: true, result: { ok: true } },
    verification: { verified: true },
    receipt_id: "RECEIPT-001",
  };
  assert.equal(admission.projectExecutiveInteraction(result(executed), request, INTERACTION_ID).status, "executed");
  assert.throws(
    () => admission.projectExecutiveInteraction(result({ ...executed, verification: { verified: false } }), request, INTERACTION_ID),
    /allowed, verified execution with a durable receipt/,
  );
  assert.throws(
    () => admission.projectExecutiveInteraction(result({ ...executed, receipt_id: null }), request, INTERACTION_ID),
    /allowed, verified execution with a durable receipt/,
  );
  assert.throws(
    () => admission.projectExecutiveInteraction(result({ ...executed, authority_decision: { decision: "deny" } }), request, INTERACTION_ID),
    /allowed, verified execution with a durable receipt/,
  );
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
