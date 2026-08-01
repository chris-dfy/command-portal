// Verifies the running Node version satisfies package.json "engines.node"
// and that .replit declares a matching nodejs module major version.
// Exits non-zero with a clear message on any mismatch.
import { readFileSync } from "node:fs";

function fail(message) {
  console.error(`verify:engines FAILED: ${message}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const range = pkg.engines?.node;
if (!range) fail('package.json is missing an "engines.node" constraint.');

// Parse constraints like ">=22.18", ">=22.18.0", "^22", "22.x" (comma/space separated AND).
function parseVersion(v) {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

function cmp(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function satisfiesClause(current, clause) {
  const m = /^(>=|<=|>|<|\^|~|=)?\s*(\d+(?:\.(?:\d+|x))?(?:\.(?:\d+|x))?)$/.exec(clause.trim());
  if (!m) fail(`Unsupported engines.node clause "${clause}". Update tests/verify-engines.mjs to handle it.`);
  const op = m[1] ?? "=";
  const base = parseVersion(m[2].replaceAll(".x", ".0"));
  const hasX = m[2].includes("x");
  switch (op) {
    case ">=": return cmp(current, base) >= 0;
    case ">": return cmp(current, base) > 0;
    case "<=": return cmp(current, base) <= 0;
    case "<": return cmp(current, base) < 0;
    case "^": return current[0] === base[0] && cmp(current, base) >= 0;
    case "~": return current[0] === base[0] && current[1] === base[1] && cmp(current, base) >= 0;
    default: // "="
      if (hasX || !m[2].includes(".")) return current[0] === base[0];
      return cmp(current, base) === 0;
  }
}

const current = parseVersion(process.versions.node);
const clauses = range.split(/[,\s]+/).filter(Boolean);
for (const clause of clauses) {
  if (!satisfiesClause(current, clause)) {
    fail(
      `Running Node v${process.versions.node} does not satisfy package.json engines.node "${range}". ` +
        `Update the environment or the engines constraint so they agree.`,
    );
  }
}

// Cross-check .replit modules declaration against the engines constraint's major version.
const replit = readFileSync(new URL("../.replit", import.meta.url), "utf8");
const modulesMatch = /^modules\s*=\s*\[([^\]]*)\]/m.exec(replit);
if (!modulesMatch) fail(".replit has no modules declaration to cross-check.");
const nodeModule = modulesMatch[1]
  .split(",")
  .map((s) => s.trim().replaceAll(/['"]/g, ""))
  .find((s) => s.startsWith("nodejs-"));
if (!nodeModule) fail('.replit modules does not declare a "nodejs-<major>" module.');

const declaredMajor = Number(nodeModule.slice("nodejs-".length));
if (!Number.isInteger(declaredMajor)) fail(`Could not parse Node major from .replit module "${nodeModule}".`);

const requiredMajor = parseVersion(clauses.map((c) => c.replace(/^[^\d]*/, ""))[0])[0];
if (declaredMajor !== requiredMajor) {
  fail(
    `.replit declares module "${nodeModule}" (Node ${declaredMajor}) but package.json engines.node "${range}" ` +
      `requires major ${requiredMajor}. Keep them in lockstep.`,
  );
}

if (current[0] !== declaredMajor) {
  fail(
    `Running Node v${process.versions.node} does not match .replit module "${nodeModule}". ` +
      `The environment may not have picked up a module change yet.`,
  );
}

console.log(
  `verify:engines OK: Node v${process.versions.node} satisfies engines.node "${range}" and matches .replit module "${nodeModule}".`,
);
