// Preloaded via `node --test --import` (see the "test" script in package.json).
//
// The test suites construct their configuration explicitly through
// `loadConfig(overrides)` fixtures and assert exact defaults for everything
// they do not override. `loadConfig` falls back to process.env for any value
// not overridden, so real workspace/deployment secrets (COMMAND_PORTAL_*,
// NEXUS_*, SESSION_SECRET) leaking into the test process change those
// defaults and cause spurious, environment-dependent failures.
//
// Deleting them here — before any test module loads — makes the suite
// deterministic regardless of which secrets are configured in the workspace.
// This only affects the test process; the real server still reads them.
for (const key of Object.keys(process.env)) {
  if (
    key.startsWith("COMMAND_PORTAL_")
    || key.startsWith("NEXUS_")
    || key === "SESSION_SECRET"
  ) {
    delete process.env[key];
  }
}
