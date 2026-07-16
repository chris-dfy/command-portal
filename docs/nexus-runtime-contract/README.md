# Runtime Contract Package

This contract is governed by the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

This directory is the curated contract between the Command Portal's NEXUS Experience Gateway and the Runtime API. The browser contract is product-name-neutral and versioned independently from visible identity.

## Contract

- Browser envelope: `portal-envelope/1.0`
- Browser route prefix: `/api/runtime`
- Runtime access: server-side GET only
- Allowed browser query keys: none
- Cache TTL: 15 seconds by default, non-authoritative

The route set is closed. Adding a runtime endpoint requires an explicit mapping, schema review, threat review, tests, and a contract documentation update.

## Package contents

- `ENDPOINT_ALLOWLIST.md` — exact browser-to-runtime route mapping
- `PORTAL_ENVELOPE.md` — response and error schema
- `SECURITY_BOUNDARY.md` — credentials, origins, methods, limits, and logging
- `TRUTH_BOUNDARIES.md` — facts the UI must preserve
- `ASSET_PROVISIONING.md` — explicit provisioning and model-native knowledge doctrine

The normative machine-readable browser contract is `../../openapi/portal-readonly.openapi.json`.
