import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/acceptance-bound-draft.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const lifecycle = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("an HIF draft stays visible until known acceptance and remains editable after failure", () => {
  const inFlight = lifecycle.beginAcceptanceBoundDraft("  assess the registered context  ");
  assert.equal(inFlight.visibleDraft, "assess the registered context");

  const failed = lifecycle.retainDraftAfterUnacceptedFailure(inFlight);
  assert.deepEqual(failed, { draft: "assess the registered context", pending: null });

  const accepted = lifecycle.clearDraftAfterAcceptance(inFlight);
  assert.deepEqual(accepted, { draft: "", pending: null });
});
