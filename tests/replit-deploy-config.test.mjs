import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const replit = readFileSync(new URL("../.replit", import.meta.url), "utf8");

function setting(name) {
  const match = replit.match(new RegExp(`^${name}\\s*=\\s*"([^"]*)"$`, "m"));
  return match?.[1] ?? null;
}

test("published deploy config pins the purpose-bound Portal signer and keeps M3 disabled", () => {
  assert.equal(
    setting("NEXUS_CONTEXT_ASSERTION_COMMAND_PORTAL_SECRET_REF"),
    "secret-manager:experience-gateway/mission-1/context-assertion-command-portal-v1",
  );
  assert.equal(setting("NEXUS_CONTEXT_ASSERTION_KEY_ID"), null);
  assert.equal(setting("NEXUS_CONTEXT_ASSERTION_SECRET_REF"), null);
  assert.equal(setting("COMMAND_PORTAL_EXECUTIVE_SESSION_ENABLED"), "false");
});
test("published deploy config uses the bounded automatic workspace service", () => {
  assert.equal(setting("COMMAND_PORTAL_SESSION_MODE"), "automatic_private_workspace");
  assert.equal(setting("COMMAND_PORTAL_OPERATOR_USER_ID"), "nexus-workspace-service");
  assert.equal(setting("COMMAND_PORTAL_OPERATOR_ROLE"), "operator");
  assert.equal(
    setting("COMMAND_PORTAL_OPERATIONAL_SCOPES"),
    "operations:read,operations:write,repository:metadata:read,evidence:write,edge:node_admission:request",
  );
});
