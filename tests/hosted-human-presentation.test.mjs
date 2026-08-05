import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("hosted workspace availability is concise while diagnostics stay disclosed", async () => {
  const [app, styles] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/HostedOperationalContext.css"),
  ]);
  const context = app.match(
    /const hostedOperationalContext = hostedContextData && active !== "conclave" \? <section[\s\S]*?<\/section> : null;/,
  )?.[0];
  assert.ok(context);

  const summary = context.indexOf("hosted-operational-context__summary");
  const disclosure = context.indexOf("<details");
  assert.ok(summary >= 0 && disclosure > summary);
  assert.match(context.slice(summary, disclosure), /hostedPresentation\.summary/);
  assert.doesNotMatch(context.slice(summary, disclosure), /hostedCapability\.reason|operationalSession\.(?:tenantId|workspaceId|expiresAt)/);
  for (const diagnostic of [
    "hostedCapability.reason",
    "operationalSession.tenantId",
    "operationalSession.workspaceId",
    "operationalSession.expiresAt",
  ]) {
    assert.ok(context.indexOf(diagnostic) > disclosure, diagnostic);
  }

  assert.match(app, /status: "limited"/);
  assert.match(app, /Runtime support has limits/);
  assert.match(app, /Individual controls verify session access and authorization; unavailable controls stay disabled/);
  assert.doesNotMatch(app, /surfaceToolCounts|Runtime tools are live/);
  assert.match(styles, /hosted-operational-context__details > summary:focus-visible/);
});

test("Conclave presents the investigation workflow before hosted diagnostics", async () => {
  const [app, conclave] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/ConclaveWorkspace.tsx"),
  ]);
  assert.match(app, /availability=\{hostedContextData\}/);
  const summary = conclave.indexOf("hosted-operational-context--summary");
  const workflow = conclave.indexOf('title="What would you like to investigate?"');
  const diagnostics = conclave.indexOf("hosted-operational-context--details");
  const reviewDiagnostics = conclave.indexOf('className="conclave-technical-details"', workflow);
  assert.ok(summary >= 0 && workflow > summary && diagnostics > workflow);
  assert.doesNotMatch(conclave, /className="conclave-hero"/);
  assert.match(conclave, /Start investigation/);
  assert.match(conclave, /requests creation of a governed Review record/);
  assert.match(conclave, /does not run tasks or authorize external actions/);
  assert.match(conclave, /not yet a Runtime record/);
  assert.match(conclave, /aria-describedby="conclave-action-availability"/);
  assert.match(conclave, /Saved Reviews may be out of date/);
  for (const label of ["Tool availability", "System details", "Evidence availability"]) {
    assert.match(conclave, new RegExp(label));
  }
  assert.ok(conclave.indexOf("creationReason", workflow) > reviewDiagnostics);
  assert.ok(conclave.indexOf("runAction.reason", workflow) > reviewDiagnostics);
});

test("a failed detail does not inherit the global transport headline", async () => {
  const [app, styles] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/platform/nexus-platform.css"),
  ]);
  const alert = app.match(
    /\{failures\.length > 0 && <section className="nx-runtime-alert"[\s\S]*?<\/section>}/,
  )?.[0];
  assert.ok(alert);
  assert.match(app, /primaryFailure\?\.gateway\.connectionState/);
  assert.match(alert, /data-tone=\{primaryFailureTone}/);
  assert.match(alert, /<strong>\{primaryFailureCopy\.title}<\/strong>/);
  assert.doesNotMatch(alert, /<strong>\{state}<\/strong>/);
  assert.match(alert, /<details className="nx-runtime-alert__details">/);
  assert.ok(alert.indexOf("failures.map") > alert.indexOf("<details"));
  assert.ok(alert.indexOf("failure.error?.message") > alert.indexOf("<details"));
  assert.ok(alert.indexOf("failure.gateway.route") > alert.indexOf("<details"));
  assert.match(alert, /Technical details \(\$\{failures\.length}\)/);
  assert.doesNotMatch(alert, /failures\.slice/);
  assert.match(app, /failureCount === 1 \? "Status detail unavailable" : "Status details unavailable"/);
  assert.match(app, /Workspace availability is reported separately/);
  assert.match(app, /Gateway access to the Runtime could not be verified/);
  assert.match(app, /runtimeFailurePresentation\(primaryFailureState, failures\.length\)/);
  assert.doesNotMatch(app, /Other verified tools remain available/);
  assert.match(styles, /nx-runtime-alert__details > summary:focus-visible/);
  assert.match(styles, /nx-runtime-alert__details > ul/);
});

test("an unavailable hosted workspace keeps raw gate diagnostics behind disclosure", async () => {
  const app = await read("../src/App.tsx");
  const boundary = app.match(
    /function HostedCapabilityBoundary\([\s\S]*?\n}\n\nfunction ProofReferences/,
  )?.[0];
  assert.ok(boundary);
  assert.match(boundary, /Required tools could not be verified, so this workspace remains disabled/);
  const disclosure = boundary.indexOf("<details");
  assert.ok(disclosure >= 0);
  assert.ok(boundary.indexOf("{reason}") > disclosure);
});

test("workspace summary and module boundary use the same required mount actions", async () => {
  const app = await read("../src/App.tsx");
  const surface = app.match(
    /function surfaceCapabilityStateView\([\s\S]*?\n}\n\nfunction envelopeHasVerifiedRuntimeEvidence/,
  )?.[0];
  assert.ok(surface);
  assert.match(surface, /moduleCapabilityStateView\(/);
  assert.match(surface, /states\.flatMap\(\(\{ capability \}\) => capability\.diagnostics\)/);
  assert.match(surface, /capability\.diagnostics/);
});
