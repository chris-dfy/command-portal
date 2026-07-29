import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Mission Control contains long revision identifiers without obscuring adjacent readiness values", async () => {
  const [workspace, styles] = await Promise.all([
    read("../src/components/OperationsWorkspace.tsx"),
    read("../src/components/OperationsWorkspace.css"),
  ]);

  assert.match(workspace, /import "\.\/OperationsWorkspace\.css"/);
  assert.match(workspace, /const revisionLabel = .*value\.slice\(0, 12\)/);
  assert.match(workspace, /title=\{deployedCommit\}/);
  assert.match(workspace, /aria-label=\{`Deployed commit \$\{deployedCommit\}`\}/);
  assert.match(workspace, /title=\{embeddedProgramAlphaCommit\}/);
  assert.match(workspace, /aria-label=\{`Program Alpha commit \$\{embeddedProgramAlphaCommit\}`\}/);

  assert.match(styles, /\.operations-workspace \.operations-summary > article \{[^}]*min-width: 0;[^}]*overflow: hidden;/s);
  assert.match(styles, /\.operations-workspace \.operations-summary code \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/s);
  assert.match(styles, /grid-template-columns: minmax\(11rem, 0\.75fr\) minmax\(0, 1\.6fr\) auto/);
  assert.match(styles, /@container operations-workspace \(max-width: 48rem\)/);
  assert.match(styles, /@container operations-workspace \(max-width: 30rem\)/);
});
