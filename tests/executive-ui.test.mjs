import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("executive status system covers all required operational domains", async () => {
  const source = await read("../src/components/ExecutiveStatusBar.tsx");
  for (const label of ["Runtime", "Knowledge", "Governance", "Execution", "Evidence", "Security", "Connection", "Operator mode"]) {
    assert.match(source, new RegExp(`title: \\"${label}\\"`));
  }
  assert.match(source, /aria-label="Executive system status"/);
});

test("six-layer visualization preserves order and exposes selectable detail", async () => {
  const source = await read("../src/components/SixLayerArchitecture.tsx");
  const positions = ["Integration", "Intelligence", "Conclave", "Governance", "Execution", "Experience"].map((name) => source.indexOf(`name: "${name}"`));
  assert.equal(positions.every((position) => position >= 0), true);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(source, /aria-pressed=/);
  assert.match(source, /Conclave is staged/);
  assert.match(source, /Hosted portal connection acceptance remains pending Phase 5X-C/);
});

test("topology distinguishes supplied path from verified provider state", async () => {
  const source = await read("../src/components/RuntimeTopology.tsx");
  for (const node of ["OpenAI", "Runtime Gateway", "Knowledge", "Conclave", "Governance", "Execution", "Experience", "Command Portal"]) {
    assert.match(source, new RegExp(`name: \\"${node}\\"`));
  }
  assert.match(source, /Provider connectivity not verified/);
  assert.match(source, /Configured is not connected/);
  assert.match(source, /hosting\.defaultProvider/);
});

test("asset coverage uses registered inventory rather than fabricated percentages", async () => {
  const source = await read("../src/components/AssetCoverage.tsx");
  for (const group of ["Knowledge", "Policies", "Handlers", "Connectors", "Specialists", "Evidence", "Datasets"]) {
    assert.match(source, new RegExp(`name: \\"${group}\\"`));
  }
  assert.equal(source.includes("%"), false);
  assert.match(source, /Counts are registered manifest entries/);
  assert.match(source, /missingRequirements/);
});

test("responsive and accessible presentation contracts remain present", async () => {
  const [styles, app, mission] = await Promise.all([read("../src/styles.css"), read("../src/App.tsx"), read("../src/components/MissionOverview.tsx")]);
  assert.match(styles, /@media \(max-width: 820px\)/);
  assert.match(styles, /@media \(max-width: 580px\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /prefers-contrast/);
  assert.match(app, /Skip to portal content/);
  assert.match(app, /aria-label="Toggle navigation"/);
  assert.match(mission, /aria-labelledby=/);
  assert.match(mission, /Production ready: false/);
  assert.match(mission, /Enterprise ready: false/);
  assert.match(mission, /Cloud primary: false/);
});
