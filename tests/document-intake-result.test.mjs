import assert from "node:assert/strict";
import { test } from "node:test";
import {
  successfulDocumentUploadMessage,
} from "../src/lib/document-intake-result.ts";

test("successful upload remains successful when inventory read is unavailable", () => {
  const result = successfulDocumentUploadMessage(
    1,
    {
      available: false,
      reason: "GET /intake/history is unavailable.",
    },
  );
  assert.match(result, /^1 document ingested by the workspace-scoped NEXUS Runtime/);
  assert.match(result, /Source inventory remains degraded/);
  assert.match(result, /GET \/intake\/history is unavailable/);
});

test("successful upload remains successful when its independent refresh fails", () => {
  const result = successfulDocumentUploadMessage(
    2,
    {
      available: true,
      reason: "The exact canonical action is live verified.",
    },
    "Runtime request timed out.",
  );
  assert.match(result, /^2 documents ingested by the workspace-scoped NEXUS Runtime/);
  assert.match(result, /Source inventory refresh is degraded/);
  assert.match(result, /Runtime request timed out/);
});

test("successful upload reports a clean completion when refresh succeeds", () => {
  const result = successfulDocumentUploadMessage(
    1,
    {
      available: true,
      reason: "The exact canonical action is live verified.",
    },
  );
  assert.equal(
    result,
    "1 document ingested by the workspace-scoped NEXUS Runtime with evidence and proof.",
  );
});
