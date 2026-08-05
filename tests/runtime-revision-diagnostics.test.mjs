import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Runtime revision is diagnostic provenance rather than shared workspace content", async () => {
  const [
    app,
    runtimeInformation,
    releaseRevision,
    releaseRevisionStyles,
    hostedContextStyles,
    inspector,
    inspectorStyles,
  ] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/RuntimeInformation.tsx"),
    read("../src/components/ReleaseRevision.tsx"),
    read("../src/components/ReleaseRevision.css"),
    read("../src/components/HostedOperationalContext.css"),
    read("../src/platform/NexusContextInspector.tsx"),
    read("../src/platform/NexusContextInspector.css"),
  ]);

  const hostedContext = app.match(
    /const hostedOperationalContext = hostedContextData && active !== "conclave" \? <section[\s\S]*?<\/section> : null;/,
  )?.[0];
  assert.ok(hostedContext);
  assert.doesNotMatch(hostedContext, /Runtime commit/);
  for (const label of [
    "Gateway connection",
    "Capability state",
    "Verified Runtime reason",
    "Tenant",
    "Workspace",
    "Session expires",
  ]) {
    assert.match(hostedContext, new RegExp(label));
  }
  const disclosure = hostedContext.indexOf("<details");
  assert.ok(disclosure > hostedContext.indexOf("hosted-operational-context__summary"));
  assert.ok(hostedContext.indexOf("hostedCapability.reason") > disclosure);
  assert.ok(hostedContext.indexOf("operationalSession.tenantId") > disclosure);
  assert.ok(hostedContext.indexOf("operationalSession.workspaceId") > disclosure);
  assert.ok(hostedContext.indexOf("operationalSession.expiresAt") > disclosure);

  assert.match(app, /const \[inspectorOpen, setInspectorOpen\] = useState\(false\)/);
  assert.match(app, /eyebrow="Release provenance" title="Verified deployment revisions"/);
  assert.match(app, /<ReleaseRevision label="Runtime commit" value=\{runtimeCommit\}/);
  assert.match(app, /<ReleaseRevision label="Program Alpha commit" value=\{programAlphaCommit\}/);
  assert.match(app, /runtimeRevision=\{deployedRuntimeCommit\}/);

  assert.match(runtimeInformation, /<ReleaseRevision label="Runtime commit" value=\{runtimeCommit\}/);
  assert.match(runtimeInformation, /<ReleaseRevision label="Program Alpha commit" value=\{programAlphaCommit\}/);
  assert.match(releaseRevision, /title=\{revision\}/);
  assert.match(releaseRevision, /aria-label=\{`\$\{label\} \$\{revision\}`\}/);
  assert.match(releaseRevisionStyles, /overflow-wrap: anywhere/);
  assert.match(releaseRevisionStyles, /\.release-provenance-grid \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);

  assert.match(hostedContextStyles, /hosted-operational-context__summary/);
  assert.match(hostedContextStyles, /hosted-operational-context__details > summary:focus-visible/);
  assert.match(hostedContextStyles, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(hostedContextStyles, /@media \(max-width: 760px\)/);

  assert.match(inspector, /Runtime revision/);
  assert.match(inspector, /value\.slice\(0, 12\)/);
  assert.match(inspector, /title=\{runtimeRevision\}/);
  assert.match(inspector, /aria-label=\{`Runtime revision \$\{runtimeRevision\}`\}/);
  assert.match(inspectorStyles, /text-overflow: ellipsis/);
  assert.match(inspectorStyles, /white-space: nowrap/);
});
