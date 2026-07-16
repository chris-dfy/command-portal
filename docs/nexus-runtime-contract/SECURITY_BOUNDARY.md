# Security Boundary

This boundary enforces the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

## Credential isolation

`COMMAND_PORTAL_RUNTIME_READ_TOKEN` is read only by the Node server. The NEXUS Experience Gateway adds it to allowlisted upstream reads. It is never returned, logged, embedded in source maps, or exposed through a `VITE_` variable. The credential should carry only the runtime scope `nexus.portal.read` when such an identity is issued.

## Browser boundary

- Same-origin reads are the intended access path.
- Requests with an `Origin` header must match the request origin or an exact configured origin.
- Wildcard CORS is not emitted.
- Only GET and OPTIONS are accepted under `/api/runtime`.
- POST, PUT, PATCH, and DELETE return 405 and never contact the runtime.
- Unknown portal paths return 404 and never contact the runtime.
- All query parameters return 400.

## Runtime boundary

- Each browser route has a literal runtime route mapping.
- Redirects are rejected.
- Default timeout: 8 seconds.
- Default maximum response: 1 MiB.
- Default cache TTL: 15 seconds.
- Cache entries are non-authoritative. An expired entry is used only after a failed refresh and is labeled `stale`.

## Local capability boundary

`/api/local` is a separate, disabled-by-default boundary for a loopback-only private Runtime. It uses exact method/path mappings, payload allowlists, request and response size limits, timeouts, safe error normalization, and registered artifact-type validation. It never receives the hosted Runtime credential.

The browser may submit document, project, and transcript inputs, but the Runtime owns ingestion, context assembly, project intelligence, intent routing, governance, proof, receipts, and execution decisions. High-risk actions remain approval-gated and cannot be approved by the browser request itself.

Hosted `/api/runtime` remains observation-only. Local `/api/local` exposes only the governed capabilities documented in the endpoint allowlist; neither boundary is a generic proxy.
