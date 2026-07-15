# Security Boundary

## Credential isolation

`COMMAND_PORTAL_RUNTIME_READ_TOKEN` is read only by the Node server. The BFF adds it to allowlisted upstream reads. It is never returned, logged, embedded in source maps, or exposed through a `VITE_` variable. The credential should carry only the runtime scope `nexus.portal.read` when such an identity is issued.

## Browser boundary

- Same-origin reads are the intended access path.
- Requests with an `Origin` header must match the request origin or an exact configured origin.
- Wildcard CORS is not emitted.
- Only GET and OPTIONS are accepted under `/api/portal`.
- POST, PUT, PATCH, and DELETE return 405 and never contact the runtime.
- Unknown portal paths return 404 and never contact the runtime.
- Query keys other than `limit` and `offset` return 400.

## Runtime boundary

- Each browser route has a literal runtime route mapping.
- Redirects are rejected.
- Default timeout: 15 seconds.
- Default maximum response: 1 MiB.
- Default cache TTL: 30 seconds.
- Cache entries are non-authoritative. An expired entry is used only after a failed refresh and is labeled `stale`.

This is an observation system, not an execution boundary. It contains no dispatch, approvals, uploads, mutation forwarding, or command endpoints.
