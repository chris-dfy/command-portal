# Runtime Contract Package

This directory is the curated Phase 5X-B contract between the standalone portal BFF and the Runtime API. The browser contract is product-name-neutral and versioned independently from visible identity.

## Contract

- Browser envelope: `portal-envelope/1.0`
- Browser route prefix: `/api/portal`
- Runtime access: server-side GET only
- Allowed browser query keys: `limit`, `offset`
- `limit`: integer 1–100
- Cache TTL: 30 seconds by default, non-authoritative
- Detail IDs: 1–160 characters from `A-Z`, `a-z`, `0-9`, `.`, `_`, `:`, `-`

The route set is closed. Adding a runtime endpoint requires an explicit mapping, schema review, threat review, tests, and a contract documentation update.

## Package contents

- `ENDPOINT_ALLOWLIST.md` — exact browser-to-runtime route mapping
- `PORTAL_ENVELOPE.md` — response and error schema
- `SECURITY_BOUNDARY.md` — credentials, origins, methods, limits, and logging
- `TRUTH_BOUNDARIES.md` — facts the UI must preserve
- `ASSET_PROVISIONING.md` — explicit provisioning and model-native knowledge doctrine

The normative machine-readable browser contract is `../../openapi/portal-readonly.openapi.json`.
