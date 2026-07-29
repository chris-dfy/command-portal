import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const indexPath = resolve(dist, "index.html");
assert.ok(existsSync(indexPath), "Production build index is missing.");

const html = readFileSync(indexPath, "utf8");
const javascript = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => match[1]);
const stylesheets = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1]);
assert.equal(javascript.length, 1, "Live index must reference exactly one authoritative JavaScript asset.");
assert.equal(stylesheets.length, 1, "Live index must reference exactly one authoritative CSS asset.");

for (const asset of [...javascript, ...stylesheets]) {
  assert.match(asset, /^\/assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/);
  assert.ok(existsSync(resolve(dist, asset.replace(/^\//, ""))), `Referenced asset is absent: ${asset}`);
}

const outputFiles = readdirSync(resolve(dist, "assets"));
assert.equal(outputFiles.some((name) => name.endsWith(".map")), false, "Production source maps must not be published.");
for (const reserved of ["service-worker.js", "sw.js", "manifest.json", "manifest.webmanifest"]) {
  assert.equal(existsSync(resolve(dist, reserved)), false, `${reserved} must not be published implicitly.`);
  assert.equal(html.includes(reserved), false, `${reserved} must not be referenced by the live index.`);
}

const bundle = [html, ...[...javascript, ...stylesheets].map((asset) => readFileSync(resolve(dist, asset.replace(/^\//, "")), "utf8"))].join("\n");
for (const forbidden of [
  "COMMAND_PORTAL_RUNTIME_READ_TOKEN",
  "COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN",
  "COMMAND_PORTAL_SESSION_SECRET",
  "COMMAND_PORTAL_OPERATOR_ACCESS_KEY",
  "NEXUS_HOSTED_OPERATIONAL_TOKEN",
  "NEXUS_CONTEXT_ASSERTION_SECRET",
  "BEGIN PRIVATE KEY",
]) assert.equal(bundle.includes(forbidden), false, `Client output contains forbidden server-only material: ${forbidden}`);

console.log(JSON.stringify({ javascript: javascript[0], stylesheet: stylesheets[0], secretValuesExposed: false }));
