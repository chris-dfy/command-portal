# Threat Model

## Project Overview

This project is a standalone command portal: a React frontend served by a Node.js backend-for-frontend (BFF) that performs read-only, allowlisted GET requests to a configured runtime API. The production entry point is `server/index.mjs`, with the main trust boundary enforcement in `server/portal-server.mjs`. The current deployment is `private`, so Replit blocks public-internet access to endpoints. Per scan assumptions, only production-reachable issues matter; mockup or sandbox-only behaviors are out of scope.

## Assets

- **Runtime read credential** -- `COMMAND_PORTAL_RUNTIME_READ_TOKEN` lets the BFF read from the upstream runtime API. Exposure would let an attacker query the upstream system directly within that token's scope.
- **Runtime-derived operational data** -- status, readiness, claims, proofs, receipts, and related portal data may be sensitive even in read-only form because it reflects internal system state.
- **Portal integrity and truth posture** -- the portal is expected to preserve its declared truth boundary (`productionReady=false`, `secretValuesExposed=false`, non-live fixture labeling). Incorrect or forged values could mislead operators.
- **Service availability** -- the BFF fans out to multiple upstream routes for `/api/portal/snapshot`; resource exhaustion or hanging upstream calls can degrade portal availability.
- **Static browser bundle and visible configuration** -- frontend assets in `dist/` and browser-visible config from `config/brand.json` must not contain secrets or dangerous active content.

## Trust Boundaries

- **Browser to BFF** -- all browser input crosses into `server/portal-server.mjs`. The browser is untrusted, so route, method, origin, and query validation must be enforced server-side.
- **BFF to runtime API** -- the BFF sends allowlisted requests to `COMMAND_PORTAL_RUNTIME_API_BASE_URL` with a server-held bearer token. This boundary is the primary confidentiality risk in the application.
- **Static file serving boundary** -- the server must keep requests confined to `dist/` and prevent traversal into source files, config, fixtures outside intended access, or environment material.
- **Deployment visibility boundary** -- the current deployment is `private`, so unauthenticated public-internet reachability is not assumed. Findings that require public exposure are out of scope unless another reachable path is demonstrated.
- **Production vs dev-only boundary** -- `server/`, `src/`, `config/`, and built `dist/` are production-relevant. `tests/`, `docs/`, and `openapi/` are normally dev-only. `fixtures/` is mixed because it is also served intentionally in `contract_fixture` mode.

## Scan Anchors

- Production entry points: `server/index.mjs`, `server/portal-server.mjs`
- Highest-risk code: upstream runtime fetch path, origin validation, allowlisted route handling, static file serving
- Public/authenticated/admin surfaces: no user auth or admin plane exists in this repo; primary exposed surface is `/api/portal/*`
- Dev-only areas usually ignored: `tests/`, `docs/`, `openapi/`
- Mixed area: `fixtures/contract-fixture.json` is production-relevant only when explicitly running in `contract_fixture` mode

## Threat Categories

### Spoofing

This app does not implement end-user authentication, so the main spoofing concern is whether an untrusted web origin can make the BFF perform privileged runtime reads. The BFF must continue to reject unexpected `Origin` values, avoid trusting browser-supplied identity, and ensure no future authenticated or admin surfaces are added without server-side verification.

### Tampering

The browser must not be able to change which upstream route is queried or turn the BFF into a generic proxy. The system must preserve its fixed GET allowlist, strict detail ID validation, bounded query parameters, and read-only method policy. Any future feature that lets the client influence upstream paths, headers, or mutation verbs would materially change the threat model.

### Information Disclosure

The runtime token must remain server-only and must never appear in client bundles, API responses, logs, source maps, or browser-visible configuration. Upstream error details must stay normalized so stack traces, authorization headers, and raw runtime bodies are not leaked. Static file serving must remain confined to `dist/` so source and config files are not exposed.

### Denial of Service

The portal depends on upstream runtime responsiveness, especially for `/api/portal/snapshot`, which aggregates multiple allowlisted reads. The BFF must keep request timeouts, size limits, and error handling in place so a slow or oversized upstream response cannot tie up the service indefinitely. Public-internet DoS is partially reduced by the current `private` deployment visibility, but internal or authenticated callers could still trigger expensive reads.

### Elevation of Privilege

There is no user role model in this repo, so the main privilege-escalation risks are proxy abuse, path traversal, or runtime credential misuse that turns a read-only portal into broader access. The BFF must remain unable to fetch arbitrary destinations, follow attacker-controlled redirects, or serve files outside `dist/`. Any future addition of admin features, uploads, or write paths would require a new review.
