import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { accentContrastRatio, MINIMUM_ACCENT_CONTRAST } from "../src/appearance/accentContrast.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const tokenValue = (block, name) => block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];

test("canonical tokens provide theme, contrast, motion, and legacy compatibility contracts", async () => {
  const tokens = await read("../src/design-system/nexus-tokens.css");

  for (const token of [
    "--nx-font-display",
    "--nx-type-3xl",
    "--nx-space-16",
    "--nx-status-card-gap",
    "--nx-status-card-grid-gap",
    "--nx-status-card-padding-block",
    "--nx-status-card-padding-inline",
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

test("light semantic accents meet readable foreground contrast", async () => {
  const tokens = await read("../src/design-system/nexus-tokens.css");
  const lightBlock = tokens.match(/:root\[data-nexus-color-scheme="light"\][\s\S]*?\{([\s\S]*?)\n\}/)?.[1];
  const systemLightBlock = tokens.match(/:root\[data-nexus-theme="system"\],[\s\S]*?\{([\s\S]*?)\n  \}/)?.[1];
  for (const [name, block] of [["light", lightBlock], ["system light", systemLightBlock]]) {
    assert.ok(block, `${name} token block must exist`);
    const accent = tokenValue(block, "--nx-accent");
    const canvas = tokenValue(block, "--nx-canvas");
    const surface = tokenValue(block, "--nx-surface-1");
    const inverse = tokenValue(block, "--nx-text-inverse");
    const success = tokenValue(block, "--nx-success");
    for (const [backgroundName, background] of [["canvas", canvas], ["surface", surface]]) {
      assert.ok(accent && background, `${name} ${backgroundName} contrast tokens must be hexadecimal`);
      assert.ok(
        accentContrastRatio(accent, background) >= MINIMUM_ACCENT_CONTRAST,
        `${name} accent ${accent} must be readable on ${backgroundName} ${background}`,
      );
    }
    assert.ok(accent && inverse, `${name} inverse-text tokens must be hexadecimal`);
    assert.ok(
      accentContrastRatio(inverse, accent) >= MINIMUM_ACCENT_CONTRAST,
      `${name} inverse text ${inverse} must be readable on accent fill ${accent}`,
    );
    assert.ok(success && canvas, `${name} success-text tokens must be hexadecimal`);
    assert.ok(
      accentContrastRatio(success, canvas) >= MINIMUM_ACCENT_CONTRAST,
      `${name} success text ${success} must be readable on canvas ${canvas}`,
    );
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
  assert.match(styles, /\.nx-metric \{[\s\S]*?min-width: 0;/);
  assert.match(styles, /\.nx-metric \{[\s\S]*?height: 100%;[\s\S]*?gap: var\(--nx-status-card-gap\);[\s\S]*?padding: var\(--nx-status-card-padding-block\) var\(--nx-status-card-padding-inline\);/);
  assert.match(styles, /\.nx-metric > span,[\s\S]*?\.nx-metric > small \{[^}]*min-block-size: 2lh;[^}]*overflow-wrap: anywhere;/);
  for (const row of ["span", "strong", "small"]) {
    assert.match(styles, new RegExp(`\\.nx-metric > ${row}`));
  }
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
