# Security Boundary

This boundary enforces the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

## Credential isolation

`COMMAND_PORTAL_RUNTIME_READ_TOKEN` is read only by the Node server. The NEXUS Experience Gateway adds it to allowlisted upstream reads. It is never returned, logged, embedded in source maps, or exposed through a `VITE_` variable. The credential should carry only the runtime scope `nexus.portal.read` when such an identity is issued.

## Browser boundary

- Same-origin reads are the intended access path.
- Requests with an `Origin` header must match the request origin or an exact configured origin.
- Wildcard CORS is not emitted.
- Observation routes under `/api/runtime` accept only GET and OPTIONS.
- Conversational input, executive briefing requests, Conclave review prompts, typed NEXUS Command, and finalized voice transcripts all enter through the canonical interaction gateway, which alone forwards to `POST /executive/interactions`.
- Former direct interaction and generic action routes return `410 canonical_interaction_required` and never contact Runtime.
- Realtime SDP negotiation accepts POST only to establish provider transport; it cannot produce an admitted final response until the finalized transcript has completed canonical Runtime interaction admission.
- In hosted operational mode, canonical interactions and Realtime SDP mutations require the signed operational session and CSRF proof.
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

The browser may submit document, project, and interaction inputs, but Runtime owns ingestion, context assembly, classification, intent construction, governance, proof, receipts, and execution decisions. The gateway injects canonical interaction actor and workspace fields from server identity; client-supplied identity or Authority fields fail closed. Approval continuation preserves the original interaction and returns through the same endpoint.

Hosted `/api/operations` exposes authenticated, scope-checked Runtime capability contracts through an exact allowlist. Its canonical interaction, Document Intelligence, and Project routes derive identity and workspace scope on the server, require CSRF and idempotency for mutations, and never infer Authority from the session. Local `/api/local` exposes only the governed capabilities documented in its endpoint allowlist. None of these boundaries is a generic proxy.
