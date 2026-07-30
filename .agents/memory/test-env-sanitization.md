---
name: Test env sanitization
description: Why command-portal tests must run with workspace env vars unset
---

Rule: run the command-portal test suite (`npm run check`, `node --test`) with all `COMMAND_PORTAL_*` and `NEXUS_*` environment variables (and `REPLIT_DEPLOYMENT`) unset.

**Why:** `loadConfig` in the Experience Gateway reads `process.env` as a fallback for every override. The Replit workspace carries real operational secrets/config (trust bootstrap required, operational mode enabled), which flips test servers into hosted-operations validation paths and fails dozens of otherwise-green tests with secret-length/bootstrap errors. This is environmental, not a code regression.

**How to apply:** prefix test runs with `env -u VAR ...` for each matching var, e.g. build the unset list from `env | grep -oE "^(COMMAND_PORTAL|NEXUS)[A-Z_]*"`.
