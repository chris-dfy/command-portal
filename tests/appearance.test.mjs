import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("appearance themes preserve the canonical NEXUS palette and browser color modes", async () => {
  const source = await read("../src/appearance/themes.ts");
  for (const theme of [
    "nexus-noir",
    "executive-glass",
    "tactical-blue",
    "government-command",
    "minimal-light",
    "ambient-hologram",
  ]) {
    assert.match(source, new RegExp(`id: \\"${theme}\\"`));
  }
  assert.match(source, /NexusColorMode = "dark" \| "light" \| "system"/);
  assert.match(source, /resolveNexusColorScheme/);
  assert.match(source, /mode === "system" \? \(prefersDark \? "dark" : "light"\) : mode/);
  assert.match(source, /NEXUS_HIGH_CONTRAST_COLORS/);
  assert.match(source, /NEXUS_FORCED_COLOR_PALETTE/);
  assert.match(source, /background: "Canvas"/);
  assert.match(source, /text: "CanvasText"/);
  assert.match(source, /background: "#1e1e1e"/);
  assert.match(source, /text: "#f4f0e9"/);
  assert.match(source, /accent: "#86f5d5"/);
});

test("appearance persistence and document attributes are browser safe", async () => {
  const source = await read("../src/appearance/useAppearanceSettings.ts");
  assert.match(source, /nexus\.command\.appearance\.v2/);
  assert.match(source, /candidate\.accentColor\.toLowerCase\(\) === "#62d2ff"/);
  assert.match(source, /"--nx-accent": resolved\.accentColor/);
  assert.match(source, /typeof window === "undefined"/);
  assert.match(source, /typeof document === "undefined"/);
  assert.match(source, /window\.localStorage/);
  assert.match(source, /try \{/);
  assert.match(source, /catch \{/);
  assert.match(source, /window\.addEventListener\("storage"/);
  assert.match(source, /window\.removeEventListener\("storage"/);
  for (const query of [
    "prefers-color-scheme: dark",
    "prefers-reduced-motion: reduce",
    "prefers-contrast: more",
    "forced-colors: active",
  ]) {
    assert.match(source, new RegExp(query));
  }
  for (const attribute of [
    "nexusTheme",
    "nexusThemePreference",
    "nexusColorMode",
    "nexusColorScheme",
    "nexusMotion",
    "nexusDensity",
    "nexusBackground",
    "nexusContrast",
    "nexusForcedColors",
  ]) {
    assert.match(source, new RegExp(`root\\.dataset\\.${attribute}`));
  }
  assert.match(source, /root\.style\.colorScheme = resolved\.colorScheme/);
  assert.match(source, /settings\.highContrast \|\| systemAppearance\.prefersHighContrast \|\| forcedColors/);
  assert.match(source, /settings\.reducedMotion \|\| systemAppearance\.prefersReducedMotion/);
  assert.match(source, /addEventListener\("change"/);
  assert.match(source, /removeEventListener\("change"/);
  assert.doesNotMatch(source, /@tauri|\binvoke\s*\(|windowBridge|runtimeBridge/i);
});

test("NEXUS appearance assets are local inert SVGs", async () => {
  const assets = [
    "nexus-logo-placeholder.svg",
    "nexus-mark.svg",
    "nexus-symbol-particles.svg",
    "nexus-symbol.svg",
  ];
  for (const asset of assets) {
    const source = await read(`../src/assets/${asset}`);
    assert.match(source, /^<svg[\s>]/);
    assert.doesNotMatch(source, /<script|<foreignObject/i);
    assert.doesNotMatch(source, /(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|\/\/)/i);
  }
});
