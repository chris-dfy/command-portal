import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/platform/portable-limitation-proof.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const validator = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const registry = JSON.parse(await readFile(new URL("../src/platform/surface-registry.json", import.meta.url), "utf8"));

const proven = (reason = "No canonical Data Platform contract or verified operational adapter is registered for either client.") => ({
  state: "unavailable",
  reason,
  limitationProof: {
    basis: "runtime_contract",
    evidenceRefs: [
      "boundary:docs/nexus-runtime-contract/ASSET_PROVISIONING.md#model-native-knowledge-and-explicit-provisioning",
      "contract:docs/ClientParityContract.md#current-registered-operational-scope",
      "contract:server/portal-server.mjs#CANONICAL_OPERATIONAL_ROUTES",
    ],
  },
});

test("symmetric unavailable portable projections are both validated", () => {
  assert.doesNotThrow(() => validator.assertPortableLimitationProofs([{
    moduleId: "data-platform.workspace",
    portability: "portable",
    clients: { desktop: proven(), web: proven() },
  }]));
  assert.throws(() => validator.assertPortableLimitationProofs([{
    moduleId: "data-platform.workspace",
    portability: "portable",
    clients: { desktop: proven(), web: { state: "unavailable", reason: "Unavailable." } },
  }]), /without a contract-backed limitation proof/);
});

const markdownHeadingSlugs = (markdown) => [...markdown.matchAll(/^#+\s+(.+)$/gm)].map((match) => match[1]
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, "")
  .trim()
  .replace(/\s+/g, "-"));

test("the full registry matches the exhaustive per-projection limitation evidence catalog", () => {
  const modules = registry.surfaces.flatMap((surface) => surface.modules);
  assert.doesNotThrow(() => validator.assertPortableLimitationProofs(modules));
  const unavailableProjectionKeys = modules
    .filter((module) => module.portability === "portable")
    .flatMap((module) => Object.entries(module.clients)
      .filter(([, projection]) => projection.state === "unavailable")
      .map(([client, projection]) => `${module.moduleId}:${client}:${projection.limitationProof?.basis}`))
    .sort();
  const catalogKeys = Object.keys(validator.PORTABLE_LIMITATION_EVIDENCE_CATALOG).sort();
  assert.equal(unavailableProjectionKeys.length, 59);
  assert.deepEqual(catalogKeys, unavailableProjectionKeys);
});

test("every approved catalog reference resolves to an existing path and fragment", async () => {
  for (const [catalogKey, entry] of Object.entries(validator.PORTABLE_LIMITATION_EVIDENCE_CATALOG)) {
    for (const reference of entry.evidenceRefs) {
      const parsed = /^(contract|boundary|evidence):([^#\s]+)#([A-Za-z0-9._:-]+)$/.exec(reference);
      assert.ok(parsed, `${catalogKey} has malformed evidence ref ${reference}`);
      const [, , relativePath, fragment] = parsed;
      const target = new URL(`../${relativePath}`, import.meta.url);
      await access(target);
      const evidenceSource = await readFile(target, "utf8");
      if (relativePath.endsWith(".md")) {
        assert.ok(
          markdownHeadingSlugs(evidenceSource).includes(fragment),
          `${catalogKey} reference ${reference} must resolve to a Markdown heading`,
        );
      } else {
        assert.ok(
          evidenceSource.includes(fragment),
          `${catalogKey} reference ${reference} must resolve to a code identifier`,
        );
      }
    }
  }
});

test("opaque, circular, single-reference, and implementation-absence proofs fail closed", () => {
  const invalid = [
    { ...proven(), limitationProof: { ...proven().limitationProof, evidenceRefs: ["opaque"] } },
    { ...proven(), limitationProof: { ...proven().limitationProof, evidenceRefs: ["boundary:src/platform/surface-registry.json#self", "contract:docs/ClientParityContract.md#contract"] } },
    { ...proven(), limitationProof: { ...proven().limitationProof, evidenceRefs: ["boundary:docs/nexus-runtime-contract/ASSET_PROVISIONING.md#only"] } },
    proven("This source artifact was not implemented."),
  ];
  for (const projection of invalid) {
    assert.throws(() => validator.assertPortableLimitationProjection("data-platform.workspace", "web", projection));
  }
  assert.throws(
    () => validator.assertPortableLimitationProjection("unknown.module", "web", proven()),
    /no approved evidence catalog entry/,
  );
});
