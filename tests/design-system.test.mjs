import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("canonical tokens provide theme, contrast, motion, and legacy compatibility contracts", async () => {
  const tokens = await read("../src/design-system/nexus-tokens.css");

  for (const token of [
    "--nx-font-display",
    "--nx-type-3xl",
    "--nx-space-16",
    "--nx-radius-xl",
    "--nx-surface-glass",
    "--nx-text-strong",
    "--nx-border-strong",
    "--nx-accent",
    "--nx-success",
    "--nx-attention",
    "--nx-critical",
    "--nx-info",
    "--nx-shadow-panel",
    "--nx-focus-ring",
    "--nx-duration-state",
    "--nx-ease-enter",
  ]) assert.match(tokens, new RegExp(token));

  assert.match(tokens, /data-nexus-theme="dark"/);
  assert.match(tokens, /data-nexus-theme="light"/);
  assert.match(tokens, /data-nexus-theme="system"/);
  assert.match(tokens, /prefers-color-scheme: light/);
  assert.match(tokens, /data-nexus-contrast="high"/);
  assert.match(tokens, /prefers-contrast: more/);
  assert.match(tokens, /data-nexus-motion="reduced"/);
  assert.match(tokens, /prefers-reduced-motion: reduce/);

  const aliases = {
    bg: "--nx-canvas",
    panel: "--nx-surface-glass",
    "panel-solid": "--nx-surface-1",
    border: "--nx-border-subtle",
    "border-strong": "--nx-border-strong",
    text: "--nx-text-strong",
    muted: "--nx-text-muted",
    accent: "--nx-accent",
    "accent-rgb": "--nx-accent-rgb",
    success: "--nx-success",
    warning: "--nx-attention",
    danger: "--nx-critical",
  };
  for (const [alias, semantic] of Object.entries(aliases)) {
    assert.match(tokens, new RegExp(`--${alias}:\\s*var\\(${semantic}\\)`));
  }
});

test("canonical primitives expose reusable controls, surfaces, states, and keyboard behavior", async () => {
  const [source, styles] = await Promise.all([
    read("../src/design-system/NexusPrimitives.tsx"),
    read("../src/design-system/nexus-primitives.css"),
  ]);

  for (const component of [
    "NexusButton",
    "NexusIconButton",
    "NexusStatus",
    "NexusPanel",
    "NexusMetric",
    "NexusPageHeader",
    "NexusProgress",
    "NexusStateView",
    "NexusTabs",
    "NexusCallout",
    "NexusSkeleton",
  ]) assert.match(source, new RegExp(`export function ${component}\\(`));

  for (const className of [
    "nx-button",
    "nx-icon-button",
    "nx-status",
    "nx-panel",
    "nx-metric",
    "nx-page-header",
    "nx-progress",
    "nx-state",
    "nx-tabs",
    "nx-callout",
    "nx-skeleton",
  ]) assert.match(styles, new RegExp(`\\.${className}(?:[\\s,{.:\\[]|$)`));

  assert.match(source, /aria-busy=\{loading \|\| undefined\}/);
  assert.match(source, /role="progressbar"/);
  assert.match(source, /role=\{state === "failure" \? "alert" : "status"\}/);
  assert.match(source, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(source, /tabIndex=\{active === item\.id \? 0 : -1\}/);
  assert.match(styles, /data-nx-state-change="success"/);
  assert.match(styles, /data-nx-state-change="attention"/);
  assert.match(styles, /data-nx-state-change="critical"/);
  assert.match(styles, /\.nx-status \{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal;/);
  assert.match(styles, /@keyframes nx-state-success/);
  assert.match(styles, /@keyframes nx-skeleton-scan/);
});

test("legacy panel and status APIs are canonical primitive adapters", async () => {
  const [panel, status] = await Promise.all([
    read("../src/components/DataPanel.tsx"),
    read("../src/components/StatusPill.tsx"),
  ]);

  assert.match(panel, /className=\{`data-panel nx-panel/);
  assert.match(panel, /data-nexus-primitive="panel"/);
  assert.match(panel, /className="data-panel__body nx-panel__body"/);
  assert.match(panel, /className="empty-record nx-empty-record"/);

  assert.match(status, /tone\?: StatusPillTone/);
  assert.match(status, /className="status-pill nx-status"/);
  assert.match(status, /data-nexus-tone=\{nexusTone\}/);
  assert.ok(status.indexOf("CRITICAL_STATE.test") < status.indexOf("ATTENTION_STATE.test"));
  assert.ok(status.indexOf("ATTENTION_STATE.test") < status.indexOf("SUCCESS_STATE.test"));
  assert.match(status, /unverified/);
  assert.match(status, /disconnected/);
});
