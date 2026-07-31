import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PROVIDER_PRIVATE_HOST_SUFFIXES = Object.freeze([
  ".replit.local",
]);

test("package lock contains no provider-private registry hosts", async () => {
  const lock = JSON.parse(
    await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  const violations = Object.entries(lock.packages ?? {}).flatMap(
    ([packagePath, metadata]) => {
      const resolved = metadata?.resolved;
      if (typeof resolved !== "string") return [];
      const hostname = new URL(resolved).hostname.toLowerCase();
      return PROVIDER_PRIVATE_HOST_SUFFIXES.some(
        (suffix) => hostname.endsWith(suffix),
      )
        ? [{ packagePath, hostname }]
        : [];
    },
  );

  assert.deepEqual(
    violations,
    [],
    "package-lock.json must remain installable outside provider-private networks",
  );
});
